"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { MediaUnavailable } from "./MediaUnavailable";
import { mediaSrc, tamanhoDaMidia } from "./media-utils";
import { useMediaViewer } from "./MediaViewer";

interface Props {
  messageId: string;
  alt: string;
}

/** Miniatura na bolha + lightbox (Dialog) no clique. Padrão WhatsApp Web. */
export function ImageMedia({ messageId, alt }: Props) {
  const t = useT();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const src = mediaSrc(messageId);
  const viewer = useMediaViewer();

  if (state === "error")
    return (
      <div className="aspect-[4/3] w-64 max-w-full">
        <MediaUnavailable kind="Imagem" className="h-full w-full" />
      </div>
    );

  return (
    <>
      <button
        type="button"
        aria-label={t("Ampliar imagem")}
        onClick={() => (viewer ? viewer.abrir(messageId) : setOpen(true))}
        style={tamanhoDaMidia(dim?.w ?? 4, dim?.h ?? 3)}
        disabled={state !== "ready"}
        aria-disabled={state !== "ready"}
        className={cn(
          "relative block max-w-full overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-ring",
          state === "ready" ? "cursor-zoom-in" : "cursor-not-allowed opacity-50",
        )}
      >
        {state === "loading" && <Skeleton className="absolute inset-0 h-full w-full" />}
        <img src={src} alt={alt} loading="lazy" onLoad={(e) => { setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }); setState("ready"); }} onError={() => setState("error")} className="h-full w-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img src={src} alt={alt} className="max-h-[85vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
