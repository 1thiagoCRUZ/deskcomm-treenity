/**
 * Envio pelo canal OFICIAL do WhatsApp em nome do bot, com o registro no Inbox.
 *
 * Usado por duas rotas, para o caminho ser um só:
 *   - `/api/treenity-bot/whatsapp/{versao}/{phone_number_id}/messages`, o espelho
 *     da Graph API que o n8n usa para as respostas do bot;
 *   - `/api/treenity-bot/whatsapp/enviar-texto`, a ferramenta com que o bot manda
 *     um texto NA HORA, no meio do raciocínio (ex.: a apresentação antes dos
 *     vídeos), com corpo simples.
 *
 * Gravar no Inbox acontece DEPOIS da resposta (`after`): o bot não espera o
 * banco, e uma falha ao gravar não desfaz um envio que já saiu.
 */
import { after } from "next/server";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { metaCredsForPhoneNumberId } from "@/lib/channels/meta/credentials";
import { repassarEnvioOficial } from "@/lib/channels/meta/repasse-de-envio";
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";
import { mensagemDoCorpo, previaDaMensagem } from "@/lib/treenity-bot/whatsapp";

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoDoEnvio =
  | { ok: true; status: number; textoDaMeta: string; contentType: string; externalId: string | null }
  | { ok: false; status: number; message: string; code: string };

export async function enviarPeloCanalOficial(args: {
  admin: Admin;
  organizationId: string;
  versao: string;
  phoneNumberId: string;
  /** O corpo exatamente como vai para a Meta (JSON em texto). */
  texto: string;
  corpo: Record<string, unknown>;
}): Promise<ResultadoDoEnvio> {
  const { admin, organizationId, versao, phoneNumberId, texto, corpo } = args;
  let creds;
  try {
    creds = await metaCredsForPhoneNumberId(admin, { organizationId, phoneNumberId });
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] credencial do canal indisponível", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { ok: false, status: 500, message: "Não foi possível ler a credencial do canal.", code: "creds_lookup_failed" };
  }
  if (!creds) {
    return {
      ok: false,
      status: 404,
      message: "Este número não está conectado em Conexões nesta organização.",
      code: "channel_not_found",
    };
  }

  let respostaMeta: Response;
  try {
    respostaMeta = await repassarEnvioOficial({ versao, phoneNumberId, token: creds.token, corpo: texto });
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] Meta não respondeu", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { ok: false, status: 502, message: "A Meta não respondeu.", code: "meta_unreachable" };
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

  return {
    ok: true,
    status: respostaMeta.status,
    textoDaMeta,
    contentType: respostaMeta.headers.get("content-type") ?? "application/json",
    externalId,
  };
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
async function gravarNoInbox(admin: Admin, envio: EnvioFeito): Promise<void> {
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
