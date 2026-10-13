"use client";

/**
 * Visualizador de mídia em tela cheia, no padrão do WhatsApp Web (pedido do
 * usuário em 12/10): quem mandou e quando no topo, ações à direita, a imagem ou
 * o vídeo no meio, a legenda embaixo e a faixa com TODAS as mídias da conversa.
 *
 * A lista vem das mensagens que o ChatThread já carregou — nenhuma consulta
 * nova. Quando a conversa tem páginas mais antigas ainda não baixadas, a faixa
 * mostra só o que está carregado.
 *
 * Fora de um MediaViewerProvider (ex.: o bloco de mídia usado isolado) o
 * `useMediaViewer()` devolve null e quem chama cai no comportamento antigo.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { Message } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";
import {
  ArrowBendUpLeft,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Play,
  X,
} from "@/lib/ui/icons";

import { mediaSrc } from "./media-utils";

interface Ctx {
  abrir: (messageId: string) => void;
}

const MediaViewerContext = createContext<Ctx | null>(null);

export function useMediaViewer(): Ctx | null {
  return useContext(MediaViewerContext);
}

/** Imagem ou vídeo com arquivo — o que entra na galeria. */
export function ehMidiaDaGaleria(m: Message): boolean {
  return (
    (m.type === "image" || m.type === "video") &&
    !m.revoked_at &&
    Boolean(m.media_url || m.media_storage_path)
  );
}

/** 5 degraus, como no WhatsApp: normal + 4 cliques de zoom. */
const ZOOMS = [1, 1.5, 2, 3, 4];

interface ProviderProps {
  messages: Message[];
  nomeDoContato: string;
  onResponder?: (m: Message) => void;
  children: ReactNode;
}

export function MediaViewerProvider({ messages, nomeDoContato, onResponder, children }: ProviderProps) {
  const galeria = useMemo(() => messages.filter(ehMidiaDaGaleria), [messages]);
  const [atualId, setAtualId] = useState<string | null>(null);
  const abrir = useCallback((id: string) => setAtualId(id), []);
  const fechar = useCallback(() => setAtualId(null), []);
  const ctx = useMemo(() => ({ abrir }), [abrir]);

  const indice = atualId ? galeria.findIndex((m) => m.id === atualId) : -1;
  const atual = galeria[indice];

  return (
    <MediaViewerContext.Provider value={ctx}>
      {children}
      {atual &&
        typeof document !== "undefined" &&
        createPortal(
          <Viewer
            galeria={galeria}
            msg={atual}
            indice={indice}
            nomeDoContato={nomeDoContato}
            onTrocar={(i) => setAtualId(galeria[i]?.id ?? null)}
            onFechar={fechar}
            onResponder={onResponder}
          />,
          document.body,
        )}
    </MediaViewerContext.Provider>
  );
}

interface ViewerProps {
  galeria: Message[];
  msg: Message;
  indice: number;
  nomeDoContato: string;
  onTrocar: (i: number) => void;
  onFechar: () => void;
  onResponder?: (m: Message) => void;
}

