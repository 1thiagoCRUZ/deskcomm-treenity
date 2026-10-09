import { afterEach, describe, expect, it, vi } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";
import { lerConfigDoTreenityBot } from "@/lib/treenity-bot/configuracao";
import {
  chaveConfere,
  chaveDoCabecalho,
  conversaCalada,
  gerarChave,
  lerConfigDoWhatsApp,
  mensagemDoCorpo,
  organizacaoDaChave,
  repassarAoBot,
} from "@/lib/treenity-bot/whatsapp";

const ORG = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const URL_N8N = "https://n8n.exemplo.com/webhook/whatsapp";

interface LinhaDeConversa {
  id: string;
  bot_silenced_until: string | null;
  contacts: { force_human: boolean | null } | null;
}

/**
 * Client de serviço falso: `organizations` devolve o `settings`, e
 * `conversations` devolve as linhas pedidas no `.in("id", ...)`.
 */
function adminCom(settings: unknown, conversas: LinhaDeConversa[] = [], erroConversas = false) {
  return {
    from(tabela: string) {
      if (tabela === "organizations") {
        const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: { settings } }) };
        return c;
      }
      let ids: string[] = [];
      const c = {
        select: () => c,
        eq: () => c,
        in: (_col: string, v: string[]) => {
          ids = v;
          return c;
        },
        then: (resolve: (r: unknown) => void) =>
          resolve(
            erroConversas
              ? { data: null, error: { message: "fora do ar" } }
              : { data: conversas.filter((l) => ids.includes(l.id)), error: null },
          ),
      };
      return c;
    },
  } as never;
}

const ligado = { treenity_bot: { whatsapp: { ativo: true, url_n8n: URL_N8N } } };

function pedido(conversas: (string | null)[]) {
  return {
    organizationId: ORG,
    corpoBruto: '{"object":"whatsapp_business_account","entry":[]}',
    assinatura: "sha256=abc",
    conversas,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chave do n8n", () => {
  it("carrega a organização e só confere com o hash dela", () => {
    const { chave, hash } = gerarChave(ORG);
    expect(organizacaoDaChave(chave)).toBe(ORG);
    expect(chaveConfere(chave, hash)).toBe(true);
    expect(chaveConfere(`${chave}x`, hash)).toBe(false);
    expect(chaveConfere(chave, gerarChave(ORG).hash)).toBe(false);
    expect(chaveConfere(chave, null)).toBe(false);
  });

  it("recusa formato fora do padrão", () => {
    expect(organizacaoDaChave("tok_qualquer")).toBeNull();
    expect(organizacaoDaChave(`tbw_${ORG}`)).toBeNull();
    expect(organizacaoDaChave("tbw_nao-e-uuid_segredo")).toBeNull();
  });

  it("lê só Bearer do cabeçalho", () => {
    expect(chaveDoCabecalho("Bearer tbw_x")).toBe("tbw_x");
    expect(chaveDoCabecalho("Basic abc")).toBeNull();
    expect(chaveDoCabecalho(null)).toBeNull();
  });
});

describe("configuração", () => {
  it("degrada para desligado quando não há nada gravado", () => {
    expect(lerConfigDoWhatsApp(undefined)).toEqual({
      ativo: false,
      urlN8n: null,
      chaveHash: null,
      chaveCriadaEm: null,
    });
  });

  it("a tela recebe só se existe chave, nunca o hash", () => {
    const c = lerConfigDoTreenityBot({ treenity_bot: { whatsapp: { ativo: true, chave_hash: "ab" } } });
    expect(c.whatsapp).toEqual({ ativo: true, urlN8n: null, temChave: true, chaveCriadaEm: null });
    expect(JSON.stringify(c)).not.toContain('"ab"');
  });
});

