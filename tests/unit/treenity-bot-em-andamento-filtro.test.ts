import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  acesso: vi.fn(),
  config: vi.fn(),
  atendimentos: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/treenity-bot/acesso", () => ({ carregarAcessoAoBot: deps.acesso }));
vi.mock("@/lib/treenity-bot/config", () => ({ getConfig: deps.config }));
vi.mock("@/lib/treenity-bot/client", () => ({
  carregarVendasTreenityBot: vi.fn(),
  carregarAtendimentosTreenityBot: deps.atendimentos,
}));

import { GET as atendimentos } from "@/app/api/treenity-bot/atendimentos/route";

function pedido(caminho: string): Request {
  return new Request(`http://localhost${caminho}`);
}

beforeEach(() => {
  vi.resetAllMocks();
  deps.role.mockResolvedValue({
    ok: true,
    user: { email: "dono@empresa.test", full_name: "Dono", idioma: "pt-BR" },
    org: { orgId: "org-1" },
  });
  deps.acesso.mockResolvedValue({ permitido: true });
  deps.config.mockReturnValue({ apiUrl: "https://bot.test" });
  deps.atendimentos.mockResolvedValue({ itens: [], proximoCursor: null });
});

describe("rota de atendimentos: em_andamento chega ao bot como booleano", () => {
  it("em_andamento=true vira emAndamento true", async () => {
    const res = await atendimentos(pedido("/api/treenity-bot/atendimentos?em_andamento=true") as never);
    expect(res.status).toBe(200);
    expect(deps.atendimentos).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ emAndamento: true }));
  });

  it("em_andamento=false vira emAndamento false (não some no caminho)", async () => {
    await atendimentos(pedido("/api/treenity-bot/atendimentos?em_andamento=false") as never);
    expect(deps.atendimentos).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ emAndamento: false }));
  });

  it("sem o parâmetro, o bot não recebe emAndamento (lista geral continua igual)", async () => {
    await atendimentos(pedido("/api/treenity-bot/atendimentos?limit=20") as never);
    const filtros = deps.atendimentos.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(filtros.emAndamento).toBeUndefined();
    expect("em_andamento" in filtros).toBe(false);
  });

  it("valor fora de true/false é recusado (422) e não chega ao bot", async () => {
    const res = await atendimentos(pedido("/api/treenity-bot/atendimentos?em_andamento=sim") as never);
    expect(res.status).toBe(422);
    expect(deps.atendimentos).not.toHaveBeenCalled();
  });
});
