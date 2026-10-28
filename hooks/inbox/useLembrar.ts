"use client";
/**
 * O resto do "Lembrar" do Inbox (o aviso interno é `useSnoozeConversation`):
 *   - os botões que a empresa montou (`/api/v1/settings/lembrar`);
 *   - a mensagem marcada da parte "Janela aberta"
 *     (`/api/v1/conversations/[id]/mensagem-agendada`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { OPCOES_PADRAO, type LembrarOpcoes } from "@/lib/schemas/snooze";

export interface MensagemAgendada {
  id: string;
  body: string;
  enviar_em: string;
  criado_por_user_id: string | null;
  created_at: string;
}

const CHAVE_OPCOES = ["lembrar-opcoes"] as const;
const chaveDaMensagem = (conversationId: string) => ["mensagem-agendada", conversationId] as const;

export function useLembrarOpcoes() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: CHAVE_OPCOES,
    queryFn: async () => (await apiClient.get<{ data: LembrarOpcoes }>("/api/v1/settings/lembrar")).data,
    staleTime: 5 * 60_000,
  });
  const salvar = useMutation({
    mutationFn: async (opcoes: LembrarOpcoes) =>
      (await apiClient.put<{ data: LembrarOpcoes }>("/api/v1/settings/lembrar", opcoes)).data,
    onError: showApiError,
    onSuccess: (data) => qc.setQueryData(CHAVE_OPCOES, data),
  });
  // Enquanto carrega (ou se falhar), o padrão: o botão nunca fica vazio.
  return { opcoes: query.data ?? OPCOES_PADRAO, salvar };
}

export function useMensagemAgendada(conversationId: string) {
  const qc = useQueryClient();
  const chave = chaveDaMensagem(conversationId);
  const query = useQuery({
    queryKey: chave,
    queryFn: async () =>
      (
        await apiClient.get<{ data: MensagemAgendada | null }>(
          `/api/v1/conversations/${conversationId}/mensagem-agendada`,
        )
      ).data,
  });
  const marcar = useMutation({
    mutationFn: async (args: { minutos: number; texto: string }) =>
      (
        await apiClient.post<{ data: MensagemAgendada }>(
          `/api/v1/conversations/${conversationId}/mensagem-agendada`,
          args,
        )
      ).data,
    onError: showApiError,
    onSuccess: (data) => qc.setQueryData(chave, data),
  });
  const cancelar = useMutation({
    mutationFn: async () => apiClient.delete<void>(`/api/v1/conversations/${conversationId}/mensagem-agendada`),
    onError: showApiError,
    onSuccess: () => qc.setQueryData(chave, null),
  });
  return { marcada: query.data ?? null, marcar, cancelar };
}