describe("conversa calada", () => {
  const agora = new Date("2026-09-27T12:00:00Z");
  it("assumida (infinity), pausada no futuro ou com force_human", () => {
    expect(conversaCalada("infinity", false, agora)).toBe(true);
    expect(conversaCalada("2026-09-27T12:05:00Z", false, agora)).toBe(true);
    expect(conversaCalada(null, true, agora)).toBe(true);
  });
  it("silêncio vencido ou ausente deixa o bot responder", () => {
    expect(conversaCalada("2026-09-27T11:55:00Z", false, agora)).toBe(false);
    expect(conversaCalada(null, null, agora)).toBe(false);
  });
});

describe("repasse ao n8n", () => {
  it("repassa o corpo e a assinatura da Meta sem mudar nada", async () => {
    const fetchFalso = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const conversa = { id: "c1", bot_silenced_until: null, contacts: { force_human: false } };

    const r = await repassarAoBot(adminCom(ligado, [conversa]), pedido(["c1"]));

    expect(r).toBe("repassado");
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_N8N);
    expect(init.body).toBe(pedido([]).corpoBruto);
    expect((init.headers as Record<string, string>)["x-hub-signature-256"]).toBe("sha256=abc");
  });

  it("desligado não chama o n8n", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const desligado = { treenity_bot: { whatsapp: { ativo: false, url_n8n: URL_N8N } } };
    expect(await repassarAoBot(adminCom(desligado), pedido([null]))).toBe("desligado");
    expect(await repassarAoBot(adminCom({}), pedido([null]))).toBe("desligado");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("conversa assumida pela equipe não vai ao bot", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const assumida = { id: "c1", bot_silenced_until: "infinity", contacts: { force_human: false } };
    expect(await repassarAoBot(adminCom(ligado, [assumida]), pedido(["c1"]))).toBe("calado");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sem mensagem de cliente (recibo, reentrega) não chama o n8n", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    expect(await repassarAoBot(adminCom(ligado), pedido([]))).toBe("sem_mensagem");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("falha para o lado do bot: sem gravar ou sem ler o silêncio, repassa", async () => {
    const fetchFalso = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const assumida = { id: "c1", bot_silenced_until: "infinity", contacts: null };
    expect(await repassarAoBot(adminCom(ligado, [assumida]), pedido([null]))).toBe("repassado");
    expect(await repassarAoBot(adminCom(ligado, [assumida], true), pedido(["c1"]))).toBe("repassado");
  });

  it("n8n fora do ar vira desfecho, nunca exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await repassarAoBot(adminCom(ligado), pedido([null]))).toBe("falhou");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    expect(await repassarAoBot(adminCom(ligado), pedido([null]))).toBe("falhou");
  });
});

describe("resposta do bot vira linha do Inbox", () => {
  it("texto, mídia por link e modelo", () => {
    expect(mensagemDoCorpo({ type: "text", text: { body: "Oi!" } })).toMatchObject({ type: "text", body: "Oi!" });
    expect(
      mensagemDoCorpo({ type: "video", video: { link: "https://cdn/x.mp4", caption: "Veja" } }),
    ).toMatchObject({ type: "video", body: "Veja", mediaUrl: "https://cdn/x.mp4" });
    expect(mensagemDoCorpo({ type: "audio", audio: { link: "https://cdn/a.ogg" } })).toMatchObject({
      type: "audio",
      body: null,
    });
    expect(mensagemDoCorpo({ type: "template", template: { name: "boas_vindas" } })).toMatchObject({
      type: "template",
    });
  });

  it("o que o Inbox não mostra não vira linha", () => {
    expect(mensagemDoCorpo({ type: "reaction", reaction: { emoji: "👍" } })).toBeNull();
  });
});

describe("rota de envio é pública só no formato da Graph API", () => {
  it("abre o caminho exato e nada além", () => {
    expect(isPublicPath("/api/treenity-bot/whatsapp/v21.0/123456/messages")).toBe(true);
    expect(isPublicPath("/api/treenity-bot/whatsapp/v21.0/123456/messages/x")).toBe(false);
    expect(isPublicPath("/api/treenity-bot/configuracoes")).toBe(false);
    expect(isPublicPath("/api/treenity-bot/configuracoes/chave-whatsapp")).toBe(false);
  });
});

// ─── Fase 2: pediu ajuda, automático externo e devolver ao bot ──────────────

