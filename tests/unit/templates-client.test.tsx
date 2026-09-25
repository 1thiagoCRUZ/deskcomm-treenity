import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({
    data: [
      { id: "1", title: "Meu Pessoal", body: "Oi {{primeiro_nome}}", shortcut: "oi", owner_user_id: "u1" },
      { id: "2", title: "Política da Equipe", body: "Política de troca", shortcut: null, owner_user_id: null },
      { id: "3", title: "Pessoal do Outro", body: "Segredo do colega", shortcut: null, owner_user_id: "u2" },
      {
        id: "4",
        title: "Em quanto tempo faz efeito?",
        body: "Com uns 15 dias...",
        shortcut: "efeito",
        owner_user_id: null,
        bot_triggers: ["quanto tempo", "demora quanto"],
        bot_context: "any",
        bot_enabled: true,
      },
      {
        id: "5",
        title: "Frete",
        body: "O frete sai pela Frenet.",
        shortcut: null,
        owner_user_id: null,
        bot_triggers: ["qual o frete"],
        bot_context: "any",
        bot_enabled: false,
      },
    ],
    isLoading: false,
  }),
}));

import { TemplatesClient } from "@/app/app/templates/_components/TemplatesClient";

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("TemplatesClient", () => {
  it("lista templates e abre o form de novo", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" />));
    expect(screen.getByText("Meu Pessoal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /nova resposta/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("agent (não-manager) só vê ações no próprio pessoal, não no compartilhado nem no de outro", () => {
    render(wrap(<TemplatesClient canShare={false} currentUserId="u1" />));
    // 5 respostas listadas, mas só 1 editável (o próprio pessoal) → 1 par de ações.
    expect(screen.getByText("Meu Pessoal")).toBeInTheDocument();
    expect(screen.getByText("Política da Equipe")).toBeInTheDocument();
    expect(screen.getByText("Pessoal do Outro")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Editar resposta" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Excluir resposta" })).toHaveLength(1);
  });

  it("manager vê ações no próprio E no compartilhado, mas não no pessoal de outro", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" />));
    // próprio (u1) + 3 compartilhados (null) editáveis; pessoal de u2 não → 4 pares.
    expect(screen.getAllByRole("button", { name: "Editar resposta" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Excluir resposta" })).toHaveLength(4);
  });

  it("sem o bot ligado na organização, não mostra gatilhos nem estado do bot", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" />));
    expect(screen.queryByText("Gatilhos do bot")).not.toBeInTheDocument();
    expect(screen.queryByText("quanto tempo")).not.toBeInTheDocument();
  });

  it("com o bot ligado, mostra gatilhos e o estado de cada resposta — inclusive a pausada", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" botDisponivel />));
    expect(screen.getByText("quanto tempo")).toBeInTheDocument();
    // Filtro "O bot responde · 2" também usa o rótulo; a etiqueta da linha é a outra.
    expect(screen.getAllByText("O bot responde").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pausada")).toBeInTheDocument();
    expect(screen.getAllByText("só o atendente usa")).toHaveLength(3);
  });

  it("com o bot ligado, toda resposta é da loja: sem selo Pessoal/Compartilhado", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" botDisponivel />));
    expect(screen.queryByText("Pessoal")).not.toBeInTheDocument();
    expect(screen.queryByText("Compartilhado")).not.toBeInTheDocument();
  });

  it("com o bot ligado, agent não cria resposta (só manager+ fala pela loja)", () => {
    render(wrap(<TemplatesClient canShare={false} currentUserId="u1" botDisponivel />));
    expect(screen.queryByRole("button", { name: /nova resposta/i })).not.toBeInTheDocument();
  });

  it("filtra só as que o bot responde e busca por gatilho", () => {
    render(wrap(<TemplatesClient canShare={true} currentUserId="u1" botDisponivel />));
    fireEvent.click(screen.getByRole("button", { name: /O bot responde · 2/ }));
    expect(screen.queryByText("Política da Equipe")).not.toBeInTheDocument();
    expect(screen.getByText("Frete")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar resposta" }), {
      target: { value: "demora" },
    });
    expect(screen.getByText("Em quanto tempo faz efeito?")).toBeInTheDocument();
    expect(screen.queryByText("Frete")).not.toBeInTheDocument();
  });
});
