/**
 * O hub é a vitrine de um grupo: mostra TUDO que ele tem, com descrição,
 * organizado pela jornada de quem usa. É onde as sete telas que só existiam
 * atrás das abas de IA passam a ser descobertas.
 *
 * A permissão é do registro (`navegacao-registry.test.ts`); aqui é o desenho.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { NavHub } from "@/components/shell/NavHub";

afterEach(cleanup);

describe("NavHub", () => {
  it("apresenta o CRM nas etapas da jornada, na ordem", () => {
    render(<NavHub group="crm" isPlatformAdmin role={null} title="CRM" subtitle="" />);
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toEqual(["O dia a dia da venda", "Preparar a venda"]);
  });

  it("desenterra Produtos, que não está no sidebar", () => {
    render(<NavHub group="crm" isPlatformAdmin role={null} title="CRM" subtitle="" />);
    const link = screen.getByRole("link", { name: /Produtos/ });
    expect(link).toHaveAttribute("href", "/app/products");
  });

  it("mostra também o que já está no sidebar — é inventário, não sobra", () => {
    render(<NavHub group="crm" isPlatformAdmin role={null} title="CRM" subtitle="" />);
    expect(screen.getByRole("link", { name: /Funis/ })).toBeTruthy();
  });

  it("some com a seção inteira quando a permissão esvazia", () => {
    render(
      <NavHub group="organizacao" isPlatformAdmin={false} role="viewer" title="Org" subtitle="" />,
    );
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toContain("Sua conta");
    expect(secoes).not.toContain("Dados e acesso");
  });

  it("agrupa os cards sob a própria seção, não numa lista solta", () => {
    render(<NavHub group="crm" isPlatformAdmin role={null} title="CRM" subtitle="" />);
    const preparar = screen.getByRole("region", { name: "Preparar a venda" });
    expect(within(preparar).getByRole("link", { name: /Produtos/ })).toBeTruthy();
    expect(within(preparar).queryByRole("link", { name: /Contatos/ })).toBeNull();
  });
});
