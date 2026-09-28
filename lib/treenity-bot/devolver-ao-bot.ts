/**
 * "Reativar bot" no Inbox também solta a trava do lado do bot.
 *
 * Quando o CADU chama o especialista, DUAS travas se armam: a do Inbox
 * (`conversations.bot_silenced_until`, ver `marcarPediuAjuda`) e a do próprio
 * bot (`atendimentos.precisa_atencao_humana`, que o gate do n8n confere antes
 * de responder). "Reativar bot" já limpava a primeira; sem esta chamada a
 * segunda ficava armada, e o bot seguia calado com a tela dizendo o contrário.
 *
 * Só para organização com o WhatsApp do Treenity Bot ligado. Nunca lança: a
 * devolução no Inbox já aconteceu, e o desfecho sobe para quem chamou decidir
 * o que mostrar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { logger } from "@/lib/logger";

import { trocarToken } from "./client";
import { getConfig } from "./config";
import { botDoTreenityAtende } from "./whatsapp";

export type DesfechoDaDevolucao = "nao_se_aplica" | "liberado" | "falhou";

const TEMPO_MAXIMO_MS = 8_000;

/**
 * Os `id_face` que o bot pode ter gravado para este número: como a Meta manda,
 * só dígitos, com e sem o nono dígito.
 */
export function idsFaceDoTelefone(telefone: string): string[] {
  return phoneLookupVariants(telefone).map((v) => v.replace(/\D/g, ""));
}

export async function liberarTravaDoBot(
  supabase: SupabaseClient,
  pedido: {
    organizationId: string;
    conversationId: string;
    usuario: { email: string; nome: string };
  },
): Promise<DesfechoDaDevolucao> {
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", pedido.organizationId)
      .maybeSingle();
    if (!botDoTreenityAtende(org?.settings ?? null) || !getConfig()) return "nao_se_aplica";

    const { data: conversa } = await supabase
      .from("conversations")
      .select("contacts:contact_id(phone_number)")
      .eq("organization_id", pedido.organizationId)
      .eq("id", pedido.conversationId)
      .maybeSingle();
    const telefone = (conversa as { contacts: { phone_number: string | null } | null } | null)?.contacts
      ?.phone_number;
    if (!telefone) return "nao_se_aplica";

    const sessao = await trocarToken(pedido.usuario);
    const config = getConfig();
    if (!sessao || !config) return "falhou";

    const res = await fetch(`${config.apiUrl}/api/atendimentos/devolver-ao-bot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id_faces: idsFaceDoTelefone(telefone) }),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
    if (!res.ok) {
      logger.error("[treenity-bot] API do bot recusou a devolução", {
        organization_id: pedido.organizationId,
        status: res.status,
      });
      return "falhou";
    }
    return "liberado";
  } catch (err) {
    logger.error("[treenity-bot] não foi possível soltar a trava do bot", {
      organization_id: pedido.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return "falhou";
  }
}
