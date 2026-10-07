"use client";

import Link from "next/link";
import { ArrowRight, UserCircle, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { caminhoDoAnexo, type AnexoDeCliente } from "@/lib/treenity-bot/anexo-de-cliente";

/**
 * O cliente anexado, como cartão: dentro da mensagem do Chat da equipe (com
 * "Abrir conversa") ou no campo de digitação antes de enviar (com "remover").
 */
export function CartaoDoCliente({
  anexo,
  minha = false,
  onRemover,
}: {
  anexo: AnexoDeCliente;
  /** Dentro de uma mensagem SUA (fundo da cor primária). */
  minha?: boolean;
  /** Presente = cartão do rascunho, com botão de remover em vez do link. */
  onRemover?: () => void;
}) {
  const t = useT();
  return (
    <div
      data-testid="cartao-do-cliente"
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2",
        minha
          ? "border-primary-foreground/30 bg-primary-foreground/10"
          : "border-border bg-background",
      )}
    >
      <UserCircle size={18} className="shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <span className={cn("block text-xs", minha ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {t("Cliente")}
        </span>
        <span className="block truncate text-sm font-semibold">{anexo.nome}</span>
      </div>
      {onRemover ? (
        <button
          type="button"
          onClick={onRemover}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("Remover cliente")}
          title={t("Remover cliente")}
        >
          <X size={16} aria-hidden />
        </button>
      ) : (
        <Link
          href={caminhoDoAnexo(anexo)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium underline-offset-4 hover:underline",
            minha ? "text-primary-foreground" : "text-accent",
          )}
        >
          {t("Abrir conversa")}
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}
