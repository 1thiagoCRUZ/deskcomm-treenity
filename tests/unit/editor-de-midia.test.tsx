import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { EditorDeMidia } from "@/components/inbox/composer/EditorDeMidia";

/** Envio de anexos no padrão WhatsApp (pedido de 11/10). */

beforeAll(() => {
  // jsdom não tem URL.createObjectURL.
  globalThis.URL.createObjectURL = vi.fn(() => "blob:teste");
  globalThis.URL.revokeObjectURL = vi.fn();
});

const img = (nome: string) => new File(["x"], nome, { type: "image/jpeg" });
const pdf = new File(["x"], "orcamento.pdf", { type: "application/pdf" });

describe("editor de mídia", () => {
  it("fechado quando não há arquivo", () => {
    render(<EditorDeMidia arquivos={[]} enviando={false} onCancel={() => {}} onSend={() => {}} />);
    expect(screen.queryByTestId("editor-de-midia")).toBeNull();
  });

  it("mostra a fila de miniaturas e manda TODOS, cada um com a sua legenda", () => {
    const onSend = vi.fn();
    render(<EditorDeMidia arquivos={[img("a.jpg"), img("b.jpg")]} enviando={false} onCancel={() => {}} onSend={onSend} />);
    expect(screen.getByRole("button", { name: "Arquivo 1" })).toHaveAttribute("aria-current", "true");
    fireEvent.change(screen.getByLabelText("Legenda"), { target: { value: "  primeira  " } });
    fireEvent.click(screen.getByRole("button", { name: "Arquivo 2" }));
    fireEvent.change(screen.getByLabelText("Legenda"), { target: { value: "segunda" } });
    fireEvent.click(screen.getByTestId("editor-de-midia-enviar"));
    expect(onSend).toHaveBeenCalledWith([
      { file: expect.objectContaining({ name: "a.jpg" }), caption: "primeira" },
      { file: expect.objectContaining({ name: "b.jpg" }), caption: "segunda" },
    ]);
  });

  it("Enter na legenda envia", () => {
    const onSend = vi.fn();
    render(<EditorDeMidia arquivos={[img("a.jpg")]} enviando={false} onCancel={() => {}} onSend={onSend} />);
    fireEvent.keyDown(screen.getByLabelText("Legenda"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("tirar o único arquivo fecha o editor", () => {
    const onCancel = vi.fn();
    render(<EditorDeMidia arquivos={[img("a.jpg")]} enviando={false} onCancel={onCancel} onSend={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover 1" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("documento: mostra nome e tamanho, sem ferramentas de imagem", () => {
    render(<EditorDeMidia arquivos={[pdf]} enviando={false} onCancel={() => {}} onSend={() => {}} />);
    expect(screen.getAllByText("orcamento.pdf").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Recortar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desenhar" })).toBeDisabled();
  });

  it("imagem: abre o desenho com as cores e volta com Cancelar", () => {
    render(<EditorDeMidia arquivos={[img("a.jpg")]} enviando={false} onCancel={() => {}} onSend={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Desenhar" }));
    expect(screen.getAllByRole("button", { name: /^Cor / })).toHaveLength(6);
    // Enquanto edita, não envia nem troca de arquivo.
    expect(screen.getByTestId("editor-de-midia-enviar")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Desenhar" })).toBeEnabled();
  });

  it("Esc fecha o editor", () => {
    const onCancel = vi.fn();
    render(<EditorDeMidia arquivos={[img("a.jpg")]} enviando={false} onCancel={onCancel} onSend={() => {}} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
