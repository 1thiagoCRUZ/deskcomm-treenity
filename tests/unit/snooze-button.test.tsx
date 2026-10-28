import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const deleteMock = vi.fn();
const getMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: vi.fn(),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

const showApiErrorMock = vi.fn();
vi.mock("@/components/feedback/ApiErrorToast", () => ({
  showApiError: (...args: unknown[]) => showApiErrorMock(...args),
}));

import { SnoozeButton } from "@/components/inbox/SnoozeButton";

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

// Radix DropdownMenuTrigger abre no `pointerdown` (não `click`).
function openTrigger(btn: HTMLElement) {
  fireEvent.pointerDown(btn, { button: 0, ctrlKey: false, pointerId: 1 });
}

const estado: { opcoes: unknown; marcada: unknown } = { opcoes: null, marcada: null };

beforeEach(() => {
  postMock.mockReset();
  deleteMock.mockReset();
  showApiErrorMock.mockReset();
  estado.opcoes = { janela: [60, 180], interno: [10_080, 3 * 10_080, 3 * 43_200] };
  estado.marcada = null;
  getMock.mockReset();
  getMock.mockImplementation(async (path: string) =>
    path.includes("settings/lembrar") ? { data: estado.opcoes } : { data: estado.marcada },
  );
});

// Cliente escreveu há 1 hora num canal com janela: faltam ~23 h.
const janelaAberta = { provider: "meta_cloud", lastInboundAt: new Date(Date.now() - 3_600_000).toISOString() };

describe("SnoozeButton — Me lembrar", () => {
  it("usa os botões da empresa: 'Em 3 semanas' marca 30240 minutos", async () => {
    postMock.mockResolvedValue({ data: { snooze_until: "2026-11-17T12:00:00.000Z" } });
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} {...janelaAberta} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    fireEvent.click(await screen.findByText("Em 3 semanas"));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze", { minutos: 30_240 }),
    );
  });

  it("'Em 3 meses' marca 129600 minutos", async () => {
    postMock.mockResolvedValue({ data: {} });
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    fireEvent.click(await screen.findByText("Em 3 meses"));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze", { minutos: 129_600 }),
    );
  });

  it("'Outro prazo...' aceita 5 meses", async () => {
    postMock.mockResolvedValue({ data: {} });
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    fireEvent.click(await screen.findByText("Outro prazo..."));
    fireEvent.change(await screen.findByLabelText("Daqui a quanto tempo"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze", { minutos: 5 * 43_200 }),
    );
  });

  it("lembrete ativo: mostra a data e cancela com DELETE", async () => {
    deleteMock.mockResolvedValue(undefined);
    const daqui10dias = new Date(Date.now() + 10 * 86_400_000).toISOString();
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={daqui10dias} />));
    const botao = screen.getByRole("button", { name: /lembrete ativo/i });
    expect(botao.textContent).toMatch(/Lembrete \d{2}\/\d{2}/);
    openTrigger(botao);
    fireEvent.click(await screen.findByText(/Cancelar lembrete de/));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/snooze"));
  });

  it("erro na mutation chama showApiError", async () => {
    postMock.mockRejectedValue(new Error("falhou"));
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    fireEvent.click(await screen.findByText("Em 1 semana"));
    await waitFor(() => expect(showApiErrorMock).toHaveBeenCalled());
  });
});

describe("SnoozeButton — Janela aberta", () => {
  it("escreve a mensagem e marca para daqui a 3 horas", async () => {
    postMock.mockResolvedValue({ data: { id: "m1", enviar_em: new Date().toISOString(), body: "Oi" } });
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} {...janelaAberta} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    fireEvent.click(await screen.findByText("Em 3 horas"));
    fireEvent.change(await screen.findByLabelText("Mensagem"), { target: { value: "Conseguiu ver?" } });
    fireEvent.click(screen.getByRole("button", { name: "Marcar" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/mensagem-agendada", {
        minutos: 180,
        texto: "Conseguiu ver?",
      }),
    );
  });

  it("não deixa passar do fim da janela", async () => {
    // Cliente escreveu há 22 h: faltam 2 h. "Em 3 horas" fica desligado e 5 horas no "Outro" não salva.
    const quase = { provider: "meta_cloud", lastInboundAt: new Date(Date.now() - 22 * 3_600_000).toISOString() };
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} {...quase} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    expect((await screen.findByText("Em 3 horas")).closest("[role=menuitem]")).toHaveAttribute("data-disabled");
    fireEvent.click(screen.getByText("Outro horário..."));
    fireEvent.change(await screen.findByLabelText("Mensagem"), { target: { value: "Oi" } });
    fireEvent.change(screen.getByLabelText("Daqui a quanto tempo"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Unidade"), { target: { value: "hora" } });
    expect(screen.getByRole("button", { name: "Marcar" })).toBeDisabled();
    expect(screen.getByText(/passa do fim da janela/)).toBeInTheDocument();
  });

  it("janela fechada: não oferece mensagem", async () => {
    const fechada = { provider: "meta_cloud", lastInboundAt: new Date(Date.now() - 30 * 3_600_000).toISOString() };
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} {...fechada} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    expect(await screen.findByText(/Janela fechada/)).toBeInTheDocument();
    expect(screen.queryByText("Em 1 hora")).toBeNull();
  });

  it("com mensagem marcada: mostra a hora e cancela", async () => {
    deleteMock.mockResolvedValue(undefined);
    estado.marcada = { id: "m1", body: "Oi", enviar_em: new Date(Date.now() + 3_600_000).toISOString() };
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} {...janelaAberta} />));
    const botao = await screen.findByRole("button", { name: /lembrete ativo/i });
    expect(botao.textContent).toMatch(/Mensagem \d{2}:\d{2}/);
    openTrigger(botao);
    fireEvent.click(await screen.findByText(/Cancelar mensagem das/));
    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith("/api/v1/conversations/conv-1/mensagem-agendada"),
    );
  });

  it("'Editar opções...' só aparece para a Gestão", async () => {
    const { unmount } = render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    await screen.findByText("Me lembrar");
    expect(screen.queryByText("Editar opções...")).toBeNull();
    unmount();
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} podeEditarOpcoes />));
    openTrigger(screen.getByRole("button", { name: /lembrar/i }));
    expect(await screen.findByText("Editar opções...")).toBeInTheDocument();
  });

  it("disabled prop desabilita o botão", () => {
    render(wrap(<SnoozeButton conversationId="conv-1" snoozeUntil={null} disabled />));
    expect(screen.getByRole("button", { name: /lembrar/i })).toBeDisabled();
  });
});
