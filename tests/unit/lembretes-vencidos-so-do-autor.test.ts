import { describe, expect, it, vi } from "vitest";

/** A tela só avisa o lembrete de QUEM o criou (ou o antigo, sem autor). */

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "u-dono" }, org: { orgId: "org-1", role: "admin" } }),
}));

const itens = [
  { id: "i1", ref_id: "cv-1", body: JSON.stringify({ lembrete_de: "u-dono" }), created_at: "2026-10-10T13:00:00Z" },
  { id: "i2", ref_id: "cv-2", body: JSON.stringify({ lembrete_de: "u-funcionario" }), created_at: "2026-10-10T13:00:00Z" },
  { id: "i3", ref_id: "cv-3", body: null, created_at: "2026-10-10T13:00:00Z" },
];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "gte", "order"]) q[m] = () => q;
      q.limit = async () => ({ data: itens, error: null });
      q.in = async () => ({
        data: tabela === "conversations"
          ? [{ id: "cv-1", contacts: { display_name: "João", name: null, phone_number: null } },
             { id: "cv-3", contacts: { display_name: "Maria", name: null, phone_number: null } }]
          : [],
      });
      return q;
    },
  }),
}));

import { GET } from "@/app/api/v1/inbox/lembretes-vencidos/route";

describe("lembretes vencidos", () => {
  it("devolve o meu e o sem autor; o do colega não", async () => {
    const corpo = await (await GET()).json();
    expect(corpo.data).toEqual([
      { id: "i1", conversa_id: "cv-1", contato: "João", vencido_em: "2026-10-10T13:00:00Z" },
      { id: "i3", conversa_id: "cv-3", contato: "Maria", vencido_em: "2026-10-10T13:00:00Z" },
    ]);
  });
});
