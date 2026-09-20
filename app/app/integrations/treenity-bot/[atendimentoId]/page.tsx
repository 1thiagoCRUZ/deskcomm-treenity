/**
 * Transcrição de um atendimento do Treenity Bot — destino do clique em cada
 * linha de "precisando de atenção" na tela principal da integração.
 *
 * Bolhas no mesmo padrão visual de components/inbox/MessageBubble.tsx
 * (rounded-2xl, bg-primary/bg-muted, cauda assimétrica) — versão simples,
 * sem citação/mídia/ack, porque as mensagens do bot não têm esses campos.
 *
 * O separador de dia e a latência ("IA respondeu em Xs") são CALCULADOS em
 * cima de `enviadoEm` — dado real, não estimado.
 *
 * "Encerrar atendimento" (`encerrar-button.tsx` + `_actions.ts`) é a única
 * mutação desta tela: sem ela, um atendimento sinalizado ficava com a IA
 * pausada pra sempre depois que um humano assumia na mão — nada avisava a
 * API do bot que a situação foi resolvida.
 */

import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { CaretLeft, ChatCircle, Robot, Warning } from "@/lib/ui/icons";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadAuthUser } from "@/lib/auth/server";
import { carregarConversaTreenityBot, type MensagemAtendimento } from "@/lib/treenity-bot/client";
import { formatarLatencia, iniciaisDe } from "@/lib/treenity-bot/formatacao";
import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";
import { localeDeData, tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { cn } from "@/lib/utils";
import { EncerrarAtendimentoButton } from "./encerrar-button";
import { ScrollAoFinal } from "./scroll-ao-final";

interface Props {
  params: Promise<{ atendimentoId: string }>;
}

function rotuloDoDia(data: Date, idioma: Idioma): string {
  if (isToday(data)) return traduzir("Hoje", idioma);
  if (isYesterday(data)) return traduzir("Ontem", idioma);
  return format(data, "d 'de' MMMM", { locale: localeDeData(idioma) });
}

interface GrupoDeDia {
  chave: string;
  rotulo: string;
  mensagens: MensagemAtendimento[];
}

function agruparPorDia(mensagens: MensagemAtendimento[], idioma: Idioma): GrupoDeDia[] {
  const grupos: GrupoDeDia[] = [];
  for (const mensagem of mensagens) {
    const data = new Date(mensagem.enviadoEm);
    const chave = format(data, "yyyy-MM-dd");
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.chave === chave) {
      ultimo.mensagens.push(mensagem);
    } else {
      grupos.push({ chave, rotulo: rotuloDoDia(data, idioma), mensagens: [mensagem] });
    }
  }
  return grupos;
}

export default async function TreenityBotConversaPage({ params }: Props) {
  const { atendimentoId } = await params;
  const user = await loadAuthUser();
  const idioma = normalizarIdioma(user?.locale ?? null);

  const conversa = user
    ? await carregarConversaTreenityBot({ email: user.email, nome: user.full_name ?? user.email }, atendimentoId)
    : null;

  const grupos = conversa ? agruparPorDia(conversa.mensagens, idioma) : [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-2*var(--space-6))] w-full max-w-3xl flex-col gap-4">
      <Link
        href="/app/integrations/treenity-bot"
        className="inline-flex w-fit shrink-0 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <CaretLeft size={14} />
        {traduzir("Voltar", idioma)}
      </Link>

      {!conversa ? (
        <Card>
          <CardHeader>
            <CardTitle>{traduzir("Não foi possível carregar esta conversa", idioma)}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <>
          <header className="flex shrink-0 flex-wrap items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {iniciaisDe(conversa.atendimento.clienteNome)}
            </span>
            <h1 className="text-xl font-semibold tracking-tight">{conversa.atendimento.clienteNome}</h1>
            {conversa.atendimento.canal ? (
              <Badge variant="secondary" className="gap-1">
                <ChatCircle size={11} />
                {conversa.atendimento.canal}
              </Badge>
            ) : null}
            {conversa.atendimento.precisaAtencaoHumana ? (
              <Badge variant="destructive" className="gap-1">
                <Warning size={12} weight="fill" />
                {traduzir("Precisa de atenção", idioma)}
              </Badge>
            ) : null}
            {conversa.atendimento.precisaAtencaoHumana ? (
              <div className="ml-auto">
                <EncerrarAtendimentoButton atendimentoId={conversa.atendimento.id} />
              </div>
            ) : null}
          </header>

          {conversa.atendimento.motivoAtencao ? (
            <p className="flex shrink-0 items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
              {conversa.atendimento.motivoAtencao}
            </p>
          ) : null}

          <ScrollAoFinal className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface py-4">
            {conversa.mensagens.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {traduzir("Nenhuma mensagem neste atendimento ainda.", idioma)}
              </p>
            ) : (
              <>
                {grupos.map((grupo) => (
                  <div key={grupo.chave}>
                    <div className="my-2 flex items-center gap-3 px-6 text-[11px] font-semibold text-muted-foreground/80">
                      <span className="h-px flex-1 bg-border" />
                      {grupo.rotulo.toUpperCase()}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    {grupo.mensagens.map((mensagem, i) => {
                      const isIa = mensagem.remetente === "ia";
                      const anterior = i > 0 ? grupo.mensagens[i - 1] : undefined;
                      const latencia =
                        isIa && anterior?.remetente === "cliente"
                          ? formatarLatencia(new Date(anterior.enviadoEm).getTime(), new Date(mensagem.enviadoEm).getTime())
                          : null;
                      return (
                        <div key={mensagem.id}>
                          <div
                            className={cn("flex w-full items-end gap-1 px-6 py-1.5", isIa ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                                isIa
                                  ? "rounded-br-sm bg-primary text-primary-foreground"
                                  : "rounded-bl-sm bg-muted text-foreground",
                              )}
                            >
                              {isIa ? (
                                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold opacity-80">
                                  <Robot size={11} weight="duotone" aria-hidden />
                                  IA
                                </div>
                              ) : null}
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{mensagem.conteudo}</p>
                              <div
                                className={cn(
                                  "mt-1 text-right text-[11px]",
                                  isIa ? "text-primary-foreground/80" : "text-muted-foreground",
                                )}
                              >
                                {new Date(mensagem.enviadoEm).toLocaleTimeString(tagDeIdioma(idioma), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                          {latencia ? (
                            <p className="px-6 text-right text-xs text-muted-foreground/70">
                              {traduzir("IA respondeu em", idioma)} {latencia}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {conversa.atendimento.precisaAtencaoHumana ? (
                  <div className="my-3 flex justify-center px-6">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3.5 py-1.5 text-xs font-semibold text-warning-fg">
                      <Warning size={11} weight="fill" />
                      {traduzir("IA sinalizou este atendimento para um humano", idioma)}
                      {conversa.atendimento.atencaoSinalizadaEm
                        ? ` — ${new Date(conversa.atendimento.atencaoSinalizadaEm).toLocaleTimeString(tagDeIdioma(idioma), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </ScrollAoFinal>

          {conversa.atendimento.precisaAtencaoHumana ? (
            <p className="shrink-0 rounded-md border border-border bg-surface-elevated px-4 py-3 text-sm text-muted-foreground">
              {traduzir("Este atendimento está com a IA pausada, esperando um humano.", idioma)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
