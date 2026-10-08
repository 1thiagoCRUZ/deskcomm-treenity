/**
 * Dados para nota e envio, pelo BOT (n8n), no fechamento da venda.
 *
 *   GET  ?id_face=5514…   → o que já existe, SEM CPF: `tem_dados`, `faltando`,
 *                           e uma frase para confirmar ("nome X, entrega em
 *                           Cidade/UF, CEP …") na compra seguinte.
 *   POST { id_face, ...campos } → grava o que o cliente respondeu. `telefone`
 *                           nos campos é o telefone PARA A NOTA, não a busca.
 *
 * Mesma chave `tbw_…` das outras rotas do WhatsApp do bot: a organização sai
 * da chave, nunca do corpo. O contato é achado pelo `id_face` (o número do
 * WhatsApp do cliente), como em `pediu-ajuda`. Erro de validação volta em português simples
 * em `faltou`/`message`, porque quem lê é o modelo, que repassa ao cliente.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import {
  camposAlterados,
  dadosDeNotaEntradaSchema,
  gravarDadosDeNota,
  lerDadosDeNota,
  resumoParaOBot,
} from "@/lib/contacts/dados-de-nota";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const entrada = dadosDeNotaEntradaSchema.safeParse(campos);
  if (!entrada.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: entrada.error.issues.map((i) => i.message).join(" "),
          campos_com_problema: entrada.error.issues.map((i) => i.path.join(".")),
        },
      },
      { status: 422 },
    );
  }

  try {
    const linha = await gravarDadosDeNota(c.admin, c.organizationId, c.contactId, entrada.data, "bot");
    await audit({
      action: "contact.dados_de_nota_updated",
      organizationId: c.organizationId,
      resourceType: "contact",
      resourceId: c.contactId,
      metadata: { campos: camposAlterados(entrada.data), preenchido_por: "bot" },
    });
    return NextResponse.json({ data: resumoParaOBot(linha) });
  } catch (err) {
    logger.error("[treenity-bot.dados-do-cliente] gravação falhou", {
      organization_id: c.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return erro(500, "internal_error", "Não foi possível gravar os dados agora.");
  }
}
