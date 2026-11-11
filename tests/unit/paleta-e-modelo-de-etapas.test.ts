import { describe, expect, it } from "vitest";

import { chaveDeNome, validarCorDeEtapa } from "@/lib/leads/stage-editing";
import {
  FORMATO_DE_COR,
  PALETA_DE_ETAPAS,
  corDoTextoSobre,
} from "@/lib/kanban/paleta-de-etapas";
import { ETAPAS_DO_FUNIL_DE_VENDAS } from "@/lib/pipelines/modelos";

/**
 * A paleta e o modelo de vendas são DADO que vai para o banco — e o banco recusa
 * (`crm_stages_color_format`, `crm_stages_slug_format`, os índices únicos de
 * ganho/perda) com um erro cru. Estes testes pegam no commit o que o CHECK pegaria
 * em produção, num `POST /pipelines` que já tinha criado o funil.
 */
describe("validarCorDeEtapa", () => {
  it("aceita #RRGGBB e devolve em minúscula (a mesma cor não tem duas grafias)", () => {
    expect(validarCorDeEtapa("#3B82F6")).toEqual({ ok: true, cor: "#3b82f6" });
    expect(validarCorDeEtapa("#3b82f6")).toEqual({ ok: true, cor: "#3b82f6" });
  });

  it("null é 'sem cor', não erro", () => {
    expect(validarCorDeEtapa(null)).toEqual({ ok: true, cor: null });
  });

  it.each(["", "azul", "#fff", "#ggg000", "3b82f6", "#3b82f6ff", " #3b82f6"])(
    "recusa %j em português, sem citar constraint",
    (c) => {
      const r = validarCorDeEtapa(c);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.erro).toMatch(/Cor inválida/);
        expect(r.erro).not.toMatch(/crm_stages|violates|check/i);
      }
    },
  );
});

describe("paleta de etapas", () => {
  it("toda cor da paleta passa no CHECK do banco, sem repetir", () => {
    for (const c of PALETA_DE_ETAPAS) expect(c.hex).toMatch(FORMATO_DE_COR);
    expect(new Set(PALETA_DE_ETAPAS.map((c) => c.hex)).size).toBe(PALETA_DE_ETAPAS.length);
    expect(new Set(PALETA_DE_ETAPAS.map((c) => c.nome)).size).toBe(PALETA_DE_ETAPAS.length);
  });

  it("texto sobre a cor: claro em fundo escuro, escuro em fundo claro", () => {
    expect(corDoTextoSobre("#000000")).toBe("#ffffff");
    expect(corDoTextoSobre("#ffffff")).toBe("#000000");
    // Amarelo PARECE claro e a média RGB erra; a luminância acerta.
    expect(corDoTextoSobre("#eab308")).toBe("#000000");
    expect(corDoTextoSobre("#1e3a8a")).toBe("#ffffff");
    expect(corDoTextoSobre("nao-e-hex")).toBeNull();
  });
});

describe("modelo 'Funil de vendas'", () => {
  const etapas = ETAPAS_DO_FUNIL_DE_VENDAS;

  it("tem as 11 etapas do cliente, com os nomes que ele escreveu", () => {
    expect(etapas.map((e) => e.name)).toEqual([
      "Iniciado",
      "Orçamento",
      "Retorno de orçamento",
      "Envio de dados",
      "Aguardando pagamento",
      "Pagamento realizado",
      "Pagamento não realizado",
      "Envio",
      "Feedback (entrega + 15 dias)",
      "Venda ganha",
      "Venda perdida",
    ]);
  });

  it("todo slug passa em `crm_stages_slug_format` e nenhum se repete (índice único por funil)", () => {
    for (const e of etapas) expect(e.slug).toMatch(/^[a-z0-9_-]{2,40}$/);
    expect(new Set(etapas.map((e) => e.slug)).size).toBe(etapas.length);
  });

  it("toda cor é #RRGGBB válida e vem da paleta (a tela a mostra marcada)", () => {
    const hexes = new Set(PALETA_DE_ETAPAS.map((c) => c.hex));
    for (const e of etapas) {
      expect(e.color).toMatch(FORMATO_DE_COR);
      expect(hexes.has(e.color as string)).toBe(true);
    }
  });

  it("exatamente UM ganho e UM perda, nunca os dois na mesma etapa", () => {
    expect(etapas.filter((e) => e.is_won).map((e) => e.name)).toEqual(["Venda ganha"]);
    expect(etapas.filter((e) => e.is_lost).map((e) => e.name)).toEqual(["Venda perdida"]);
    expect(etapas.some((e) => e.is_won && e.is_lost)).toBe(false);
  });

  it("'Pagamento realizado' NÃO é ganho: ainda há envio e feedback depois dele", () => {
    const pago = etapas.find((e) => e.slug === "pagamento_realizado");
    expect(pago).toMatchObject({ is_won: false, is_lost: false });
  });

  it("nomes não colidem sob a chave de nome do funil (sem acento/caixa)", () => {
    const chaves = etapas.map((e) => chaveDeNome(e.name));
    expect(new Set(chaves).size).toBe(etapas.length);
  });
});
