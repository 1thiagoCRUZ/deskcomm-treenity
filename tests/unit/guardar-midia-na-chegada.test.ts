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
  bytesCasamComMime,
  COTA_BYTES_POR_ORG_24H,
  deveGuardarNaChegada,
  guardarMidiaNaChegada,
  guardarMidiasDoPost,
  MAX_BYTES_GUARDAR_NA_CHEGADA,
  MAX_MIDIAS_POR_POST,
  PRAZO_DO_LACO_MS,
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

const JPEG = (n = 10) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n - 3)]);
const PDF = Buffer.from("%PDF-1.4 conteudo");

function fakeAdmin(
  opts: { storagePath?: string | null; uploadError?: boolean; usados?: number | null; linhas?: number } = {},
) {
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
      q.not = () => q;
      q.gte = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.then = (res: (v: unknown) => unknown) =>
        res(
          opts.usados === null
            ? { data: null, error: { message: "x" } }
            : { data: Array.from({ length: opts.linhas ?? 1 }, () => ({ media_size_bytes: opts.usados ?? 0 })), error: null },
        );
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
    baixou.mockResolvedValue({ buffer: JPEG(), mime: "image/jpeg" });
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("guardada");
    expect(f.upload).toHaveBeenCalledOnce();
    expect(f.updates[0]).toMatchObject({
      media_storage_path: "org-1/c1/m1.jpg",
      media_mime: "image/jpeg",
      media_size_bytes: 10,
      metadata: { voice: false, media_status: "stored" },
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
    baixou.mockResolvedValue({ buffer: PDF, mime: "application/pdf" });
    const f = fakeAdmin({ uploadError: true });
    expect(await guardarMidiaNaChegada(f.admin, { ...base, type: "document" })).toBe("pendente");
    expect(f.updates).toHaveLength(1);
    expect(f.updates[0]).toHaveProperty("metadata");
  });

  it("conteúdo que não confere com o mime declarado não é guardado", async () => {
    baixou.mockResolvedValue({ buffer: Buffer.from("<html>nao sou jpeg</html>"), mime: "image/jpeg" });
    const f = fakeAdmin();
    expect(await guardarMidiaNaChegada(f.admin, base)).toBe("ignorada");
    expect(f.upload).not.toHaveBeenCalled();
  });
});

describe("bytesCasamComMime", () => {
  it("confere assinatura de jpeg, png, pdf e webp", () => {
    expect(bytesCasamComMime(JPEG(), "image/jpeg")).toBe(true);
    expect(bytesCasamComMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]), "image/png")).toBe(true);
    expect(bytesCasamComMime(PDF, "application/pdf; x=y")).toBe(true);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
    expect(bytesCasamComMime(webp, "image/webp")).toBe(true);
  });
  it("rejeita troca de tipo, vazio e mime desconhecido", () => {
    expect(bytesCasamComMime(PDF, "image/jpeg")).toBe(false);
    expect(bytesCasamComMime(Buffer.alloc(0), "application/pdf")).toBe(false);
    expect(bytesCasamComMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]), "image/webp")).toBe(false);
    expect(bytesCasamComMime(JPEG(), "image/gif")).toBe(false);
  });
});

describe("guardarMidiasDoPost", () => {
  const entradas = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...base, messageId: `m${i}` }));
  beforeEach(() => {
    baixou.mockReset();
    baixou.mockResolvedValue({ buffer: JPEG(), mime: "image/jpeg" });
  });

  it("guarda no máximo 5 por POST; o resto fica para a primeira abertura", async () => {
    const f = fakeAdmin();
    const r = await guardarMidiasDoPost(f.admin, entradas(8));
    expect(MAX_MIDIAS_POR_POST).toBe(5);
    expect(r).toEqual({ guardadas: 5, restantes: 3 });
    expect(baixou).toHaveBeenCalledTimes(5);
  });

  it("acima da cota de 24h não guarda nada", async () => {
    const f = fakeAdmin({ usados: COTA_BYTES_POR_ORG_24H });
    const r = await guardarMidiasDoPost(f.admin, entradas(2));
    expect(r.guardadas).toBe(0);
    expect(baixou).not.toHaveBeenCalled();
  });

  it("consulta de cota lotada (corte do PostgREST) conta como estourada", async () => {
    const f = fakeAdmin({ usados: 1, linhas: 999 });
    expect((await guardarMidiasDoPost(f.admin, entradas(1))).guardadas).toBe(0);
    expect(baixou).not.toHaveBeenCalled();
  });

  it("cota que não pôde ser medida: não guarda", async () => {
    const f = fakeAdmin({ usados: null });
    expect((await guardarMidiasDoPost(f.admin, entradas(1))).guardadas).toBe(0);
    expect(baixou).not.toHaveBeenCalled();
  });

  it("passa ao adapter só o que resta da cota", async () => {
    const f = fakeAdmin({ usados: COTA_BYTES_POR_ORG_24H - 5 });
    const r = await guardarMidiasDoPost(f.admin, entradas(1));
    // JPEG de 10 bytes > 5 restantes: não grava
    expect(r.guardadas).toBe(0);
    expect(f.upload).not.toHaveBeenCalled();
  });

  it("para o laço quando o prazo acaba", async () => {
    const f = fakeAdmin();
    let t = 0;
    const agora = () => {
      const v = t;
      t += PRAZO_DO_LACO_MS / 2 + 1; // cada leitura do relógio avança meio prazo
      return v;
    };
    const r = await guardarMidiasDoPost(f.admin, entradas(4), agora);
    expect(r.guardadas).toBeLessThan(4);
    expect(r.restantes).toBeGreaterThan(0);
  });
});
