"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ouvirEventosDoPainel } from "@/lib/treenity-bot/painel-eventos";

const AGRUPAR_AVISOS_MS = 400;

/**
 * Sem interface. Enquanto a transcrição está aberta, mensagem nova DESTE
 * atendimento (ou um "reconectado", que significa avisos perdidos) refaz a
 * página no servidor e a conversa se atualiza na hora.
 *
 * Os avisos só chegam a quem é admin (sala do painel no bot); para os demais este
 * componente simplesmente nunca dispara e a transcrição segue como antes.
 */
export function TranscricaoAoVivo({ atendimentoId }: { atendimentoId: string }) {
  const router = useRouter();

  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const agendar = () => {
      if (espera) clearTimeout(espera);
      // Rajada de avisos (o n8n grava várias linhas por mensagem) vira uma atualização só.
      espera = setTimeout(() => router.refresh(), AGRUPAR_AVISOS_MS);
    };

    const parar = ouvirEventosDoPainel((evento) => {
      if (evento.tipo === "reconectado") return agendar();
      if ((evento.tipo === "mensagem" || evento.tipo === "atendimento") && evento.atendimentoId === atendimentoId) {
        agendar();
      }
    });

    return () => {
      parar();
      if (espera) clearTimeout(espera);
    };
  }, [atendimentoId, router]);

  return null;
}
