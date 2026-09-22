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
import { definirPainelAoVivo, emitirEventoDoPainel, type EventoDoPainel } from "@/lib/treenity-bot/painel-eventos";

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
    let timer: ReturnType<typeof setInterval> | undefined;
    let sincronismo: ReturnType<typeof setTimeout> | undefined;
    let sincronismoFunil: ReturnType<typeof setTimeout> | undefined;

    // O token do bot dura 15 min e esta conexão fica aberta o dia todo: sem
    // renovar, a primeira reconexão depois disso falha e os alertas param.
    const renovarToken = async () => {
      const nova = await buscarSessaoChat();
      if (!nova || cancelado || !socketRef.current) return false;
      socketRef.current.auth = { token: nova.accessToken };
      return true;
    };

    (async () => {
      const sessao = await buscarSessaoChat();
      if (cancelado || !sessao) return;

      const socket = conectarSocketChat(sessao);
      socketRef.current = socket;

      socket.on("connect_error", async (err: Error) => {
        if (/token/i.test(err.message) && (await renovarToken())) socket.connect();
      });
      timer = setInterval(() => void renovarToken(), 10 * 60 * 1000);

      // Tempo real do painel admin: este é o ÚNICO socket da aba para isso. Repassa
      // os avisos aos painéis (lib/treenity-bot/painel-eventos.ts). "Ao vivo" só
      // depois de `painel_pronto` — o bot confirmando que este socket entrou na
      // sala do painel (só admin entra); sem isso os painéis mantêm o polling.
      let jaConectouAntes = false;
      socket.on("connect", () => {
        // Reconexão da aba: avisos emitidos enquanto estava fora se perderam.
        if (jaConectouAntes) emitirEventoDoPainel({ tipo: "reconectado" });
        jaConectouAntes = true;
      });
      socket.on("disconnect", () => definirPainelAoVivo(false));

      // Venda nova => tarefa "Conferir pagamento PIX". Quem recebe estes avisos é
      // admin (sala do painel), então só admin dispara o sincronismo; a rota
      // confere de novo no servidor. Vários avisos seguidos viram uma chamada só.
      const pedirSincronismoDeTarefas = () => {
        if (sincronismo) clearTimeout(sincronismo);
        sincronismo = setTimeout(() => {
          void fetch("/api/treenity-bot/sincronizar-tarefas", { method: "POST" }).catch(() => {});
        }, 2000);
      };
      // Etapa mudou ou venda nova => card do funil (crm_leads) precisa se mexer.
      const pedirSincronismoDeFunil = () => {
        if (sincronismoFunil) clearTimeout(sincronismoFunil);
        sincronismoFunil = setTimeout(() => {
          void fetch("/api/treenity-bot/sincronizar-funil", { method: "POST" }).catch(() => {});
        }, 2000);
      };
      socket.on("painel_pronto", () => {
        definirPainelAoVivo(true);
        pedirSincronismoDeTarefas(); // pega o que ficou pendente enquanto ninguém estava conectado
        pedirSincronismoDeFunil();
      });
      socket.on("painel_evento", (evento: EventoDoPainel) => {
        emitirEventoDoPainel(evento);
        if (evento.tipo === "venda" || evento.tipo === "reconectado") pedirSincronismoDeTarefas();
        if (evento.tipo === "atendimento" || evento.tipo === "venda" || evento.tipo === "reconectado") {
          pedirSincronismoDeFunil();
        }
      });

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
      definirPainelAoVivo(false);
      if (timer) clearInterval(timer);
      if (sincronismo) clearTimeout(sincronismo);
      if (sincronismoFunil) clearTimeout(sincronismoFunil);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [router, t]);

  return null;
}
