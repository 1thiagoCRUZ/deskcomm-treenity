import { describe, expect, it } from "vitest";

import {
  OPCOES_PADRAO,
  lembrarOpcoesSchema,
  mensagemAgendadaSchema,
  opcoesDoLembrar,
  rotuloDoPrazo,
  snoozeSchema,
} from "@/lib/schemas/snooze";

describe("Me lembrar (snoozeSchema)", () => {
  it("aceita qualquer prazo em minutos de 5 minutos a 5 anos", () => {
    expect(snoozeSchema.safeParse({ minutos: 5 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ minutos: 3 * 43_200 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ minutos: 5 * 365 * 1440 }).success).toBe(true);
  });
  it("recusa fora do limite, fração e texto", () => {
    expect(snoozeSchema.safeParse({ minutos: 4 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ minutos: 5 * 365 * 1440 + 1 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ minutos: 10.5 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ minutos: "60" }).success).toBe(false);
  });
  it("aceita data, mas não data e prazo juntos", () => {
    expect(snoozeSchema.safeParse({ ate: "2026-11-27T12:00:00.000Z" }).success).toBe(true);
    expect(snoozeSchema.safeParse({ minutos: 60, ate: "2026-11-27T12:00:00.000Z" }).success).toBe(false);
  });
});

describe("Janela aberta (mensagemAgendadaSchema)", () => {
  it("vai até 24 horas, nunca mais", () => {
    expect(mensagemAgendadaSchema.safeParse({ minutos: 1440, texto: "Oi" }).success).toBe(true);
    expect(mensagemAgendadaSchema.safeParse({ minutos: 1441, texto: "Oi" }).success).toBe(false);
  });
  it("exige texto", () => {
    expect(mensagemAgendadaSchema.safeParse({ minutos: 60, texto: "   " }).success).toBe(false);
  });
});

describe("opções da empresa", () => {
  it("janela até 24 h; me lembrar até 5 anos; ordena e tira repetidos", () => {
    expect(lembrarOpcoesSchema.safeParse({ janela: [1500], interno: [] }).success).toBe(false);
    const r = lembrarOpcoesSchema.parse({ janela: [180, 60, 60], interno: [129_600, 10_080] });
    expect(r).toEqual({ janela: [60, 180], interno: [10_080, 129_600] });
  });
  it("sem nada salvo (ou estragado), vale o padrão", () => {
    expect(opcoesDoLembrar({})).toEqual(OPCOES_PADRAO);
    expect(opcoesDoLembrar({ lembrar: { janela: [99999], interno: [] } })).toEqual(OPCOES_PADRAO);
    expect(opcoesDoLembrar({ lembrar: { janela: [], interno: [20_160] } })).toEqual({ janela: [], interno: [20_160] });
  });
  it("rótulo usa a maior unidade inteira", () => {
    expect(rotuloDoPrazo(60)).toBe("Em 1 hora");
    expect(rotuloDoPrazo(90)).toBe("Em 90 minutos");
    expect(rotuloDoPrazo(3 * 10_080)).toBe("Em 3 semanas");
    expect(rotuloDoPrazo(2 * 43_200)).toBe("Em 2 meses");
    expect(rotuloDoPrazo(15 * 1440)).toBe("Em 15 dias");
  });
});
