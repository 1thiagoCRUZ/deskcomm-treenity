import { describe, expect, it } from "vitest";

import { MENSAGEM_SEM_SUPORTE, parseMetaWebhook, type InboundMessageEvent } from "@/lib/channels/meta/webhook";

/**
 * MENSAGEM DO CLIENTE DE TIPO QUE O CRM NÃO GUARDA NÃO PODE SUMIR.
 *
 * `messages.type` tem CHECK; `unsupported`, `button`, `interactive` iam crus para
 * o INSERT, eram recusados, e a conversa ficava "o cliente nunca escreveu" — a
 * janela de 24h nunca abria e a equipe não conseguia responder (2026-10-02).
 */
function envelope(msg: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: "pn-1", display_phone_number: "5514997317147" },
          contacts: [{ wa_id: "5511919351515", profile: { name: "Cliente" } }],
          messages: [{ id: "wamid.X", from: "5511919351515", timestamp: "1790900000", ...msg }],
        },
      }],
    }],
  } as unknown as Parameters<typeof parseMetaWebhook>[0];
}
const inbound = (msg: Record<string, unknown>) =>
  parseMetaWebhook(envelope(msg)).find((e): e is InboundMessageEvent => e.kind === "inbound_message")!;

describe("tipos que o CRM não guarda viram texto legível", () => {
  it("⭐ `unsupported` entra como texto com o aviso, e não some", () => {
    const e = inbound({ type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] });
    expect(e.type).toBe("text");
    expect(e.text).toBe(MENSAGEM_SEM_SUPORTE);
  });

  it("clique em botão de modelo vira o texto do botão", () => {
    const e = inbound({ type: "button", button: { text: "Quero comprar", payload: "x" } });
    expect(e).toMatchObject({ type: "text", text: "Quero comprar" });
  });

  it("resposta de lista/botão interativo vira o título escolhido", () => {
    const e = inbound({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "1", title: "Kit 20 L" } } });
    expect(e).toMatchObject({ type: "text", text: "Kit 20 L" });
  });

  it("CONTROLE — texto, figurinha e localização seguem como eram", () => {
    expect(inbound({ type: "text", text: { body: "oi" } })).toMatchObject({ type: "text", text: "oi" });
    expect(inbound({ type: "sticker", sticker: { id: "m1", mime_type: "image/webp" } }).type).toBe("sticker");
    expect(inbound({ type: "location", location: { latitude: 1, longitude: 2 } }).type).toBe("location");
  });
});