function Viewer({ galeria, msg, indice, nomeDoContato, onTrocar, onFechar, onResponder }: ViewerProps) {
  const t = useT();
  const locale = useLocaleDeData();
  const ehVideo = msg.type === "video";
  // O zoom é guardado junto da mídia a que pertence: trocar de mídia volta ao normal.
  const [zoomDe, setZoomDe] = useState({ id: "", nivel: 0 });
  const zoom = zoomDe.id === msg.id ? zoomDe.nivel : 0;
  const setZoom = (f: (z: number) => number) => setZoomDe({ id: msg.id, nivel: f(zoom) });
  const miniaturaAtiva = useRef<HTMLButtonElement | null>(null);
  const palco = useRef<HTMLDivElement | null>(null);
  // Arrastar a imagem ampliada move a vista (rolagem). `moveu` evita que o fim
  // do arrasto conte como clique e dê mais um zoom.
  const arrasto = useRef<{ x: number; y: number; left: number; top: number; moveu: boolean } | null>(null);
  const noMax = zoom === ZOOMS.length - 1;

  const iniciarArrasto = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom === 0 || !palco.current) return;
    arrasto.current = { x: e.clientX, y: e.clientY, left: palco.current.scrollLeft, top: palco.current.scrollTop, moveu: false };
  };
  const moverArrasto = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrasto.current;
    if (!a || !palco.current) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.moveu && Math.abs(dx) + Math.abs(dy) > 4) {
      a.moveu = true;
      // Só captura o ponteiro quando virou arrasto: capturar já no pressionar faz o
      // clique cair no palco (fora da imagem) e fechar o visualizador.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (!a.moveu) return;
    palco.current.scrollLeft = a.left - dx;
    palco.current.scrollTop = a.top - dy;
  };
  const terminarArrasto = () => {
    // Zera depois do click que vem junto com o pointerup.
    setTimeout(() => {
      arrasto.current = null;
    }, 0);
  };

  const anterior = useCallback(() => indice > 0 && onTrocar(indice - 1), [indice, onTrocar]);
  const proxima = useCallback(
    () => indice < galeria.length - 1 && onTrocar(indice + 1),
    [indice, galeria.length, onTrocar],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "ArrowRight") proxima();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [anterior, proxima, onFechar]);

  useEffect(() => {
    miniaturaAtiva.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [msg.id]);

  const quem =
    msg.direction === "inbound" ? nomeDoContato : msg.sent_via === "ai" ? t("IA") : t("Equipe");
  const quando = format(new Date(msg.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale });
  const inicial = quem.trim().charAt(0).toUpperCase() || "?";

  const responder = () => {
    onFechar();
    onResponder?.(msg);
  };

  const botao =
    "rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30 disabled:hover:bg-transparent";

  const ext = msg.media_mime?.split(";")[0]?.split("/")[1]?.replace("jpeg", "jpg") ?? (ehVideo ? "mp4" : "jpg");

  const nomeDoArquivo = `${ehVideo ? "video" : "imagem"}-${msg.id.slice(0, 8)}.${ext}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ehVideo ? t("Vídeo") : t("Imagem")}
      className="fixed inset-0 z-[100] flex flex-col bg-[#0b0d0f] text-white"
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{quem}</p>
          <p className="truncate text-xs text-white/60">{quando}</p>
        </div>
        {!ehVideo && (
          <>
            <button
              type="button"
              className={botao}
              aria-label={t("Reduzir")}
              title={t("Reduzir")}
              disabled={zoom === 0}
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
            >
              <MagnifyingGlassMinus size={22} />
            </button>
            <button
              type="button"
              className={botao}
              aria-label={t("Aumentar")}
              title={t("Aumentar")}
              disabled={noMax}
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            >
              <MagnifyingGlassPlus size={22} />
            </button>
          </>
        )}
        {onResponder && (
          <button type="button" className={botao} aria-label={t("Responder")} title={t("Responder")} onClick={responder}>
            <ArrowBendUpLeft size={22} />
          </button>
        )}
        <a
          className={botao}
          aria-label={t("Baixar")}
          title={t("Baixar")}
          href={`${mediaSrc(msg.id)}?download=${encodeURIComponent(nomeDoArquivo)}`}
          download={nomeDoArquivo}
        >
          <DownloadSimple size={22} />
        </a>
        <button type="button" className={botao} aria-label={t("Fechar")} title={t("Fechar")} onClick={onFechar}>
          <X size={22} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <button type="button" className={cn(botao, "absolute left-3 top-1/2 z-10 -translate-y-1/2 bg-white/10")} aria-label={t("Anterior")} onClick={anterior} disabled={indice === 0}>
          <CaretLeft size={24} />
        </button>
        <div
          ref={palco}
          className={cn(
            "flex min-w-0 flex-1 overflow-auto px-16 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            zoom > 0 && "touch-none cursor-grab active:cursor-grabbing",
          )}
          onPointerDown={iniciarArrasto}
          onPointerMove={moverArrasto}
          onPointerUp={terminarArrasto}
          onPointerCancel={terminarArrasto}
          onClick={(e) => e.target === e.currentTarget && !arrasto.current?.moveu && onFechar()}
        >
          {ehVideo ? (
            <video
              key={msg.id}
              src={mediaSrc(msg.id)}
              controls
              autoPlay
              className="m-auto max-h-full max-w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={msg.id}
              src={mediaSrc(msg.id)}
              alt={t("Imagem recebida")}
              draggable={false}
              onClick={() => {
                if (arrasto.current?.moveu) return;
                setZoom((z) => (z + 1) % ZOOMS.length);
              }}
              style={zoom === 0 ? undefined : { height: `${(ZOOMS[zoom] ?? 1) * 100}%`, maxWidth: "none", maxHeight: "none" }}
              className={cn("m-auto object-contain", zoom === 0 ? "max-h-full max-w-full cursor-zoom-in" : "shrink-0 select-none")}
            />
          )}
        </div>
        <button type="button" className={cn(botao, "absolute right-3 top-1/2 z-10 -translate-y-1/2 bg-white/10")} aria-label={t("Próxima")} onClick={proxima} disabled={indice === galeria.length - 1}>
          <CaretRight size={24} />
        </button>
      </div>

      {msg.body && <p className="px-16 py-2 text-center text-sm text-white/70">{msg.body}</p>}

      <footer className="flex gap-2 overflow-x-auto border-t border-white/10 px-3 py-2" aria-label={t("Mídias da conversa")}>
        {galeria.map((m, i) => (
          <button
            key={m.id}
            ref={i === indice ? miniaturaAtiva : undefined}
            type="button"
            onClick={() => onTrocar(i)}
            aria-label={`${m.type === "video" ? t("Vídeo") : t("Imagem")} ${i + 1}`}
            aria-current={i === indice}
            className={cn(
              "relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/10 outline-2 outline-offset-0",
              i === indice ? "outline outline-emerald-400" : "opacity-70 hover:opacity-100",
            )}
          >
            {m.type === "video" ? (
              <>
                <video src={`${mediaSrc(m.id)}#t=0.1`} preload="metadata" muted className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play size={18} weight="fill" />
                </span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(m.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </footer>
    </div>
  );
}
