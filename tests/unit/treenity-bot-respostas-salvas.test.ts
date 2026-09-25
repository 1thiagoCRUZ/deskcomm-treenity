import { beforeEach, describe, expect, it, vi } from "vitest";

const espelharRespostaNoBot = vi.fn();
const removerRespostaDoBot = vi.fn();
vi.mock("@/lib/treenity-bot/client", () => ({
  espelharRespostaNoBot: (...args: unknown[]) => espelharRespostaNoBot(...args),
  removerRespostaDoBot: (...args: unknown[]) => removerRespostaDoBot(...args),
}));
vi.mock("@/lib/treenity-bot/config", () => ({ isConfigured: () => true }));

import {
  acaoNoBot,
  espelharResposta,
  tirarRespostaDoBot,
  type RespostaSalva,
} from "@/lib/treenity-bot/respostas-salvas";

function resposta(extra: Partial<RespostaSalva> = {}): RespostaSalva {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    owner_user_id: null,
    title: "Efeito",
    body: "[cumprimento]! Com uns 15 dias você já vê.",
    bot_triggers: ["quanto tempo"],
    bot_context: "opening",
    bot_max_chars: 40,
    bot_enabled: true,
    bot_synced_at: null,
    bot_sync_error: null,
    ...extra,
  };
}

/** Client de serviço falso: devolve `settings` da org e guarda os updates. */
function adminFalso(espelhoLigado: boolean) {
  const updates: Record<string, unknown>[] = [];
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: async () => ({ data: { settings: { treenity_bot: { respostas: { ativo: espelhoLigado } } } } }),
    update: (valores: Record<string, unknown>) => {
      updates.push(valores);
      return cadeia;
    },
  };
  return { admin: { from: () => cadeia } as never, updates };
}

describe("acaoNoBot — o que vai para o bot", () => {
  it("compartilhada com gatilho e espelho ligado: envia, traduzindo contexto e campos para a API do bot", () => {
    expect(acaoNoBot(resposta(), true)).toEqual({
      tipo: "espelhar",
      resposta: {
        titulo: "Efeito",
        corpo: "[cumprimento]! Com uns 15 dias você já vê.",
        gatilhos: ["quanto tempo"],
        contexto: "abertura",
        max_chars_msg: 40,
        ativo: true,
      },
    });
  });

  it("bot desligado na resposta: envia mesmo assim, DESLIGADA — o dono pode religar sem recadastrar", () => {
    const acao = acaoNoBot(resposta({ bot_enabled: false }), true);
    expect(acao.tipo === "espelhar" && acao.resposta.ativo).toBe(false);
  });

  it("nunca liga no bot um texto com {{variável}}, que chegaria cru ao cliente", () => {
    const acao = acaoNoBot(resposta({ body: "Oi {{primeiro_nome}}" }), true);
    expect(acao.tipo === "espelhar" && acao.resposta.ativo).toBe(false);
  });

  it("pessoal, sem gatilho ou com o espelho desligado: tira do bot se pode estar lá", () => {
    const jaEnviada = { bot_synced_at: "2026-09-25T00:00:00Z" };
    expect(acaoNoBot(resposta({ ...jaEnviada, owner_user_id: "u1" }), true)).toEqual({ tipo: "remover" });
    expect(acaoNoBot(resposta({ ...jaEnviada, bot_triggers: [] }), true)).toEqual({ tipo: "remover" });
    expect(acaoNoBot(resposta(jaEnviada), false)).toEqual({ tipo: "remover" });
    // envio anterior falhou: o estado no bot é incerto, então tira também.
    expect(acaoNoBot(resposta({ bot_sync_error: "x", bot_triggers: [] }), true)).toEqual({ tipo: "remover" });
  });

  it("atalho que nunca foi ao bot: não chama a API do bot (salvar não pode depender de outro servidor)", () => {
    expect(acaoNoBot(resposta({ owner_user_id: "u1" }), true)).toEqual({ tipo: "nada" });
    expect(acaoNoBot(resposta({ bot_triggers: [] }), true)).toEqual({ tipo: "nada" });
  });
});

describe("espelharResposta — o laço de retorno", () => {
  beforeEach(() => {
    espelharRespostaNoBot.mockReset();
    removerRespostaDoBot.mockReset();
  });

  it("bot confirmou: marca bot_synced_at e limpa o erro", async () => {
    espelharRespostaNoBot.mockResolvedValue(true);
    const { admin, updates } = adminFalso(true);
    expect(await espelharResposta(admin, "org-1", resposta())).toBe("espelhada");
    expect(updates).toHaveLength(1);
    expect(updates[0].bot_sync_error).toBeNull();
    expect(typeof updates[0].bot_synced_at).toBe("string");
  });

  it("bot não confirmou: guarda o erro para a lista avisar, sem apagar o último envio bom", async () => {
    espelharRespostaNoBot.mockResolvedValue(false);
    const { admin, updates } = adminFalso(true);
    expect(await espelharResposta(admin, "org-1", resposta({ bot_synced_at: "2026-09-24T00:00:00Z" }))).toBe("falhou");
    expect(updates).toEqual([{ bot_sync_error: expect.any(String) }]);
  });

  it("tirou do bot: bot_synced_at volta a nulo", async () => {
    removerRespostaDoBot.mockResolvedValue(true);
    const { admin, updates } = adminFalso(false);
    expect(await espelharResposta(admin, "org-1", resposta({ bot_synced_at: "2026-09-24T00:00:00Z" }))).toBe("removida");
    expect(updates).toEqual([{ bot_synced_at: null, bot_sync_error: null }]);
  });
});

describe("tirarRespostaDoBot — antes de apagar", () => {
  beforeEach(() => removerRespostaDoBot.mockReset());

  it("nunca foi ao bot: libera o apagar sem chamar a API", async () => {
    expect(await tirarRespostaDoBot(resposta())).toBe(true);
    expect(removerRespostaDoBot).not.toHaveBeenCalled();
  });

  it("está no bot e a remoção falhou: segura o apagar, para não deixar resposta órfã no bot", async () => {
    removerRespostaDoBot.mockResolvedValue(false);
    expect(await tirarRespostaDoBot(resposta({ bot_synced_at: "2026-09-24T00:00:00Z" }))).toBe(false);
  });
});
