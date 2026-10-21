import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/treenity-bot/config", () => ({
  getConfig: () => ({ apiUrl: "https://bot.test", ssoSecret: "segredo" }),
}));

import { carregarAtendimentosTreenityBot, limparCacheDeTokensDoBot } from "@/lib/treenity-bot/client";

const fetchMock = vi.fn();

function resposta(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  limparCacheDeTokensDoBot();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/auth/sso")) {
      const body = JSON.parse(String(init.body));
      return resposta({
        success: true,
        data: { accessToken: `tok-${body.email}`, usuario: { id: "u", nome: body.nome, email: body.email, papel: "admin" } },
      });
    }
    return resposta({ success: true, data: [], proximoCursor: null });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const dono = { email: "dono@x.com", nome: "Dono" };

function urlDaListagem(): string {
  const chamada = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/atendimentos"));
  expect(chamada).toBeDefined();
  return String(chamada?.[0]);
}

describe("cliente do bot: em_andamento vai na query só quando pedido", () => {
  it("emAndamento true vira em_andamento=true na URL", async () => {
    await carregarAtendimentosTreenityBot(dono, { emAndamento: true, limit: 20 });
    const url = new URL(urlDaListagem());
    expect(url.searchParams.get("em_andamento")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  it("emAndamento false vira em_andamento=false (não some)", async () => {
    await carregarAtendimentosTreenityBot(dono, { emAndamento: false });
    expect(new URL(urlDaListagem()).searchParams.get("em_andamento")).toBe("false");
  });

  it("sem emAndamento a URL não traz o parâmetro (bot antigo e lista geral seguem iguais)", async () => {
    await carregarAtendimentosTreenityBot(dono, { limit: 20 });
    expect(new URL(urlDaListagem()).searchParams.has("em_andamento")).toBe(false);
  });
});
