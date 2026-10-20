import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  acesso: vi.fn(),
  config: vi.fn(),
  vendas: vi.fn(),
  atendimentos: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/treenity-bot/acesso", () => ({ carregarAcessoAoBot: deps.acesso }));
vi.mock("@/lib/treenity-bot/config", () => ({ getConfig: deps.config }));
vi.mock("@/lib/treenity-bot/client", () => ({
  carregarVendasTreenityBot: deps.vendas,
  carregarAtendimentosTreenityBot: deps.atendimentos,
}));

import { GET as vendas } from "@/app/api/treenity-bot/vendas/route";
import { GET as atendimentos } from "@/app/api/treenity-bot/atendimentos/route";

const pagina = { itens: [], resumo: {}, proximoCursor: null };

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
  deps.vendas.mockResolvedValue(pagina);
  deps.atendimentos.mockResolvedValue({ itens: [], proximoCursor: null });
});

describe("rota de vendas: ate inclusivo vira exclusivo para o bot", () => {
  it("ate=2026-10-20 chega ao bot como 2026-10-21 e desde segue igual", async () => {
    const res = await vendas(pedido("/api/treenity-bot/vendas?desde=2026-10-01&ate=2026-10-20") as never);
    expect(res.status).toBe(200);
    expect(deps.vendas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ desde: "2026-10-01", ate: "2026-10-21" }));
  });

  it("virada de mês: ate=2026-10-31 vira 2026-11-01", async () => {
    await vendas(pedido("/api/treenity-bot/vendas?ate=2026-10-31") as never);
    expect(deps.vendas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ate: "2026-11-01" }));
  });

  it("sem ate, o bot não recebe ate", async () => {
    await vendas(pedido("/api/treenity-bot/vendas?desde=2026-10-01") as never);
    const filtros = deps.vendas.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(filtros.ate).toBeUndefined();
  });

  it("ate com hora ou lixo é recusado (422) e não chega ao bot", async () => {
    const res = await vendas(pedido("/api/treenity-bot/vendas?ate=2026-10-20T10:00") as never);
    expect(res.status).toBe(422);
    expect(deps.vendas).not.toHaveBeenCalled();
  });

  it("busca repassada com espaços aparados; busca vazia ou longa demais é recusada", async () => {
    await vendas(pedido("/api/treenity-bot/vendas?busca=%20%20Maria%20") as never);
    expect(deps.vendas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ busca: "Maria" }));

    deps.vendas.mockClear();
    const vazia = await vendas(pedido("/api/treenity-bot/vendas?busca=%20%20%20") as never);
    expect(vazia.status).toBe(422);
    const longa = await vendas(pedido(`/api/treenity-bot/vendas?busca=${"a".repeat(101)}`) as never);
    expect(longa.status).toBe(422);
    expect(deps.vendas).not.toHaveBeenCalled();
  });

  it("quem não é admin não chega ao bot, mesmo com ate válido", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const res = await vendas(pedido("/api/treenity-bot/vendas?ate=2026-10-20") as never);
    expect(res.status).toBe(403);
    expect(deps.vendas).not.toHaveBeenCalled();
  });
});

describe("rota de atendimentos: ate inclusivo vira exclusivo e busca passa", () => {
  it("ate=2026-10-20 chega ao bot como 2026-10-21, com busca e desde", async () => {
    const res = await atendimentos(
      pedido("/api/treenity-bot/atendimentos?desde=2026-10-01&ate=2026-10-20&busca=Ana") as never,
    );
    expect(res.status).toBe(200);
    expect(deps.atendimentos).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ desde: "2026-10-01", ate: "2026-10-21", busca: "Ana" }),
    );
  });

  it("ate inválido é recusado e não chega ao bot", async () => {
    const res = await atendimentos(pedido("/api/treenity-bot/atendimentos?ate=20-10-2026") as never);
    expect(res.status).toBe(422);
    expect(deps.atendimentos).not.toHaveBeenCalled();
  });

  it("sem acesso ao bot na empresa, não chega ao bot", async () => {
    deps.acesso.mockResolvedValue({ permitido: false });
    const res = await atendimentos(pedido("/api/treenity-bot/atendimentos?ate=2026-10-20") as never);
    expect(res.status).toBe(403);
    expect(deps.atendimentos).not.toHaveBeenCalled();
  });
});
