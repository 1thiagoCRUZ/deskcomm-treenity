import { describe, expect, it } from "vitest";

import { JANELA_PADRAO, janelaDaGrade } from "@/lib/agenda/janela-da-grade";

describe("janela da grade da Agenda", () => {
  it("sem expediente publicado, usa o padrão", () => {
    expect(janelaDaGrade([])).toEqual(JANELA_PADRAO);
  });

  it("segue o expediente: 8h–18h desenha as linhas de 8 a 17", () => {
    expect(janelaDaGrade([{ start: "08:00", end: "18:00" }])).toEqual({ primeira: 8, ultima: 17 });
  });

  it("junta os expedientes de várias pessoas", () => {
    expect(
      janelaDaGrade([
        { start: "09:00", end: "12:00" },
        { start: "14:00", end: "20:30" },
      ]),
    ).toEqual({ primeira: 9, ultima: 20 });
  });

  it("cresce para caber um compromisso fora do expediente", () => {
    const j = janelaDaGrade(
      [{ start: "10:00", end: "16:00" }],
      [{ comeca: "2026-10-14T07:00:00", termina: "2026-10-14T08:00:00" }],
    );
    expect(j.primeira).toBe(7);
  });

  it("nunca fica menor que seis linhas", () => {
    const j = janelaDaGrade([{ start: "10:00", end: "11:00" }]);
    expect(j.ultima - j.primeira + 1).toBe(6);
  });
});
