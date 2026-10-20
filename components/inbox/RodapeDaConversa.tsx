"use client";
import { useEffect, useState, type RefObject } from "react";
import { useT } from "@/hooks/i18n/useT";
import { estadoDaJanela, formatarDecorrido } from "@/lib/channels/janela";
import { JanelaFechadaAviso } from "@/components/inbox/JanelaFechadaAviso";
import type { Message as ConversationMensagem } from "@/lib/types/messaging";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { Composer, type ComposerHandle } from "./Composer";

interface Props {
  conversation: ConversationWithContact;
  composerRef: RefObject<ComposerHandle | null>;
  blockedReason: string | null;
  respondendo: ConversationMensagem | null;
  onCancelarResposta: () => void;
}

/**
 * O aviso de janela + o composer, com o RELÓGIO da janela dentro.
 *
 * O relógio (a cada 30 s) vivia no InboxLayout e fazia a tela inteira (lista,
 * conversa, painel) redesenhar a cada tique. Aqui ele só redesenha estas duas
 * peças. A regra da janela é a mesma de antes.
 */
export function RodapeDaConversa({
  conversation,
  composerRef,
  blockedReason,
  respondendo,
  onCancelarResposta,
}: Props) {
  const t = useT();

  // A janela vence SOZINHA com a aba aberta. Sem este relógio, quem deixa o
  // inbox aberto a tarde inteira seguiria com o composer liberado numa conversa
  // que já venceu — e o bloqueio só apareceria no próximo recarregamento.
  const [agoraJanela, setAgoraJanela] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgoraJanela(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // A janela de 24h fecha o composer, e o motivo DIZ há quanto tempo fechou.
  //
  // Reusa o `blockedReason` que já existe (contato bloqueado/anonimizado) em vez
  // de um segundo mecanismo de bloqueio: dois caminhos para desabilitar o mesmo
  // composer divergem, e o segundo esquece de cobrir o áudio ou o anexo.
  const janela = estadoDaJanela(
    conversation.channel_sessions?.provider ?? null,
    conversation.last_inbound_at ?? null,
    agoraJanela,
  );
  const motivoDaJanela =
    janela.tipo === "fechada"
      ? janela.fechadaHaMs === null
        ? t(
            "O cliente ainda não escreveu — a janela de 24h nunca abriu. Só um modelo aprovado sai daqui.",
          )
        : `${t("A janela de 24h fechou há")} ${formatarDecorrido(janela.fechadaHaMs)}. ${t("Só um modelo aprovado sai daqui — texto livre é recusado pela plataforma.")}`
      : null;

  return (
    <>
      {motivoDaJanela && (
        <JanelaFechadaAviso
          conversationId={conversation.id}
          provider={conversation.channel_sessions?.provider ?? null}
          motivo={motivoDaJanela}
        />
      )}
      <Composer
        ref={composerRef}
        conversationId={conversation.id}
        blockedReason={blockedReason}
        janelaFechada={motivoDaJanela}
        disabled={conversation.status === "closed"}
        contactName={conversation.contacts?.name ?? null}
        respondendo={respondendo}
        onCancelarResposta={onCancelarResposta}
        currentContactId={conversation.contact_id}
      />
    </>
  );
}
