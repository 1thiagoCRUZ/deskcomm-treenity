import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageMedia } from "@/components/inbox/media/ImageMedia";
import { MediaViewerProvider, ehMidiaDaGaleria } from "@/components/inbox/media/MediaViewer";
import type { Message } from "@/lib/types/messaging";

function msg(id: string, type: string, extra: Partial<Message> = {}): Message {
  return {
    id,
    type,
    direction: "inbound",
    sent_via: "user",
    sent_at: "2026-10-11T21:40:00Z",
    body: null,
    media_url: null,
    media_storage_path: `org/${id}.bin`,
    media_mime: type === "video" ? "video/mp4" : "image/jpeg",
    revoked_at: null,
    ...extra,
  } as Message;
}

const lista = [msg("a", "image", { body: "legenda A" }), msg("b", "video"), msg("c", "image")];

function abre(onResponder?: (m: Message) => void) {
  render(
    <MediaViewerProvider messages={lista} nomeDoContato="Thiago" onResponder={onResponder}>
      <ImageMedia messageId="a" alt="Imagem recebida" />
    </MediaViewerProvider>,
  );
  fireEvent.load(screen.getByAltText("Imagem recebida"));
  fireEvent.click(screen.getByRole("button", { name: /ampliar imagem/i }));
}

describe("MediaViewer", () => {
  it("só imagem/vídeo com arquivo e não apagados entram na galeria", () => {
    expect(ehMidiaDaGaleria(msg("x", "image"))).toBe(true);
    expect(ehMidiaDaGaleria(msg("x", "audio"))).toBe(false);
    expect(ehMidiaDaGaleria(msg("x", "image", { revoked_at: "2026-10-12T00:00:00Z" }))).toBe(false);
    expect(ehMidiaDaGaleria(msg("x", "image", { media_storage_path: null }))).toBe(false);
  });

  it("abre em tela cheia com quem enviou, legenda e todas as miniaturas", () => {
    abre();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Thiago")).toBeInTheDocument();
    expect(screen.getByText("legenda A")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^(Imagem|Vídeo) \d$/ })).toHaveLength(3);
  });

  it("setas e teclado trocam de mídia; Esc fecha", () => {
    abre();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(document.querySelector("video[controls]")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("legenda A")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("responder fecha e entrega a mensagem", () => {
    const onResponder = vi.fn();
    abre(onResponder);
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(onResponder).toHaveBeenCalledWith(lista[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("zoom em 4 degraus: o + desliga no máximo e o - só liga depois do primeiro zoom", () => {
    abre();
    const mais = screen.getByRole("button", { name: "Aumentar" });
    const menos = screen.getByRole("button", { name: "Reduzir" });
    expect(menos).toBeDisabled();
    for (let i = 0; i < 4; i++) {
      expect(mais).toBeEnabled();
      fireEvent.click(mais);
    }
    expect(mais).toBeDisabled();
    expect(menos).toBeEnabled();
    fireEvent.click(menos);
    expect(mais).toBeEnabled();
  });

  it("não tem mais o botão de ir para a mensagem", () => {
    abre();
    expect(screen.queryByRole("button", { name: "Ir para a mensagem" })).not.toBeInTheDocument();
  });

  it("baixar pede o arquivo como anexo (o atributo download não vale entre origens)", () => {
    abre();
    const a = screen.getByRole("link", { name: "Baixar" });
    expect(a.getAttribute("href")).toMatch(/^\/api\/v1\/messages\/a\/media\?download=imagem-a\.jpg$/);
    expect(a).toHaveAttribute("download", "imagem-a.jpg");
  });

  it("clicar na imagem com zoom não fecha o visualizador", () => {
    abre();
    const img = document.querySelector("img[alt='Imagem recebida']") as HTMLElement;
    fireEvent.click(img);
    fireEvent.click(img);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("depois de arrastar, o clique solto no palco não fecha", () => {
    abre();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    const palco = document.querySelector("img[alt='Imagem recebida']")!.parentElement as HTMLElement;
    fireEvent.pointerDown(palco, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(palco, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(palco, { pointerId: 1 });
    fireEvent.click(palco);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
