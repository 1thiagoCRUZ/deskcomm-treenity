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
import { MediaTooLargeError, storagePathFor } from "@/lib/messaging/media/types";

import { META_MEDIA_PREFIX } from "./media-ref";

type Admin = SupabaseClient;

export const MAX_BYTES_GUARDAR_NA_CHEGADA = 10 * 1024 * 1024;
export const MIMES_GUARDAR_NA_CHEGADA: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
/** No máximo tantas mídias copiadas por POST do webhook; as demais ficam `pending` para a primeira abertura. */
export const MAX_MIDIAS_POR_POST = 5;
/** O laço de cópias para depois disto (folga sobre o `maxDuration` de 60s do webhook). */
export const PRAZO_DO_LACO_MS = 45_000;
/** Teto do upload ao Storage; passou, vira `pending`. */
export const TIMEOUT_UPLOAD_MS = 20_000;
/**
 * Cota de bytes guardados NA CHEGADA por organização em 24h (soma de
 * `media_size_bytes` das mensagens inbound). O bucket é compartilhado e a cota do
 * Supabase é do cliente: um cliente final mandando PDFs em sequência não pode
 * encher o armazenamento da empresa. Acima disso, o comportamento é o de antes
 * (guarda na primeira abertura).
 */
export const COTA_BYTES_POR_ORG_24H = 500 * 1024 * 1024;

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
 * Confere os primeiros bytes contra o mime declarado. O mime vem da Meta, mas o
 * conteúdo vem do cliente final: não guardamos no bucket o que não é o que diz ser.
 */
