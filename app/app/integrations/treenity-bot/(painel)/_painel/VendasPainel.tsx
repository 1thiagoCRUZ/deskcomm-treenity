"use client";

/**
 * Vendas do bot, na Visão geral do Treenity Bot — só para ADMIN.
 *
 * Os dados chegam da página (servidor) na primeira pintura; filtros e "carregar
 * mais" buscam em `/api/treenity-bot/vendas`, que confere o admin de novo no
 * servidor. Somente leitura. O `resumo` (cartões) cobre TODAS as vendas do
 * filtro, não só as linhas já carregadas.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { PaginaDeVendas, ResumoVendas, VendaPainel } from "@/lib/treenity-bot/client";
import {
  assinarEstadoDoPainel,
  ouvirEventosDoPainel,
  painelEstaAoVivo,
} from "@/lib/treenity-bot/painel-eventos";
import { dataHora, moeda, varianteDoStatusDaVenda } from "./formatacao-painel";

const TODOS = "todos";
const AGRUPAR_AVISOS_MS = 400;
const POLLING_DE_RESERVA_MS = 30 * 1000;
const CANAIS_CONHECIDOS = ["Instagram", "Facebook", "WhatsApp"];

interface Filtros {
  status: string;
  canal: string;
  desde: string;
  ate: string;
}

const FILTROS_VAZIOS: Filtros = { status: TODOS, canal: TODOS, desde: "", ate: "" };

/** Uma página do servidor. `null` = falha. Fora do componente: não depende de estado. */
async function baixar(f: Filtros, cursor: string | null): Promise<PaginaDeVendas | null> {
  try {
    const params = new URLSearchParams();
    if (f.status !== TODOS) params.set("status", f.status);
    if (f.canal !== TODOS) params.set("canal", f.canal);
    if (f.desde) params.set("desde", f.desde);
    if (f.ate) params.set("ate", f.ate);
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/treenity-bot/vendas?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).data as PaginaDeVendas;
  } catch {
    return null;
  }
}

/** Junta por id (o mais novo vence) e ordena pela data da venda, da mais recente pra mais antiga. */
function mesclarVendas(atuais: VendaPainel[], novas: VendaPainel[]): VendaPainel[] {
  const porId = new Map(atuais.map((v) => [v.id_venda, v]));
  for (const n of novas) porId.set(n.id_venda, n);
  return [...porId.values()].sort((a, b) => b.data_venda.localeCompare(a.data_venda));
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 px-8 py-6">
        <span className="text-sm text-muted-foreground">{rotulo}</span>
        <span className="text-3xl font-semibold tracking-tight tabular-nums lg:text-4xl">
          {valor}
        </span>
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 text-right font-medium break-words">{children}</span>
    </div>
  );
}

