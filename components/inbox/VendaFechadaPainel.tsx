"use client";
/**
 * A VENDA, não a conversa: o que o Inbox mostra ao abrir um item da aba Fechadas.
 *
 * A conversa com um cliente é uma só e o fio acumula todas as compras. Aqui aparece
 * só o atendimento que terminou NESTA venda, do começo ao fechamento, sem as
 * mensagens que o cliente mandou depois. Somente leitura: não há composer. Para
 * continuar falando com o cliente existe "Abrir conversa atual".
 */
import { format } from "date-fns";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { JanelaDaVenda } from "@/hooks/inbox/useMessagesRealtime";
import { useVendaDaConversa } from "@/hooks/inbox/useVendaDaConversa";
import { ChatThread } from "./ChatThread";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  conversationId: string;
  /** Nome que a lista mostra para este cliente. */
  nome: string;
  /** Sai da aba Fechadas e abre a conversa viva deste cliente. */
  onAbrirConversa: () => void;
}

export function VendaFechadaPainel({ conversationId, nome, onAbrirConversa }: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const { data: venda, isPending } = useVendaDaConversa(conversationId, true);

  const janela: JanelaDaVenda | null = useMemo(
    () => (venda ? { desde: venda.iniciada_em, ate: venda.ate } : null),
    [venda],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{nome}</h2>
          {venda ? (
            <p className="text-xs text-text-muted">
              {t("Venda fechada em")} {format(new Date(venda.fechada_em), "dd/MM/yyyy HH:mm", { locale })}
              {venda.valor !== null ? ` · ${BRL.format(venda.valor)}` : ""}
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={onAbrirConversa}>
          {t("Abrir conversa atual")}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : (
          // Sem recorte registrado (venda antiga), cai no fio inteiro.
          <ChatThread conversationId={conversationId} janela={janela} nomeDoContato={nome} />
        )}
      </div>

      <footer className="border-t border-border px-4 py-2 text-center text-xs text-text-muted">
        {t("Esta é a conversa desta venda. Mensagens novas do cliente ficam na conversa atual.")}
      </footer>
    </div>
  );
}
