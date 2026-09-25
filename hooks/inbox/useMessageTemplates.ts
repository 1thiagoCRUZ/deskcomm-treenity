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
   * pelo `/` do composer. Com gatilho, o bot responde sozinho. Com a integração
   * ligada, a resposta mora na tabela do bot — ver `lib/treenity-bot/respostas-salvas.ts`.
   */
  bot_triggers: string[];
  bot_context: "any" | "opening";
  bot_max_chars: number;
  bot_enabled: boolean;
  usage_count: number;
  last_used_at: string | null;
}

/**
 * Onda 5: templates de script (pessoais + compartilhados) para o slash-menu do composer.
 *
 * `soDoCrm`: só os de `message_templates`, mesmo com as respostas no Treenity
 * Bot. É para quem guarda o id do template (os follow-ups): o id do bot não
 * existe aqui.
 */
export function useMessageTemplates({ soDoCrm = false }: { soDoCrm?: boolean } = {}) {
  const podeConsultar = usePermission("message-templates.view");
  return useQuery({
    enabled: podeConsultar,
    queryKey: soDoCrm ? ["message-templates", "crm"] : ["message-templates"],
    queryFn: async () =>
      apiClient.get<{ data: MessageTemplate[] }>(
        soDoCrm ? "/api/v1/message-templates?origem=crm" : "/api/v1/message-templates",
      ),
    staleTime: 60_000,
    select: (res) => res.data,
  });
}
