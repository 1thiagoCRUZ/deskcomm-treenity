"use client";
/**
 * A venda do cliente desta conversa, no painel lateral do Inbox: quanto foi,
 * frete, forma de pagamento e quem fechou. Só aparece para quem é admin (a rota
 * devolve 403 aos demais e o painel some em silêncio) e só quando há venda.
 *
 * Abrir a conversa e ver a venda apaga a bolinha verde de "Fechadas".
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Separator } from "@/components/ui/separator";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { VendaPainel } from "@/lib/treenity-bot/client";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const FORMA: Record<string, string> = {
  pix: "Pix",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  boleto: "Boleto",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{rotulo}</dt>
      <dd className="text-right font-medium text-text">{valor}</dd>
    </div>
  );
}

export function VendaDaConversa({ conversationId }: { conversationId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const { data: venda } = useQuery({
    queryKey: ["treenity-bot", "venda-da-conversa", conversationId],
    retry: false,
    staleTime: 30_000,
    queryFn: () =>
      apiClient
        .get<{ data: VendaPainel | null }>(`/api/treenity-bot/conversas/${conversationId}/venda`)
        .then((r) => r.data),
  });

  const idDaVenda = venda?.id_venda;
  useEffect(() => {
    if (!idDaVenda) return;
    void apiClient
      .post(`/api/treenity-bot/conversas/${conversationId}/venda-vista`, {})
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["conversation-counts"] });
        void qc.invalidateQueries({ queryKey: ["agent-inbox"] });
      })
      .catch(() => {});
  }, [idDaVenda, conversationId, qc]);

  if (!venda) return null;

  const frete = venda.frete > 0 ? BRL.format(venda.frete) : t("Grátis");
  const forma = venda.forma_pagamento
    ? t(FORMA[venda.forma_pagamento] ?? venda.forma_pagamento)
    : t("Não informada");
  const quem = venda.fechada_por?.trim() || t("Bot (CADU)");

  return (
    <>
      <section data-testid="inbox-venda">
        <h3 className="text-xs font-semibold text-text">{t("Venda")}</h3>
        <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3 text-xs">
          <p className="text-lg font-semibold text-text">{BRL.format(venda.total)}</p>
          {venda.itens && <p className="mt-0.5 line-clamp-3 text-text-muted">{venda.itens}</p>}
          <dl className="mt-3 space-y-1.5">
            <Linha rotulo={t("Produtos")} valor={BRL.format(venda.valor_produtos)} />
            <Linha rotulo={t("Frete")} valor={frete} />
            {venda.transportadora && (
              <Linha rotulo={t("Transportadora")} valor={venda.transportadora} />
            )}
            <Linha rotulo={t("Pagamento")} valor={forma} />
            <Linha rotulo={t("Situação")} valor={t(venda.status)} />
            <Linha rotulo={t("Fechada por")} valor={quem} />
          </dl>
        </div>
      </section>
      <Separator />
    </>
  );
}
