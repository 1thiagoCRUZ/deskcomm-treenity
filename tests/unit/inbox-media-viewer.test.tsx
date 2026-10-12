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

  it("baixar aponta para o endpoint de mídia", () => {
    abre();
    expect(screen.getByRole("link", { name: "Baixar" })).toHaveAttribute("href", "/api/v1/messages/a/media");
  });
});