export function bytesCasamComMime(buffer: Buffer, mime: string | null | undefined): boolean {
  const m = mimeBase(mime);
  const b = buffer;
  if (m === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (m === "image/png") {
    return b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  }
  if (m === "application/pdf") return b.length >= 5 && b.subarray(0, 5).toString("latin1") === "%PDF-";
  if (m === "image/webp") {
    return (
      b.length >= 12 &&
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP"
    );
  }
  return false;
}

/**
 * `messages.metadata.media_status` — vocabulário compartilhado com
 * `workers/media-persist-worker.ts`: `stored` (cópia no bucket), `failed`, `pending`
 * (ainda não copiada; a primeira abertura no Inbox tenta de novo). Hoje só quem
 * escreve é o código (worker, chegada e rota de mídia); nenhuma tela lê o campo,
 * ele serve de diagnóstico. Escrita por ler e gravar `metadata` (sem RPC atômica,
 * que exigiria migration): uma escrita concorrente no mesmo `metadata` pode perder.
 */
export type MediaStatus = "stored" | "failed" | "pending";

async function definirStatus(
  admin: Admin,
  organizationId: string,
  messageId: string,
  status: MediaStatus,
  extra: Record<string, unknown> = {},
): Promise<{ error: unknown }> {
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
  const { error } = await admin
    .from("messages")
    .update({ ...extra, metadata: { ...atual, media_status: status } })
    .eq("organization_id", organizationId)
    .eq("id", messageId);
  return { error };
}

/**
 * Sobe os bytes e aponta a mensagem para eles (e marca `media_status='stored'`).
 * Compartilhada com a rota de mídia. Devolve o caminho, ou null se o upload (com
 * timeout) ou o update falhou.
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const envio = admin.storage
      .from("whatsapp-media")
      .upload(path, media.buffer, { contentType: media.mime, upsert: true });
    const limite = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), TIMEOUT_UPLOAD_MS);
    });
    const r = await Promise.race([envio, limite]);
    if (r === "timeout" || r.error) return null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const { error } = await definirStatus(admin, organizationId, messageId, "stored", {
    media_storage_path: path,
    media_mime: media.mime,
    media_size_bytes: media.buffer.byteLength,
  });
  return error ? null : path;
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

export type GuardarMidiaResultado = "guardada" | "ignorada" | "ja_guardada" | "pendente";

async function marcarPendente(admin: Admin, organizationId: string, messageId: string) {
  await definirStatus(admin, organizationId, messageId, "pending");
}

/** Marca `pending` antes de agendar a cópia. Nunca lança. */
export async function marcarMidiasPendentes(admin: Admin, entradas: GuardarMidiaInput[]) {
  await Promise.all(
    entradas.map((e) =>
      marcarPendente(admin, e.organizationId, e.messageId).catch((err) =>
        logger.warn("[meta.midia] não marcou pending", {
          organization_id: e.organizationId,
          message_id: e.messageId,
          erro: err instanceof Error ? err.message : "desconhecido",
        }),
      ),
    ),
  );
}

interface Execucao {
  resultado: GuardarMidiaResultado;
  bytes: number;
}

async function executar(
  admin: Admin,
  input: GuardarMidiaInput,
  restanteBytes: number,
): Promise<Execucao> {
  const { organizationId, messageId } = input;
  const nada = (resultado: GuardarMidiaResultado): Execucao => ({ resultado, bytes: 0 });
  if (!tipoGuardaNaChegada(input.type) || !input.mediaId) return nada("ignorada");
  const ctx = { organization_id: organizationId, message_id: messageId, tipo: input.type };

  try {
    const { data: atual } = await admin
      .from("messages")
      .select("media_storage_path")
      .eq("organization_id", organizationId)
      .eq("id", messageId)
      .maybeSingle();
    if ((atual as { media_storage_path?: string | null } | null)?.media_storage_path) {
      return nada("ja_guardada");
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
      return nada("pendente");
    }

    const media = await adapter.fetchInboundMedia({
      organizationId,
      sessionRef,
      url: `${META_MEDIA_PREFIX}${input.mediaId}`,
      hintMime: input.hintMime ?? null,
      maxBytes: Math.min(MAX_BYTES_GUARDAR_NA_CHEGADA, restanteBytes),
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
      return nada("ignorada");
    }
    if (!bytesCasamComMime(media.buffer, media.mime)) {
      logger.warn("[meta.midia] conteúdo não confere com o mime declarado, não guardada", {
        ...ctx,
        mime: mimeBase(media.mime),
      });
      return nada("ignorada");
    }
    if (media.buffer.byteLength > restanteBytes) return nada("ignorada");

    const path = await gravarMidiaNoStorage(admin, {
      organizationId,
      conversationId: input.conversationId,
      messageId,
      media,
    });
    if (!path) {
      logger.error("[meta.midia] upload falhou", ctx);
      await marcarPendente(admin, organizationId, messageId);
      return nada("pendente");
    }
    return { resultado: "guardada", bytes: media.buffer.byteLength };
  } catch (err) {
    if (err instanceof MediaTooLargeError) {
      logger.info("[meta.midia] arquivo acima do teto, não guardado na chegada", {
        ...ctx,
        limite: err.limite,
      });
      return nada("ignorada");
    }
    logger.error("[meta.midia] falha ao guardar na chegada", {
      ...ctx,
      erro: err instanceof Error ? err.message : "desconhecido",
    });
    try {
      await marcarPendente(admin, organizationId, messageId);
    } catch {
      /* só loga: a primeira abertura tenta de novo */
    }
    return nada("pendente");
  }
}

/** Nunca lança. Uma mídia, sem cota (a cota é do lote: `guardarMidiasDoPost`). */
export async function guardarMidiaNaChegada(
  admin: Admin,
  input: GuardarMidiaInput,
  opcoes: { restanteBytes?: number } = {},
): Promise<GuardarMidiaResultado> {
  return (await executar(admin, input, opcoes.restanteBytes ?? Number.POSITIVE_INFINITY)).resultado;
}

/** Bytes já guardados pela organização nas últimas 24h; null se não deu para medir. */
async function bytesGuardadosEm24h(admin: Admin, organizationId: string): Promise<number | null> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("messages")
    .select("media_size_bytes")
    .eq("organization_id", organizationId)
    .eq("direction", "inbound")
    .not("media_size_bytes", "is", null)
    .gte("created_at", desde)
    .limit(20000);
  if (error) return null;
  return ((data ?? []) as Array<{ media_size_bytes: number | null }>).reduce(
    (soma, l) => soma + (l.media_size_bytes ?? 0),
    0,
  );
}

/**
 * Copia as mídias de UM POST do webhook, em série. Nunca lança. Respeita: máximo de
 * `MAX_MIDIAS_POR_POST`, prazo do laço e cota da organização em 24h (uma consulta
 * por POST). O que ficar de fora já está `pending` (ver `marcarMidiasPendentes`).
 * Todas as entradas são da mesma organização (a do token do webhook).
 */
export async function guardarMidiasDoPost(
  admin: Admin,
  entradas: GuardarMidiaInput[],
  agora: () => number = Date.now,
): Promise<{ guardadas: number; restantes: number }> {
  const inicio = agora();
  try {
    const lote = entradas.slice(0, MAX_MIDIAS_POR_POST);
    let restantes = entradas.length - lote.length;
    if (lote.length === 0) return { guardadas: 0, restantes };
    const orgId = lote[0]!.organizationId;

    const usados = await bytesGuardadosEm24h(admin, orgId);
    if (usados === null || usados >= COTA_BYTES_POR_ORG_24H) {
      logger.warn("[meta.midia] cota diária de mídia na chegada não permite guardar", {
        organization_id: orgId,
        medida: usados !== null,
      });
      return { guardadas: 0, restantes: entradas.length };
    }
    let restanteBytes = COTA_BYTES_POR_ORG_24H - usados;

    let guardadas = 0;
    for (let i = 0; i < lote.length; i++) {
      if (agora() - inicio > PRAZO_DO_LACO_MS) {
        restantes += lote.length - i;
        logger.warn("[meta.midia] prazo do laço esgotado, o resto fica pending", {
          organization_id: orgId,
          restantes,
        });
        break;
      }
      const r = await executar(admin, lote[i]!, restanteBytes);
      if (r.resultado === "guardada") {
        guardadas += 1;
        restanteBytes -= r.bytes;
      }
    }
    if (restantes > 0) {
      logger.info("[meta.midia] mídias deixadas para a primeira abertura", { restantes });
    }
    return { guardadas, restantes };
  } catch (err) {
    logger.error("[meta.midia] falha no lote", {
      erro: err instanceof Error ? err.message : "desconhecido",
    });
    return { guardadas: 0, restantes: entradas.length };
  }
}
