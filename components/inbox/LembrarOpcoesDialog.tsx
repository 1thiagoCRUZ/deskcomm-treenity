"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "@/lib/ui/icons";
import { CampoDePrazo, minutosDoPrazo, type Prazo } from "@/components/inbox/CampoDePrazo";
import { useLembrarOpcoes } from "@/hooks/inbox/useLembrar";
import {
  INTERNO_MAX_MINUTOS,
  INTERNO_MIN_MINUTOS,
  JANELA_MAX_MINUTOS,
  JANELA_MIN_MINUTOS,
  MAX_OPCOES,
  OPCOES_PADRAO,
  rotuloDoPrazo,
  type LembrarOpcoes,
  type Unidade,
} from "@/lib/schemas/snooze";

type Parte = keyof LembrarOpcoes;

const PARTES: Record<
  Parte,
  { titulo: string; ajuda: string; unidades: readonly Unidade[]; min: number; max: number; erro: string; inicial: Prazo }
> = {
  janela: {
    titulo: "Janela aberta",
    ajuda: "Mensagem ao cliente. No máximo 24 horas.",
    unidades: ["minuto", "hora"],
    min: JANELA_MIN_MINUTOS,
    max: JANELA_MAX_MINUTOS,
    erro: "Na janela aberta, escolha entre 5 minutos e 24 horas.",
    inicial: { quantidade: "2", unidade: "hora" },
  },
  interno: {
    titulo: "Me lembrar",
    ajuda: "Aviso para a equipe. Qualquer prazo, até 5 anos.",
    unidades: ["hora", "dia", "semana", "mes"],
    min: INTERNO_MIN_MINUTOS,
    max: INTERNO_MAX_MINUTOS,
    erro: "Escolha um prazo entre 5 minutos e 5 anos.",
    inicial: { quantidade: "3", unidade: "semana" },
  },
};

/** Gestão monta os botões das duas partes do "Lembrar" (vale para a empresa toda). */
export function LembrarOpcoesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const { opcoes, salvar } = useLembrarOpcoes();
  const [rascunho, setRascunho] = useState<LembrarOpcoes>(opcoes);
  const [novo, setNovo] = useState<Record<Parte, Prazo>>({ janela: PARTES.janela.inicial, interno: PARTES.interno.inicial });
  const [erro, setErro] = useState<Partial<Record<Parte, string>>>({});

  function aoAbrir(v: boolean) {
    if (v) {
      setRascunho({ janela: [...opcoes.janela], interno: [...opcoes.interno] });
      setErro({});
    }
    onOpenChange(v);
  }

  function adicionar(parte: Parte) {
    const cfg = PARTES[parte];
    const m = minutosDoPrazo(novo[parte]);
    if (m === null || m < cfg.min || m > cfg.max) {
      setErro({ ...erro, [parte]: cfg.erro });
      return;
    }
    if (rascunho[parte].length >= MAX_OPCOES) {
      setErro({ ...erro, [parte]: "No máximo 8 opções." });
      return;
    }
    setErro({ ...erro, [parte]: undefined });
    setRascunho({ ...rascunho, [parte]: [...new Set([...rascunho[parte], m])].sort((a, b) => a - b) });
  }

  function remover(parte: Parte, m: number) {
    setRascunho({ ...rascunho, [parte]: rascunho[parte].filter((x) => x !== m) });
  }

  return (
    <Dialog open={open} onOpenChange={aoAbrir}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Opções do Lembrar")}</DialogTitle>
          <DialogDescription>{t("Os botões que aparecem para toda a equipe. \"Outro...\" continua lá para um prazo diferente.")}</DialogDescription>
        </DialogHeader>
        {(["janela", "interno"] as const).map((parte) => {
          const cfg = PARTES[parte];
          return (
            <section key={parte} className="space-y-2" aria-label={t(cfg.titulo)}>
              <div>
                <h3 className="text-sm font-medium">{t(cfg.titulo)}</h3>
                <p className="text-xs text-muted-foreground">{t(cfg.ajuda)}</p>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {rascunho[parte].map((m) => (
                  <li key={m} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                    {rotuloDoPrazo(m, t)}
                    <button
                      type="button"
                      aria-label={`${t("Tirar")} ${rotuloDoPrazo(m, t)}`}
                      className="text-muted-foreground hover:text-text"
                      onClick={() => remover(parte, m)}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
                {rascunho[parte].length === 0 && (
                  <li className="text-xs text-muted-foreground">{t("Só o \"Outro...\".")}</li>
                )}
              </ul>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <CampoDePrazo
                    rotulo="Quantidade"
                    valor={novo[parte]}
                    unidades={cfg.unidades}
                    onChange={(p) => setNovo({ ...novo, [parte]: p })}
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => adicionar(parte)}>
                  {t("Adicionar")}
                </Button>
              </div>
              {erro[parte] && <p className="text-xs text-destructive">{t(erro[parte] as string)}</p>}
            </section>
          );
        })}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setRascunho({ janela: [...OPCOES_PADRAO.janela], interno: [...OPCOES_PADRAO.interno] })}
          >
            {t("Voltar ao padrão")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={salvar.isPending}
              onClick={() => salvar.mutate(rascunho, { onSuccess: () => onOpenChange(false) })}
            >
              {t("Salvar")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
