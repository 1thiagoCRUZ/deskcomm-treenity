"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { FunilDoFiltro } from "@/lib/inbox/etapas-do-filtro";

/**
 * Os funis e as etapas do filtro "Etapa" do Inbox.
 *
 * Via rota do servidor (o cookie de sessão é HttpOnly). `staleTime` de 5 min, como o
 * vocabulário de tags: renomear ou recolorir uma etapa chega ao seletor na próxima
 * leitura, e um filtro de rótulos não precisa de tempo real.
 *
 * A chave leva a organização: trocar de empresa não pode mostrar as etapas da outra.
 */
export function useEtapasDoInbox(orgId: string | null) {
  return useQuery({
    queryKey: ["inbox-etapas", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FunilDoFiltro[]> => {
      const res = await apiClient.get<{ data: FunilDoFiltro[] }>("/api/v1/conversations/etapas");
      return res.data;
    },
  });
}
