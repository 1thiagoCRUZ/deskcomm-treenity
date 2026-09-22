/**
 * Treenity Bot — status da conexão + o que precisa de atenção agora.
 *
 * Página operacional (grupo "canais"): está funcionando? tem cliente esperando
 * humano? Números/histórico ficam à parte, em Análise › Treenity Bot
 * (app/app/analise/treenity-bot/page.tsx) — mesma divisão que o resto do
 * deskcomm já usa entre "Canais" e "Análise".
 *
 * Três estados, no mesmo padrão de app/app/integrations/nuvemshop/page.tsx:
 *   1. not_configured — env vars vazias: mostra card "configure env".
 *   2. unreachable     — env ok, mas a API do bot não respondeu: mostra aviso.
 *   3. connected       — status + KPIs do dia + lista de sinalizados, em ABAS.
 *
 * As abas existem porque antes disso status, KPIs, fila de atenção e o chat
 * interno viviam empilhados numa página só — muita coisa pequena competindo
 * por espaço na mesma tela, difícil de escanear. Cada aba é uma pergunta:
 * "está funcionando?" (Visão geral), "alguém está esperando?" (Precisando de
 * atenção) e "preciso falar com o time do bot?" (Chat interno).
 *
 * Layout PRÓPRIO, não o padrão `max-w-5xl` das outras telas de canal: o Chat
 * interno é um mensageiro de verdade (duas colunas, lista + conversa) e
 * precisa da altura REAL da viewport — a mesma fórmula de
 * `components/inbox/InboxLayout.tsx` (100dvh menos a topbar de 3.5rem menos
 * os dois `--space-6` do padding do `<main>`), senão o conteúdo empurra a
 * página inteira pra baixo e gera scroll vertical onde não devia existir
 * nenhum (só o painel interno rola). Um `max-w` aqui também sobraria: numa
 * tela larga, a lista de pessoas + a conversa merecem a largura toda.
 *
 * KPIs e urgência vêm SÓ de dado real que a API do bot devolve (nada de
 * inventar "% resolvido sem humano" — esse campo não existe lá): "hoje" casa
 * `data_referencia` com a data local; a cor de urgência do item vem de quanto
 * tempo faz que `atencaoSinalizadaEm` foi gravado.
 */

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { CaretRight, ChartLineUp, ChatCircle, Clock, Robot } from "@/lib/ui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
import { isConfigured } from "@/lib/treenity-bot/config";
import { carregarDadosTreenityBot, carregarPainelAdmin } from "@/lib/treenity-bot/client";
import { iniciaisDe } from "@/lib/treenity-bot/formatacao";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { localeDeData } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { cn } from "@/lib/utils";
import ChatInterno from "./chat/chat-interno";
import { AtendimentosPainel } from "./_painel/AtendimentosPainel";
import { VendasPainel } from "./_painel/VendasPainel";

/** `border-l-error` (recém sinalizado) → `border-l-warning-fg` (há um tempo) → neutro. */
function corDeUrgencia(atencaoSinalizadaEm: string | null): string {
  if (!atencaoSinalizadaEm) return "border-l-border-strong";
  const minutos = (Date.now() - new Date(atencaoSinalizadaEm).getTime()) / 60_000;
  if (minutos <= 30) return "border-l-error";
  if (minutos <= 120) return "border-l-warning-fg";
  return "border-l-border-strong";
}

