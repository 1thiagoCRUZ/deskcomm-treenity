import type { AtendimentoPainel } from "@/lib/treenity-bot/client";

/** Regras puras da seção "Em andamento" (sem React): etapa, filtro e contagem. */

export type EtapaAndamento = "iniciou" | "negociacao" | "proposta";

export const ETAPAS_ANDAMENTO: EtapaAndamento[] = ["iniciou", "negociacao", "proposta"];

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** Atendimento encerrado (Fechada/Perdida). Usado quando o bot ainda não filtra `em_andamento`. */
export function estaEncerrado(statusFunil: string | null | undefined): boolean {
  const s = normalizar(statusFunil);
  return s.startsWith("fechad") || s.startsWith("perdid");
}

/** Agrupa o statusFunil do bot em 3 etapas; nulo ou desconhecido cai em "iniciou". */
export function etapaDoAndamento(statusFunil: string | null | undefined): EtapaAndamento {
  const s = normalizar(statusFunil);
  if (s.startsWith("proposta")) return "proposta";
  if (s.startsWith("em negocia") || s.startsWith("negocia")) return "negociacao";
  return "iniciou";
}

/** Só os abertos, do mais recente para o mais antigo. */
export function soEmAndamento(itens: AtendimentoPainel[]): AtendimentoPainel[] {
  return itens
    .filter((i) => !estaEncerrado(i.statusFunil))
    .sort((a, b) => (b.atualizadoEm ?? "").localeCompare(a.atualizadoEm ?? ""));
}

export function contarPorEtapa(itens: AtendimentoPainel[]): Record<EtapaAndamento, number> {
  const contagem: Record<EtapaAndamento, number> = { iniciou: 0, negociacao: 0, proposta: 0 };
  for (const i of itens) contagem[etapaDoAndamento(i.statusFunil)] += 1;
  return contagem;
}

export function filtrarPorEtapa(
  itens: AtendimentoPainel[],
  etapa: EtapaAndamento | null,
): AtendimentoPainel[] {
  return etapa ? itens.filter((i) => etapaDoAndamento(i.statusFunil) === etapa) : itens;
}
