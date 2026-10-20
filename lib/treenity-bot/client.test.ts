import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  getConfig: () => ({ apiUrl: "https://bot.test", ssoSecret: "segredo" }),
}));

import { carregarDadosTreenityBot, carregarVendasTreenityBot, comRenovacaoEm401, limparCacheDeTokensDoBot, trocarToken } from "./client";

const fetchMock = vi.fn();
let contadorToken = 0;

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function instalarBot(opts: { dados401UmaVez?: boolean } = {}) {
  let ja401 = false;
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.endsWith("/api/auth/sso")) {
      const body = JSON.parse(String(init.body));
      contadorToken += 1;
      return resposta({
        success: true,
        data: {
          accessToken: `tok${contadorToken}-${body.email}-${body.painel_admin ? "admin" : "comum"}`,
          usuario: { id: "u", nome: body.nome, email: body.email, papel: "admin" },
        },
      });
    }
    if (opts.dados401UmaVez && !ja401) {
      ja401 = true;
      return resposta({ success: false }, 401);
    }
    return resposta({ success: true, data: [] });
  });
}

const ssoCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/auth/sso"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  contadorToken = 0;
  limparCacheDeTokensDoBot();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ana = { email: "ana@x.com", nome: "Ana" };
const bia = { email: "bia@x.com", nome: "Bia" };

describe("cache do token do SSO", () => {
  it("reaproveita dentro do TTL", async () => {
    instalarBot();
    const a = await trocarToken(ana);
    const b = await trocarToken(ana);
    expect(b?.accessToken).toBe(a?.accessToken);
    expect(ssoCalls()).toHaveLength(1);
  });

  it("chamadas simultâneas dividem um único SSO", async () => {
    instalarBot();
    await Promise.all([trocarToken(ana), trocarToken(ana), trocarToken(ana)]);
    expect(ssoCalls()).toHaveLength(1);
  });

  it("não mistura e-mails", async () => {
    instalarBot();
    const a = await trocarToken(ana);
    const b = await trocarToken(bia);
    expect(a?.accessToken).not.toBe(b?.accessToken);
    expect(b?.accessToken).toContain("bia@x.com");
    expect(ssoCalls()).toHaveLength(2);
  });

  it("não mistura painelAdmin", async () => {
    instalarBot();
    const comum = await trocarToken(ana);
    const admin = await trocarToken(ana, { painelAdmin: true });
    expect(comum?.accessToken).toContain("comum");
    expect(admin?.accessToken).toContain("admin");
    // e o comum não vira admin depois que o admin entrou no cache
    expect((await trocarToken(ana))?.accessToken).toContain("comum");
    expect(ssoCalls()).toHaveLength(2);
  });

  it("expira depois de 10 minutos", async () => {
    vi.useFakeTimers();
    instalarBot();
    await trocarToken(ana);
    vi.advanceTimersByTime(9 * 60_000);
    await trocarToken(ana);
    expect(ssoCalls()).toHaveLength(1);
    vi.advanceTimersByTime(2 * 60_000);
    await trocarToken(ana);
    expect(ssoCalls()).toHaveLength(2);
  });

  it("falha do SSO não fica no cache", async () => {
    fetchMock.mockResolvedValueOnce(resposta({ success: false }, 500));
    expect(await trocarToken(ana)).toBeNull();
    instalarBot();
    expect(await trocarToken(ana)).not.toBeNull();
  });

  it("refaz o SSO e repete uma vez quando os dados voltam 401", async () => {
    instalarBot({ dados401UmaVez: true });
    const r = await carregarVendasTreenityBot(ana, {});
    expect(r).not.toBeNull(); // a segunda tentativa (token novo) deu certo
    expect(ssoCalls()).toHaveLength(2);
    const dados = fetchMock.mock.calls.filter(([u]) => String(u).includes("/api/dashboard/vendas"));
    expect(dados).toHaveLength(2);
    expect((dados[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: expect.stringContaining("tok1-") });
    expect((dados[1]?.[1] as RequestInit).headers).toMatchObject({ Authorization: expect.stringContaining("tok2-") });
  });

  it("não repete mais de uma vez se o 401 persiste", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("/api/auth/sso")
        ? resposta({ success: true, data: { accessToken: "t", usuario: { id: "u", nome: "A", email: "a", papel: "admin" } } })
        : resposta({}, 401),
    );
    const r = await carregarDadosTreenityBot(ana);
    expect(r?.metricas).toEqual([]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/api/dashboard"))).toHaveLength(2);
  });
});

describe("tempo máximo", () => {
  it("todas as chamadas levam signal de timeout e nunca lançam", async () => {
    instalarBot();
    await carregarDadosTreenityBot(ana);
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    limparCacheDeTokensDoBot();
    expect(await carregarDadosTreenityBot(ana)).toBeNull();
  });
});

describe("token que vai ao navegador", () => {
  it("a rota sso não usa o cache (semCache), nem sem empresa ativa", async () => {
    instalarBot();
    const cacheado = await trocarToken(ana);
    const doNavegador1 = await trocarToken(ana, { painelAdmin: false, organizacaoId: undefined, semCache: true });
    const doNavegador2 = await trocarToken(ana, { semCache: true });
    expect(doNavegador1?.accessToken).not.toBe(cacheado?.accessToken);
    expect(doNavegador2?.accessToken).not.toBe(doNavegador1?.accessToken);
    expect(ssoCalls()).toHaveLength(3);
    // e não grava: o próximo uso comum ainda enxerga o token cacheado de antes
    expect((await trocarToken(ana))?.accessToken).toBe(cacheado?.accessToken);
  });
});

describe("comRenovacaoEm401 (escritas no bot)", () => {
  const post = (statuses: number[]) => {
    let i = 0;
    const tokens: string[] = [];
    const fazer = async (t: string) => {
      tokens.push(t);
      return resposta({}, statuses[Math.min(i++, statuses.length - 1)]);
    };
    return { fazer, tokens };
  };

  it("401 seguido de 200 faz 2 POSTs com tokens diferentes", async () => {
    instalarBot();
    const s = await trocarToken(ana);
    const { fazer, tokens } = post([401, 200]);
    const res = await comRenovacaoEm401(ana, s!.accessToken, fazer);
    expect(res.status).toBe(200);
    expect(tokens).toHaveLength(2);
    expect(tokens[1]).not.toBe(tokens[0]);
    expect(ssoCalls()).toHaveLength(2);
  });

  it("401 duplo não entra em loop", async () => {
    instalarBot();
    const s = await trocarToken(ana);
    const { fazer, tokens } = post([401, 401, 401]);
    const res = await comRenovacaoEm401(ana, s!.accessToken, fazer);
    expect(res.status).toBe(401);
    expect(tokens).toHaveLength(2);
  });

  it("500 não repete", async () => {
    instalarBot();
    const s = await trocarToken(ana);
    const { fazer, tokens } = post([500]);
    expect((await comRenovacaoEm401(ana, s!.accessToken, fazer)).status).toBe(500);
    expect(tokens).toHaveLength(1);
    expect(ssoCalls()).toHaveLength(1);
  });
});
