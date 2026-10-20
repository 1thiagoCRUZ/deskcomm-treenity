"use client";

/**
 * Avisa quando um lembrete ("Lembrar" no Inbox) que VOCÊ criou venceu sem o
 * cliente responder — toast na tela e notificação do sistema, com som (pedido
 * do usuário em 10/10: o cliente diz "vou ver e te falo", e o lembrete chama
 * a equipe de volta na hora marcada).
 *
 * Confere a cada minuto (`/api/v1/inbox/lembretes-vencidos`) também com a aba
 * minimizada (e na hora em que ela volta a ficar visível). Cada lembrete avisa UMA vez por navegador (ids guardados no
 * localStorage). Quem vence o lembrete é o servidor (`vencer-lembretes.ts`),
 * chamado pelo n8n a cada 5 minutos.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { emitNotification } from "@/lib/notifications/emit";
import { canalLigado } from "@/lib/notifications/prefs";

interface LembreteVencido {
  id: string;
  conversa_id: string;
  contato: string;
}

const INTERVALO_MS = 60_000;
const CHAVE = "lembretes.avisados.v1";

function jaAvisados(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(CHAVE) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function guardarAvisados(ids: Set<string>) {
  try {
    // Só os mais recentes: a lista não cresce para sempre.
    window.localStorage.setItem(CHAVE, JSON.stringify([...ids].slice(-100)));
  } catch {
    /* sem armazenamento: no pior caso o mesmo lembrete avisa de novo */
  }
}

export function AvisoDeLembretes() {
  const t = useT();
  const router = useRouter();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    let cancelado = false;
    const conferir = async () => {
      let itens: LembreteVencido[] = [];
      try {
        itens = (await apiClient.get<{ data: LembreteVencido[] }>("/api/v1/inbox/lembretes-vencidos")).data;
      } catch {
        return;
      }
      if (cancelado || itens.length === 0) return;
      const avisados = jaAvisados();
      for (const item of itens) {
        if (avisados.has(item.id)) continue;
        avisados.add(item.id);
        const title = tRef.current("Lembrete: hora de voltar no cliente");
        const body = `${item.contato} ${tRef.current("não respondeu desde o lembrete.")}`;
        const href = `/app/inbox?id=${item.conversa_id}`;
        if (canalLigado("lembrete", "in_app")) {
          toast.warning(title, {
            description: body,
            duration: 20000,
            action: { label: tRef.current("Abrir conversa"), onClick: () => router.push(href) },
          });
        }
        if (canalLigado("lembrete", "push")) {
          emitNotification({ kind: "lembrete", title, body, tag: item.id, href, force: true });
        }
      }
      guardarAvisados(avisados);
    };
    void conferir();
    const timer = setInterval(() => void conferir(), INTERVALO_MS);
    // Em segundo plano segue conferindo (o aviso do sistema precisa sair); ao
    // voltar a aba, confere na hora.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router]);

  return null;
}
