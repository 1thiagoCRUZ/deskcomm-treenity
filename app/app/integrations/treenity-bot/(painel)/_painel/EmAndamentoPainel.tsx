"use client";

/**
 * "Em andamento": atendimentos do bot ainda abertos (sem venda gravada ou com
 * pedido cotado), por etapa. Fica acima da tabela de Vendas, só para ADMIN.
 * Dados de `/api/treenity-bot/atendimentos?em_andamento=true`. Os cartões por
 * etapa também filtram a lista. Somente leitura; o clique abre a conversa.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Warning } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useLocaleDeData, useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import type { AtendimentoPainel, PaginaDeAtendimentos } from "@/lib/treenity-bot/client";
import { haQuantoTempo, moeda, previaDaMensagem, varianteDaEtapa } from "./formatacao-painel";
import {
  contarPorEtapa,
  etapaDoAndamento,
  ETAPAS_ANDAMENTO,
  filtrarPorEtapa,
  soEmAndamento,
  type EtapaAndamento,
} from "./em-andamento";
import { useAtualizacaoAoVivo } from "./useAtualizacaoAoVivo";

const POR_PAGINA = 50;

async function baixar(cursor: string | null): Promise<PaginaDeAtendimentos | null> {
  try {
    const params = new URLSearchParams({ em_andamento: "true", limit: String(POR_PAGINA) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/treenity-bot/atendimentos?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).data as PaginaDeAtendimentos;
  } catch {
    return null;
  }
}

export function EmAndamentoPainel() {
  const t = useT();
  const locale = useLocaleDeData();
  const tag = useTagDeIdioma();

  const [itens, setItens] = useState<AtendimentoPainel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(false);
  const [etapa, setEtapa] = useState<EtapaAndamento | null>(null);

  const rotuloDaEtapa: Record<EtapaAndamento, string> = {
    iniciou: t("Começou a conversa"),
    negociacao: t("Negociando"),
    proposta: t("Proposta / pagamento"),
  };

  // Recarrega a primeira página (inicial, "tentar de novo" e avisos ao vivo).
  // `silencioso`: não troca a lista por "carregando" e não mostra erro se já há dados.
  const carregar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) setCarregando(true);
    const pagina = await baixar(null);
    if (pagina) {
      setItens(soEmAndamento(pagina.itens));
      setCursor(pagina.proximoCursor);
      setErro(false);
    } else if (!silencioso) {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  const atualizarSilencioso = useCallback(() => carregar(true), [carregar]);
  useAtualizacaoAoVivo(["atendimento", "mensagem", "venda"], atualizarSilencioso);

  async function carregarMais() {
    if (!cursor) return;
    setCarregandoMais(true);
    const pagina = await baixar(cursor);
    if (pagina) {
      setItens((prev) => soEmAndamento([...prev, ...pagina.itens.filter((n) => !prev.some((p) => p.id === n.id))]));
      setCursor(pagina.proximoCursor);
    } else {
      setErro(true);
    }
    setCarregandoMais(false);
  }

  const contagem = contarPorEtapa(itens);
  const visiveis = filtrarPorEtapa(itens, etapa);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("Em andamento")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Clientes que estão conversando agora e ainda não escolheram a forma de pagamento.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ETAPAS_ANDAMENTO.map((e) => {
          const ativa = etapa === e;
          return (
            <button
              key={e}
              type="button"
              aria-pressed={ativa}
              onClick={() => setEtapa(ativa ? null : e)}
              className={`rounded-lg border bg-surface px-4 py-3 text-left transition-colors hover:bg-muted ${
                ativa ? "border-foreground" : "border-border"
              }`}
            >
              <span className="block text-sm text-muted-foreground">{rotuloDaEtapa[e]}</span>
              <span className="block text-2xl font-semibold tabular-nums">{carregando ? "—" : contagem[e]}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : erro && itens.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-base text-muted-foreground">
                {t("Não foi possível carregar os atendimentos em andamento agora.")}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void carregar(false)}>
                {t("Tentar de novo")}
              </Button>
            </div>
          ) : visiveis.length === 0 ? (
            <p className="px-6 py-10 text-center text-base text-muted-foreground">
              {t("Nenhum atendimento em andamento agora")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visiveis.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/app/integrations/treenity-bot/${a.id}`}
                    className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted sm:px-6"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words font-medium">
                        {a.cliente?.nome || a.cliente?.idFace || t("Cliente")}
                      </span>
                      {a.canal ? <Badge variant="neutral">{a.canal}</Badge> : null}
                      <Badge variant={varianteDaEtapa(a.statusFunil)}>{rotuloDaEtapa[etapaDoAndamento(a.statusFunil)]}</Badge>
                      {a.precisaAtencaoHumana ? (
                        <Badge variant="error">
                          <Warning size={12} aria-hidden /> {t("Precisa de atenção")}
                        </Badge>
                      ) : null}
                      <span className="ml-auto text-sm text-muted-foreground">
                        {haQuantoTempo(a.ultimaMensagem?.enviadoEm ?? a.atualizadoEm, locale)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-muted-foreground">
                        {previaDaMensagem(a.ultimaMensagem?.conteudo) || "—"}
                      </p>
                      {a.venda ? (
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {moeda(a.venda.total, tag)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {cursor && !carregando && !erro ? (
            <div className="flex justify-center border-t border-border p-4">
              <Button variant="secondary" disabled={carregandoMais} onClick={() => void carregarMais()}>
                {carregandoMais ? t("Carregando…") : t("Carregar mais")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
