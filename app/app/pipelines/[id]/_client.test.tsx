/**
 * Trocar de funil sem sair do quadro (Spec 18, F2).
 *
 * O que nasce aqui, na tela: (a) com UM funil só, o título é só texto — não há o que
 * trocar, e um seletor com uma opção seria um controle que não faz nada; (b) com mais
 * de um, o título vira o seletor e mostra o funil ATUAL; (c) escolher outro navega para
 * a rota dele — e leva SÓ o id, não a querystring de filtros do funil anterior
 * (etiqueta e responsável de um funil não valem no outro).
 *
 * O quadro em si (colunas, cards, arrastar) tem testes próprios; aqui ele é um
 * esqueleto.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/app/pipelines/f1",
  useSearchParams: () => new URLSearchParams("owner=algum-filtro"),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    data: { pipeline: { name: "Vendas", vocabulary: null }, stages: [], leads: [] },
    isLoading: false,
    error: null,
    pulses: new Map(),
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
vi.mock("@/components/kanban/KanbanBoard", () => ({ KanbanBoard: () => <div data-testid="quadro" /> }));
vi.mock("@/components/kanban/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));

import { PipelinePageClient } from "./_client";

// Polyfills que o Radix Select exige e o jsdom não tem.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const FUNIS = [
  { id: "f1", name: "Vendas" },
  { id: "f2", name: "Pós-venda" },
];

beforeEach(() => vi.clearAllMocks());

describe("PipelinePageClient — trocar de funil", () => {
  it("com UM funil, o título é só texto: nenhum seletor", () => {
    render(<PipelinePageClient pipelineId="f1" initialName="Vendas" funis={[FUNIS[0]!]} />);

    expect(screen.getByRole("heading", { name: "Vendas" })).toBeInTheDocument();
    expect(screen.queryByTestId("trocar-de-funil")).not.toBeInTheDocument();
  });

  it("sem a lista (prop ausente), continua só texto — o comportamento de antes", () => {
    render(<PipelinePageClient pipelineId="f1" initialName="Vendas" />);
    expect(screen.queryByTestId("trocar-de-funil")).not.toBeInTheDocument();
  });

  it("com DOIS, o título vira o seletor e mostra o funil atual", () => {
    render(<PipelinePageClient pipelineId="f1" initialName="Vendas" funis={FUNIS} />);

    const seletor = screen.getByTestId("trocar-de-funil");
    expect(seletor).toHaveTextContent("Vendas");
    expect(seletor).toHaveAccessibleName("Trocar de funil");
  });

  it("⭐ escolher outro navega para a rota dele, SEM levar o filtro do funil anterior", async () => {
    const user = userEvent.setup();
    render(<PipelinePageClient pipelineId="f1" initialName="Vendas" funis={FUNIS} />);

    await user.click(screen.getByTestId("trocar-de-funil"));
    await user.click(await screen.findByTestId("funil-f2"));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/app/pipelines/f2");
    // A URL atual tinha `?owner=algum-filtro`; ele não pode viajar junto.
    expect(String(push.mock.calls[0]?.[0])).not.toContain("?");
  });

  it("lista todos os funis ativos como opção", async () => {
    const user = userEvent.setup();
    render(<PipelinePageClient pipelineId="f1" initialName="Vendas" funis={FUNIS} />);

    await user.click(screen.getByTestId("trocar-de-funil"));
    expect(await screen.findByTestId("funil-f1")).toBeInTheDocument();
    expect(screen.getByTestId("funil-f2")).toHaveTextContent("Pós-venda");
  });
});
