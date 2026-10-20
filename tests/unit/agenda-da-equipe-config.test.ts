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

import { podeAbrirAgenda } from "@/lib/agenda/da-equipe";
import { PAPEIS_DO_CLIENTE } from "@/lib/treenity/papeis";

describe("podeAbrirAgenda", () => {
  const func = PAPEIS_DO_CLIENTE.funcionario.interface;
  it("Gestão, Dono e Gerente sempre", () => {
    expect(podeAbrirAgenda(true, null, undefined, false)).toBe(true);
    expect(podeAbrirAgenda(false, "admin", { preset: "completa" }, false)).toBe(true);
    expect(podeAbrirAgenda(false, "manager", { preset: "completa" }, false)).toBe(true);
  });
  it("Funcionário padrão só com a Agenda ligada", () => {
    expect(podeAbrirAgenda(false, "agent", func, false)).toBe(false);
    expect(podeAbrirAgenda(false, "agent", func, true)).toBe(true);
  });
  it("agent sem configuração ou simplificado sem lista não abre desligada", () => {
    expect(podeAbrirAgenda(false, "agent", undefined, false)).toBe(false);
    expect(podeAbrirAgenda(false, "agent", { preset: "simplificada" }, false)).toBe(false);
  });
  it("lista personalizada com a Agenda abre mesmo desligada; sem, não", () => {
    expect(podeAbrirAgenda(false, "agent", { preset: "simplificada", destinos: ["/app/inbox", "/app/agenda"] }, false)).toBe(true);
    expect(podeAbrirAgenda(false, "agent", { preset: "simplificada", destinos: ["/app/inbox"] }, false)).toBe(false);
  });
});
