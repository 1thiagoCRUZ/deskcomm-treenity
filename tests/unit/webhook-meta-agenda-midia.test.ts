import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterMock }));

const ingest = vi.fn();
const guardarLote = vi.fn(async () => ({ guardadas: 0, restantes: 0 }));
const marcar = vi.fn(async () => undefined);
let eventos: unknown[] = [];

vi.mock("@/lib/channels/meta/ingest", () => ({ ingestMetaInbound: (...a: unknown[]) => ingest(...a) }));
vi.mock("@/lib/channels/meta/guardar-midia", () => ({
  guardarMidiasDoPost: (...a: unknown[]) => guardarLote(...(a as [])),
  marcarMidiasPendentes: (...a: unknown[]) => marcar(...(a as [])),
}));
vi.mock("@/lib/channels/meta/session", () => ({
  metaSessionByWebhookToken: async () => ({ organizationId: "org-1", wabaId: null }),
}));
vi.mock("@/lib/channels/meta/envelope", () => ({ lerEnvelopeMeta: () => ({ ok: true, envelope: {} }) }));
vi.mock("@/lib/channels/meta/webhook", () => ({
  parseMetaWebhook: () => eventos,
  verifyMetaSignature: () => true,
  verificationChallenge: () => null,
}));
vi.mock("@/lib/treenity-bot/whatsapp", () => ({ repassarAoBot: async () => ({ enviado: false }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from "@/app/api/v1/webhooks/meta/[token]/route";

const ev = (type: string, id: string) => ({
  kind: "inbound_message",
  type,
  externalId: id,
  phoneNumberId: "p",
  wabaId: null,
  from: "5531",
  media: { id: "123", mime: "image/jpeg" },
});

function chamar() {
  const req = new Request("http://x/api/v1/webhooks/meta/t", { method: "POST", body: "{}" });
  return POST(req as never, { params: Promise.resolve({ token: "t" }) });
}

describe("webhook Meta agenda a cópia da mídia", () => {
  beforeEach(() => {
    afterMock.mockReset();
    ingest.mockReset();
    guardarLote.mockClear();
    marcar.mockClear();
  });

  it("agenda só image/document ingeridos, em um único after, depois de marcar pending", async () => {
    eventos = [ev("image", "a"), ev("document", "b"), ev("video", "c"), ev("audio", "d"), ev("text", "e")];
    ingest.mockImplementation(async (_a: unknown, e: { externalId: string }) => ({
      status: "ingested",
      messageId: `m-${e.externalId}`,
      conversationId: "c1",
      channelSessionId: "s1",
    }));
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(marcar).toHaveBeenCalledOnce();
    const entradas = (marcar.mock.calls[0] as unknown as [unknown, Array<{ messageId: string; organizationId: string }>])[1];
    expect(entradas.map((e) => e.messageId)).toEqual(["m-a", "m-b"]);
    expect(entradas.every((e) => e.organizationId === "org-1")).toBe(true);
    expect(afterMock).toHaveBeenCalledOnce();
    await (afterMock.mock.calls[0]![0] as () => Promise<void>)();
    expect(guardarLote).toHaveBeenCalledOnce();
  });

  it("não agenda em duplicate nem em falha", async () => {
    eventos = [ev("image", "a"), ev("image", "b")];
    ingest.mockResolvedValueOnce({ status: "duplicate" }).mockResolvedValueOnce({ status: "failed", reason: "x" });
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(afterMock).not.toHaveBeenCalled();
    expect(marcar).not.toHaveBeenCalled();
  });

  it("responde 200 mesmo se o after lançar", async () => {
    eventos = [ev("image", "a")];
    ingest.mockResolvedValue({ status: "ingested", messageId: "m", conversationId: "c", channelSessionId: "s" });
    afterMock.mockImplementation(() => {
      throw new Error("fora de escopo");
    });
    const res = await chamar();
    expect(res.status).toBe(200);
  });
});
