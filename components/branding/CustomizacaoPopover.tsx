"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { usePermission } from "@/hooks/auth/AuthProvider";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Palette, Sun, Moon, MonitorPlay, ImageIcon, FileText } from "@/lib/ui/icons";
import {
  FONTES_DISPONIVEIS,
  FONTE_PADRAO,
  fontePorId,
  type IdDeFonte,
} from "@/lib/customizacao/fontes";

const CORES_PRESET: readonly { readonly nome: string; readonly hex: string }[] = [
  { nome: "Treenity (padrão)", hex: "#3B64DE" },
  { nome: "Sage", hex: "#506D48" },
  { nome: "Grafite", hex: "#26292F" },
  { nome: "Rosé", hex: "#B84A6B" },
  { nome: "Âmbar", hex: "#B07A2B" },
  { nome: "Índigo", hex: "#4F46E5" },
];

const STYLE_ID = "custom-preview-marca";

function ehHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

function cssDeAccent(hex: string): string {
  return `:root, [data-theme="light"], [data-theme="dark"] {
    --color-accent-500: ${hex};
    --color-accent: ${hex};
    --ring: ${hex};
    --primary: ${hex};
  }`;
}

function cssDeFonte(fonteVar: string): string {
  return `:root { --font-sans: ${fonteVar}, ui-sans-serif, system-ui, sans-serif; }`;
}

function injetarPreview(css: string) {
  if (typeof document === "undefined") return;
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

function removerPreview() {
  if (typeof document === "undefined") return;
  document.getElementById(STYLE_ID)?.remove();
}

export function CustomizacaoPopover() {
  const podeVer = usePermission("settings.write");
  const { theme, setTheme } = useTheme();

  const [aberto, setAberto] = useState(false);
  const [cor, setCor] = useState<string>("#3B64DE");
  const [fonte, setFonte] = useState<IdDeFonte>(FONTE_PADRAO);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const cssAtual = useMemo(() => {
    const partes: string[] = [];
    if (ehHex(cor)) partes.push(cssDeAccent(cor));
    partes.push(cssDeFonte(fontePorId(fonte).variavelCss));
    return partes.join("\n");
  }, [cor, fonte]);

  useEffect(() => {
    injetarPreview(cssAtual);
  }, [cssAtual]);

  const descartar = useCallback(() => {
    setCor("#3B64DE");
    setFonte(FONTE_PADRAO);
    setLogoDataUrl(null);
    removerPreview();
    toast.info("Ajustes descartados.");
  }, []);

  const salvar = useCallback(() => {
    toast.message(
      "Preview aplicado nesta sessão. Para salvar como padrão da organização, use Configurações › Marca.",
      { duration: 6000 },
    );
    setAberto(false);
  }, []);

  const escolherLogo = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setLogoDataUrl(url);
      if (url) toast.success("Logo carregada no preview.");
    };
    reader.readAsDataURL(file);
  }, []);

  if (!podeVer) return null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Personalizar aparência">
          <Palette size={16} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Personalizar aparência</div>
          <div className="text-xs text-text-muted">
            Preview vive nesta sessão. Salvar como padrão fica em Configurações › Marca.
          </div>
        </div>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
            <Palette size={12} aria-hidden /> Cor de destaque
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={ehHex(cor) ? cor : "#3B64DE"}
              onChange={(e) => setCor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded border border-border bg-surface"
              aria-label="Escolher cor"
            />
            <input
              type="text"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              placeholder="#3B64DE"
              className="h-9 flex-1 rounded border border-border bg-surface px-2 font-mono text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {CORES_PRESET.map((p) => (
              <button
                key={p.hex}
                type="button"
                onClick={() => setCor(p.hex)}
                title={`${p.nome} — ${p.hex}`}
                className="h-6 w-6 rounded border border-border transition hover:scale-110"
                style={{ backgroundColor: p.hex }}
                aria-label={p.nome}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
            <FileText size={12} aria-hidden /> Fonte
          </div>
          <div className="grid grid-cols-3 gap-1">
            {FONTES_DISPONIVEIS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFonte(f.id)}
                className={`rounded border px-2 py-1.5 text-xs transition ${
                  fonte === f.id
                    ? "border-accent bg-accent-soft text-text"
                    : "border-border bg-surface text-text-muted hover:border-border-strong"
                }`}
                style={{ fontFamily: f.variavelCss }}
                title={f.nome}
              >
                <div className="text-base font-semibold">{f.amostra}</div>
                <div className="truncate">{f.nome}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
            Tema
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(["light", "dark", "system"] as const).map((t) => {
              const Icon = t === "dark" ? Moon : t === "system" ? MonitorPlay : Sun;
              const label = t === "dark" ? "Escuro" : t === "system" ? "Sistema" : "Claro";
              const ativo = theme === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex flex-col items-center gap-1 rounded border px-2 py-2 text-xs transition ${
                    ativo
                      ? "border-accent bg-accent-soft text-text"
                      : "border-border bg-surface text-text-muted hover:border-border-strong"
                  }`}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
            <ImageIcon size={12} aria-hidden /> Logo
          </div>
          <div className="flex items-center gap-2">
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoDataUrl}
                alt="Logo preview"
                className="h-10 w-10 rounded border border-border bg-surface object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-border bg-surface text-text-subtle">
                <ImageIcon size={16} aria-hidden />
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) escolherLogo(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
            >
              Escolher arquivo
            </Button>
            {logoDataUrl && (
              <Button variant="ghost" size="sm" onClick={() => setLogoDataUrl(null)}>
                Remover
              </Button>
            )}
          </div>
          <div className="text-xs text-text-subtle">
            Logo aqui é só preview. Para publicar, use Configurações › Marca.
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={descartar}>
            Descartar
          </Button>
          <Button size="sm" onClick={salvar}>
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
