"use client";
/**
 * A lista da aba Fechadas: uma linha por VENDA das últimas 24 horas.
 *
 * Não é a lista de conversas. O cliente que comprou às 12h e voltou às 20h tem duas
 * vendas e aparece duas vezes; a conversa dele é uma só e continua em Automático.
 */
import { format } from "date-fns";
import { useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useVendasFechadas } from "@/hooks/inbox/useVendaFechada";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { CheckCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}

interface Props {
  vendaSelecionadaId: string | null;
  onSelecionar: (venda: { id: string; conversation_id: string }) => void;
  /** Busca digitada no topo da lista (nome ou telefone). */
  busca?: string;
}

export function VendasFechadasLista({ vendaSelecionadaId, onSelecionar, busca }: Props) {
  const t = useT();
  const locale = useLocaleDeData();
  const { data, isPending, isError } = useVendasFechadas(true);

  const vendas = useMemo(() => {
    const termo = (busca ?? "").trim().toLowerCase();
    const todas = data ?? [];
    if (!termo) return todas;
    return todas.filter((v) => {
      const nome = rotuloDoContato(v.contact, t).toLowerCase();
      const fone = (v.contact?.phone_number ?? "").replace(/\D/g, "");
      return nome.includes(termo) || (fone !== "" && fone.includes(termo.replace(/\D/g, "")));
    });
  }, [data, busca, t]);

  if (isPending) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return <p className="p-4 text-sm text-text-muted">{t("Não foi possível carregar as vendas agora.")}</p>;
  }
  if (vendas.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-text-muted">
        {t("Nenhuma venda fechada nas últimas 24 horas.")}
      </p>
    );
  }

  return (
    <ul className="h-full overflow-y-auto" data-testid="vendas-fechadas-lista">
      {vendas.map((v) => {
        const nome = rotuloDoContato(v.contact, t);
        const selecionada = v.id === vendaSelecionadaId;
        return (
          <li key={v.id}>
            <button
              type="button"
              data-venda-id={v.id}
              onClick={() => onSelecionar({ id: v.id, conversation_id: v.conversation_id })}
              aria-current={selecionada ? "true" : undefined}
              className={cn(
                "relative flex w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated",
                selecionada && "bg-accent-50 hover:bg-accent-50",
              )}
            >
              {selecionada ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden /> : null}
              <Avatar className="h-10 w-10 shrink-0">
                {v.contact?.avatar_storage_path && !v.contact.is_anonymized ? (
                  <AvatarImage src={`/api/v1/contacts/${v.contact.id}/avatar`} alt="" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-surface-elevated text-xs font-medium text-text-muted">
                  {iniciais(nome)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text">{nome}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-subtle">
                    {format(new Date(v.fechada_em), "HH:mm", { locale })}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="success" className="h-4 gap-1 px-1.5 text-[10px] font-semibold">
                    <CheckCircle size={9} weight="fill" aria-hidden />
                    {t("Venda")}
                  </Badge>
                  {v.valor !== null ? (
                    <span className="text-[13px] font-medium tabular-nums text-text">{BRL.format(v.valor)}</span>
                  ) : null}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
