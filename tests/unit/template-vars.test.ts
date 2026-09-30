import { describe, expect, it } from "vitest";

import { interpolateTemplate } from "@/lib/inbox/template-vars";

describe("interpolateTemplate", () => {
  it("substitui nome e primeiro_nome", () => {
    expect(interpolateTemplate("Oi {{primeiro_nome}}, tudo bem?", { name: "Rafael Melgaço" })).toBe(
      "Oi Rafael, tudo bem?",
    );
    expect(interpolateTemplate("Falo com {{nome}}?", { name: "Rafael Melgaço" })).toBe(
      "Falo com Rafael Melgaço?",
    );
  });
  it("tolera espaços e case nas chaves", () => {
    expect(interpolateTemplate("Oi {{ Primeiro_Nome }}!", { name: "Ana Paula" })).toBe("Oi Ana!");
  });
  it("sem nome → mantém o literal (não quebra)", () => {
    expect(interpolateTemplate("Oi {{primeiro_nome}}", { name: null })).toBe("Oi {{primeiro_nome}}");
  });
  it("variável desconhecida → mantém o literal", () => {
    expect(interpolateTemplate("Cupom {{codigo}}", { name: "X" })).toBe("Cupom {{codigo}}");
  });

  describe("cumprimento — a mesma regra do bot (horário de São Paulo)", () => {
    // 14:30 UTC = 11:30 em São Paulo (UTC-3); 15:00 UTC = 12:00; 21:00 UTC = 18:00.
    const manha = new Date("2026-09-29T14:30:00Z");
    const meioDia = new Date("2026-09-29T15:00:00Z");
    const seis = new Date("2026-09-29T21:00:00Z");

    it("[cumprimento] das respostas do Treenity Bot vira a saudação, nunca vai cru", () => {
      const corpo = "[cumprimento], tudo certo? Sou o CADU.";
      expect(interpolateTemplate(corpo, { name: null }, manha)).toBe("Bom dia, tudo certo? Sou o CADU.");
      expect(interpolateTemplate(corpo, { name: null }, meioDia)).toBe("Boa tarde, tudo certo? Sou o CADU.");
      expect(interpolateTemplate(corpo, { name: null }, seis)).toBe("Boa noite, tudo certo? Sou o CADU.");
    });

    it("{{cumprimento}} também vale, junto com as outras variáveis", () => {
      expect(interpolateTemplate("{{cumprimento}}, {{primeiro_nome}}!", { name: "Ana Paula" }, manha)).toBe(
        "Bom dia, Ana!",
      );
    });

    it("usa o fuso de São Paulo, não o do navegador: 02:00 UTC ainda é noite lá", () => {
      expect(interpolateTemplate("[cumprimento]", { name: null }, new Date("2026-09-29T02:00:00Z"))).toBe(
        "Boa noite",
      );
    });
  });
});
