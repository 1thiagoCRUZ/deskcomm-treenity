"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { useInvalidarAgrupado } from "@/hooks/realtime/useInvalidarAgrupado";
import { useRefetchDeSeguranca } from "@/hooks/realtime/useRefetchDeSeguranca";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Message } from "@/lib/types/messaging";

interface MessagesResponse {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

/** O recorte de uma venda: só as mensagens de `desde` até `ate` (exclusivo; `null` = sem fim). */
export interface JanelaDaVenda {
  desde: string;
  ate: string | null;
}

export function useMessagesRealtime(conversationId: string | null, janela?: JanelaDaVenda | null) {
  const qc = useQueryClient();
  // O recorte entra na chave: a mesma conversa tem duas leituras (o fio inteiro e a venda).
  // O prefixo `["messages", id]` continua valendo para invalidar as duas de uma vez.
  const queryKey = (janela
    ? (["messages", conversationId, janela.desde, janela.ate ?? ""] as const)
    : (["messages", conversationId] as const)) as readonly unknown[];

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!conversationId) {
        return { data: [], meta: { has_more: false, cursor: null } } as MessagesResponse;
      }
      const qs = new URLSearchParams();
      if (pageParam) qs.set("cursor", pageParam);
      if (janela) {
        qs.set("desde", janela.desde);
        if (janela.ate) qs.set("ate", janela.ate);
      }
      qs.set("limit", "50");
      try {
        return await apiClient.get<MessagesResponse>(
          `/api/v1/conversations/${conversationId}/messages?${qs.toString()}`,
        );
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    getNextPageParam: (last) =>
      last.meta?.has_more && last.meta.cursor ? last.meta.cursor : undefined,
    /**
     * Voltar para a aba RESSINCRONIZA — aqui, e não no padrão global.
     *
     * O padrão do repo é `refetchOnWindowFocus: false`, e está certo para o
     * resto: recarregar tudo a cada troca de aba é gasto sem retorno numa tela
     * que muda devagar. O inbox é o oposto — é a tela em que a informação chega
     * de fora enquanto ninguém olha, e voltar para ela é exatamente o momento
     * em que a defasagem aparece.
     *
     * É a segunda rede, não a primeira: quem entrega é o Realtime. Esta existe
     * para o intervalo em que ele esteve caído — e foi o sintoma relatado,
     * "às vezes preciso atualizar para a mensagem aparecer".
     */
    refetchOnWindowFocus: true,
  });

  // A conversa aberta atualiza na hora (é o que a pessoa está lendo); a LISTA,
  // que refaz todas as páginas, é agrupada: uma chamada por rajada de eventos.
  const invalidarLista = useInvalidarAgrupado(qc, ["conversations"]);
  const onChange = useCallback(() => {
    if (conversationId) qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    invalidarLista();
  }, [qc, conversationId, invalidarLista]);

  const { status: realtimeStatus, ultimaEntrega } = useRealtimeChannel({
    name: conversationId ? `messages-${conversationId}` : "messages-disabled",
    postgresChanges: conversationId
      ? {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }
      : undefined,
    onChange,
    enabled: !!conversationId,
  });

  /**
   * A REDE DE SEGURANÇA da conversa aberta.
   *
   * A mesma razão da lista, e aqui o custo de ficar velho é maior: a pessoa
   * está OLHANDO a conversa enquanto responde. Com o canal morto e a aba em
   * foco, a resposta do cliente não aparecia até o F5.
   *
   * A assinatura é a contagem de mensagens mais o id da mais recente — a
   * contagem sozinha não flagraria uma mensagem que chega e outra que sai da
   * primeira página no mesmo intervalo.
   */
  const seguranca = useRefetchDeSeguranca<{ pages: MessagesResponse[] }>({
    queryKey,
    assinatura: (d) => {
      const msgs = d?.pages.flatMap((p) => p.data) ?? [];
      return `${msgs.length}:${msgs[0]?.id ?? ""}`;
    },
    ultimaEntrega,
    enabled: !!conversationId,
  });

  return { ...query, realtimeStatus, seguranca };
}
