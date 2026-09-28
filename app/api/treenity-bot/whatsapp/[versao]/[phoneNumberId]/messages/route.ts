/**
 * POST /api/treenity-bot/whatsapp/{versao}/{phone_number_id}/messages — o n8n
 * envia as respostas do bot por aqui, e elas aparecem no Inbox.
 *
 * O caminho e o corpo são OS MESMOS da Graph API
 * (`https://graph.facebook.com/{versao}/{phone_number_id}/messages`), e a
 * resposta volta sem mudança (status e JSON da Meta). Assim, no n8n, cada nó de
 * envio muda só o começo do endereço e a credencial — o corpo, os
 * `messages[0].id` que os nós seguintes leem e o tratamento de erro ficam iguais.
 *
 * Autenticação: `Authorization: Bearer tbw_<organização>_<segredo>`, gerada na
 * tela do Treenity Bot (ver `lib/treenity-bot/whatsapp.ts`). O número tem de
 * ser de um canal oficial DESSA organização — a credencial da Meta vem da
 * sessão dela, nunca do `.env`.
 *
 * Gravar no Inbox acontece DEPOIS da resposta (`after`): o bot não espera o
 * banco, e uma falha ao gravar não desfaz um envio que já saiu.
 */
import { after, type NextRequest, NextResponse } from "next/server";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { metaCredsForPhoneNumberId } from "@/lib/channels/meta/credentials";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensagemDoCorpo, organizacaoPelaChave, previaDaMensagem } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ versao: string; phoneNumberId: string }>;
}

/** Erro no formato da Graph API, para o n8n tratar igual a um erro da Meta. */
function erro(status: number, message: string, code: string): NextResponse {
  return NextResponse.json({ error: { message, type: "DeskCommError", code } }, { status });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { versao, phoneNumberId } = await ctx.params;
  if (!/^v\d+\.\d+$/.test(versao) || !/^\d+$/.test(phoneNumberId)) {
    return erro(404, "Endereço inválido.", "not_found");
  }

  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) return erro(401, "Chave ausente ou inválida.", "unauthorized");
  const { organizationId } = dono;

  const texto = await req.text();
  let corpo: Record<string, unknown>;
  try {
    const lido = JSON.parse(texto) as unknown;
    if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("não é objeto");
    corpo = lido as Record<string, unknown>;
  } catch {
    return erro(400, "Corpo precisa ser um JSON.", "invalid_json");
  }

  let creds;
  try {
    creds = await metaCredsForPhoneNumberId(admin, { organizationId, phoneNumberId });
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] credencial do canal indisponível", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return erro(500, "Não foi possível ler a credencial do canal.", "creds_lookup_failed");
  }
  if (!creds) {
    return erro(404, "Este número não está conectado em Conexões nesta organização.", "channel_not_found");
  }

  let respostaMeta: Response;
  try {
    respostaMeta = await fetch(`https://graph.facebook.com/${versao}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
      body: texto,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] Meta não respondeu", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return erro(502, "A Meta não respondeu.", "meta_unreachable");
  }

  const textoDaMeta = await respostaMeta.text();
  let jsonDaMeta: { messages?: { id?: string }[] } | null = null;
  try {
    jsonDaMeta = JSON.parse(textoDaMeta) as { messages?: { id?: string }[] };
  } catch {
    jsonDaMeta = null;
  }

  const externalId = jsonDaMeta?.messages?.[0]?.id ?? null;
  const para = typeof corpo.to === "string" ? corpo.to : null;
  if (respostaMeta.ok && externalId && para) {
    after(() =>
      gravarNoInbox(admin, { organizationId, phoneNumberId, para, externalId, corpo }).catch((err) => {
        logger.error("[treenity-bot.whatsapp] envio saiu mas não foi gravado no Inbox", {
          organization_id: organizationId,
          external_id: externalId,
          detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
        });
      }),
    );
  }

  return new NextResponse(textoDaMeta, {
    status: respostaMeta.status,
    headers: { "content-type": respostaMeta.headers.get("content-type") ?? "application/json" },
  });
}

interface EnvioFeito {
  organizationId: string;
  phoneNumberId: string;
  para: string;
  externalId: string;
  corpo: Record<string, unknown>;
}

/**
 * Grava a resposta do bot na conversa do cliente. Só grava onde a conversa já
 * pode existir: sem contato com esse número, não cria cadastro — quem
 * escreveu primeiro foi o cliente, e a entrada dele já criou o contato.
 */
async function gravarNoInbox(admin: ReturnType<typeof createAdminClient>, envio: EnvioFeito): Promise<void> {
  const mensagem = mensagemDoCorpo(envio.corpo);
  if (!mensagem) return;

  const base = () =>
    admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", envio.organizationId)
      .eq("meta_phone_number_id", envio.phoneNumberId);
  const { data: sessao, error: erroSessao } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );
  if (erroSessao || !sessao) throw new Error(`sessao: ${erroSessao?.message ?? "não achada"}`);

  const contato = await encontrarContatoPorTelefone(admin, envio.organizationId, envio.para);
  if (!contato) {
    logger.warn("[treenity-bot.whatsapp] resposta do bot para número sem contato no Inbox", {
      organization_id: envio.organizationId,
      external_id: envio.externalId,
    });
    return;
  }

  const { data: conversationId, error: erroConversa } = await admin.rpc(
    "fn_upsert_wa_conversation" as never,
    { p_org: envio.organizationId, p_contact: contato.id, p_session: (sessao as { id: string }).id } as never,
  );
  if (erroConversa || !conversationId) throw new Error(`conversa: ${erroConversa?.message ?? "sem id"}`);

  const agora = new Date().toISOString();
  const { error: erroInsert } = await admin.from("messages").insert({
    organization_id: envio.organizationId,
    conversation_id: conversationId as string,
    channel_session_id: (sessao as { id: string }).id,
    contact_id: contato.id,
    direction: "outbound",
    status: "sent",
    sent_via: "ai",
    type: mensagem.type,
    body: mensagem.body,
    media_url: mensagem.mediaUrl,
    media_mime: mensagem.mediaMime,
    external_id: envio.externalId,
    sent_at: agora,
    metadata: { origem: "treenity_bot" },
  });
  // 23505: a mesma mensagem já foi gravada (o n8n repetiu o envio).
  if (erroInsert && erroInsert.code !== "23505") throw new Error(`mensagem: ${erroInsert.message}`);

  await admin.rpc("fn_mark_conversation_message" as never, {
    p_conv: conversationId as string,
    p_direction: "outbound",
    p_preview: previaDaMensagem(mensagem),
    p_at: agora,
  } as never);
}
