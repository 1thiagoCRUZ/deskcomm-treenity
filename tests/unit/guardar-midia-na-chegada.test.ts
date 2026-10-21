import { beforeEach, describe, expect, it, vi } from "vitest";

const baixou = vi.fn();
// Não é um vi.fn que lança: o runner trata esse erro como do teste.
let falhaDoAdapter: Error | null = null;
const fetchInboundMedia = Object.assign(
  async (...args: unknown[]) => {
    if (falhaDoAdapter) throw falhaDoAdapter;
    return baixou(...args);
  },
  {},
);
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "meta_phone_number_id",
  DEFAULT_CHANNEL_PROVIDER: "meta_cloud",
  getAdapter: () => ({ fetchInboundMedia }),
  resolveSessionRef: () => "ref",
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  deveGuardarNaChegada,
  guardarMidiaNaChegada,
  MAX_BYTES_GUARDAR_NA_CHEGADA,
} from "@/lib/channels/meta/guardar-midia";

describe("deveGuardarNaChegada", () => {
  const ok = { type: "image", mime: "image/jpeg", sizeBytes: 1000 };
  it("guarda imagem e documento dentro dos limites", () => {
    expect(deveGuardarNaChegada(ok)).toBe(true);
    expect(deveGuardarNaChegada({ type: "document", mime: "application/pdf", sizeBytes: 5 })).toBe(true);
    expect(deveGuardarNaChegada({ ...ok, mime: "image/png; charset=x" })).toBe(true);
  });
  it("não guarda vídeo, áudio, mime fora da lista, vazio ou acima de 10 MB", () => {
    expect(deveGuardarNaChegada({ ...ok, type: "video", mime: "video/mp4" })).toBe(false);
    expect(deveGuardarNaChegada({ ...ok, type: "audio", mime: "audio/ogg" })).toBe(false);
    expect(deveGuardarNaChegada({ ...ok, mime: "image/gif" })).toBe(false);
    expect(deveGuardarNaChegada({ ...ok, mime: null })).toBe(false);
    expect(deveGuardarNaChegada({ ...ok, sizeBytes: 0 })).toBe(false);
    expect(deveGuardarNaChegada({ ...ok, sizeBytes: MAX_BYTES_GUARDAR_NA_CHEGADA })).toBe(true);
    expect(deveGuardarNaChegada({ ...ok, sizeBytes: MAX_BYTES_GUARDAR_NA_CHEGADA + 1 })).toBe(false);
  });
});

function fakeAdmin(opts: { storagePath?: string | null; uploadError?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const upload = vi.fn(async () => ({ error: opts.uploadError ? { message: "x" } : null }));
  const filtros: Array<[string, unknown]> = [];
  const admin = {
    storage: { from: () => ({ upload }) },
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => (filtros.push([`${tabela}.${c}`, v]), q);
      q.maybeSingle = async () => ({
        data:
          tabela === "channel_sessions"
            ? { provider: "meta_cloud" }
            : { media_storage_path: opts.storagePath ?? null, metadata: { voice: false } },
      });
      q.update = (v: Record<string, unknown>) => (updates.push(v), q);
      return q;
    },
  };
  return { admin: admin as never, updates, upload, filtros };
}

const base = {
  organizationId: "org-1",
  channelSessionId: "s1",
  conversationId: "c1",
  messageId: "m1",
  type: "image",
  mediaId: "mid",
};

describe("guardarMidiaNaChegada", () => {
  beforeEach(() => {
    baixou.mockReset();
    falhaDoAdapter = null;
  });

  it("baixa, sobe e atualiza a mensagem filtrando pela organização", async () => {
    baixou.mockResolvedValue({ buffer: Buffer.alloc(10), mime: "image/jpeg" });
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("guardada");
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.updates[0]).toMatchObject({
      media_storage_path: "org-1/c1/m1.jpg",
      media_mime: "image/jpeg",
      media_size_bytes: 10,
    });
    expect(f.filtros.every(([c, v]) => !c.endsWith("organization_id") || v === "org-1")).toBe(true);
  });

  it("é idempotente: já guardada não baixa de novo", async () => {
    const f = fakeAdmin({ storagePath: "x/y.jpg" });
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("ja_guardada");
    expect(baixou).not.toHaveBeenCalled();
  });

  it("vídeo e áudio nem tentam baixar", async () => {
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, { ...base, type: "video" })).toBe("ignorada");
    expect(await guardarMidiaNaChegada(f.admin, { ...base, type: "audio" })).toBe("ignorada");
    expect(baixou).not.toHaveBeenCalled();
  });

  it("acima do teto não guarda", async () => {
    baixou.mockResolvedValue({
      buffer: Buffer.alloc(MAX_BYTES_GUARDAR_NA_CHEGADA + 1),
      mime: "image/jpeg",
    });
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("ignorada");
    expect(f.upload).not.toHaveBeenCalled();
  });

  it("adapter que desiste por tamanho: ignorada, sem pending", async () => {
    const { MediaTooLargeError } = await import("@/lib/messaging/media/types");
    falhaDoAdapter = new MediaTooLargeError();
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("ignorada");
    expect(f.updates).toHaveLength(0);
  });

  it("falha do adapter não propaga e marca pending", async () => {
    falhaDoAdapter = new Error("meta fora");
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("pendente");
    expect(f.updates[0]).toMatchObject({ metadata: { voice: false, media_status: "pending" } });
  });

  it("falha do upload não propaga e marca pending", async () => {
    baixou.mockResolvedValue({ buffer: Buffer.alloc(10), mime: "application/pdf" });
    const f = fakeAdmin({ uploadError: true });
    expect(await guardarMidiaNaChegada(f.admin, { ...base, type: "document" })).toBe("pendente");
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0]).toHaveProperty("metadata");
  });
});
