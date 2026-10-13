import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentCard } from "@/components/inbox/media/DocumentCard";
import { VideoMedia } from "@/components/inbox/media/VideoMedia";

describe("VideoMedia", () => {
  it("renderiza <video> com controles apontando pro endpoint", () => {
    const { container } = render(<VideoMedia messageId="m4" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/api/v1/messages/m4/media");
    expect(video).toHaveAttribute("controls");
  });

  it("caixa estável mantém a proporção do vídeo", () => {
    const { container } = render(<VideoMedia messageId="m4" />);
    const box = container.querySelector("div[style*='aspect-ratio']");
    expect(box).not.toBeNull();
    expect(box).toHaveClass("relative", "max-w-full", "overflow-hidden", "rounded-xl");
  });

  it("mostra skeleton enquanto carrega, desaparece após loadedmetadata", () => {
    const { container } = render(<VideoMedia messageId="m4" />);
    const video = container.querySelector("video")!;
    const skeleton = container.querySelector(".absolute.inset-0");

    // Skeleton deve estar presente antes do evento
    expect(skeleton).not.toBeNull();

    // Dispara loadedmetadata
    fireEvent(video, new Event("loadedmetadata"));

    // Skeleton deve desaparecer
    expect(container.querySelector(".absolute.inset-0")).toBeNull();
  });

  it("mostra fallback quando o vídeo falha (dentro do container)", () => {
    const { container } = render(<VideoMedia messageId="m4" />);
    const video = container.querySelector("video")!;

    fireEvent.error(video);

    const aspectVideoBox = container.querySelector("div[style*='aspect-ratio']");
    expect(aspectVideoBox).not.toBeNull();
    expect(screen.getByText("Mídia indisponível")).toBeInTheDocument();

    // Verifica que o fallback está dentro do container com proporção
    expect(aspectVideoBox?.contains(screen.getByText("Mídia indisponível"))).toBe(true);
  });
});

describe("DocumentCard", () => {
  it("mostra rótulo, tamanho e link de download", () => {
    render(
      <DocumentCard
        messageId="m5"
        mime="application/pdf"
        sizeBytes={3179614}
        storagePath="org/conv/m5.pdf"
        isOutbound={false}
      />,
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText(/3,0 MB/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /baixar pdf \(3,0 MB\)/i });
    expect(link).toHaveAttribute("href", "/api/v1/messages/m5/media");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
