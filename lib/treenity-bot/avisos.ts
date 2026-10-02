/**
 * Avisos do Treenity Bot que viram notificação (toast + bandeja do sistema):
 * venda nova gravada pelo CADU e cliente pedindo um especialista.
 *
 * Chegam pelo socket que o `TreenityBotAlertProvider` já mantém aberto. Por
 * isso só avisa quem está com o sistema aberto numa aba (mesmo minimizada) —
 * aviso com o navegador fechado exige push pelo servidor, que é outro passo.
 */
import type { VendaPainel } from "./client";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function textoDoAvisoDeVenda(venda: Pick<VendaPainel, "cliente" | "total" | "itens">): {
  title: string;
  body: string;
} {
  const cliente = venda.cliente?.trim() || "Cliente";
  return {
    title: `Venda nova: ${cliente} — ${BRL.format(Number(venda.total) || 0)}`,
    body: venda.itens?.trim() || "Pedido registrado pelo bot.",
  };
}

/** A venda recém-criada, pela mesma rota do painel (só admin). `null` se não achar. */
export async function buscarVendaParaAviso(id: string): Promise<VendaPainel | null> {
  try {
    const res = await fetch("/api/treenity-bot/vendas?limit=10", { cache: "no-store" });
    if (!res.ok) return null;
    const pagina = (await res.json()).data as { itens?: VendaPainel[] } | undefined;
    return pagina?.itens?.find((v) => v.id_venda === id) ?? null;
  } catch {
    return null;
  }
}