export default async function TreenityBotIntegrationPage() {
  const user = await loadAuthUser();
  const idioma = normalizarIdioma(user?.locale ?? null);
  const locale = localeDeData(idioma);
  const configured = isConfigured();

  // Vendas e a lista de atendimentos são só para ADMIN da organização. A decisão
  // é tomada AQUI, no servidor: só quem passa vira `painel_admin` no token do bot,
  // e o token nunca vai para o navegador (ver `carregarPainelAdmin`).
  const activeOrg = configured && user ? await resolveActiveOrg(user) : null;
  const ehAdmin = roleAtLeast(activeOrg?.role, "admin");
  const usuarioDoBot = user ? { email: user.email, nome: user.full_name ?? user.email } : null;

  const [dados, painel] = await Promise.all([
    configured && usuarioDoBot ? carregarDadosTreenityBot(usuarioDoBot) : null,
    configured && usuarioDoBot && ehAdmin ? carregarPainelAdmin(usuarioDoBot) : null,
  ]);

  const hojeISO = new Date().toISOString().slice(0, 10);
  const metricaHoje = dados?.metricas.find((m) => m.data_referencia === hojeISO) ?? null;
  const maisRecente =
    dados && dados.metricas.length > 0
      ? dados.metricas.reduce((a, b) => (a.atualizado_em > b.atualizado_em ? a : b))
      : null;

  const tabTriggerClass =
    "rounded-lg px-6 py-3 text-base font-semibold text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2*var(--space-6))] w-full flex-col gap-4">
      <header className="flex shrink-0 items-center gap-3">
        <div className="rounded-lg border border-border bg-surface p-2.5">
          <Robot size={24} weight="duotone" className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Treenity Bot</h1>
          <p className="text-sm text-muted-foreground">
            {traduzir(
              "Bot de vendas (WhatsApp/Facebook) — status da conexão e conversas precisando de um humano.",
              idioma,
            )}
          </p>
        </div>
      </header>

      {!configured ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{traduzir("Integração não configurada", idioma)}</CardTitle>
            <CardDescription>
              {traduzir("Configure", idioma)}{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 text-xs">TREENITY_BOT_API_URL</code>{" "}
              {traduzir("e", idioma)}{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 text-xs">TREENITY_BOT_SSO_SECRET</code>{" "}
              {traduzir("em", idioma)}{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 text-xs">.env.local</code>{" "}
              {traduzir("para ativar a integração.", idioma)}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !dados ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{traduzir("Não foi possível conectar", idioma)}</CardTitle>
            <CardDescription>
              {traduzir(
                "A API do Treenity Bot não respondeu. Confira se ela está no ar e se o segredo configurado bate dos dois lados.",
                idioma,
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="visao-geral" className="flex min-h-0 flex-1 flex-col gap-4">
          <TabsList className="h-auto w-fit shrink-0 gap-1 rounded-xl bg-muted p-1.5">
            <TabsTrigger value="visao-geral" className={tabTriggerClass}>
              {traduzir("Visão geral", idioma)}
            </TabsTrigger>
            <TabsTrigger value="atencao" className={cn(tabTriggerClass, "gap-2.5")}>
              {traduzir("Precisando de atenção", idioma)}
              {dados.sinalizados.length > 0 ? (
                <Badge variant="destructive" className="text-sm">
                  {dados.sinalizados.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            {ehAdmin ? (
              <TabsTrigger value="atendimentos" className={tabTriggerClass}>
                {traduzir("Atendimentos", idioma)}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="chat" className={tabTriggerClass}>
              {traduzir("Chat interno", idioma)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral" className="mt-0 min-h-0 flex-1 space-y-6 overflow-y-auto">
            <Card className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-4 px-8 py-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-40" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-accent-500" />
                  </span>
                  <span className="text-base font-semibold text-accent-700">
                    {traduzir("Conectado", idioma)}
                  </span>
                  {maisRecente ? (
                    <>
                      <span className="text-border-strong">•</span>
                      <span className="text-sm text-muted-foreground">
                        {traduzir("atualizado", idioma)}{" "}
                        {formatDistanceToNowStrict(new Date(maisRecente.atualizado_em), {
                          addSuffix: true,
                          locale,
                        })}
                      </span>
                    </>
                  ) : null}
                </div>
                <Link
                  href="/app/analise/treenity-bot"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:underline"
                >
                  <ChartLineUp size={15} />
                  {traduzir("Ver métricas e histórico completo", idioma)}
                </Link>
              </div>
              <div className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="flex flex-col gap-2 px-8 py-8">
                  <span
                    className={cn(
                      "text-4xl font-semibold tracking-tight tabular-nums lg:text-5xl",
                      dados.sinalizados.length > 0 && "text-error-fg",
                    )}
                  >
                    {dados.sinalizados.length}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {traduzir("Precisando de atenção", idioma)}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-8 py-8">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums lg:text-5xl">
                    {metricaHoje?.total_atendimentos ?? "—"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {traduzir("Atendimentos hoje", idioma)}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-8 py-8">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums lg:text-5xl">
                    {metricaHoje?.total_clientes ?? "—"}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {traduzir("Clientes hoje", idioma)}
                  </span>
                </div>
              </div>
            </Card>

            {ehAdmin ? <VendasPainel inicial={painel?.vendas ?? null} /> : null}
          </TabsContent>

          <TabsContent value="atencao" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <Card className="w-full">
              <CardHeader>
                <CardDescription>
                  {traduzir(
                    "Conversas em que a IA parou de responder e um humano precisa assumir.",
                    idioma,
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className={dados.sinalizados.length === 0 ? "p-0" : "p-[var(--density-gap)]"}>
                {dados.sinalizados.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-muted-foreground">
                    {traduzir("Nada precisando de atenção agora.", idioma)}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-[var(--density-gap)]">
                    {dados.sinalizados.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/app/integrations/treenity-bot/${item.id}`}
                          className={cn(
                            // Borda esquerda mais grossa carrega a urgência (cor de
                            // `corDeUrgencia`); as outras três lados fecham a pílula
                            // padrão da listagem — por isso o hover não mexe na borda,
                            // só no fundo, pra não apagar o sinal de urgência.
                            "flex items-center gap-4 rounded-md border border-border border-l-2 bg-surface px-6 py-4 transition-colors hover:bg-surface-elevated",
                            corDeUrgencia(item.atencaoSinalizadaEm),
                          )}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                            {iniciaisDe(item.clienteNome)}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-semibold">{item.clienteNome}</span>
                              {item.canal ? (
                                <Badge variant="secondary" className="gap-1">
                                  <ChatCircle size={11} />
                                  {item.canal}
                                </Badge>
                              ) : null}
                            </div>
                            {item.motivoAtencao ? (
                              <p className="line-clamp-1 text-sm text-muted-foreground">{item.motivoAtencao}</p>
                            ) : null}
                            {item.atencaoSinalizadaEm ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock size={11} />
                                {formatDistanceToNowStrict(new Date(item.atencaoSinalizadaEm), {
                                  addSuffix: true,
                                  locale,
                                })}
                              </div>
                            ) : null}
                          </div>
                          <CaretRight size={18} className="shrink-0 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {ehAdmin ? (
            <TabsContent value="atendimentos" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <AtendimentosPainel inicial={painel?.atendimentos ?? null} />
            </TabsContent>
          ) : null}

          <TabsContent value="chat" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <ChatInterno />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
