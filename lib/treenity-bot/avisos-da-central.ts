/**
 * Avisos do Treenity Bot na Central de avisos (o sino do topo).
 *
 * O toast e a notificação do navegador só existem com o sistema aberto numa
 * aba. Quem entra de manhã não vê o que aconteceu de noite — e acha que está
 * tudo certo. Estes avisos ficam gravados em `agent_inbox_items`, então o sino
 * mostra o que houve enquanto ninguém olhava.
 *
 * Reaproveita os kinds que já existem (`handoff` para o pedido de especialista,
 * `other` para a venda): kind novo exigiria migration e baseline.
 * Nunca lança — o aviso é consequência, não a ação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Abre o aviso "cliente pediu especialista", um por conversa enquanto aberto. */
export async function abrirAvisoDeEspecialista(
  admin: SupabaseClient,
  p: { organizationId: string; conversationId: string; cliente: string | null; motivo: string },
): Promise<void> {
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", p.organizationId)
      .eq("kind", "handoff")
      .eq("ref_kind", "conversation")
      .eq("ref_id", p.conversationId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (aberto) return;
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: p.organizationId,
      kind: "handoff",
      severity: "critical",
      title: `${p.cliente?.trim() || "Um cliente"} pediu um especialista`,
      body: `Motivo: ${p.motivo}. O automático parou; a conversa está na Fila esperando alguém assumir.`,
      ref_kind: "conversation",
      ref_id: p.conversationId,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("[treenity-bot.avisos] não abriu o aviso de especialista", {
      organization_id: p.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/** Aviso de venda nova. `idVenda` evita repetir se a API reenviar. */
export async function abrirAvisoDeVenda(
  admin: SupabaseClient,
  p: {
    organizationId: string;
    conversationId: string | null;
    cliente: string | null;
    total: number;
    itens: string | null;
    idVenda: string;
  },
): Promise<void> {
  try {
    const marca = `[venda ${p.idVenda}]`;
    const { data: ja } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", p.organizationId)
      .eq("kind", "other")
      .like("body", `%${marca}%`)
      .limit(1)
      .maybeSingle();
    if (ja) return;
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: p.organizationId,
      kind: "other",
      severity: "info",
      title: `Venda nova: ${p.cliente?.trim() || "Cliente"} — ${BRL.format(p.total)}`,
      body: `${p.itens?.trim() || "Pedido registrado pelo bot."} ${marca}`,
      ref_kind: p.conversationId ? "conversation" : null,
      ref_id: p.conversationId,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("[treenity-bot.avisos] não abriu o aviso de venda", {
      organization_id: p.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/** Alguém assumiu ou fechou: o aviso de especialista dessa conversa se resolve. */
export async function resolverAvisosDaConversa(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
): Promise<void> {
  try {
    await admin
      .from("agent_inbox_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("kind", "handoff")
      .eq("ref_kind", "conversation")
      .eq("ref_id", conversationId)
      .eq("status", "open");
  } catch (err) {
    logger.warn("[treenity-bot.avisos] não resolveu o aviso", {
      organization_id: organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}
