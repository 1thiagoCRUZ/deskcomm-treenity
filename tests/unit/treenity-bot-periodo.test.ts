import { describe, expect, it } from "vitest";

import {
  ateParaOBot,
  desdeParaOBot,
  atalhoDoPeriodo,
  diaParaExibir,
  hojeNoPainel,
  periodoDoAtalho,
  somarDias,
} from "@/lib/treenity-bot/periodo";
import { previaDaMensagem, unirSemRepetir } from "@/app/app/integrations/treenity-bot/(painel)/_painel/formatacao-painel";

describe("periodo do painel do Treenity Bot", () => {
  it("hoje usa o dia de São Paulo, não o de UTC", () => {
    // 01:30 UTC de 21/10 ainda é 22:30 de 20/10 em São Paulo.
    expect(hojeNoPainel(new Date("2026-10-21T01:30:00Z"))).toBe("2026-10-20");
    expect(hojeNoPainel(new Date("2026-10-21T04:00:00Z"))).toBe("2026-10-21");
  });

  it("soma dias atravessando mês e ano", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("ate inclusivo vira exclusivo para o bot", () => {
    expect(ateParaOBot("2026-10-20")).toBe("2026-10-21T00:00:00-03:00");
    expect(ateParaOBot("2026-10-31")).toBe("2026-11-01T00:00:00-03:00");
    expect(ateParaOBot("2026-02-31")).toBeUndefined();
    expect(desdeParaOBot("2026-10-20")).toBe("2026-10-20T00:00:00-03:00");
    expect(ateParaOBot("")).toBeUndefined();
    expect(ateParaOBot(undefined)).toBeUndefined();
    expect(ateParaOBot("lixo")).toBeUndefined();
  });

  it("atalhos", () => {
    const hoje = "2026-10-20";
    expect(periodoDoAtalho("hoje", hoje)).toEqual({ desde: hoje, ate: hoje });
    expect(periodoDoAtalho("7dias", hoje)).toEqual({ desde: "2026-10-14", ate: hoje });
    expect(periodoDoAtalho("30dias", hoje)).toEqual({ desde: "2026-09-21", ate: hoje });
    expect(periodoDoAtalho("este_mes", hoje)).toEqual({ desde: "2026-10-01", ate: hoje });
    expect(periodoDoAtalho("mes_passado", hoje)).toEqual({ desde: "2026-09-01", ate: "2026-09-30" });
    expect(periodoDoAtalho("mes_passado", "2026-01-15")).toEqual({ desde: "2025-12-01", ate: "2025-12-31" });
    expect(periodoDoAtalho("tudo", hoje)).toEqual({ desde: "", ate: "" });
  });

  it("reconhece o atalho a partir do período", () => {
    const hoje = "2026-10-20";
    expect(atalhoDoPeriodo({ desde: "", ate: "" }, hoje)).toBe("tudo");
    expect(atalhoDoPeriodo({ desde: "2026-10-14", ate: hoje }, hoje)).toBe("7dias");
    expect(atalhoDoPeriodo({ desde: "2026-10-02", ate: hoje }, hoje)).toBe("personalizado");
  });

  it("mostra o dia no formato brasileiro", () => {
    expect(diaParaExibir("2026-10-05")).toBe("05/10/2026");
  });
});

describe("formatação de conversas", () => {
  it("prévia em uma linha, com corte", () => {
    expect(previaDaMensagem("oi\n\n  tudo   bem?")).toBe("oi tudo bem?");
    expect(previaDaMensagem("a".repeat(200), 10)).toBe("aaaaaaaaa…");
    expect(previaDaMensagem(null)).toBe("");
  });

  it("junta status sem repetir e sem vazios", () => {
    expect(unirSemRepetir(["A", "B"], ["B", null, "C", ""])).toEqual(["A", "B", "C"]);
  });
});
