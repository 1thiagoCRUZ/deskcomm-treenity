"use client";

/**
 * Envio de anexos no padrão do WhatsApp (pedido do usuário em 11/10: "99% das
 * pessoas usam o WhatsApp; se a tela for igual, ninguém precisa aprender").
 *
 * Tela cheia escura: a mídia grande no meio, ferramentas no topo, legenda
 * embaixo e a fila de miniaturas com "+" para juntar mais arquivos. O botão
 * verde manda TODOS, cada um com a sua legenda, na ordem da fila.
 *
 * Ferramentas (só em imagem): RECORTAR (arrasta um retângulo e confirma) e
 * DESENHAR (traço livre, 6 cores, desfazer). Cada edição confirmada vira um
 * arquivo novo (PNG/JPEG achatado no canvas) — o envio continua sendo o mesmo
 * upload + mensagem de sempre (`Composer.tsx`). "Voltar ao original" desfaz
 * todas as edições da imagem.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { useT } from "@/hooks/i18n/useT";
import { formatBytes } from "@/components/inbox/media/media-utils";
import { cn } from "@/lib/utils";
import {
  ArrowCounterClockwise,
  ArrowUUpLeft,
  Check,
  Crop,
  FileText,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  X,
} from "@/lib/ui/icons";

export interface ItemParaEnviar {
  file: File;
  caption: string;
}

interface Item {
  id: string;
  original: File;
  atual: File;
  caption: string;
}

type Ferramenta = "nenhuma" | "recortar" | "desenhar";

interface Traco {
  cor: string;
  largura: number;
  pontos: { x: number; y: number }[];
}

const CORES = ["#ffffff", "#111111", "#ef4444", "#facc15", "#22c55e", "#3b82f6"];
const MAX_ARQUIVOS = 10;

let contador = 0;
const novoId = () => `m${Date.now()}-${contador++}`;

const ehImagem = (f: File) => f.type.startsWith("image/") && f.type !== "image/gif";
const ehVideo = (f: File) => f.type.startsWith("video/");

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagem ilegível"));
    };
    img.src = url;
  });
}

function canvasParaArquivo(canvas: HTMLCanvasElement, base: File): Promise<File> {
  // PNG mantém transparência; o resto vira JPEG (menor para o WhatsApp).
  const tipo = base.type === "image/png" ? "image/png" : "image/jpeg";
  const nome = base.name.replace(/\.[^.]+$/, "") + (tipo === "image/png" ? ".png" : ".jpg");
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], nome, { type: tipo })) : reject(new Error("canvas vazio"))),
      tipo,
      0.92,
    ),
  );
}

export function EditorDeMidia({
  arquivos,
  enviando,
  onCancel,
  onSend,
}: {
  /** Os arquivos escolhidos (ou colados). Vazio = editor fechado. */
  arquivos: File[];
  enviando: boolean;
  onCancel: () => void;
  onSend: (itens: ItemParaEnviar[]) => void;
}) {
  const t = useT();
  const [itens, setItens] = useState<Item[]>([]);
  const [selecionado, setSelecionado] = useState(0);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("nenhuma");
  const [cor, setCor] = useState(CORES[2]!);
  const [tracos, setTracos] = useState<Traco[]>([]);
  const [recorte, setRecorte] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const maisRef = useRef<HTMLInputElement | null>(null);
  // Tamanho REAL da imagem aberta (pixels), lido quando ela carrega: é a escala
  // dos traços e do recorte. Em estado, e não lido do <img> na renderização.
  const [tamanho, setTamanho] = useState({ largura: 1, altura: 1 });

  // Abre com os arquivos recebidos (cada abertura recomeça do zero).
  useEffect(() => {
    setItens(arquivos.slice(0, MAX_ARQUIVOS).map((f) => ({ id: novoId(), original: f, atual: f, caption: "" })));
    setSelecionado(0);
    setFerramenta("nenhuma");
    setTracos([]);
    setRecorte(null);
  }, [arquivos]);

  const item = itens[selecionado] ?? null;

  const urls = useMemo(() => new Map(itens.map((i) => [i.id, URL.createObjectURL(i.atual)])), [itens]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const atualizar = useCallback((id: string, mudanca: Partial<Item>) => {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  function adicionar(files: FileList | null) {
    if (!files) return;
    const novos = Array.from(files).map((f) => ({ id: novoId(), original: f, atual: f, caption: "" }));
    setItens((prev) => {
      const juntos = [...prev, ...novos].slice(0, MAX_ARQUIVOS);
      setSelecionado(Math.min(prev.length, juntos.length - 1));
      return juntos;
    });
  }

  function remover(id: string) {
    setItens((prev) => {
      const resto = prev.filter((i) => i.id !== id);
      if (resto.length === 0) onCancel();
      setSelecionado((s) => Math.max(0, Math.min(s, resto.length - 1)));
      return resto;
    });
  }

  function trocarPara(indice: number) {
    if (ferramenta !== "nenhuma") return; // termine a edição antes
    setSelecionado(indice);
  }

  function enviar() {
    if (enviando || itens.length === 0 || ferramenta !== "nenhuma") return;
    onSend(itens.map((i) => ({ file: i.atual, caption: i.caption.trim() })));
  }

  // ---- área de edição (imagem) -------------------------------------------
  const imgRef = useRef<HTMLImageElement | null>(null);
  const desenhando = useRef<Traco | null>(null);

  /** Posição do ponteiro em coordenadas da imagem NATURAL (pixels reais). */
  function pontoNaImagem(e: PointerEvent<HTMLElement>) {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * img.naturalWidth;
    const y = ((e.clientY - r.top) / r.height) * img.naturalHeight;
    return {
      x: Math.max(0, Math.min(img.naturalWidth, x)),
      y: Math.max(0, Math.min(img.naturalHeight, y)),
    };
  }

  function aoPressionar(e: PointerEvent<HTMLDivElement>) {
    const p = pontoNaImagem(e);
    if (!p) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (ferramenta === "desenhar") {
      desenhando.current = { cor, largura: Math.max(3, tamanho.largura / 160), pontos: [p] };
      setTracos((prev) => [...prev, desenhando.current!]);
    } else if (ferramenta === "recortar") {
      setRecorte({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
  }

  function aoMover(e: PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    const p = pontoNaImagem(e);
    if (!p) return;
    if (ferramenta === "desenhar" && desenhando.current) {
      desenhando.current.pontos.push(p);
      setTracos((prev) => [...prev.slice(0, -1), { ...desenhando.current! }]);
    } else if (ferramenta === "recortar" && recorte) {
      setRecorte({ ...recorte, x1: p.x, y1: p.y });
    }
  }

  function aoSoltar() {
    desenhando.current = null;
  }

  async function concluirDesenho() {
    if (!item || tracos.length === 0) {
      setFerramenta("nenhuma");
      return;
    }
    const img = await carregarImagem(item.atual);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    for (const tr of tracos) {
      ctx.strokeStyle = tr.cor;
      ctx.lineWidth = tr.largura;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      tr.pontos.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      if (tr.pontos.length === 1) ctx.lineTo(tr.pontos[0]!.x + 0.1, tr.pontos[0]!.y);
      ctx.stroke();
    }
    atualizar(item.id, { atual: await canvasParaArquivo(canvas, item.original) });
    setTracos([]);
    setFerramenta("nenhuma");
  }

  async function concluirRecorte() {
    if (!item || !recorte) {
      setFerramenta("nenhuma");
      return;
    }
    const x = Math.min(recorte.x0, recorte.x1);
    const y = Math.min(recorte.y0, recorte.y1);
    const w = Math.abs(recorte.x1 - recorte.x0);
    const h = Math.abs(recorte.y1 - recorte.y0);
    if (w < 10 || h < 10) {
      setRecorte(null);
      setFerramenta("nenhuma");
      return;
    }
    const img = await carregarImagem(item.atual);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext("2d")!.drawImage(img, x, y, w, h, 0, 0, w, h);
    atualizar(item.id, { atual: await canvasParaArquivo(canvas, item.original) });
    setRecorte(null);
    setFerramenta("nenhuma");
  }

  function cancelarFerramenta() {
    setTracos([]);
    setRecorte(null);
    setFerramenta("nenhuma");
  }

  // Esc fecha a ferramenta aberta; sem ferramenta, fecha o editor. Enter envia.
  useEffect(() => {
    if (itens.length === 0) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (ferramenta !== "nenhuma") cancelarFerramenta();
        else onCancel();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [itens.length, ferramenta, onCancel]);

  if (itens.length === 0 || !item) return null;

  const podeEditar = ehImagem(item.atual);
  const editado = item.atual !== item.original;
  const url = urls.get(item.id);
  const { largura, altura } = tamanho;

  const botaoTopo = "rounded-full p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Enviar anexos")}
      data-testid="editor-de-midia"
      className="absolute inset-0 z-40 flex flex-col bg-[#0b141a] text-white"
    >
      {/* Topo: fechar | ferramentas */}
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <button type="button" className={botaoTopo} onClick={onCancel} aria-label={t("Fechar")} disabled={enviando}>
          <X size={24} aria-hidden />
        </button>

        {ferramenta === "nenhuma" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={botaoTopo}
              onClick={() => setFerramenta("recortar")}
              disabled={!podeEditar || enviando}
              title={t("Recortar")}
              aria-label={t("Recortar")}
            >
              <Crop size={22} aria-hidden />
            </button>
            <button
              type="button"
              className={botaoTopo}
              onClick={() => setFerramenta("desenhar")}
              disabled={!podeEditar || enviando}
              title={t("Desenhar")}
              aria-label={t("Desenhar")}
            >
              <PencilSimple size={22} aria-hidden />
            </button>
            <button
              type="button"
              className={botaoTopo}
              onClick={() => atualizar(item.id, { atual: item.original })}
              disabled={!editado || enviando}
              title={t("Voltar ao original")}
              aria-label={t("Voltar ao original")}
            >
              <ArrowCounterClockwise size={22} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {ferramenta === "desenhar" ? (
              <>
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    aria-label={`${t("Cor")} ${c}`}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      cor === c ? "scale-110 border-white" : "border-white/30",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <button
                  type="button"
                  className={botaoTopo}
                  onClick={() => setTracos((prev) => prev.slice(0, -1))}
                  disabled={tracos.length === 0}
                  title={t("Desfazer")}
                  aria-label={t("Desfazer")}
                >
                  <ArrowUUpLeft size={22} aria-hidden />
                </button>
              </>
            ) : (
              <span className="text-sm text-white/80">{t("Arraste para marcar a área do recorte")}</span>
            )}
            <button type="button" className={botaoTopo} onClick={cancelarFerramenta} aria-label={t("Cancelar")}>
              <X size={20} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void (ferramenta === "desenhar" ? concluirDesenho() : concluirRecorte())}
              className="rounded-full bg-[#00a884] p-2 text-white hover:bg-[#06cf9c]"
              aria-label={t("Concluir")}
              title={t("Concluir")}
            >
              <Check size={20} weight="bold" aria-hidden />
            </button>
          </div>
        )}
        <span className="w-10" aria-hidden />
      </div>

      {/* Centro: a mídia */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 [container-type:size]">
        {podeEditar && url ? (
          <div
            className={cn("relative max-h-full touch-none select-none", ferramenta !== "nenhuma" && "cursor-crosshair")}
            onPointerDown={ferramenta !== "nenhuma" ? aoPressionar : undefined}
            onPointerMove={ferramenta !== "nenhuma" ? aoMover : undefined}
            onPointerUp={aoSoltar}
          >
            <img
              ref={imgRef}
              src={url}
              alt={item.atual.name}
              draggable={false}
              onLoad={(e) =>
                setTamanho({
                  largura: e.currentTarget.naturalWidth || 1,
                  altura: e.currentTarget.naturalHeight || 1,
                })
              }
              className="block max-h-[100cqh] max-w-[100cqw] object-contain"
            />
            {/* Traços em andamento, desenhados por cima em SVG (mesma escala da imagem). */}
            {tracos.length > 0 ? (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${largura} ${altura}`}
                preserveAspectRatio="none"
              >
                {tracos.map((tr, i) => (
                  <polyline
                    key={i}
                    points={tr.pontos.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={tr.cor}
                    strokeWidth={tr.largura}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            ) : null}
            {recorte ? (
              <div
                className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                style={{
                  left: `${(Math.min(recorte.x0, recorte.x1) / largura) * 100}%`,
                  top: `${(Math.min(recorte.y0, recorte.y1) / altura) * 100}%`,
                  width: `${(Math.abs(recorte.x1 - recorte.x0) / largura) * 100}%`,
                  height: `${(Math.abs(recorte.y1 - recorte.y0) / altura) * 100}%`,
                }}
              />
            ) : null}
          </div>
        ) : ehVideo(item.atual) && url ? (
          <video src={url} controls className="max-h-[100cqh] max-w-[100cqw]" />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white/5 px-10 py-8 text-center">
            <FileText size={56} weight="duotone" className="text-white/80" aria-hidden />
            <p className="max-w-xs break-words font-medium">{item.atual.name}</p>
            <p className="text-sm text-white/60">{formatBytes(item.atual.size)}</p>
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="flex shrink-0 justify-center px-4 py-3">
        <input
          value={item.caption}
          onChange={(e) => atualizar(item.id, { caption: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder={t("Digite uma mensagem")}
          aria-label={t("Legenda")}
          disabled={enviando || ferramenta !== "nenhuma"}
          className="w-full max-w-2xl rounded-lg bg-[#2a3942] px-4 py-3 text-[15px] text-white placeholder:text-white/50 focus:outline-none"
        />
      </div>

      {/* Fila de miniaturas + enviar */}
      <div className="flex h-24 shrink-0 items-center gap-3 border-t border-white/10 px-4">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto py-2">
          {itens.map((i, indice) => (
            <div key={i.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => trocarPara(indice)}
                aria-label={`${t("Arquivo")} ${indice + 1}`}
                aria-current={indice === selecionado ? "true" : undefined}
                className={cn(
                  "flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border-2 bg-white/5",
                  indice === selecionado ? "border-[#00a884]" : "border-transparent",
                )}
              >
                {ehImagem(i.atual) ? (
                  <img src={urls.get(i.id)} alt="" className="h-full w-full object-cover" />
                ) : ehVideo(i.atual) ? (
                  <video src={urls.get(i.id)} className="h-full w-full object-cover" muted />
                ) : (
                  <FileText size={24} aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => remover(i.id)}
                aria-label={`${t("Remover")} ${indice + 1}`}
                disabled={enviando}
                className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-black/80 p-0.5 text-white group-hover:block"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
          {itens.length < MAX_ARQUIVOS ? (
            <button
              type="button"
              onClick={() => maisRef.current?.click()}
              disabled={enviando}
              aria-label={t("Adicionar mais")}
              title={t("Adicionar mais")}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-white/30 text-white/80 hover:bg-white/10"
            >
              <Plus size={22} aria-hidden />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || ferramenta !== "nenhuma"}
          aria-label={t("Enviar")}
          data-testid="editor-de-midia-enviar"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-lg transition-colors hover:bg-[#06cf9c] disabled:opacity-60"
        >
          {enviando ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <PaperPlaneTilt size={24} weight="fill" aria-hidden />
          )}
        </button>
      </div>

      <input
        ref={maisRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          adicionar(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
