"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { lerEstadoDoCanal } from "@/lib/channels/estado";
import { PedidoDeTroca } from "./PedidoDeTroca";
import { Phone } from "@/lib/ui/icons";

/**
 * Conexões vistas pelo DONO: os números da empresa e se estão funcionando.
 *
 * Só isso. Credencial da Meta, webhook, token e provedor são da equipe Treenity
 * (ver `ehGestaoTreenity`) — o Dono não tem o que fazer com eles, e a tela
 * técnica o levaria a mexer no que quebra o atendimento. Para conectar ou
 * trocar um número ele PEDE (`PedidoDeTroca`) e a Treenity executa.
 */
export function ConexoesDoDono() {
  const t = useT();
  const { data, isLoading, isError } = useChannelSessions({ refetchInterval: 15_000 });

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (isError) {
    return (
      <p className="text-sm text-error-fg">{t("Não foi possível carregar seus números agora.")}</p>
    );
  }

  const numeros = data ?? [];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {numeros.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t("Nenhum número conectado ainda. Use o botão abaixo para pedir à Treenity que conecte o seu.")}
        </Card>
      ) : (
        numeros.map((c) => {
          const estado = lerEstadoDoCanal(c.status);
          return (
            <Card key={c.id} className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <Phone size={20} className="text-muted-foreground" />
                <div>
                  <div className="font-medium">{channelLabel(c, t)}</div>
                  {c.phone_number ? (
                    <div className="text-sm text-muted-foreground">{c.phone_number}</div>
                  ) : null}
                </div>
              </div>
              <Badge variant={estado.tom}>{t(estado.rotulo)}</Badge>
            </Card>
          );
        })
      )}
      <PedidoDeTroca />
    </div>
  );
}