import { botDoTreenityAtende, marcarPediuAjuda } from "@/lib/treenity-bot/whatsapp";
import { idsFaceDoTelefone } from "@/lib/treenity-bot/devolver-ao-bot";

/** Client falso para `marcarPediuAjuda`: um contato, uma conversa, e grava o update. */
function adminDaAjuda(opcoes: { contato?: boolean; conversa?: boolean }) {
  const updates: Record<string, unknown>[] = [];
  const admin = {
    updates,
    from(tabela: string) {
      if (tabela === "contacts") {
        const linhas = opcoes.contato
          ? [{ id: "ct1", phone_number: "+5514997317147", created_at: "2026-01-01", is_merged_into: null }]
          : [];
        const c = {
          select: () => c,
          eq: () => c,
          in: () => c,
          is: () => c,
          order: () => c,
          limit: async () => ({ data: linhas, error: null }),
          then: (r: (v: unknown) => void) => r({ data: linhas, error: null }),
        };
        return c;
      }
      const c = {
        select: () => c,
        eq: () => c,
        order: () => c,
        limit: () => c,
        maybeSingle: async () => ({ data: opcoes.conversa ? { id: "cv1" } : null, error: null }),
        update: (v: Record<string, unknown>) => {
          updates.push(v);
          const u = { eq: () => u, then: (r: (v: unknown) => void) => r({ error: null }) };
          return u;
        },
      };
      return c;
    },
  };
  return admin;
}

describe("o bot chamou o especialista", () => {
  it("cala o bot na conversa e deixa sem dono (vai para a Fila), com o motivo", async () => {
    const admin = adminDaAjuda({ contato: true, conversa: true });
    const r = await marcarPediuAjuda(admin as never, {
      organizationId: ORG,
      idFace: "551497317147",
      motivo: "pediu desconto 3 vezes",
    });
    expect(r).toBe("marcada");
    expect(admin.updates[0]).toMatchObject({ bot_silenced_until: "infinity" });
    expect(String(admin.updates[0].last_handoff_reason)).toContain("pediu desconto 3 vezes");
    expect(admin.updates[0]).not.toHaveProperty("assigned_to_user_id");
  });

  it("cliente que não passou pelo Inbox não é erro", async () => {
    expect(
      await marcarPediuAjuda(adminDaAjuda({ contato: false }) as never, { organizationId: ORG, idFace: "1", motivo: "x" }),
    ).toBe("sem_contato");
    expect(
      await marcarPediuAjuda(adminDaAjuda({ contato: true, conversa: false }) as never, {
        organizationId: ORG,
        idFace: "551497317147",
        motivo: "x",
      }),
    ).toBe("sem_conversa");
  });

  it("a rota do aviso é pública só no caminho exato", () => {
    expect(isPublicPath("/api/treenity-bot/whatsapp/pediu-ajuda")).toBe(true);
    expect(isPublicPath("/api/treenity-bot/whatsapp/pediu-ajuda/x")).toBe(false);
  });

  it("a rota dos dados de nota do bot é pública só no caminho exato (o proxy barrava o n8n)", () => {
    expect(isPublicPath("/api/treenity-bot/whatsapp/dados-do-cliente")).toBe(true);
    expect(isPublicPath("/api/treenity-bot/whatsapp/dados-do-cliente/x")).toBe(false);
  });
});

describe("o Treenity Bot conta como atendimento automático", () => {
  it("só com o WhatsApp no Inbox ligado", () => {
    expect(botDoTreenityAtende({ treenity_bot: { whatsapp: { ativo: true } } })).toBe(true);
    expect(botDoTreenityAtende({ treenity_bot: { whatsapp: { ativo: false } } })).toBe(false);
    expect(botDoTreenityAtende(null)).toBe(false);
  });
});

describe("devolver ao bot", () => {
  it("manda ao bot as duas grafias do número, como a Meta manda (só dígitos)", () => {
    expect(idsFaceDoTelefone("+5514997317147").sort()).toEqual(["551497317147", "5514997317147"]);
  });
});
