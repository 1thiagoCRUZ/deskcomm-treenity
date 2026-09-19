/**
 * Alerta em tempo real de "atendimento sinalizado" do Treenity Bot — visível
 * em QUALQUER tela de /app, não só na aba "Precisando de atenção".
 *
 * Antes disso, o único jeito de saber que a IA parou de responder um cliente
 * era abrir a integração e olhar a lista — sem alerta, sem atualização
 * automática. Este componente abre um socket (mesmo canal `/chat` do
 * `lib/treenity-bot/chat-client.ts`, que já recebe `atendimento_sinalizado`
 * — ver `emitAlertaAtendimento` no api-treenity-bot) e, quando o evento
 * chega:
 *   1. mostra um toast com o nome do cliente/motivo e um atalho pra conversa;
 *   2. se a pessoa já está em alguma tela do Treenity Bot, faz
 *      `router.refresh()` pra lista/contador saírem do ar do jeito que estavam.
 *
 * Não renderiza nada visível (`return null`) — só o efeito colateral do toast.
 * Fica montado no layout autenticado (`app/app/layout.tsx`), gated por role
 * (mesmo `minRole: "agent"` do resto da integração, ver `lib/navigation/catalogo.ts`)
 * e só quando a integração está configurada.
 */
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import { useT } from "@/hooks/i18n/useT";
import { buscarSessaoChat, conectarSocketChat } from "@/lib/treenity-bot/chat-client";

interface AlertaAtendimentoPayload {
  atendimentoId: string;
  clienteNome: string;
  canal: string | null;
  motivo: string | null;
  sinalizadoEm: string | null;
}

export function TreenityBotAlertProvider() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const sessao = await buscarSessaoChat();
      if (cancelado || !sessao) return;

      const socket = conectarSocketChat(sessao);
      socketRef.current = socket;

      socket.on("atendimento_sinalizado", (alerta: AlertaAtendimentoPayload) => {
        toast.warning(alerta.clienteNome, {
          description: alerta.motivo ?? t("Um cliente está precisando de atenção humana."),
          duration: 15000,
          action: {
            label: t("Ver conversa"),
            onClick: () => router.push(`/app/integrations/treenity-bot/${alerta.atendimentoId}`),
          },
        });

        if (pathnameRef.current.startsWith("/app/integrations/treenity-bot")) {
          router.refresh();
        }
      });
    })();

    return () => {
      cancelado = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [router, t]);

  return null;
}
