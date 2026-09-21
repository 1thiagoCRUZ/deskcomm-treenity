"use client";

/**
 * Todos os atendimentos da IA, numa aba do Treenity Bot — só para ADMIN.
 *
 * Primeira pintura vem do servidor. Depois a lista se atualiza sozinha buscando
 * a primeira página em `/api/treenity-bot/atendimentos` e mesclando: atendimento
 * que teve mensagem nova sobe pro topo. Ao vivo (avisos do bot, via
 * `painel-eventos.ts`) a busca acontece na hora; o polling fica de reserva —
 * rápido enquanto NÃO está ao vivo, só "por garantia" quando está.
 *
 * Somente leitura. Clicar numa linha abre a transcrição já existente.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Warning } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { localeDeData, tagDeIdioma } from "@/lib/i18n/datas";
import type { AtendimentoPainel, PaginaDeAtendimentos } from "@/lib/treenity-bot/client";
import { assinarEstadoDoPainel, ouvirEventosDoPainel, painelEstaAoVivo } from "@/lib/treenity-bot/painel-eventos";
import { haQuantoTempo, moeda, varianteDaEtapa } from "./formatacao-painel";

const ATUALIZAR_MS = 8 * 1000;
const ATUALIZAR_AO_VIVO_MS = 60 * 1000;
const AGRUPAR_AVISOS_MS = 400;
const TODOS = "todos";
const CANAIS_CONHECIDOS = ["Instagram", "Facebook", "WhatsApp"];
const ETAPAS_CONHECIDAS = ["Iniciou", "Em Negociacao", "Proposta", "Fechada"];

interface Filtros {
  canal: string;
  etapa: string;
  venda: "todos" | "com" | "sem";
}

const FILTROS_VAZIOS: Filtros = { canal: TODOS, etapa: TODOS, venda: TODOS };

/** Uma página do servidor. `null` = falha. Fora do componente: não depende de estado. */
async function baixar(f: Filtros, cursor: string | null): Promise<PaginaDeAtendimentos | null> {
  try {
    const params = new URLSearchParams();
    if (f.canal !== TODOS) params.set("canal", f.canal);
    if (f.etapa !== TODOS) params.set("etapa", f.etapa);
    if (f.venda !== TODOS) params.set("com_venda", f.venda === "com" ? "true" : "false");
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/treenity-bot/atendimentos?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).data as PaginaDeAtendimentos;
  } catch {
    return null;
  }
}

function atividadeDe(a: AtendimentoPainel): string {
  return a.atualizadoEm ?? a.criadoEm ?? "";
}

/** Junta por id (o mais novo vence) e ordena pela última atividade, do mais recente pro mais antigo. */
function mesclar(atuais: AtendimentoPainel[], novos: AtendimentoPainel[]): AtendimentoPainel[] {
  const porId = new Map(atuais.map((a) => [a.id, a]));
  for (const n of novos) porId.set(n.id, n);
  return [...porId.values()].sort((a, b) => atividadeDe(b).localeCompare(atividadeDe(a)));
}

