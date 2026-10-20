import { format, formatDistanceToNowStrict, type Locale } from "date-fns";

/** Só o que os dois painéis (vendas e atendimentos) compartilham. Funções puras, seguras no navegador. */

export function moeda(valor: number, tagDeIdioma: string): string {
  return new Intl.NumberFormat(tagDeIdioma, { style: "currency", currency: "BRL" }).format(valor);
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm");
}

export function haQuantoTempo(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale });
}

export type VarianteDeStatus = "neutral" | "success" | "warning" | "error" | "info";

/** Cor do selo de status da venda. O bot só grava "Aguardando Pagamento" hoje; o resto cobre o que vier. */
export function varianteDoStatusDaVenda(status: string): VarianteDeStatus {
  const s = status.toLowerCase();
  if (s.includes("cancel")) return "error";
  if (s.includes("aguard") || s.includes("pend")) return "warning";
  if (s.includes("pago") || s.includes("paga") || s.includes("conclu") || s.includes("entreg") || s.includes("envi")) {
    return "success";
  }
  return "neutral";
}

/** Cor do selo da etapa do funil. */
export function varianteDaEtapa(etapa: string | null): VarianteDeStatus {
  const s = (etapa ?? "").toLowerCase();
  if (s.includes("fechad")) return "success";
  if (s.includes("proposta")) return "info";
  if (s.includes("negocia")) return "warning";
  return "neutral";
}
