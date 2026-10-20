import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Achado C1: a API do bot não separa empresas, então o painel só entrega token
 * (SSO, transcrição, encerrar) a quem tem o papel e a empresa com o bot ligado,
 * e as chamadas servidor-para-servidor levam o segredo em X-SSO-Secret.
 */

const SEGREDO = "segredo-de-servidor-xyz";

const estado = {
  user: null as null | Record<string, unknown>,
  role: "agent" as string | null,
  settings: null as unknown,
  trocarToken: vi.fn(),
  fetch: vi.fn(),
  logs: [] as unknown[][],
  mfa: false,
};

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => estado.user,
  mfaEmDivida: async () => estado.mfa,
  resolveActiveOrg: async () => ({ orgId: "org-1", name: "Loja", role: estado.role ?? "viewer" }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: (...a: unknown[]) => estado.logs.push(a),
    warn: (...a: unknown[]) => estado.logs.push(a),
    info: (...a: unknown[]) => estado.logs.push(a),
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/treenity-bot/avisos-da-central", () => ({ resolverAvisosDeVenda: async () => undefined }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => ({ data: estado.role, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: estado.settings } }) }) }),
    }),
  }),
}));
vi.mock("@/lib/treenity-bot/config", () => ({
  getConfig: () => ({ apiUrl: "https://bot.test", ssoSecret: SEGREDO }),
  isConfigured: () => true,
}));
vi.mock("@/lib/treenity-bot/client", () => ({
  trocarToken: (...a: unknown[]) => estado.trocarToken(...a),
}));

import { GET as ssoGET } from "@/app/api/treenity-bot/sso/route";
import { GET as vendaGET } from "@/app/api/treenity-bot/conversas/[id]/venda/route";
import { POST as vendaVistaPOST } from "@/app/api/treenity-bot/conversas/[id]/venda-vista/route";
import { encerrarAtendimentoAction } from "@/app/app/integrations/treenity-bot/[atendimentoId]/_actions";
import { decidirAcessoAoBot } from "@/lib/treenity-bot/acesso";
import { liberarTravaDoBot } from "@/lib/treenity-bot/devolver-ao-bot";
import { encerrarAtendimentoNoBot } from "@/lib/treenity-bot/encerrar-no-bot";

const COM_BOT = { treenity_bot: { whatsapp: { ativo: true } } };
const SEM_BOT = { treenity_bot: { whatsapp: { ativo: false } } };

const usuario = (extra: Record<string, unknown> = {}) => ({
  id: "u1",
  email: "a@b.c",
  full_name: "Ana",
  is_platform_admin: false,
  idioma: "pt",
  organizations: [],
  support: null,
  ...extra,
});

beforeEach(() => {
  estado.user = usuario();
  estado.role = "agent";
  estado.settings = COM_BOT;
  estado.logs = [];
  estado.mfa = false;
  estado.trocarToken.mockReset().mockResolvedValue({
    accessToken: "tok-usuario",
    usuario: { id: "b1", nome: "Ana", email: "a@b.c", papel: "funcionario" },
  });
  estado.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }));
  vi.stubGlobal("fetch", estado.fetch);
});

describe("decidirAcessoAoBot (decisão pura)", () => {
  it("nega papel abaixo do mínimo", () => {
    expect(decidirAcessoAoBot({ papel: "viewer", ehGestao: false, settings: COM_BOT, minimo: "agent" })).toEqual({
      permitido: false,
      motivo: "sem_papel",
    });
    expect(decidirAcessoAoBot({ papel: "agent", ehGestao: false, settings: COM_BOT, minimo: "admin" })).toEqual({
      permitido: false,
      motivo: "sem_papel",
    });
  });

  it("nega empresa sem a flag (ausente, desligada ou lixo)", () => {
    for (const settings of [null, {}, SEM_BOT, { treenity_bot: "x" }]) {
      expect(decidirAcessoAoBot({ papel: "admin", ehGestao: false, settings, minimo: "admin" })).toEqual({
        permitido: false,
        motivo: "bot_desligado",
      });
    }
  });

  it("concede com papel e flag; a Gestão passa sem os dois", () => {
    expect(decidirAcessoAoBot({ papel: "admin", ehGestao: false, settings: COM_BOT, minimo: "admin" })).toEqual({
      permitido: true,
    });
    expect(decidirAcessoAoBot({ papel: "viewer", ehGestao: true, settings: null, minimo: "admin" })).toEqual({
      permitido: true,
    });
  });
});

