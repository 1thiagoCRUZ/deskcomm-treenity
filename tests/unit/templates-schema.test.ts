import { describe, expect, it } from "vitest";

import { createTemplateSchema, normalizarGatilho, updateTemplateSchema } from "@/lib/schemas/templates";

describe("createTemplateSchema", () => {
  it("aceita template válido pessoal", () => {
    const r = createTemplateSchema.safeParse({ title: "Saudação", body: "Oi {{primeiro_nome}}!" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.shared).toBe(false);
  });
  it("aceita shared + shortcut", () => {
    const r = createTemplateSchema.safeParse({ title: "Fechamento", body: "Fechado!", shortcut: "fech", shared: true });
    expect(r.success).toBe(true);
  });
  it("rejeita title vazio e body vazio", () => {
    expect(createTemplateSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(createTemplateSchema.safeParse({ title: "x", body: "" }).success).toBe(false);
  });
  it("rejeita body gigante (>4096)", () => {
    expect(createTemplateSchema.safeParse({ title: "x", body: "a".repeat(5000) }).success).toBe(false);
  });
});

describe("respostas salvas usadas pelo bot", () => {
  const base = { title: "Frete", body: "O frete sai pela Frenet.", shared: true };

  it("normaliza os gatilhos como o banco do bot: minúsculo, sem acento nem pontuação", () => {
    const r = createTemplateSchema.safeParse({ ...base, bot_enabled: true, bot_triggers: ["Qual o FRETE?!", "qual   o frete", "a"] });
    expect(r.success).toBe(true);
    // duplicata some; gatilho de 1 letra (casaria com quase tudo) também.
    if (r.success) expect(r.data.bot_triggers).toEqual(["qual o frete"]);
  });

  it("normalizarGatilho segue a mesma tabela de acentos de normalizar_texto (ñ vira espaço, não n)", () => {
    expect(normalizarGatilho("Olá, TUDO bem?")).toBe("ola tudo bem");
    expect(normalizarGatilho("ação")).toBe("acao");
    expect(normalizarGatilho("piñata")).toBe("pi ata");
  });

  it("recusa bot ligado sem gatilho", () => {
    expect(createTemplateSchema.safeParse({ ...base, bot_enabled: true, bot_triggers: [] }).success).toBe(false);
  });

  it("recusa bot em resposta pessoal: o bot só fala o que é da loja", () => {
    const r = createTemplateSchema.safeParse({ ...base, shared: false, bot_enabled: true, bot_triggers: ["frete"] });
    expect(r.success).toBe(false);
  });

  it("recusa {{variável}} em resposta do bot, que chegaria crua ao cliente", () => {
    const criar = createTemplateSchema.safeParse({ ...base, body: "Oi {{primeiro_nome}}", bot_enabled: true, bot_triggers: ["oi"] });
    expect(criar.success).toBe(false);
    const editar = updateTemplateSchema.safeParse({ body: "Oi {{nome}}", bot_enabled: true, bot_triggers: ["oi"] });
    expect(editar.success).toBe(false);
    // Para o atendente, a variável continua valendo.
    expect(createTemplateSchema.safeParse({ ...base, body: "Oi {{primeiro_nome}}" }).success).toBe(true);
  });

  it("aceita [cumprimento], que o bot troca sozinho", () => {
    const r = createTemplateSchema.safeParse({ ...base, body: "[cumprimento]! Sou o CADU.", bot_enabled: true, bot_triggers: ["oi"] });
    expect(r.success).toBe(true);
  });
});
