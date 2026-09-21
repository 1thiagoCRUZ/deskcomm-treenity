"use client";

import { useEffect, useRef } from "react";

const MARGEM_DO_FIM_PX = 80;

/**
 * Área rolável que abre na mensagem mais recente, como o WhatsApp Web, e depois
 * SEGUE as mensagens novas — mas só se a pessoa já estava no fim. Quem subiu para
 * ler o histórico não é puxado de volta quando chega mensagem.
 */
export function ScrollAoFinal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const noFimRef = useRef(true);

  // Sem lista de dependências de propósito: roda a cada render, e o render é
  // exatamente o que acontece quando `children` traz mensagens novas.
  useEffect(() => {
    const el = ref.current;
    if (el && noFimRef.current) el.scrollTop = el.scrollHeight;
  });

  function aoRolar() {
    const el = ref.current;
    if (el) noFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < MARGEM_DO_FIM_PX;
  }

  return (
    <div ref={ref} onScroll={aoRolar} className={className}>
      {children}
    </div>
  );
}
