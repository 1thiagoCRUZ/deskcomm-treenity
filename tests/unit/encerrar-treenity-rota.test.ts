import { beforeEach, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  rpc: vi.fn(),
  atual: { status: "open", service_revision: 6, assigned_to_user_id: "u-dono" } as Record<string, unknown>,
  bot: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: "u-eu", email: "ana.silva@x.com", full_name: "Ana Maria Silva", idioma: "pt" },
    org: { orgId: "org-1" },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: estado.audit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/treenity-bot/whatsapp", () => ({ botDoTreenityAtende: () => true }));
vi.mock("@/lib/treenity-bot/avisos-da-central", () => ({ resolverAvisosDaConversa: vi.fn() }));
vi.mock("@/lib/treenity-bot/funil-de-leads", () => ({ sincronizarFunilDoTreenityBot: vi.fn() }));
vi.mock("@/lib/treenity-bot/encerrar-no-bot", () => ({ encerrarAtendimentoNoBot: estado.bot }));

const conversa = {
  id: "c1", organization_id: "org-1", contact_id: "ct", service_revision: 5, assigned_to_user_id: "u-dono",
  service_started_at: "2026-10-20T10:00:00Z", created_at: "2026-10-01T00:00:00Z",
  contacts: { phone_number: "5514999990000" },
};
function tabela(nome: string, leitura: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "insert"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: leitura, error: null });
  q.then = (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (n: string) => tabela(n, n === "organizations" ? { settings: {} } : conversa),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: estado.rpc,
    from: (n: string) => tabela(n, estado.atual),
  }),
}));

import { POST } from "@/app/api/treenity-bot/conversas/[id]/encerrar/route";

const chamar = () =>
  POST(new Request("http://l/x", { method: "POST", body: JSON.stringify({ desfecho: "venda", valor: 150 }) }) as never, {
    params: Promise.resolve({ id: "c1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  estado.atual = { status: "open", service_revision: 6, assigned_to_user_id: "u-dono" };
  estado.bot.mockResolvedValue({ desfecho: "encerrado", vendaId: "v1", aguardandoPendentes: 0 });
  estado.rpc.mockResolvedValueOnce({ error: { code: "40001", message: "x" } }).mockResolvedValue({ error: null });
});

it("manda ao bot só o primeiro nome e o início da conversa (desde)", async () => {
  await chamar();
  expect(estado.bot).toHaveBeenCalledWith(
    expect.objectContaining({ fechadaPor: "Ana", desde: "2026-10-20T10:00:00Z", valorDaVenda: 150 }),
  );
});

it("40001 com conversa ainda aberta e mesmo dono: repete com a revisão nova", async () => {
  const r = await chamar();
  expect(r.status).toBe(200);
  expect(estado.rpc).toHaveBeenLastCalledWith("fn_service_status", expect.objectContaining({ p_expected: 6 }));
});

it("40001 e outro atendente assumiu: não fecha, 409 e audita", async () => {
  estado.atual = { status: "open", service_revision: 6, assigned_to_user_id: "u-outro" };
  const r = await chamar();
  expect(r.status).toBe(409);
  expect(estado.rpc).toHaveBeenCalledTimes(1);
  expect(estado.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "conversation.close_conflict" }));
});

it("40001 e a conversa já foi encerrada: não repete, 409 e audita", async () => {
  estado.atual = { status: "closed", service_revision: 6, assigned_to_user_id: "u-dono" };
  expect((await chamar()).status).toBe(409);
  expect(estado.rpc).toHaveBeenCalledTimes(1);
});
