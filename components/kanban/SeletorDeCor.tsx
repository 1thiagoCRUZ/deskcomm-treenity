"use client";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { FORMATO_DE_COR, PALETA_DE_ETAPAS } from "@/lib/kanban/paleta-de-etapas";
import { Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface SeletorDeCorProps {
  /** `#RRGGBB` atual, ou `null` (coluna sem cor). */
  cor: string | null;
  /** Chamado com o hex em minúscula, ou `null` para tirar a cor. Não fecha sozinho com erro. */
  aoEscolher: (cor: string | null) => void;
  /** Nome da etapa — vai no `aria-label`, porque a bolinha sozinha não diz de quê é. */
  nomeDaEtapa: string;
  desabilitado?: boolean;
  /** Prefixo dos `data-testid`. */
  idDeTeste: string;
  /** Classes extras do botão-gatilho. */
  className?: string;
}

/**
 * A cor de uma etapa: uma bolinha que abre a paleta.
 *
 * ⚠️ ESCOLHER APLICA NA HORA, sem botão "salvar": é um clique, e a coluna do quadro
 * muda de cor diante de quem clicou — é a prova de que funcionou. "Outra cor" é o
 * único caminho com confirmação (Enter ou botão), porque digitar `#3b8` e sair não
 * pode gravar nada.
 *
 * A validação de verdade é do servidor (`validarCorDeEtapa`). O que fica aqui é só o
 * que a tela pode saber antes de perguntar: não habilitar "Usar" com um hex que o
 * banco recusaria.
 */
export function SeletorDeCor({
  cor,
  aoEscolher,
  nomeDaEtapa,
  desabilitado = false,
  idDeTeste,
  className,
}: SeletorDeCorProps) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [outra, setOutra] = useState("");

  const outraValida = FORMATO_DE_COR.test(outra);

  function escolher(nova: string | null) {
    aoEscolher(nova);
    setAberto(false);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={desabilitado}
          aria-label={`${t("Cor da etapa")} «${nomeDaEtapa}»`}
          data-testid={`${idDeTeste}-gatilho`}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border",
            "hover:bg-surface-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn("h-4 w-4 rounded-full", !cor && "bg-text-muted/40")}
            style={cor ? { backgroundColor: cor } : undefined}
            data-testid={`${idDeTeste}-amostra`}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3" data-testid={`${idDeTeste}-paleta`}>
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={t("Cor da etapa")}>
          {PALETA_DE_ETAPAS.map((c) => {
            const marcada = cor?.toLowerCase() === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={marcada}
                aria-label={t(c.nome)}
                title={t(c.nome)}
                data-testid={`${idDeTeste}-cor-${c.hex.slice(1)}`}
                onClick={() => escolher(c.hex)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full border border-black/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                style={{ backgroundColor: c.hex }}
              >
                {marcada && <Check size={14} weight="bold" className="text-white drop-shadow" aria-hidden />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={outra}
            onChange={(e) => setOutra(e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter" && outraValida) escolher(outra.toLowerCase());
            }}
            placeholder="#3b82f6"
            maxLength={7}
            aria-label={t("Outra cor (#RRGGBB)")}
            data-testid={`${idDeTeste}-outra`}
            className="h-8 flex-1 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={!outraValida}
            data-testid={`${idDeTeste}-usar-outra`}
            onClick={() => escolher(outra.toLowerCase())}
          >
            {t("Usar")}
          </Button>
        </div>

        {cor && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            data-testid={`${idDeTeste}-sem-cor`}
            onClick={() => escolher(null)}
          >
            {t("Sem cor")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
