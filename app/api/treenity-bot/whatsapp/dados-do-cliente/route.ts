/**
 * Dados para nota e envio, pelo BOT (n8n), no fechamento da venda.
 *
 *   GET  ?id_face=5514…   → o que já existe, MASCARADO (`dados_mascarados`),
 *                           para o cliente conferir na compra seguinte, mais o
 *                           CEP e a transportadora preferida para refazer o frete.
 *   POST { id_face, ...campos } → grava o que o cliente respondeu. `telefone`
 *                           nos campos é o telefone PARA A NOTA, não a busca.
 *
 * Mesma chave `tbw_…` das outras rotas do WhatsApp do bot: a organização sai
 * da chave, nunca do corpo. O contato é achado pelo `id_face` (o número do
 * WhatsApp do cliente), como em `pediu-ajuda`. Erro de validação volta em português simples
 * em `faltou`/`message`, porque quem lê é o modelo, que repassa ao cliente.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import {
  camposAlterados,
  gravarDadosDeNota,
  lerDadosDeNota,
  mascararCpfNasConversas,
  resumoParaOBot,
  separarCamposValidos,
} from "@/lib/contacts/dados-de-nota";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// As passadas de mascarar o CPF rodam até ~2 min depois da resposta (`after`).
export const maxDuration = 300;

/** 45 s e mais 75 s (2 min no total): o tempo de o Cadu responder e o CRM gravar. */
const ESPERAS_PARA_MASCARAR_DE_NOVO_MS = [45_000, 75_000];

const idFaceSchema = z.string().trim().min(8).max(32);

function erro(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function contexto(req: NextRequest, idFace: unknown) {
  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) return { resposta: erro(401, "unauthorized", "Chave ausente ou inválida.") };
  const id = idFaceSchema.safeParse(idFace);
  if (!id.success) return { resposta: erro(422, "validation_failed", "id_face é obrigatório.") };
  const contato = await encontrarContatoPorTelefone(admin, dono.organizationId, id.data);
  if (!contato) return { resposta: erro(404, "sem_contato", "Cliente não encontrado no Inbox.") };
  return { admin, organizationId: dono.organizationId, contactId: contato.id };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const c = await contexto(req, req.nextUrl.searchParams.get("id_face"));
  if ("resposta" in c) return c.resposta!;
  try {
    const linha = await lerDadosDeNota(c.admin, c.organizationId, c.contactId);
    return NextResponse.json({ data: resumoParaOBot(linha) });
  } catch (err) {
    logger.error("[treenity-bot.dados-do-cliente] leitura falhou", {
      organization_id: c.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return erro(500, "internal_error", "Não foi possível ler os dados agora.");
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const c = await contexto(req, corpo?.id_face);
  if ("resposta" in c) return c.resposta!;

  const { id_face: _idFace, ...enviados } = corpo ?? {};
  // Pelo bot, campo vazio é "o cliente não disse", NUNCA "apague": a ferramenta
  // do n8n pode mandar o parâmetro opcional em branco, e isso não pode zerar o
  // CPF que já estava guardado. Apagar é só pela tela, pela equipe.
  const campos = Object.fromEntries(
    Object.entries(enviados).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== ""),
  );
  const { validos, problemas } = separarCamposValidos(campos);
  const entrada = { data: validos };
  if (Object.keys(validos).length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: problemas.length
            ? `Nada foi salvo. ${problemas.map((p) => p.mensagem).join(" ")}`
            : "Nada foi salvo: nenhum dado veio.",
          campos_com_problema: problemas.map((p) => p.campo),
        },
      },
      { status: 422 },
    );
  }

  try {
    const linha = await gravarDadosDeNota(c.admin, c.organizationId, c.contactId, entrada.data, "bot");
    const cpf = entrada.data.cpf;
    if (cpf) {
      // O CPF já está guardado cifrado; agora ele sai do TEXTO das conversas.
      // Na hora pega o Inbox. A mensagem desta vez nas tabelas do bot e na
      // memória do Cadu só é gravada DEPOIS que ele responde (o CRM do n8n roda
      // depois do envio) — por isso mais duas passadas, depois da resposta.
      await mascararCpfNasConversas(c.admin, c.organizationId, c.contactId, cpf);
      after(async () => {
        for (const esperaMs of ESPERAS_PARA_MASCARAR_DE_NOVO_MS) {
          await new Promise((r) => setTimeout(r, esperaMs));
          await mascararCpfNasConversas(c.admin, c.organizationId, c.contactId, cpf);
        }
      });
    }
    await audit({
      action: "contact.dados_de_nota_updated",
      organizationId: c.organizationId,
      resourceType: "contact",
      resourceId: c.contactId,
      metadata: { campos: camposAlterados(entrada.data), preenchido_por: "bot" },
    });
    return NextResponse.json({
      data: {
        salvo: true,
        ...resumoParaOBot(linha),
        // O que NÃO foi salvo, para o bot pedir só isso de novo.
        nao_salvos: problemas,
      },
    });
  } catch (err) {
    logger.error("[treenity-bot.dados-do-cliente] gravação falhou", {
      organization_id: c.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return erro(500, "internal_error", "Não foi possível gravar os dados agora.");
  }
}
