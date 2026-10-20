"use client";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

/**
 * Invalida uma chave de query com debounce de TRAILING: uma rajada de chamadas
 * vira uma só, disparada `esperaMs` depois da ÚLTIMA. Nenhum evento se perde —
 * o último da rajada sempre agenda o refetch. Com `maxEsperaMs`, rajada
 * contínua não adia o refetch para sempre. Ao desmontar, cancela o timer.
 *
 * O callback devolvido tem identidade estável (seguro em deps de efeito).
 */
export function useInvalidarAgrupado(
  qc: QueryClient,
  queryKey: readonly unknown[],
  esperaMs = 500,
  /** Se os eventos não param, dispara mesmo assim depois de tanto tempo. */
  maxEsperaMs = 2000,
) {
  const inicioDaRajada = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A chave é lida na hora do disparo; fica em ref para o callback não mudar.
  const chave = useRef(queryKey);
  useEffect(() => {
    chave.current = queryKey;
  }, [queryKey]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    [],
  );

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const agora = Date.now();
    if (inicioDaRajada.current === null) inicioDaRajada.current = agora;
    const restante = Math.max(0, maxEsperaMs - (agora - inicioDaRajada.current));
    timer.current = setTimeout(() => {
      timer.current = null;
      inicioDaRajada.current = null;
      void qc.invalidateQueries({ queryKey: chave.current });
    }, Math.min(esperaMs, restante));
  }, [qc, esperaMs, maxEsperaMs]);
}