export function AtendimentosPainel({ inicial }: { inicial: PaginaDeAtendimentos | null }) {
  const t = useT();
  const idioma = useIdioma();
  const locale = localeDeData(idioma);
  const tag = tagDeIdioma(idioma);
  const router = useRouter();

  const [itens, setItens] = useState<AtendimentoPainel[]>(inicial?.itens ?? []);
  const [cursor, setCursor] = useState<string | null>(inicial?.proximoCursor ?? null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(inicial === null);
  const filtrosRef = useRef(filtros);

  useEffect(() => {
    filtrosRef.current = filtros;
  }, [filtros]);

  // "Ao vivo" só quando o bot confirmou que este socket está na sala do painel.
  const aoVivo = useSyncExternalStore(assinarEstadoDoPainel, painelEstaAoVivo, () => false);

  const atualizarSilencioso = useCallback(async () => {
    const f = filtrosRef.current;
    const pagina = await baixar(f, null);
    if (!pagina || filtrosRef.current !== f) return; // falhou, ou o filtro mudou no meio da busca
    setItens((prev) => mesclar(prev, pagina.itens));
    setCursor((atual) => atual ?? pagina.proximoCursor);
    setErro(false);
  }, []);

  // Reserva: polling. Rápido quando NÃO está ao vivo; só um "por garantia" lento
  // quando está (os avisos abaixo já trazem tudo).
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void atualizarSilencioso();
      },
      aoVivo ? ATUALIZAR_AO_VIVO_MS : ATUALIZAR_MS,
    );
    return () => clearInterval(timer);
  }, [aoVivo, atualizarSilencioso]);

  // Tempo real: qualquer mudança em mensagens/atendimentos/vendas (ou um
  // "reconectado") busca a primeira página de novo. Avisos em rajada — o n8n grava
  // várias linhas por mensagem — viram uma busca só.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const parar = ouvirEventosDoPainel(() => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void atualizarSilencioso(), AGRUPAR_AVISOS_MS);
    });
    return () => {
      parar();
      if (espera) clearTimeout(espera);
    };
  }, [atualizarSilencioso]);

  async function aplicar(parcial: Partial<Filtros>) {
    const novo = { ...filtros, ...parcial };
    setFiltros(novo);
    setCarregando(true);
    const pagina = await baixar(novo, null);
    setCarregando(false);
    if (!pagina) {
      setErro(true);
      toast.error(t("Não foi possível carregar os atendimentos agora."));
      return;
    }
    setErro(false);
    setItens(pagina.itens);
    setCursor(pagina.proximoCursor);
  }

  async function carregarMais() {
    if (!cursor) return;
    setCarregando(true);
    const pagina = await baixar(filtros, cursor);
    setCarregando(false);
    if (!pagina) {
      toast.error(t("Não foi possível carregar os atendimentos agora."));
      return;
    }
    setItens((prev) => mesclar(prev, pagina.itens));
    setCursor(pagina.proximoCursor);
  }

  const temFiltro = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS);

  return (
    <Card className="w-full">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label>{t("Canal")}</Label>
            <Select value={filtros.canal} onValueChange={(v) => void aplicar({ canal: v })}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>{t("Todos")}</SelectItem>
                {CANAIS_CONHECIDOS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Etapa do funil")}</Label>
            <Select value={filtros.etapa} onValueChange={(v) => void aplicar({ etapa: v })}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>{t("Todas")}</SelectItem>
                {ETAPAS_CONHECIDAS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Venda")}</Label>
            <Select value={filtros.venda} onValueChange={(v) => void aplicar({ venda: v as Filtros["venda"] })}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">{t("Todos")}</SelectItem>
                <SelectItem value="com">{t("Com venda")}</SelectItem>
                <SelectItem value="sem">{t("Sem venda")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {temFiltro ? (
            <Button variant="ghost" onClick={() => void aplicar(FILTROS_VAZIOS)}>
              {t("Limpar filtros")}
            </Button>
          ) : null}
          <p className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-500" />
            </span>
            {aoVivo ? t("Ao vivo") : t("Atualiza sozinho")} · {itens.length} {t("atendimentos")}
          </p>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {erro && itens.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-base text-muted-foreground">{t("Não foi possível carregar os atendimentos agora.")}</p>
            <Button variant="secondary" size="sm" onClick={() => void aplicar({})}>
              {t("Tentar de novo")}
            </Button>
          </div>
        ) : itens.length === 0 ? (
          <p className="px-6 py-10 text-center text-base text-muted-foreground">
            {carregando ? t("Carregando…") : t("Nenhum atendimento encontrado.")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t("Cliente")}</TableHead>
                <TableHead>{t("Canal")}</TableHead>
                <TableHead>{t("Etapa")}</TableHead>
                <TableHead className="text-right">{t("Nota da IA")}</TableHead>
                <TableHead>{t("Última mensagem")}</TableHead>
                <TableHead className="text-right">{t("Msgs")}</TableHead>
                <TableHead className="pr-6 text-right">{t("Venda")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((a) => {
                const ultima = a.ultimaMensagem;
                const previa = ultima?.conteudo || (ultima?.formato === "audio" ? `(${t("áudio")})` : "");
                return (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/app/integrations/treenity-bot/${a.id}`)}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.cliente?.nome ?? t("Desconhecido")}</span>
                        {a.precisaAtencaoHumana ? (
                          <Badge variant="error" className="gap-1">
                            <Warning size={11} weight="fill" aria-hidden />
                            {t("Atenção")}
                          </Badge>
                        ) : null}
                      </div>
                      {a.cliente?.idFace ? (
                        <span className="text-xs text-muted-foreground">{a.cliente.idFace}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{a.canal ? <Badge variant="neutral">{a.canal}</Badge> : "—"}</TableCell>
                    <TableCell>
                      {a.statusFunil ? <Badge variant={varianteDaEtapa(a.statusFunil)}>{a.statusFunil}</Badge> : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.qualidadeIa != null ? Number(a.qualidadeIa).toFixed(1) : "—"}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      {ultima ? (
                        <>
                          <p className="truncate text-sm">
                            <span className="text-muted-foreground">
                              {ultima.remetente === "ia" ? t("IA") : t("Cliente")}:{" "}
                            </span>
                            {previa}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {haQuantoTempo(ultima.enviadoEm, locale)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.totalMensagens}</TableCell>
                    <TableCell className="pr-6 text-right tabular-nums">
                      {a.venda ? (
                        <span className="font-semibold">{moeda(a.venda.total, tag)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {cursor ? (
          <div className="flex justify-center border-t border-border p-4">
            <Button variant="secondary" disabled={carregando} onClick={() => void carregarMais()}>
              {carregando ? t("Carregando…") : t("Carregar mais")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
