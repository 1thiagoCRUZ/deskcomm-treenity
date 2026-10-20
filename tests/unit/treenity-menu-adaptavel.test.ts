import { describe, expect, it } from "vitest";

import { hubSections, sidebarGroups } from "@/lib/navigation/registry";
import { PAPEIS_DO_CLIENTE } from "@/lib/treenity/papeis";

const hrefsDoMenu = (...args: Parameters<typeof sidebarGroups>) =>
  sidebarGroups(...args).flatMap((g) => g.items.map((i) => i.href));

describe("menu do Dono: enxuto e adaptável", () => {
  it("Conexões e Respostas rápidas saem do menu lateral, mas ficam em Configurações", () => {
    const menu = hrefsDoMenu(false, "admin", { preset: "completa" });
    expect(menu).not.toContain("/app/connections");
    expect(menu).not.toContain("/app/templates");
    expect(menu).toContain("/app/inbox");
    expect(menu).toContain("/app/metrics");

    const config = hubSections("organizacao", false, "admin", { preset: "completa" })
      .flatMap((s) => s.items.map((i) => i.href));
    expect(config).toContain("/app/connections");
    expect(config).toContain("/app/templates");
  });

  it("Chat da equipe só aparece quando a empresa tem mais de uma pessoa", () => {
    const chat = "/app/integrations/treenity-bot/chat";
    expect(hrefsDoMenu(false, "admin", { preset: "completa" }, { temEquipe: false })).not.toContain(chat);
    expect(hrefsDoMenu(false, "admin", { preset: "completa" }, { temEquipe: true })).toContain(chat);
    // Sem a informação, mostra: esconder por engano é pior que mostrar a mais.
    expect(hrefsDoMenu(false, "admin", { preset: "completa" })).toContain(chat);
  });

  it("o Funcionário continua vendo as Respostas rápidas (a lista dele vence)", () => {
    const menu = hrefsDoMenu(false, "agent", PAPEIS_DO_CLIENTE.funcionario.interface, { temEquipe: true });
    expect(menu).toContain("/app/templates");
  });

  it("a Gestão dentro da empresa vê Conexões no menu", () => {
    const menu = hrefsDoMenu(false, "admin", { preset: "completa" }, { suporte: true });
    expect(menu).toContain("/app/connections");
  });
});

describe("Agenda no menu do Funcionário", () => {
  const agenda = "/app/agenda";
  it("o Funcionário padrão e o Dono veem a Agenda", () => {
    expect(hrefsDoMenu(false, "agent", PAPEIS_DO_CLIENTE.funcionario.interface)).toContain(agenda);
    expect(hrefsDoMenu(false, "admin", { preset: "completa" })).toContain(agenda);
  });
  it("menu personalizado pelo Dono vence: lista sem Agenda continua sem", () => {
    expect(hrefsDoMenu(false, "agent", { preset: "simplificada", destinos: ["/app/inbox"] })).not.toContain(agenda);
  });
});
