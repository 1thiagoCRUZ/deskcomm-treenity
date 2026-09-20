"use client";

import { useEffect, useRef } from "react";

/** Área rolável que abre na mensagem mais recente, como o WhatsApp Web. */
export function ScrollAoFinal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
