/**
 * O FILTRO POR ETAPA DO INBOX (Spec 18, F3) — três elos, provados separados porque
 * quebram separados:
 *
 *   1. a ROTA lê `?etapa=` (a cadeia do `tag` já rompeu exatamente aqui: o schema
 *      aceitava, o hook mandava, o handler implementava — e a rota não lia);
 *   2. o HANDLER monta um JOIN no banco, com o filtro de organização, e NÃO uma lista
 *      de ids na URL (o muro de 8 KB do gateway);
 *   3. a rota que alimenta o SELETOR devolve só os funis/etapas da organização ativa.
 *
 * ⚠️ O QUE ESTES TESTES NÃO PROVAM: que o PostgREST de verdade aceita o embed aninhado
 * com `!inner` e o filtro `contacts.crm_leads.stage_id`. Isso só se prova com banco —
 * está na spec e no mapa de jornadas como pendente de e2e.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as HandlerReal from "@/app/api/v1/conversations/_handler";

const ETAPA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// elo 1 — a rota lê o parâmetro
// ---------------------------------------------------------------------------

const listConversationsHandler = vi.fn(async () => ({
  conversations: [],
  cursor: null,
  has_more: false,
}));

vi.mock("@/app/api/v1/conversations/_handler", async (importOriginal) => {
  const real = await importOriginal<typeof HandlerReal>();
  return { ...real, listConversationsHandler };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  mfaEmDivida: vi.fn(async () => false),
  loadAuthUser: async () => ({ id: "u-1" }),
  resolveActiveOrg: async () => ({ orgId: "org-1", role: "agent" }),
}));

async function queryRecebidaCom(qs: string): Promise<Record<string, unknown>> {
  const { GET } = await import("@/app/api/v1/conversations/route");
  const res = await GET(new NextRequest(`http://x/api/v1/conversations${qs}`));
  const chamada = listConversationsHandler.mock.calls.at(-1) as unknown[] | undefined;
  if (!chamada) throw new Error(`o handler não foi chamado — a rota respondeu ${res.status}`);
  return chamada[2] as Record<string, unknown>;
}

describe("GET /api/v1/conversations — o `etapa` da query string chega ao handler", () => {
  beforeEach(() => listConversationsHandler.mockClear());

  it("com `?etapa=<uuid>`, o handler recebe a etapa", async () => {
    expect((await queryRecebidaCom(`?etapa=${ETAPA}`)).etapa).toBe(ETAPA);
  });

  it("sem `etapa` na URL, chega `undefined` (guarda de vacuidade)", async () => {
    expect((await queryRecebidaCom("")).etapa).toBeUndefined();
  });

  it("convive com os outros filtros — `?status=open&etapa=<uuid>`", async () => {
    const q = await queryRecebidaCom(`?status=open&etapa=${ETAPA}`);
    expect([q.status, q.etapa]).toEqual([["open"], ETAPA]);
  });

  it("etapa que não é UUID → 422, e o handler NÃO é chamado", async () => {
    // Recusar em vez de ignorar: um filtro descartado devolveria a lista INTEIRA,
    // que parece resposta.
    const { GET } = await import("@/app/api/v1/conversations/route");
    listConversationsHandler.mockClear();
    const res = await GET(new NextRequest("http://x/api/v1/conversations?etapa=banana"));
    expect(res.status).toBe(422);
    expect(listConversationsHandler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// elo 2 — o handler monta o JOIN
// ---------------------------------------------------------------------------

interface Chamada {
  tabela: string;
  metodo: string;
  args: unknown[];
}

function fakeSupabase(linhas: unknown[] = []) {
  const chamadas: Chamada[] = [];
  const client = {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (ok: (v: unknown) => unknown) => ok({ data: linhas, error: null });
            }
            return (...args: unknown[]) => {
              chamadas.push({ tabela, metodo: String(prop), args });
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { client: client as never, chamadas };
}

const ctx = {
  organization_id: "org-1",
  requestId: "req-1",
  actor: { type: "user" as const, id: "user-1" },
} as never;

async function listar(q: Record<string, unknown>, linhas: unknown[] = []) {
  const { listConversationsHandler: real } = await vi.importActual<typeof HandlerReal>(
    "@/app/api/v1/conversations/_handler",
  );
  const { client, chamadas } = fakeSupabase(linhas);
  const out = await real(client, ctx, { limit: 50, ...q } as never);
  return { chamadas, out };
}

const selectDe = (c: Chamada[]) =>
  String(c.find((x) => x.tabela === "conversations" && x.metodo === "select")?.args[0] ?? "");
const eqs = (c: Chamada[]) =>
  c.filter((x) => x.tabela === "conversations" && x.metodo === "eq").map((x) => x.args as [string, unknown]);

describe("listConversationsHandler — etapa vira JOIN no banco", () => {
  it("com etapa: o contato e o lead entram como INNER JOIN, com o hint da FK", async () => {
    const { chamadas } = await listar({ etapa: ETAPA });
    const sel = selectDe(chamadas);
    expect(sel).toMatch(/contacts:contact_id!inner/);
    expect(sel).toMatch(/crm_leads!crm_leads_contact_id_fkey!inner\s*\(stage_id\)/);
  });

  it("filtra pela etapa E pela organização no lead (service role bypassa RLS)", async () => {
    const { chamadas } = await listar({ etapa: ETAPA });
    const e = eqs(chamadas);
    expect(e).toContainEqual(["contacts.crm_leads.stage_id", ETAPA]);
    expect(e).toContainEqual(["contacts.crm_leads.organization_id", "org-1"]);
    // E o filtro de organização da própria conversa continua lá.
    expect(e).toContainEqual(["organization_id", "org-1"]);
  });

  it("⭐ NÃO monta lista de ids na URL (o muro de 8 KB do gateway)", async () => {
    const { chamadas } = await listar({ etapa: ETAPA });
    const usaIn = chamadas.some(
      (x) => x.metodo === "in" && String(x.args[0]) === "contact_id",
    );
    const usaOrComIds = chamadas.some(
      (x) => x.metodo === "or" && String(x.args[0]).includes("contact_id.in."),
    );
    expect(usaIn || usaOrComIds).toBe(false);
  });

  it("SEM etapa: o select é o de sempre — o INNER JOIN não vaza para a lista inteira", async () => {
    // `!inner` fora do filtro faria a conversa sem contato SUMIR da caixa.
    const { chamadas } = await listar({});
    const sel = selectDe(chamadas);
    expect(sel).not.toMatch(/!inner/);
    expect(sel).not.toMatch(/crm_leads/);
    expect(eqs(chamadas).some(([col]) => String(col).startsWith("contacts."))).toBe(false);
  });

  it("o embed dos leads NÃO vaza no contrato: o contato volta com o mesmo formato", async () => {
    const linha = {
      id: "c1",
      last_message_at: null,
      contacts: { id: "ct1", display_name: "Maria", crm_leads: [{ stage_id: ETAPA }] },
    };
    const { out } = await listar({ etapa: ETAPA }, [linha]);
    expect(out.conversations).toHaveLength(1);
    const contato = (out.conversations[0] as unknown as { contacts: Record<string, unknown> }).contacts;
    expect(contato).toEqual({ id: "ct1", display_name: "Maria" });
  });

  it("convive com busca, tag e canal sem derrubar nenhum deles", async () => {
    const { chamadas } = await listar({ etapa: ETAPA, tag: "vip", channel_session_id: "ch-1" });
    expect(eqs(chamadas)).toContainEqual(["channel_session_id", "ch-1"]);
    expect(chamadas.some((x) => x.metodo === "contains")).toBe(true);
    expect(eqs(chamadas)).toContainEqual(["contacts.crm_leads.stage_id", ETAPA]);
  });
});

// ---------------------------------------------------------------------------
// elo 3 — a rota que alimenta o seletor
// ---------------------------------------------------------------------------

describe("GET /api/v1/conversations/etapas — o que alimenta o seletor", () => {
  it("é leitura `viewer` e filtra as DUAS tabelas pela organização do JWT", async () => {
    vi.resetModules();
    const filtros: Array<{ tabela: string; col: string; val: unknown }> = [];
    const requireRole = vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      org: { orgId: "org-1", role: "viewer" },
      user: { id: "u-1" },
    }));
    vi.doMock("@/lib/auth/require-role", () => ({ requireRole }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        from: (tabela: string) => {
          const proxy: Record<string, unknown> = new Proxy(
            {},
            {
              get(_t, prop) {
                if (prop === "then") {
                  const data =
                    tabela === "crm_pipelines"
                      ? [
                          { id: "f1", name: "Vendas", is_default: false },
                          { id: "f2", name: "Vazio", is_default: false },
                        ]
                      : [
                          { id: "e1", pipeline_id: "f1", name: "Iniciado", color: "#94a3b8", is_won: false, is_lost: false },
                          { id: "e2", pipeline_id: "f1", name: "Venda ganha", color: null, is_won: true, is_lost: false },
                        ];
                  return (ok: (v: unknown) => unknown) => ok({ data, error: null });
                }
                return (...args: unknown[]) => {
                  if (prop === "eq") filtros.push({ tabela, col: String(args[0]), val: args[1] });
                  return proxy;
                };
              },
            },
          );
          return proxy;
        },
      }),
    }));

    const { GET } = await import("@/app/api/v1/conversations/etapas/route");
    const res = await GET();
    const body = (await res.json()) as {
      data: Array<{ id: string; etapas: Array<{ id: string; name: string; color: string | null }> }>;
    };

    expect(requireRole.mock.calls[0]?.[0]).toBe("viewer");
    expect(filtros).toContainEqual({ tabela: "crm_pipelines", col: "organization_id", val: "org-1" });
    expect(filtros).toContainEqual({ tabela: "crm_stages", col: "organization_id", val: "org-1" });
    expect(filtros).toContainEqual({ tabela: "crm_stages", col: "is_archived", val: false });

    // Funil sem etapa não vira grupo vazio no seletor.
    expect(body.data.map((f) => f.id)).toEqual(["f1"]);
    expect(body.data[0]?.etapas.map((e) => e.name)).toEqual(["Iniciado", "Venda ganha"]);
    // O formato é o contrato do hook: nada de `pipeline_id` vazando para a etapa.
    expect(body.data[0]?.etapas[0]).toEqual({
      id: "e1",
      name: "Iniciado",
      color: "#94a3b8",
      is_won: false,
      is_lost: false,
    });
  });
});