export function VendasPainel({ inicial }: { inicial: PaginaDeVendas | null }) {
  const t = useT();
  const idioma = useIdioma();
  const tag = tagDeIdioma(idioma);

  const [itens, setItens] = useState<VendaPainel[]>(inicial?.itens ?? []);
  const [resumo, setResumo] = useState<ResumoVendas | null>(inicial?.resumo ?? null);
  const [cursor, setCursor] = useState<string | null>(inicial?.proximoCursor ?? null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [statusConhecidos, setStatusConhecidos] = useState<string[]>(
    Array.from(new Set(["Aguardando Pagamento", ...(inicial?.itens ?? []).map((v) => v.status)])),
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(inicial === null);
  const [aberta, setAberta] = useState<VendaPainel | null>(null);
  const filtrosRef = useRef(filtros);

  useEffect(() => {
    filtrosRef.current = filtros;
  }, [filtros]);

  // "Ao vivo" só quando o bot confirmou que este socket está na sala do painel.
  const aoVivo = useSyncExternalStore(assinarEstadoDoPainel, painelEstaAoVivo, () => false);

  // Busca a primeira página de novo, sem piscar nem avisar erro, e mescla com o
  // que já está na tela (quem carregou "mais" não perde as páginas seguintes).
  const atualizarSilencioso = useCallback(async () => {
    const f = filtrosRef.current;
    const nova = await baixar(f, null);
    if (!nova || filtrosRef.current !== f) return;
    setItens((prev) => mesclarVendas(prev, nova.itens));
    setResumo(nova.resumo);
    setCursor((atual) => atual ?? nova.proximoCursor);
    setStatusConhecidos((prev) =>
      Array.from(new Set([...prev, ...nova.itens.map((v) => v.status)])),
    );
    setErro(false);
  }, []);

  // Ao vivo, uma venda nova/alterada (ou um "reconectado") atualiza na hora.
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    const parar = ouvirEventosDoPainel((evento) => {
      if (evento.tipo !== "venda" && evento.tipo !== "reconectado") return;
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void atualizarSilencioso(), AGRUPAR_AVISOS_MS);
    });
    return () => {
      parar();
      if (espera) clearTimeout(espera);
    };
  }, [atualizarSilencioso]);

  // Reserva: sem tempo real (usuário sem acesso ao vivo, bot antigo), atualiza por
  // polling. Ao vivo, os avisos acima bastam.
  useEffect(() => {
    if (aoVivo) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void atualizarSilencioso();
    }, POLLING_DE_RESERVA_MS);
    return () => clearInterval(timer);
  }, [aoVivo, atualizarSilencioso]);

  async function buscar(f: Filtros, cursorAtual: string | null) {
    setCarregando(true);
    setErro(false);
    try {
      const nova = await baixar(f, cursorAtual);
      if (!nova) throw new Error("falha ao buscar vendas");

      setItens((prev) => (cursorAtual ? [...prev, ...nova.itens] : nova.itens));
      setResumo(nova.resumo);
      setCursor(nova.proximoCursor);
      setStatusConhecidos((prev) =>
        Array.from(new Set([...prev, ...nova.itens.map((v) => v.status)])),
      );
    } catch {
      setErro(true);
      toast.error(t("Não foi possível carregar as vendas agora."));
    } finally {
      setCarregando(false);
    }
  }

  function aplicar(parcial: Partial<Filtros>) {
    const novo = { ...filtros, ...parcial };
    setFiltros(novo);
    void buscar(novo, null);
  }

  const temFiltro = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">{t("Vendas")}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao rotulo={t("Vendas")} valor={resumo ? String(resumo.quantidade) : "—"} />
        <Cartao
          rotulo={t("Faturamento")}
          valor={resumo ? moeda(resumo.faturamento_total, tag) : "—"}
        />
        <Cartao rotulo={t("Frete total")} valor={resumo ? moeda(resumo.frete_total, tag) : "—"} />
        <Cartao rotulo={t("Ticket médio")} valor={resumo ? moeda(resumo.ticket_medio, tag) : "—"} />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>{t("Status")}</Label>
              <Select value={filtros.status} onValueChange={(v) => aplicar({ status: v })}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{t("Todos")}</SelectItem>
                  {statusConhecidos.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Canal")}</Label>
              <Select value={filtros.canal} onValueChange={(v) => aplicar({ canal: v })}>
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
              <Label htmlFor="vendas-desde">{t("De")}</Label>
              <Input
                id="vendas-desde"
                type="date"
                className="w-44"
                value={filtros.desde}
                onChange={(e) => aplicar({ desde: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vendas-ate">{t("Até (exclusivo)")}</Label>
              <Input
                id="vendas-ate"
                type="date"
                className="w-44"
                value={filtros.ate}
                onChange={(e) => aplicar({ ate: e.target.value })}
              />
            </div>
            {temFiltro ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setFiltros(FILTROS_VAZIOS);
                  void buscar(FILTROS_VAZIOS, null);
                }}
              >
                {t("Limpar filtros")}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {erro ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-base text-muted-foreground">
                {t("Não foi possível carregar as vendas agora.")}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void buscar(filtros, null)}>
                {t("Tentar de novo")}
              </Button>
            </div>
          ) : itens.length === 0 ? (
            <p className="px-6 py-10 text-center text-base text-muted-foreground">
              {carregando ? t("Carregando…") : t("Nenhuma venda encontrada.")}
            </p>
          ) : (
            // Fundo do CANVAS (não `bg-surface`, que é branco igual ao Card): sem
            // ele, cada linha vira uma pílula branca sobre um Card branco — a
            // borda de 1px é a ÚNICA coisa entre "listagem" e "tabela lisa".
            <div className="rounded-b-lg bg-bg p-[var(--density-gap)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">{t("Data")}</TableHead>
                    <TableHead>{t("Cliente")}</TableHead>
                    <TableHead>{t("Canal")}</TableHead>
                    <TableHead>{t("Itens")}</TableHead>
                    <TableHead className="text-right">{t("Frete")}</TableHead>
                    <TableHead className="text-right">{t("Total")}</TableHead>
                    <TableHead className="pr-6">{t("Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((venda) => (
                    <TableRow
                      key={venda.id_venda}
                      className="cursor-pointer"
                      onClick={() => setAberta(venda)}
                    >
                      <TableCell className="pl-6 whitespace-nowrap">
                        {dataHora(venda.data_venda)}
                      </TableCell>
                      <TableCell className="font-medium">{venda.cliente}</TableCell>
                      <TableCell>
                        {venda.canal ? <Badge variant="neutral">{venda.canal}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{venda.itens || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moeda(venda.frete, tag)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {moeda(venda.total, tag)}
                      </TableCell>
                      <TableCell className="pr-6">
                        <Badge variant={varianteDoStatusDaVenda(venda.status)}>
                          {venda.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {cursor && !erro ? (
            <div className="flex justify-center border-t border-border p-4">
              <Button
                variant="secondary"
                disabled={carregando}
                onClick={() => void buscar(filtros, cursor)}
              >
                {carregando ? t("Carregando…") : t("Carregar mais")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={aberta !== null} onOpenChange={(aberto) => !aberto && setAberta(null)}>
        <DialogContent className="max-w-xl">
          {aberta ? (
            <>
              <DialogHeader>
                <DialogTitle>{aberta.cliente}</DialogTitle>
                <DialogDescription>
                  {dataHora(aberta.data_venda)}
                  {aberta.canal ? ` · ${aberta.canal}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div>
                  <h3 className="mb-1 text-sm font-semibold">{t("Itens do pedido")}</h3>
                  <p className="text-sm break-words whitespace-pre-wrap">{aberta.itens || "—"}</p>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold">{t("Valores")}</h3>
                  <Linha rotulo={t("Produtos")}>{moeda(aberta.valor_produtos, tag)}</Linha>
                  <Linha rotulo={t("Frete")}>{moeda(aberta.frete, tag)}</Linha>
                  <Linha rotulo={t("Total")}>{moeda(aberta.total, tag)}</Linha>
                  <Linha rotulo={t("Status")}>
                    <Badge variant={varianteDoStatusDaVenda(aberta.status)}>{aberta.status}</Badge>
                  </Linha>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold">{t("Entrega")}</h3>
                  <Linha rotulo={t("Transportadora")}>{aberta.transportadora ?? "—"}</Linha>
                  <Linha rotulo={t("CEP")}>{aberta.cep ?? "—"}</Linha>
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold">{t("Cliente e atendimento")}</h3>
                  <Linha rotulo={t("Identificador")}>
                    {aberta.cliente_detalhes.id_face ?? "—"}
                  </Linha>
                  <Linha rotulo={t("Cliente desde")}>
                    {dataHora(aberta.cliente_detalhes.cliente_desde)}
                  </Linha>
                  <Linha rotulo={t("Etapa do funil")}>
                    {aberta.atendimento_detalhes.status_funil ?? "—"}
                  </Linha>
                  <Linha rotulo={t("Nota da IA")}>
                    {aberta.atendimento_detalhes.qualidade_ia ?? "—"}
                  </Linha>
                  {aberta.cliente_detalhes.resumo ? (
                    <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {aberta.cliente_detalhes.resumo}
                    </p>
                  ) : null}
                </div>

                {aberta.atendimento_detalhes.id ? (
                  <Button asChild variant="secondary" className="w-full">
                    <Link href={`/app/integrations/treenity-bot/${aberta.atendimento_detalhes.id}`}>
                      {t("Ver a conversa deste atendimento")}
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
