"use client";

/**
 * Conversas do bot (histórico de TODOS os atendimentos), na aba "Conversas" do
 * Treenity Bot — só para ADMIN. Busca em `/api/treenity-bot/atendimentos`, que
 * confere o admin no servidor. Somente leitura; clicar numa linha abre a
 * transcrição (`/app/integrations/treenity-bot/[atendimentoId]`).
 *
 * Lógica (estado, busca, paginação) aqui; visual em classes simples.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { AtendimentoPainel, PaginaDeAtendimentos } from "@/lib/treenity-bot/client";
import { diaParaExibir } from "@/lib/treenity-bot/periodo";
import { dataHora, moeda, previaDaMensagem, unirSemRepetir, varianteDaEtapa } from "./formatacao-painel";
import {
  CampoDeBusca,
  ChipsDosFiltros,
  SeletorDePeriodo,
  useUltimoPedido,
  useValorComAtraso,
  type ChipDeFiltro,
} from "./FiltrosDoPainel";

const TODOS = "todos";
const CANAIS_CONHECIDOS = ["Instagram", "Facebook", "WhatsApp"];
// Etapas do bate-papo, na ordem em que o bot as avança.
const ETAPAS_BASE = ["Iniciou", "Em Negociacao", "Proposta", "Fechada"];
const LIMITE = 30;

interface Filtros {
  busca: string;
  desde: string;
  ate: string;
  canal: string;
  etapa: string;
  comVenda: string; // todos | sim | nao
}

const FILTROS_VAZIOS: Filtros = { busca: "", desde: "", ate: "", canal: TODOS, etapa: TODOS, comVenda: TODOS };

/** Uma página do servidor. `null` = falha. */
async function baixar(f: Filtros, cursor: string | null): Promise<PaginaDeAtendimentos | null> {
  try {
    const params = new URLSearchParams({ limit: String(LIMITE) });
    if (f.busca.trim()) params.set("busca", f.busca.trim());
    if (f.desde) params.set("desde", f.desde);
    if (f.ate) params.set("ate", f.ate);
    if (f.canal !== TODOS) params.set("canal", f.canal);
    if (f.etapa !== TODOS) params.set("etapa", f.etapa);
    if (f.comVenda !== TODOS) params.set("com_venda", f.comVenda === "sim" ? "true" : "false");
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/treenity-bot/atendimentos?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).data as PaginaDeAtendimentos;
  } catch {
    return null;
  }
}

function LinhaDeConversa({ item, tag }: { item: AtendimentoPainel; tag: string }) {
  const t = useT();
  const ultima = item.ultimaMensagem ? previaDaMensagem(item.ultimaMensagem.conteudo) : "";
  return (
    <li>
      <Link
        href={`/app/integrations/treenity-bot/${item.id}`}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 hover:border-accent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-base font-semibold">
            {item.cliente?.nome || item.cliente?.idFace || t("Cliente sem nome")}
          </span>
          {item.canal ? <Badge variant="neutral">{item.canal}</Badge> : null}
          {item.statusFunil ? <Badge variant={varianteDaEtapa(item.statusFunil)}>{item.statusFunil}</Badge> : null}
          {item.venda ? (
            <Badge variant="success">
              {t("Venda")}: {moeda(item.venda.total, tag)}
            </Badge>
          ) : null}
          <span className="ml-auto text-sm text-muted-foreground">
            {dataHora(item.atualizadoEm ?? item.criadoEm)}
          </span>
        </div>
        {item.trecho ? (
          <p className="text-sm break-words">
            <span className="text-muted-foreground">{t("Trecho encontrado")}: </span>
            {previaDaMensagem(item.trecho, 160)}
          </p>
        ) : null}
        <p className="text-sm break-words text-muted-foreground">
          {ultima || t("Sem mensagens")}
        </p>
        <span className="text-xs text-muted-foreground">
          {item.totalMensagens} {item.totalMensagens === 1 ? t("mensagem") : t("mensagens")}
        </span>
      </Link>
    </li>
  );
}

