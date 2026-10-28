import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/auth/public-paths";
import { vencerLembretes } from "@/lib/inbox/vencer-lembretes";

/**
 * "Lembrar" do Inbox (pedido de 10/10): na Vercel o lembrete nunca vencia. Agora
 * o n8n chama `/api/treenity-bot/lembretes/vencer` a cada 5 min com a chave da
 * empresa, e a tela avisa quem criou o lembrete.
 */

type Conversa = {
  id: string; organization_id: string; snoozed_at: string | null; snoozed_by_user_id: string | null;
  last_inbound_at: string | null; status: string; snooze_until: string | null;
};

function bancoFalso(conversas: Conversa[]) {
  const itens: Record<string, unknown>[] = [];
  const filtrosUsados: Record<string, unknown>[] = [];
  return {
    itens,
    filtrosUsados,
    from(tabela: string) {
      if (tabela === "agent_inbox_items") {
        return { insert: async (row: Record<string, unknown>) => { itens.push(row); return { error: null }; } };
      }
      const filtros: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        not: () => q,
        lte: () => q,
        eq: (col: string, v: unknown) => { filtros[col] = v; return q; },
        limit: async () => {
          filtrosUsados.push({ ...filtros });
          return {
            data: conversas.filter((c) => !filtros.organization_id || c.organization_id === filtros.organization_id),
            error: null,
          };
        },
        update: (patch: Record<string, unknown>) => {
          const f: Record<string, unknown> = {};
          const u: Record<string, unknown> = {
            eq: (col: string, v: unknown) => { f[col] = v; return u; },
            not: () => u,
            select: () => u,
            maybeSingle: async () => {
              const c = conversas.find((x) => x.id === f.id && x.snooze_until !== null);
              if (!c) return { data: null };
              Object.assign(c, patch);
              return { data: { id: c.id } };
            },
          };
          return u;
        },
      };
      return q;
    },
  };
}

const conversa = (m: Partial<Conversa> = {}): Conversa => ({
  id: "cv-1", organization_id: "org-1", snoozed_at: "2026-10-10T10:00:00Z", snoozed_by_user_id: "u-dono",
  last_inbound_at: "2026-10-10T09:00:00Z", status: "open", snooze_until: "2026-10-10T13:00:00Z", ...m,
});

describe("vencerLembretes", () => {
  it("cliente não respondeu: reabre e avisa, dizendo quem criou o lembrete", async () => {
    const db = bancoFalso([conversa()]);
    const r = await vencerLembretes(db as never, { organizationId: "org-1" });
    expect(r).toEqual({ scanned: 1, reopened: 1 });
    expect(db.itens[0]).toMatchObject({
      organization_id: "org-1", kind: "snooze_expired", ref_id: "cv-1",
      body: JSON.stringify({ lembrete_de: "u-dono" }),
    });
  });

  it("cliente respondeu depois do lembrete: avisa mesmo assim (o lembrete é de quem marcou)", async () => {
    const db = bancoFalso([conversa({ last_inbound_at: "2026-10-10T11:00:00Z" })]);
    expect(await vencerLembretes(db as never, { organizationId: "org-1" })).toEqual({ scanned: 1, reopened: 1 });
    expect(db.itens).toHaveLength(1);
  });

  it("com organizationId, só olha a empresa dela", async () => {
    const db = bancoFalso([conversa({ organization_id: "org-2" })]);
    expect(await vencerLembretes(db as never, { organizationId: "org-1" })).toEqual({ scanned: 0, reopened: 0 });
    expect(db.filtrosUsados[0]).toMatchObject({ organization_id: "org-1" });
  });

  it("1 mês: avisa e reabre mesmo com o cliente tendo respondido e a conversa fechada", async () => {
    const db = bancoFalso([conversa({
      snoozed_at: "2026-10-10T10:00:00Z", snooze_until: "2026-11-09T10:00:00Z",
      last_inbound_at: "2026-10-20T11:00:00Z", status: "closed",
    })]);
    expect(await vencerLembretes(db as never, { organizationId: "org-1" })).toEqual({ scanned: 1, reopened: 1 });
    expect(db.itens[0]).toMatchObject({ kind: "snooze_expired", title: "Lembrete: hora de falar com o cliente" });
  });

  it("não mexe em conversa arquivada", async () => {
    const db = bancoFalso([conversa({ snooze_until: "2026-11-09T10:00:00Z", status: "archived" })]);
    expect(await vencerLembretes(db as never, { organizationId: "org-1" })).toEqual({ scanned: 1, reopened: 0 });
    expect(db.itens).toHaveLength(0);
  });

  it("lembrete de 3 horas com a conversa fechada também avisa", async () => {
    const db = bancoFalso([conversa({ status: "closed" })]);
    expect(await vencerLembretes(db as never, { organizationId: "org-1" })).toEqual({ scanned: 1, reopened: 1 });
  });

  it("dois ticks seguidos não avisam duas vezes", async () => {
    const db = bancoFalso([conversa()]);
    await vencerLembretes(db as never, { organizationId: "org-1" });
    await vencerLembretes(db as never, { organizationId: "org-1" });
    expect(db.itens).toHaveLength(1);
  });
});

describe("rota do n8n", () => {
  it("é pública só no caminho exato", () => {
    expect(isPublicPath("/api/treenity-bot/lembretes/vencer")).toBe(true);
    expect(isPublicPath("/api/treenity-bot/lembretes/vencer/x")).toBe(false);
  });
});

const estado = { chaveValida: true };
const vencer = vi.fn(async () => ({ scanned: 0, reopened: 0 }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/treenity-bot/whatsapp", () => ({
  organizacaoPelaChave: async () => (estado.chaveValida ? { organizationId: "org-1", config: {} } : null),
}));
vi.mock("@/lib/inbox/vencer-lembretes", async (orig) => ({
  ...(await orig<typeof import("@/lib/inbox/vencer-lembretes")>()),
}));

describe("POST /api/treenity-bot/lembretes/vencer", () => {
  beforeEach(() => { estado.chaveValida = true; vencer.mockClear(); });

  it("sem chave válida: 401", async () => {
    estado.chaveValida = false;
    const { POST } = await import("@/app/api/treenity-bot/lembretes/vencer/route");
    const r = await POST(new NextRequest("https://x.test/api/treenity-bot/lembretes/vencer", { method: "POST" }));
    expect(r.status).toBe(401);
  });
});
