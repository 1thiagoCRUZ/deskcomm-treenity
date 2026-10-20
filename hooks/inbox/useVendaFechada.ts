"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { VendaFechadaDaLista } from "@/app/api/v1/vendas-fechadas/route";

/** Uma venda fechada e o recorte de tempo do atendimento dela. `ate: null` = o cliente não voltou. */
export interface VendaFechada {
  id: string;
  conversation_id: string;
  iniciada_em: string;
  fechada_em: string;
  valor: number | null;
  venda_bot_id: string | null;
  ate: string | null;
}

/** A lista da aba Fechadas: as vendas das últimas 24h, uma linha por venda. */
export function useVendasFechadas(enabled: boolean) {
  return useQuery({
    queryKey: ["vendas-fechadas", "lista"],
    enabled,
    queryFn: async () => {
      const r = await apiClient.get<{ data: VendaFechadaDaLista[] }>("/api/v1/vendas-fechadas?horas=24");
      return r.data;
    },
    refetchOnWindowFocus: true,
    // A lista não assina o Realtime: sem isto uma venda fechada agora só apareceria depois do F5.
    refetchInterval: 30_000,
  });
}

export function useVendaFechada(vendaId: string | null) {
  return useQuery({
    queryKey: ["vendas-fechadas", "venda", vendaId],
    enabled: !!vendaId,
    queryFn: async () => {
      const r = await apiClient.get<{ data: VendaFechada }>(`/api/v1/vendas-fechadas/${vendaId}`);
      return r.data;
    },
    staleTime: 60_000,
  });
}
