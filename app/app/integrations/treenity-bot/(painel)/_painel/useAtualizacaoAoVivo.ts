"use client";

/**
 * Atualização ao vivo dos painéis do bot (Vendas, Em andamento).
 *
 * Ao vivo, um aviso dos tipos pedidos (ou "reconectado") chama `atualizar` depois de
 * uma pausa curta que junta avisos seguidos. Sem tempo real (usuário sem acesso ao
 * vivo, bot antigo), chama por polling enquanto a aba está visível.
 * `atualizar` deve ser estável (useCallback). Devolve se o painel está ao vivo.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  assinarEstadoDoPainel,
  ouvirEventosDoPainel,
  painelEstaAoVivo,
} from "@/lib/treenity-bot/painel-eventos";

export const AGRUPAR_AVISOS_MS = 400;
export const POLLING_DE_RESERVA_MS = 30 * 1000;

export function useAtualizacaoAoVivo(tipos: readonly string[], atualizar: () => void | Promise<void>): boolean {
  // "Ao vivo" só quando o bot confirmou que este socket está na sala do painel.
  const aoVivo = useSyncExternalStore(assinarEstadoDoPainel, painelEstaAoVivo, () => false);
  const chaveDosTipos = tipos.join("|");

  useEffect(() => {
    const aceitos = chaveDosTipos.split("|");
    let espera: ReturnType<typeof setTimeout> | undefined;
    const parar = ouvirEventosDoPainel((evento) => {
      if (evento.tipo !== "reconectado" && !aceitos.includes(evento.tipo)) return;
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void atualizar(), AGRUPAR_AVISOS_MS);
    });
    return () => {
      parar();
      if (espera) clearTimeout(espera);
    };
  }, [chaveDosTipos, atualizar]);

  useEffect(() => {
    if (aoVivo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void atualizar();
    }, POLLING_DE_RESERVA_MS);
    return () => clearInterval(timer);
  }, [aoVivo, atualizar]);

  return aoVivo;
}
