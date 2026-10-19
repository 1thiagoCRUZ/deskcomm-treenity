"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/** A venda fechada e o recorte de tempo do atendimento dela. `ate: null` = o cliente não voltou. */
export interface VendaDaConversa {
  id: string;
  iniciada_em: string;
  fechada_em: string;
  valor: number | null;
  ate: string | null;
}

/**
 * A última venda fechada numa conversa (`/api/v1/conversations/[id]/venda`).
 * `data` é `null` quando não há venda registrada — a aba Fechadas então cai no fio inteiro.
 */
export function useVendaDaConversa(conversationId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["venda-da-conversa", conversationId],
    enabled: enabled && !!conversationId,
    queryFn: async () => {
      const r = await apiClient.get<{ data: VendaDaConversa | null }>(
        `/api/v1/conversations/${conversationId}/venda`,
      );
      return r.data;
    },
    staleTime: 60_000,
  });
}
