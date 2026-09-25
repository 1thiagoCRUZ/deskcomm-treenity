"use client";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  owner_user_id: string | null;
  /**
   * Gatilhos do bot, já normalizados. Vazio = só o atendente usa esta resposta,
   * pelo `/` do composer. Com gatilho, o bot responde sozinho — ver a migration
   * 0234, `lib/schemas/templates.ts` e `lib/treenity-bot/respostas-salvas.ts`.
   */
  bot_triggers: string[];
  bot_context: "any" | "opening";
  bot_max_chars: number;
  bot_enabled: boolean;
  /** Último envio confirmado ao Treenity Bot. `null` = não está no bot (migration 0235). */
  bot_synced_at: string | null;
  /** Por que o último envio ao bot falhou. `null` = em dia. */
  bot_sync_error: string | null;
  usage_count: number;
  last_used_at: string | null;
}

/** Onda 5: templates de script (pessoais + compartilhados) para o slash-menu do composer. */
export function useMessageTemplates() {
  const podeConsultar = usePermission("message-templates.view");
  return useQuery({
    enabled: podeConsultar,
    queryKey: ["message-templates"],
    queryFn: async () => apiClient.get<{ data: MessageTemplate[] }>("/api/v1/message-templates"),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}
