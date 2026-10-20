"use client";

/**
 * Pedaços de filtro compartilhados por Vendas e Conversas: busca com atraso,
 * atalhos de período (com "Personalizado") e chips dos filtros ativos.
 * Só visual + estado local; quem decide o que buscar é o painel que usa.
 */

import { useEffect, useState } from "react";
import { X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import {
  ATALHOS_DE_PERIODO,
  atalhoDoPeriodo,
  hojeNoPainel,
  periodoDoAtalho,
  type AtalhoDePeriodo,
  type Periodo,
} from "@/lib/treenity-bot/periodo";

export const ATRASO_DA_BUSCA_MS = 400;

/** Valor que só "assenta" depois de `ms` sem mudar (para não buscar a cada tecla). */
export function useValorComAtraso<T>(valor: T, ms: number = ATRASO_DA_BUSCA_MS): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(timer);
  }, [valor, ms]);
  return atrasado;
}

/**
 * Contador de buscas: só a resposta da busca MAIS NOVA vale (digitar rápido ou
 * trocar de filtro não deixa uma resposta velha sobrescrever a nova).
 */
function criarContador() {
  let n = 0;
  return { novo: () => ++n, ehOAtual: (x: number) => x === n };
}

export function useUltimoPedido() {
  const [contador] = useState(criarContador);
  return contador;
}

export function CampoDeBusca({
  id,
  valor,
  onChange,
  rotulo,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  rotulo: string;
}) {
  return (
    <div className="w-full space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="search"
        value={valor}
        placeholder={rotulo}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SeletorDePeriodo({
  periodo,
  onChange,
  prefixoDeId,
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
  prefixoDeId: string;
}) {
  const t = useT();
  const hoje = hojeNoPainel();
  // "Personalizado" fica aberto mesmo antes de preencher as datas.
  const [personalizado, setPersonalizado] = useState(false);
  const atalho: AtalhoDePeriodo = personalizado ? "personalizado" : atalhoDoPeriodo(periodo, hoje);

  const rotulos: Record<AtalhoDePeriodo, string> = {
    hoje: t("Hoje"),
    "7dias": t("7 dias"),
    "30dias": t("30 dias"),
    este_mes: t("Este mês"),
    mes_passado: t("Mês passado"),
    tudo: t("Tudo"),
    personalizado: t("Personalizado"),
  };

  function escolher(a: AtalhoDePeriodo) {
    if (a === "personalizado") {
      setPersonalizado(true);
      return;
    }
    setPersonalizado(false);
    onChange(periodoDoAtalho(a, hoje));
  }

  return (
    <div className="space-y-2">
      <Label>{t("Período")}</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Período")}>
        {ATALHOS_DE_PERIODO.map((a) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={atalho === a ? "default" : "secondary"}
            aria-pressed={atalho === a}
            onClick={() => escolher(a)}
          >
            {rotulos[a]}
          </Button>
        ))}
      </div>
      {atalho === "personalizado" ? (
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixoDeId}-desde`}>{t("De")}</Label>
            <Input
              id={`${prefixoDeId}-desde`}
              type="date"
              className="w-44"
              value={periodo.desde}
              max={periodo.ate || undefined}
              onChange={(e) => onChange({ ...periodo, desde: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefixoDeId}-ate`}>{t("Até")}</Label>
            <Input
              id={`${prefixoDeId}-ate`}
              type="date"
              className="w-44"
              value={periodo.ate}
              min={periodo.desde || undefined}
              onChange={(e) => onChange({ ...periodo, ate: e.target.value })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface ChipDeFiltro {
  chave: string;
  texto: string;
  remover: () => void;
}

export function ChipsDosFiltros({ chips, onLimpar }: { chips: ChipDeFiltro[]; onLimpar: () => void }) {
  const t = useT();
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.chave}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm"
        >
          {c.texto}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`${t("Remover filtro")}: ${c.texto}`}
            onClick={c.remover}
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={onLimpar}>
        {t("Limpar")}
      </Button>
    </div>
  );
}
