import { describe, expect, it } from "vitest";

import { agendaLigadaParaEquipe } from "@/lib/agenda/da-equipe";

describe("agendaLigadaParaEquipe", () => {
  it("só é verdadeiro com equipe_ativa === true", () => {
    expect(agendaLigadaParaEquipe({ agenda: { equipe_ativa: true } })).toBe(true);
    expect(agendaLigadaParaEquipe({ agenda: { equipe_ativa: "true" } })).toBe(false);
    expect(agendaLigadaParaEquipe({ agenda: {} })).toBe(false);
    expect(agendaLigadaParaEquipe({})).toBe(false);
    expect(agendaLigadaParaEquipe(null)).toBe(false);
    expect(agendaLigadaParaEquipe("x")).toBe(false);
  });
});
