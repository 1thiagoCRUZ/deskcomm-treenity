/**
 * Períodos dos filtros do painel do Treenity Bot (Vendas e Conversas).
 * Funções puras, seguras no navegador. Dias são texto `YYYY-MM-DD`; "hoje" é o
 * dia no fuso de São Paulo (a empresa pensa em dias de lá, não em UTC).
 *
 * Para quem usa a tela, "Até" é INCLUSIVO (o dia escolhido entra). O bot, porém,
 * recebe `ate` EXCLUSIVO: `ateParaOBot` soma 1 dia. A conta é feita sobre o
 * calendário (UTC puro), sem horas, então não depende de horário de verão.
 */

export const FUSO_DO_PAINEL = "America/Sao_Paulo";

export const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export type AtalhoDePeriodo =
  | "hoje"
  | "7dias"
  | "30dias"
  | "este_mes"
  | "mes_passado"
  | "tudo"
  | "personalizado";

export const ATALHOS_DE_PERIODO: AtalhoDePeriodo[] = [
  "hoje",
  "7dias",
  "30dias",
  "este_mes",
  "mes_passado",
  "tudo",
  "personalizado",
];

export interface Periodo {
  /** Inclusivo; "" = sem limite. */
  desde: string;
  /** Inclusivo; "" = sem limite. */
  ate: string;
}

/** O dia de hoje (`YYYY-MM-DD`) no fuso de São Paulo. */
export function hojeNoPainel(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_DO_PAINEL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

function paraUtc(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d));
}

function paraDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  const data = paraUtc(dia);
  data.setUTCDate(data.getUTCDate() + n);
  return paraDia(data);
}

/** Intervalo (inclusivo nas duas pontas) de cada atalho. "personalizado" não tem intervalo próprio. */
export function periodoDoAtalho(atalho: AtalhoDePeriodo, hoje: string): Periodo {
  switch (atalho) {
    case "hoje":
      return { desde: hoje, ate: hoje };
    case "7dias":
      return { desde: somarDias(hoje, -6), ate: hoje };
    case "30dias":
      return { desde: somarDias(hoje, -29), ate: hoje };
    case "este_mes":
      return { desde: `${hoje.slice(0, 8)}01`, ate: hoje };
    case "mes_passado": {
      const primeiroDeEsteMes = `${hoje.slice(0, 8)}01`;
      const ultimo = somarDias(primeiroDeEsteMes, -1);
      return { desde: `${ultimo.slice(0, 8)}01`, ate: ultimo };
    }
    default:
      return { desde: "", ate: "" };
  }
}

/** Qual atalho descreve este período (para marcar o botão certo); sem correspondência = "personalizado". */
export function atalhoDoPeriodo(p: Periodo, hoje: string): AtalhoDePeriodo {
  if (!p.desde && !p.ate) return "tudo";
  for (const a of ATALHOS_DE_PERIODO) {
    if (a === "tudo" || a === "personalizado") continue;
    const alvo = periodoDoAtalho(a, hoje);
    if (alvo.desde === p.desde && alvo.ate === p.ate) return a;
  }
  return "personalizado";
}

/** O `ate` que o bot espera (exclusivo) a partir do dia inclusivo da tela. */
export function ateParaOBot(ateInclusivo: string | undefined): string | undefined {
  if (!ateInclusivo || !DIA_ISO.test(ateInclusivo)) return undefined;
  return somarDias(ateInclusivo, 1);
}

/** "2026-10-20" -> "20/10/2026" (só para mostrar nos chips). */
export function diaParaExibir(dia: string): string {
  if (!DIA_ISO.test(dia)) return dia;
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}