export function ConversasPainel() {
  const t = useT();
  const idioma = useIdioma();
  const tag = tagDeIdioma(idioma);

  const [itens, setItens] = useState<AtendimentoPainel[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [etapas, setEtapas] = useState<string[]>(ETAPAS_BASE);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [textoBusca, setTextoBusca] = useState("");
  const buscaAtrasada = useValorComAtraso(textoBusca);
  const pedido = useUltimoPedido();

  const buscar = useCallback(
    async (f: Filtros, cursorAtual: string | null) => {
      const meu = pedido.novo();
      setCarregando(true);
      setErro(false);
      const nova = await baixar(f, cursorAtual);
      if (!pedido.ehOAtual(meu)) return; // chegou uma busca mais nova: esta resposta é velha
      setCarregando(false);
      if (!nova) {
        setErro(true);
        toast.error(t("Não foi possível carregar as conversas agora."));
        return;
      }
      setItens((prev) => (cursorAtual ? [...prev, ...nova.itens] : nova.itens));
      setCursor(nova.proximoCursor);
      setEtapas((prev) => unirSemRepetir(prev, nova.itens.map((i) => i.statusFunil)));
    },
    [t, pedido],
  );

  // Primeira página ao abrir a aba.
  useEffect(() => {
    void buscar(FILTROS_VAZIOS, null);
  }, [buscar]);

  function aplicar(parcial: Partial<Filtros>) {
    const novo = { ...filtros, ...parcial };
    setFiltros(novo);
    void buscar(novo, null);
  }

  // A busca só dispara depois de 400ms sem digitar.
  useEffect(() => {
    if (buscaAtrasada.trim() === filtros.busca.trim()) return;
    aplicar({ busca: buscaAtrasada });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAtrasada]);

  function limparTudo() {
    setTextoBusca("");
    setFiltros(FILTROS_VAZIOS);
    void buscar(FILTROS_VAZIOS, null);
  }

  const chips: ChipDeFiltro[] = [];
  if (filtros.busca.trim()) {
    chips.push({
      chave: "busca",
      texto: `${t("Busca")}: ${filtros.busca.trim()}`,
      remover: () => {
        setTextoBusca("");
        aplicar({ busca: "" });
      },
    });
  }
  if (filtros.canal !== TODOS) {
    chips.push({ chave: "canal", texto: `${t("Canal")}: ${filtros.canal}`, remover: () => aplicar({ canal: TODOS }) });
  }
  if (filtros.etapa !== TODOS) {
    chips.push({ chave: "etapa", texto: `${t("Etapa")}: ${filtros.etapa}`, remover: () => aplicar({ etapa: TODOS }) });
  }
  if (filtros.comVenda !== TODOS) {
    chips.push({
      chave: "comVenda",
      texto: filtros.comVenda === "sim" ? t("Com venda") : t("Sem venda"),
      remover: () => aplicar({ comVenda: TODOS }),
    });
  }
  if (filtros.desde || filtros.ate) {
    const texto =
      filtros.desde && filtros.ate
        ? filtros.desde === filtros.ate
          ? diaParaExibir(filtros.desde)
          : `${diaParaExibir(filtros.desde)} – ${diaParaExibir(filtros.ate)}`
        : filtros.desde
          ? `${t("A partir de")} ${diaParaExibir(filtros.desde)}`
          : `${t("Até")} ${diaParaExibir(filtros.ate)}`;
    chips.push({ chave: "periodo", texto: `${t("Período")}: ${texto}`, remover: () => aplicar({ desde: "", ate: "" }) });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{t("Conversas")}</h2>

      <Card>
        <CardHeader className="gap-4">
          <CampoDeBusca
            id="conversas-busca"
            valor={textoBusca}
            onChange={setTextoBusca}
            rotulo={t("Buscar por nome, telefone ou texto da conversa")}
          />
          <SeletorDePeriodo
            prefixoDeId="conversas"
            periodo={{ desde: filtros.desde, ate: filtros.ate }}
            onChange={(p) => aplicar({ desde: p.desde, ate: p.ate })}
          />
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full space-y-1.5 sm:w-48">
              <Label>{t("Canal")}</Label>
              <Select value={filtros.canal} onValueChange={(v) => aplicar({ canal: v })}>
                <SelectTrigger className="w-full">
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
            <div className="w-full space-y-1.5 sm:w-48">
              <Label>{t("Etapa")}</Label>
              <Select value={filtros.etapa} onValueChange={(v) => aplicar({ etapa: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t("Todas")}</SelectItem>
                  {etapas.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label>{t("Venda")}</Label>
              <Select value={filtros.comVenda} onValueChange={(v) => aplicar({ comVenda: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t("Todas")}</SelectItem>
                  <SelectItem value="sim">{t("Com venda")}</SelectItem>
                  <SelectItem value="nao">{t("Sem venda")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ChipsDosFiltros chips={chips} onLimpar={limparTudo} />
        </CardHeader>

        <CardContent className="space-y-3">
          {erro ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-base text-muted-foreground">{t("Não foi possível carregar as conversas agora.")}</p>
              <Button variant="secondary" size="sm" onClick={() => void buscar(filtros, null)}>
                {t("Tentar de novo")}
              </Button>
            </div>
          ) : carregando && itens.length === 0 ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : itens.length === 0 ? (
            <p className="px-6 py-10 text-center text-base text-muted-foreground">
              {t("Nenhuma conversa encontrada.")}
            </p>
          ) : (
            <ul className="space-y-3">
              {itens.map((item) => (
                <LinhaDeConversa key={item.id} item={item} tag={tag} />
              ))}
            </ul>
          )}

          {cursor && !erro ? (
            <div className="flex justify-center pt-1">
              <Button variant="secondary" disabled={carregando} onClick={() => void buscar(filtros, cursor)}>
                {carregando ? t("Carregando…") : t("Carregar mais")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
