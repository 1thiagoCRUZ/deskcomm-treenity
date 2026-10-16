"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { PedidoDto } from "@/lib/gestao/pedidos";

const CHAVE = ["gestao", "pedidos"] as const;

/** Os pedidos da empresa ativa — o Dono acompanha o que pediu; a Gestão vê o que precisa atender. */
export function usePedidos(opts: { soAbertos?: boolean } = {}) {
  return useQuery({
    queryKey: [...CHAVE, opts.soAbertos ? "abertos" : "todos"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: PedidoDto[] }>(
        `/api/v1/gestao/pedidos${opts.soAbertos ? "?abertos=1" : ""}`,
      );
      return r.data;
    },
    staleTime: 10_000,
  });
}

export function useCriarPedidoDeTroca() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { numero_novo: string; observacao?: string }) =>
      apiClient.post<{ data: PedidoDto }>("/api/v1/gestao/pedidos", { tipo: "trocar_numero", ...input }),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useResolverPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: "atendido" | "cancelado" }) =>
      apiClient.patch<{ data: PedidoDto }>(`/api/v1/gestao/pedidos/${input.id}`, { status: input.status }),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useRemoverNumero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelSessionId: string) =>
      apiClient.delete<{ data: { id: string; archived: boolean } }>(
        `/api/v1/channel-sessions/${channelSessionId}`,
      ),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["official-channel"] });
      qc.invalidateQueries({ queryKey: ["channel-sessions"] });
    },
  });
}