describe("GET /api/treenity-bot/sso", () => {
  it("sem login: 401 e nenhum token", async () => {
    estado.user = null;
    expect((await ssoGET()).status).toBe(401);
    expect(estado.trocarToken).not.toHaveBeenCalled();
  });

  it("nega viewer", async () => {
    estado.role = "viewer";
    const res = await ssoGET();
    expect(res.status).toBe(403);
    expect(estado.trocarToken).not.toHaveBeenCalled();
  });

  it("nega empresa sem a flag do bot", async () => {
    estado.settings = SEM_BOT;
    const res = await ssoGET();
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("accessToken");
    expect(estado.trocarToken).not.toHaveBeenCalled();
  });

  it("concede a agent com a flag, na empresa da sessão", async () => {
    const res = await ssoGET();
    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBe("tok-usuario");
    expect(estado.trocarToken).toHaveBeenCalledWith(expect.anything(), {
      painelAdmin: false,
      organizacaoId: "org-1",
    });
  });

  it("mantém a Gestão em suporte como antes (sala própria, sem exigir a flag)", async () => {
    estado.user = usuario({ is_platform_admin: true, support: { organization_id: "org-1", status: "active" } });
    estado.role = "viewer";
    estado.settings = SEM_BOT;
    const res = await ssoGET();
    expect(res.status).toBe(200);
    expect(estado.trocarToken).toHaveBeenCalledWith(expect.anything(), {
      painelAdmin: false,
      organizacaoId: "gestao-treenity",
    });
  });
});

describe("SSO da Gestão", () => {
  it("nega Gestão com MFA em dívida (aal1) e suporte vencido", async () => {
    estado.user = usuario({ is_platform_admin: true });
    estado.mfa = true;
    expect((await ssoGET()).status).toBe(403);
    estado.mfa = false;
    estado.user = usuario({ is_platform_admin: true, support: { organization_id: "org-1", status: "expired" } });
    expect((await ssoGET()).status).toBe(403);
    expect(estado.trocarToken).not.toHaveBeenCalled();
  });
});

describe("conversas/[id]/venda e venda-vista", () => {
  const ctx = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };
  const req = () => new Request("https://x.test/api") as never;

  it("nega admin sem a flag", async () => {
    estado.role = "admin";
    estado.settings = SEM_BOT;
    expect((await vendaGET(req(), ctx)).status).toBe(403);
    expect((await vendaVistaPOST(req(), ctx)).status).toBe(403);
    expect(estado.trocarToken).not.toHaveBeenCalled();
  });

  it("concede admin com a flag (venda-vista)", async () => {
    estado.role = "admin";
    expect((await vendaVistaPOST(req(), ctx)).status).toBe(200);
  });
});

describe("encerrarAtendimentoAction", () => {
  it("nega agent (só o Dono) sem tocar no bot", async () => {
    estado.role = "agent";
    expect(await encerrarAtendimentoAction("a1")).toEqual({ ok: false, error: "forbidden" });
    expect(estado.trocarToken).not.toHaveBeenCalled();
    expect(estado.fetch).not.toHaveBeenCalled();
  });

  it("nega admin de empresa sem a flag", async () => {
    estado.role = "admin";
    estado.settings = SEM_BOT;
    expect(await encerrarAtendimentoAction("a1")).toEqual({ ok: false, error: "forbidden" });
    expect(estado.fetch).not.toHaveBeenCalled();
  });

  it("concede admin com a flag e envia o segredo de servidor", async () => {
    estado.role = "admin";
    expect(await encerrarAtendimentoAction("a1")).toEqual({ ok: true });
    const [url, init] = estado.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bot.test/api/atendimentos/a1/encerrar");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-usuario", "X-SSO-Secret": SEGREDO });
  });
});

describe("chamadas servidor-para-servidor ao bot", () => {
  it("encerrar-por-cliente envia X-SSO-Secret mantendo o Bearer e não vaza o segredo em erro", async () => {
    await encerrarAtendimentoNoBot({ telefone: "5514999990000", usuario: { email: "a@b.c", nome: "Ana" }, valorDaVenda: null });
    const [url, init] = estado.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bot.test/api/atendimentos/encerrar-por-cliente");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-usuario", "X-SSO-Secret": SEGREDO });

    estado.fetch.mockResolvedValue(new Response("{}", { status: 500 }));
    const r = await encerrarAtendimentoNoBot({ telefone: "5514999990000", usuario: { email: "a@b.c", nome: "Ana" }, valorDaVenda: null });
    expect(r.desfecho).toBe("falhou");
    expect(JSON.stringify(r)).not.toContain(SEGREDO);
    expect(JSON.stringify(estado.logs)).not.toContain(SEGREDO);
  });

  it("devolver-ao-bot envia X-SSO-Secret mantendo o Bearer e não vaza o segredo em erro", async () => {
    const dados: Record<string, unknown> = {
      organizations: { settings: COM_BOT },
      conversations: { contacts: { phone_number: "5514999990000" } },
    };
    const supabase = {
      from: (tabela: string) => {
        const cadeia = { select: () => cadeia, eq: () => cadeia, maybeSingle: async () => ({ data: dados[tabela] }) };
        return cadeia;
      },
    };
    const pedido = { organizationId: "org-1", conversationId: "c1", usuario: { email: "a@b.c", nome: "Ana" } };

    expect(await liberarTravaDoBot(supabase as never, pedido)).toBe("liberado");
    const [url, init] = estado.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bot.test/api/atendimentos/devolver-ao-bot");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-usuario", "X-SSO-Secret": SEGREDO });

    estado.fetch.mockRejectedValue(new Error("falha de rede"));
    expect(await liberarTravaDoBot(supabase as never, pedido)).toBe("falhou");
    expect(JSON.stringify(estado.logs)).not.toContain(SEGREDO);
  });
});
