/**
 * Responder pelo Inbox já assume a conversa — em organização com o Treenity
 * Bot atendendo pelo Inbox.
 *
 * Sem isto, quem respondia sem clicar em "Assumir" deixava a conversa "Sem
 * responsável": na Fila, se ela veio de um pedido de ajuda do bot, ou com o
 * automático voltando sozinho 5 minutos depois (a janela deslizante do envio
 * manual, `HUMAN_REPLY_SILENCE_MS` em `app/api/v1/messages/_handler.ts`), no
 * meio de uma venda conduzida por uma pessoa. Medido em 29/09: o dono fechou
 * uma venda inteira pela Fila e a conversa seguiu sem dono.
 *
 * A regra é a combinada para o produto: mandar mensagem assume, e o bot só
 * volta com "Devolver ao automático". Assumir usa a MESMA RPC do botão
 * (`fn_conversation_assign`, que grava `bot_silenced_until = infinity` desde a
 * 0173) com `p_enforce_expected` e sem dono esperado: só pega conversa LIVRE.
 * Conversa de outra pessoa da equipe nunca muda de dono por aqui.
 *
 * Fora do Treenity Bot, nada muda: o DeskComm segue com a janela de 5 minutos.
 * Nunca lança — a mensagem já saiu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Actor } from "@/lib/api/handlers/types";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";
import { logger } from "@/lib/logger";

import { botDoTreenityAtende } from "./whatsapp";

export type DesfechoDoResponder = "nao_se_aplica" | "ja_tem_dono" | "assumida" | "falhou";

export async function assumirAoResponder(
  supabase: SupabaseClient,
  pedido: { organizationId: string; conversationId: string; actor: Extract<Actor, { type: "user" }> },
): Promise<DesfechoDoResponder> {
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", pedido.organizationId)
      .maybeSingle();
    if (!botDoTreenityAtende(org?.settings ?? null)) return "nao_se_aplica";

    const { data: conversa } = await supabase
      .from("conversations")
      .select("id, contact_id, assigned_to_user_id")
      .eq("organization_id", pedido.organizationId)
      .eq("id", pedido.conversationId)
      .maybeSingle();
    const c = conversa as { id: string; contact_id: string | null; assigned_to_user_id: string | null } | null;
    if (!c) return "falhou";
    if (c.assigned_to_user_id) return "ja_tem_dono";

    const { data, error } = await supabase.rpc("fn_conversation_assign", {
      p_organization_id: pedido.organizationId,
      p_conversation_id: c.id,
      p_to_user_id: pedido.actor.id,
      p_reason: "claim",
      p_enforce_expected: true,
    });
    // Sem linha = alguém assumiu no mesmo instante: não é erro, é a trava
    // otimista fazendo o trabalho dela.
    if (error) throw new Error(error.message);
    if (!data?.[0]) return "ja_tem_dono";

    await registrarTrocaDeComando({
      supabase,
      organizationId: pedido.organizationId,
      conversationId: c.id,
      contactId: c.contact_id,
      tipo: "conversation_claimed",
      actor: pedido.actor,
      motivo: "Assumiu ao responder o cliente",
    });
    return "assumida";
  } catch (err) {
    logger.warn("[treenity-bot] responder não conseguiu assumir a conversa", {
      organization_id: pedido.organizationId,
      conversation_id: pedido.conversationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return "falhou";
  }
}
