"use client";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MediaUnavailable } from "./MediaUnavailable";
import { useT } from "@/hooks/i18n/useT";
import { Play } from "@/lib/ui/icons";
import { mediaSrc } from "./media-utils";
import { useMediaViewer } from "./MediaViewer";

/** Vídeo inline com controles nativos (padrão WhatsApp Web). */
export function VideoMedia({ messageId }: { messageId: string }) {
  const t = useT();
  const viewer = useMediaViewer();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative w-full max-w-sm aspect-video overflow-hidden rounded-lg bg-black/5">
      {failed ? (
        <MediaUnavailable kind="Vídeo" className="h-full w-full" />
      ) : (
        <>
          {!ready && <Skeleton className="absolute inset-0 h-full w-full" />}
          <video
            src={mediaSrc(messageId)}
            controls={!viewer}
            preload="metadata"
            onLoadedMetadata={() => setReady(true)}
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
          {/* Dentro da conversa o clique abre a tela cheia (como no WhatsApp). */}
          {viewer && ready && (
            <button
              type="button"
              aria-label={t("Ampliar vídeo")}
              onClick={() => viewer.abrir(messageId)}
              className="absolute inset-0 flex cursor-zoom-in items-center justify-center bg-black/20 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
                <Play size={22} weight="fill" />
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
