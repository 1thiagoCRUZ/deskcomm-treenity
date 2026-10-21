/**
 * Guarda a mídia recebida pelo canal oficial NA CHEGADA.
 *
 * A Meta descarta o arquivo em ~30 dias. Antes, os bytes só eram copiados para o
 * bucket `whatsapp-media` na primeira abertura no Inbox; uma imagem nunca aberta
 * (um comprovante de Pix, por exemplo) se perdia. Aqui a cópia sai logo depois da
 * gravação da mensagem, em segundo plano (`after()` na rota do webhook), sem fila.
 *
 * Regras: nunca lança (falha só loga e marca `metadata.media_status='pending'`,
 * e a primeira abertura tenta de novo como antes); idempotente (já tem
 * `media_storage_path` → não faz nada); só imagem e documento, com mime e
 * tamanho limitados. A organização vem do chamador (token do webhook).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHANNEL_SESSION_REF_COLUMNS,
  DEFAULT_CHANNEL_PROVIDER,
  getAdapter,
  resolveSessionRef,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { logger } from "@/lib/logger";
import { storagePathFor } from "@/lib/messaging/media/types";

import { META_MEDIA_PREFIX } from "./media-ref";

type Admin = SupabaseClient;

export const MAX_BYTES_GUARDAR_NA_CHEGADA = 10 * 1024 * 1024;
export const MIMES_GUARDAR_NA_CHEGADA: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const TIPOS_GUARDAR_NA_CHEGADA: readonly string[] = ["image", "document"];

function mimeBase(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0]!.trim().toLowerCase();
}

/** Antes de baixar: o tipo da mensagem decide se vale tentar. */
export function tipoGuardaNaChegada(type: string): boolean {
  return TIPOS_GUARDAR_NA_CHEGADA.includes(type);
}

/** Depois de baixar: mime e tamanho reais decidem se guarda. */
export function deveGuardarNaChegada(input: {
  type: string;
  mime: string | null | undefined;
  sizeBytes: number;
}): boolean {
  return (
    tipoGuardaNaChegada(input.type) &&
    MIMES_GUARDAR_NA_CHEGADA.includes(mimeBase(input.mime)) &&
    input.sizeBytes > 0 &&
    input.sizeBytes <= MAX_BYTES_GUARDAR_NA_CHEGADA
  );
}

/**
 * Sobe os bytes e aponta a mensagem para eles. Compartilhada com a rota de mídia.
 * Devolve o caminho gravado, ou null se o upload falhou (quem chama decide o que fazer).
 */
export async function gravarMidiaNoStorage(
  admin: Admin,
  input: {
    organizationId: string;
    conversationId: string;
    messageId: string;
    media: { buffer: Buffer; mime: string };
  },
): Promise<string | null> {
  const { organizationId, conversationId, messageId, media } = input;
  const path = storagePathFor(organizationId, conversationId, messageId, media.mime);
  const { error: upErr } = await admin.storage
    .from("whatsapp-media")
    .upload(path, media.buffer, { contentType: media.mime, upsert: true });
  if (upErr) return null;
  await admin
    .from("messages")
    .update({
      media_storage_path: path,
      media_mime: media.mime,
      media_size_bytes: media.buffer.byteLength,
    })
    .eq("organization_id", organizationId)
    .eq("id", messageId);
  return path;
}

export interface GuardarMidiaInput {
  organizationId: string;
  channelSessionId: string;
  conversationId: string;
  messageId: string;
  type: string;
  mediaId: string | null | undefined;
  hintMime?: string | null;
}

export type GuardarMidiaResultado =
  | "guardada"
  | "ignorada"
  | "ja_guardada"
  | "pendente";

async function marcarPendente(admin: Admin, organizationId: string, messageId: string) {
  const { data } = await admin
    .from("messages")
    .select("metadata")
    .eq("organization_id", organizationId)
    .eq("id", messageId)
    .maybeSingle();
  const atual = ((data as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
    string,
    unknown
  >;
  await admin
    .from("messages")
    .update({ metadata: { ...atual, media_status: "pending" } })
    .eq("organization_id", organizationId)
    .eq("id", messageId);
}

/** Nunca lança. */
export async function guardarMidiaNaChegada(
  admin: Admin,
  input: GuardarMidiaInput,
): Promise<GuardarMidiaResultado> {
  const { organizationId, messageId } = input;
  if (!tipoGuardaNaChegada(input.type) || !input.mediaId) return "ignorada";
  const ctx = { organization_id: organizationId, message_id: messageId, tipo: input.type };

  try {
    const { data: atual } = await admin
      .from("messages")
      .select("media_storage_path")
      .eq("organization_id", organizationId)
      .eq("id", messageId)
      .maybeSingle();
    if ((atual as { media_storage_path?: string | null } | null)?.media_storage_path) {
      return "ja_guardada";
    }

    const { data: sessao } = await admin
      .from("channel_sessions")
      .select(`provider, ${CHANNEL_SESSION_REF_COLUMNS}`)
      .eq("organization_id", organizationId)
      .eq("id", input.channelSessionId)
      .maybeSingle();
    const adapter = getAdapter(
      ((sessao as { provider?: string } | null)?.provider ?? DEFAULT_CHANNEL_PROVIDER) as ChannelProvider,
    );
    const sessionRef = sessao ? resolveSessionRef(sessao as unknown as ChannelSessionRef) : null;
    if (!adapter.fetchInboundMedia || !sessionRef) {
      logger.warn("[meta.midia] canal sem busca de mídia de entrada", ctx);
      await marcarPendente(admin, organizationId, messageId);
      return "pendente";
    }

    const media = await adapter.fetchInboundMedia({
      organizationId,
      sessionRef,
      url: `${META_MEDIA_PREFIX}${input.mediaId}`,
      hintMime: input.hintMime ?? null,
    });

    if (
      !deveGuardarNaChegada({ type: input.type, mime: media.mime, sizeBytes: media.buffer.byteLength })
    ) {
      // Fora do teto/lista: comportamento atual (a primeira abertura cuida).
      logger.info("[meta.midia] fora do critério, não guardada na chegada", {
        ...ctx,
        mime: mimeBase(media.mime),
        bytes: media.buffer.byteLength,
      });
      return "ignorada";
    }

    const path = await gravarMidiaNoStorage(admin, {
      organizationId,
      conversationId: input.conversationId,
      messageId,
      media,
    });
    if (!path) {
      logger.error("[meta.midia] upload falhou", ctx);
      await marcarPendente(admin, organizationId, messageId);
      return "pendente";
    }
    return "guardada";
  } catch (err) {
    logger.error("[meta.midia] falha ao guardar na chegada", {
      ...ctx,
      erro: err instanceof Error ? err.message : "desconhecido",
    });
    try {
      await marcarPendente(admin, organizationId, messageId);
    } catch {
      /* só loga: a primeira abertura tenta de novo */
    }
    return "pendente";
  }
}
