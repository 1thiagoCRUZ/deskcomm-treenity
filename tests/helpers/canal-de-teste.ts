/**
 * Canal de TESTE para o handler de envio (`sendMessageHandler`).
 *
 * O handler só conhece o contrato `ChannelAdapter`; o que ele decide (gates,
 * desfechos, estados da mensagem) não depende de QUAL transporte entrega. Estes
 * testes precisam de um transporte HTTP simulável com `fetch`, e o adapter real
 * da Meta busca credencial no banco — então o teste troca o adapter por este.
 *
 * Uso, no topo do arquivo de teste (o `vi.mock` é içado):
 *
 *   vi.mock("@/lib/channels/adapters/meta-cloud", async () => ({
 *     metaCloudAdapter: (await import("../helpers/canal-de-teste")).canalDeTeste,
 *   }));
 *
 * Configurado quando `CANAL_TESTE_URL` está no ambiente. Fala em `/api/sendText`,
 * `/api/sendImage` etc., e lê o id da resposta como o handler espera.
 */
import type { ChannelAdapter, OutboundEnvelope, RecipientInput } from "@/lib/channels/types";

export const CANAL_TESTE_URL = "http://localhost:3030";

function base(): string {
  return process.env.CANAL_TESTE_URL ?? "";
}

function idDaResposta(res: unknown): string | null {
  const r = res as { key?: { id?: string }; id?: string | { _serialized?: string } } | null;
  if (r?.key?.id) return r.key.id;
  if (typeof r?.id === "string") return r.id;
  if (r?.id && typeof r.id === "object") return r.id._serialized ?? null;
  return null;
}

async function chamar(rota: string, corpo: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${base()}/api/${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) throw new Error(`canal_${res.status}`);
  return res.json();
}

const ROTA_DA_MIDIA: Record<string, string> = {
  image: "sendImage",
  video: "sendVideo",
  audio: "sendVoice",
  document: "sendFile",
};

export const canalDeTeste: ChannelAdapter = {
  provider: "meta_cloud",

  resolveRecipient(input: RecipientInput): string | null {
    if (input.isGroup && input.groupChatId) return input.groupChatId;
    if (input.phoneNumber) return `${input.phoneNumber.replace(/\D/g, "")}@c.us`;
    return null;
  },

  isConfigured: () => base() !== "",

  codes: {
    notConfigured: "canal_not_configured",
    sendFailed: "canal_error",
    unknownError: "canal_unknown",
  },

  async send(envelope: OutboundEnvelope): Promise<{ externalId: string | null }> {
    if (!base()) return { externalId: null };
    await envelope.beforeSend?.();
    if (envelope.media) {
      const rota = ROTA_DA_MIDIA[envelope.kind] ?? "sendFile";
      const res = await chamar(rota, {
        session: envelope.sessionRef,
        chatId: envelope.to,
        file: { url: envelope.media.url, mimetype: envelope.media.mime },
        caption: envelope.media.caption ?? undefined,
      });
      return { externalId: idDaResposta(res) };
    }
    const res = await chamar("sendText", {
      session: envelope.sessionRef,
      chatId: envelope.to,
      text: envelope.body ?? "",
      reply_to: envelope.replyToExternalId ?? undefined,
    });
    return { externalId: idDaResposta(res) };
  },
};
