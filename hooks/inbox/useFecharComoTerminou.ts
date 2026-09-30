"use client";
/**
 * "Fechar" do Inbox em organização com o Treenity Bot: pergunta como terminou
 * e fecha nos três lugares (bot, Inbox e funil) — ver
 * `app/api/treenity-bot/conversas/[id]/encerrar/route.ts`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

/** A organização ativa usa o Treenity Bot pelo Inbox? */
export function useTreenityBotNoInbox() {
  return useQuery({
    queryKey: ["treenity-bot", "whatsapp-ativo"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: { ativo: boolean } }>("/api/treenity-bot/whatsapp/ativo");
      return r.data.ativo;
    },
    staleTime: 5 * 60_000,
    // Silencioso: sem a resposta, o "Fechar" comum continua funcionando.
    retry: 1,
  });
}

export type ComoTerminou = { desfecho: "venda"; valor: number } | { desfecho: "sem_venda" };

export function useFecharComoTerminou() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversation_id: string } & ComoTerminou) => {
      const { conversation_id, ...corpo } = args;
      return apiClient.post<{ data: { fechada: boolean; treenity_bot: string } }>(
        `/api/treenity-bot/conversas/${conversation_id}/encerrar`,
        corpo,
      );
    },
    onSettled: (_data, _err, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
    },
    onError: (err) => showApiError(err),
  });
}
