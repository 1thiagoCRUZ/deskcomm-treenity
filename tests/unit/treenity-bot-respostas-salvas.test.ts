import { describe, expect, it, vi } from "vitest";

let configurado = true;
vi.mock("@/lib/treenity-bot/config", () => ({ isConfigured: () => configurado }));

import type { RespostaDoBot } from "@/lib/treenity-bot/client";
import {
  erroDoBot,
  idDoBot,
  paraBot,
  paraBotNovo,
  paraTemplate,
  respostasNoBot,
} from "@/lib/treenity-bot/respostas-salvas";

function linhaDoBot(extra: Partial<RespostaDoBot> = {}): RespostaDoBot {
  return {
    id: 7,
    titulo: "Efeito",
    corpo: "[cumprimento]! Com uns 15 dias você já vê.",
    atalho: "efeito",
    gatilhos: ["quanto tempo"],
    contexto: "abertura",
    max_chars_msg: 40,
    ativo: true,
    criado_em: "2026-09-25T00:00:00Z",
    atualizado_em: "2026-09-25T01:00:00Z",
    ...extra,
  };
}

/** Client de serviço falso: devolve só o `settings` da organização. */
function adminCom(settings: unknown) {
  const cadeia = {
    select: () => cadeia,
    eq: () => cadeia,
    maybeSingle: async () => ({ data: { settings } }),
  };
  return { from: () => cadeia } as never;
}

describe("paraTemplate — a linha do bot no formato da tela", () => {
  it("traduz os campos, e toda resposta do bot é da loja (owner nulo)", () => {
    expect(paraTemplate(linhaDoBot(), "org-1")).toMatchObject({
      id: "7",
      organization_id: "org-1",
      owner_user_id: null,
      title: "Efeito",
      body: "[cumprimento]! Com uns 15 dias você já vê.",
      shortcut: "efeito",
      bot_triggers: ["quanto tempo"],
      bot_context: "opening",
      bot_max_chars: 40,
      bot_enabled: true,
    });
    expect(paraTemplate(linhaDoBot({ contexto: "qualquer" }), "org-1").bot_context).toBe("any");
  });
});

describe("paraBot — o formulário no formato da API do bot", () => {
  it("numa edição, campo ausente fica ausente (nunca zera o que não veio)", () => {
    expect(paraBot({ title: "Novo título" })).toEqual({ titulo: "Novo título" });
  });

  it("traduz contexto e atalho, e null limpa o atalho", () => {
    expect(paraBot({ bot_context: "opening", shortcut: null })).toEqual({ contexto: "abertura", atalho: null });
  });

  it("nunca liga no bot um texto com {{variável}}, que chegaria cru ao cliente", () => {
    expect(paraBot({ body: "Oi {{primeiro_nome}}", bot_triggers: ["oi"], bot_enabled: true }).ativo).toBe(false);
  });

  it("nunca liga uma resposta sem gatilho: ela nunca dispararia", () => {
    expect(paraBot({ bot_triggers: [], bot_enabled: true }).ativo).toBe(false);
    expect(paraBot({ bot_triggers: ["frete"], bot_enabled: true }).ativo).toBe(true);
  });
});

describe("paraBotNovo — criar manda a resposta inteira", () => {
  it("resposta só da equipe: sem gatilho e desligada no bot", () => {
    expect(paraBotNovo({ title: "Horário", body: "Das 8h às 18h.", shortcut: "horario" })).toEqual({
      titulo: "Horário",
      corpo: "Das 8h às 18h.",
      atalho: "horario",
      gatilhos: [],
      contexto: "qualquer",
      max_chars_msg: 60,
      ativo: false,
    });
  });

  it("resposta com gatilho e o bot ligado", () => {
    const nova = paraBotNovo({
      title: "Frete",
      body: "Me passa o CEP.",
      bot_triggers: ["qual o frete"],
      bot_context: "any",
      bot_max_chars: 80,
      bot_enabled: true,
    });
    expect(nova).toMatchObject({ gatilhos: ["qual o frete"], max_chars_msg: 80, ativo: true, atalho: null });
  });
});

describe("respostasNoBot — onde a organização guarda as respostas", () => {
  it("interruptor ligado e integração configurada: no bot", async () => {
    configurado = true;
    expect(await respostasNoBot(adminCom({ treenity_bot: { respostas: { ativo: true } } }), "org-1")).toBe(true);
  });

  it("interruptor desligado: message_templates, como no deskcomm original", async () => {
    configurado = true;
    expect(await respostasNoBot(adminCom({ treenity_bot: { respostas: { ativo: false } } }), "org-1")).toBe(false);
  });

  it("instalação sem a integração: nunca no bot, mesmo com o interruptor gravado", async () => {
    configurado = false;
    expect(await respostasNoBot(adminCom({ treenity_bot: { respostas: { ativo: true } } }), "org-1")).toBe(false);
    configurado = true;
  });
});

describe("erroDoBot e idDoBot", () => {
  it("validação do bot chega à tela com a frase dele; queda vira 502", () => {
    expect(erroDoBot({ status: 422, erro: "Informe ao menos um gatilho." })).toMatchObject({
      status: 422,
      mensagem: "Informe ao menos um gatilho.",
    });
    expect(erroDoBot({ status: 404, erro: null }).status).toBe(404);
    expect(erroDoBot({ status: 0, erro: null })).toMatchObject({ code: "upstream_unavailable", status: 502 });
    expect(erroDoBot({ status: 500, erro: "boom" }).status).toBe(502);
  });

  it("id do bot é inteiro positivo; o uuid de um message_templates não existe lá", () => {
    expect(idDoBot("12")).toBe(12);
    expect(idDoBot("0")).toBeNull();
    expect(idDoBot("11111111-2222-4333-8444-555555555555")).toBeNull();
  });
});
