"use client";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";

interface AppShellProps {
  sidebarCollapsed: boolean;
  children: ReactNode;
}

export function AppShell({ sidebarCollapsed, children }: AppShellProps) {
  useInboundMessageAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  return (
    // `h-dvh` + `overflow-hidden`, não `min-h-screen`: com `min-h-screen` a
    // CAIXA CRESCE com o conteúdo, e numa página alta (ex.: a grade de
    // horários da Agenda) o DOCUMENTO passava a rolar, não só `main`. Isso
    // quebrava a sidebar: ela é `sticky` (ver Sidebar.tsx), e `html`/`body`
    // têm `overflow-x: hidden` sem `overflow-y` explícito — por regra da spec
    // CSS, isso faz o navegador computar `overflow-y: auto` nos DOIS ao mesmo
    // tempo, criando dois contêineres de rolagem empilhados. `position:
    // sticky` gruda relativo ao contêiner de rolagem mais próximo, e com dois
    // no meio o cálculo sai errado — a sidebar "soma" a rolagem duas vezes e
    // sai da tela (medido: 900px de scroll levaram o topo dela pra -844px).
    // Prendendo esta caixa em exatamente a altura da viewport, o documento
    // NUNCA precisa rolar — só `main`, por dentro do próprio `overflow-auto`
    // — e a sidebar sticky nunca chega a testar esse cálculo quebrado.
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <div className="hidden md:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>
      {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.

        Medido em 390x844 no detalhe do agente, que tem seis abas: a página
        estourava 476px na horizontal; com esta classe, 212px — o que sobra é o
        cabeçalho, presente também em telas que não têm abas (a lista de agentes
        estoura 236px). Isolado ancestral por ancestral: é este o que decide.
      */}
      {/*
        Sem `md:ml-*`: a barra voltou a ocupar lugar na linha (ver o comentário
        em `Sidebar.tsx`), então o que sobra para esta coluna é exatamente o que
        ela não usou. A margem existia para compensar uma barra `fixed`, e era a
        SEGUNDA medida da mesma coisa — a que discordava e deixava a barra por
        cima da lista.
      */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
