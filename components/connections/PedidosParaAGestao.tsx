"use client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePedidos, useResolverPedido } from "@/hooks/gestao/usePedidos";
import { useT } from "@/hooks/i18n/useT";

/**
 * O que o cliente pediu e ainda não foi feito, para a equipe Treenity. O passo a passo é o
 * mesmo da troca: remover o número antigo, conectar o novo e colar o webhook novo na Meta.
 */
export function PedidosParaAGestao() {
  const t = useT();
  const { data } = usePedidos({ soAbertos: true });
  const resolver = useResolverPedido();
  const abertos = data ?? [];
  if (abertos.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3 border-warning/40 p-4" data-testid="pedidos-da-gestao">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">{t("Pedido do cliente")}</h2>
        <Badge variant="warning">{abertos.length}</Badge>
      </div>
      {abertos.map((p) => (
        <div key={p.id} className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
          <p className="text-sm">
            {t("Trocar para")} <span className="font-mono font-medium">{p.numero_novo}</span>
          </p>
          {p.observacao ? <p className="text-sm text-muted-foreground">{p.observacao}</p> : null}
          <ol className="list-decimal pl-5 text-xs text-muted-foreground">
            <li>{t("Cadastre e verifique o número novo no WhatsApp Business (Meta).")}</li>
            <li>{t("Remova o número antigo aqui embaixo (ele deixa de receber).")}</li>
            <li>{t("Conecte o número novo (formulário abaixo) e cole o webhook novo na Meta.")}</li>
            <li>{t("Mande uma mensagem de teste e marque o pedido como atendido.")}</li>
          </ol>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolver.isPending}
              onClick={async () => {
                await resolver.mutateAsync({ id: p.id, status: "atendido" });
                toast.success(t("Pedido marcado como atendido."));
              }}
            >
              {t("Marcar como atendido")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolver.isPending}
              onClick={() => resolver.mutateAsync({ id: p.id, status: "cancelado" })}
            >
              {t("Cancelar pedido")}
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
