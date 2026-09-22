/**
 * Treenity Bot — histórico de métricas (30 dias).
 *
 * Complementa a tela de conexão em /app/integrations/treenity-bot: aqui é
 * "os números do período" (mesmo grupo de Desempenho/Meta Ads), lá é status
 * da integração + o que precisa de atenção agora. Tabela em vez de gráfico
 * de propósito — é o mesmo padrão que Desempenho já usa (ver
 * app/app/metrics/_components/MetricsClient.tsx), e este repo não tem
 * biblioteca de gráfico instalada — os sparklines abaixo são SVG puro.
 *
 * Delta e sparkline são sempre CALCULADOS em cima de `dados.metricas` (1ª
 * metade do período vs 2ª metade) — nunca um número inventado; sem pelo
 * menos 2 dias de dado eles somem em vez de mostrar 0%/reta falsa.
 */

import Link from "next/link";
import { ChartLineUp } from "@/lib/ui/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAuthUser } from "@/lib/auth/server";
import { isConfigured } from "@/lib/treenity-bot/config";
import { carregarDadosTreenityBot, type DashboardMetrica } from "@/lib/treenity-bot/client";
import { deltaPercentual, pontosSparkline } from "@/lib/treenity-bot/formatacao";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { cn } from "@/lib/utils";

const SPARK_H = 44;

function Sparkline({ valores }: { valores: number[] }) {
  const pontos = pontosSparkline(valores, 100, SPARK_H);
  if (!pontos) return null;
  return (
    <svg viewBox={`0 0 100 ${SPARK_H}`} preserveAspectRatio="none" className="block h-12 w-full">
      <path d={pontos.area} className="fill-accent-soft" />
      <polyline
        points={pontos.linha}
        fill="none"
        className="stroke-accent"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={pontos.ultimoX} cy={pontos.ultimoY} r={2.6} className="fill-accent" />
    </svg>
  );
}

function DeltaBadge({
  valor,
  idioma,
}: {
  valor: number | null;
  idioma: ReturnType<typeof normalizarIdioma>;
}) {
  if (valor === null) return null;
  const sinal = valor > 0 ? "+" : valor < 0 ? "−" : "";
  const abs = Math.abs(valor).toLocaleString(tagDeIdioma(idioma), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
        valor > 0 && "bg-success-bg text-success-fg",
        valor < 0 && "bg-error-bg text-error-fg",
        valor === 0 && "bg-muted text-muted-foreground",
      )}
    >
      {sinal}
      {abs}%
    </span>
  );
}

function StatCard({
  label,
  valor,
  serie,
  delta,
  idioma,
}: {
  label: string;
  valor: string;
  serie: number[];
  delta: number | null;
  idioma: ReturnType<typeof normalizarIdioma>;
}) {
  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <DeltaBadge valor={delta} idioma={idioma} />
      </div>
      <span className="text-4xl font-semibold tracking-tight tabular-nums">{valor}</span>
      <Sparkline valores={serie} />
    </Card>
  );
}

export default async function TreenityBotAnalisePage() {
  const user = await loadAuthUser();
  const idioma = normalizarIdioma(user?.locale ?? null);
  const configured = isConfigured();

  const dados =
    configured && user
      ? await carregarDadosTreenityBot({ email: user.email, nome: user.full_name ?? user.email })
      : null;

  const moeda = (valor: number) =>
    valor.toLocaleString(tagDeIdioma(idioma), { style: "currency", currency: "BRL" });

  const metricas: DashboardMetrica[] = dados?.metricas ?? [];
  // A API devolve mais recente primeiro; sparkline e delta precisam de ordem
  // cronológica (mais antigo → mais recente) pra "crescendo" apontar pro lado
  // certo. A tabela abaixo usa `metricas` (ordem da API) sem tocar nisso.
  const metricasCronologicas = [...metricas].sort((a, b) =>
    a.data_referencia.localeCompare(b.data_referencia),
  );
  const faturamentoSerie = metricasCronologicas.map((m) => m.faturamento_total);
  const atendimentosSerie = metricasCronologicas.map((m) => m.total_atendimentos);
  const clientesSerie = metricasCronologicas.map((m) => m.total_clientes);
  const ticketSerie = metricasCronologicas.map((m) =>
    m.total_atendimentos > 0 ? m.faturamento_total / m.total_atendimentos : 0,
  );

  const totalFaturamento = faturamentoSerie.reduce((a, b) => a + b, 0);
  const totalAtendimentos = atendimentosSerie.reduce((a, b) => a + b, 0);
  const totalClientes = clientesSerie.reduce((a, b) => a + b, 0);
  const ticketMedio = totalAtendimentos > 0 ? totalFaturamento / totalAtendimentos : 0;
  const maxFaturamento = Math.max(...faturamentoSerie, 1);

  return (
    <div className="flex w-full flex-col gap-8 p-6 lg:p-8">
      <header className="flex items-center gap-5">
        <div className="rounded-lg border border-border bg-surface p-4">
          <ChartLineUp size={34} weight="duotone" className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {traduzir("Treenity Bot — histórico", idioma)}
          </h1>
          <p className="mt-1.5 text-base text-muted-foreground">
            {traduzir("Faturamento, clientes e atendimentos dos últimos 30 dias.", idioma)}
          </p>
        </div>
      </header>

      {!dados ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{traduzir("Sem dados", idioma)}</CardTitle>
            <CardDescription>
              {traduzir(
                "Configure a integração em Canais › Treenity Bot para ver o histórico aqui.",
                idioma,
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : metricas.length === 0 ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{traduzir("Sem métricas consolidadas ainda", idioma)}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={traduzir("Faturamento no período", idioma)}
              valor={moeda(totalFaturamento)}
              serie={faturamentoSerie}
              delta={deltaPercentual(faturamentoSerie)}
              idioma={idioma}
            />
            <StatCard
              label={traduzir("Atendimentos no período", idioma)}
              valor={totalAtendimentos.toLocaleString(tagDeIdioma(idioma))}
              serie={atendimentosSerie}
              delta={deltaPercentual(atendimentosSerie)}
              idioma={idioma}
            />
            <StatCard
              label={traduzir("Clientes no período", idioma)}
              valor={totalClientes.toLocaleString(tagDeIdioma(idioma))}
              serie={clientesSerie}
              delta={deltaPercentual(clientesSerie)}
              idioma={idioma}
            />
            <StatCard
              label={traduzir("Ticket médio", idioma)}
              valor={moeda(ticketMedio)}
              serie={ticketSerie}
              delta={deltaPercentual(ticketSerie)}
              idioma={idioma}
            />
          </div>

          <Card>
            {/* Fundo do CANVAS (não `bg-surface`, que é branco igual ao Card):
                sem ele, cada linha vira uma pílula branca sobre um Card branco. */}
            <CardContent className="rounded-b-lg bg-bg p-[var(--density-gap)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-4 pl-6 text-sm">{traduzir("Data", idioma)}</TableHead>
                    <TableHead className="py-4 text-right text-sm">
                      {traduzir("Clientes", idioma)}
                    </TableHead>
                    <TableHead className="py-4 text-right text-sm">
                      {traduzir("Atendimentos", idioma)}
                    </TableHead>
                    <TableHead className="py-4 pr-6 text-right text-sm">
                      {traduzir("Faturamento", idioma)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricas.map((m) => (
                    <TableRow key={m.data_referencia}>
                      <TableCell className="py-4 pl-6 text-base">
                        {new Date(`${m.data_referencia}T00:00:00`).toLocaleDateString(
                          tagDeIdioma(idioma),
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-right text-base tabular-nums">
                        {m.total_clientes}
                      </TableCell>
                      <TableCell className="py-4 text-right text-base tabular-nums">
                        {m.total_atendimentos}
                      </TableCell>
                      <TableCell className="py-4 pr-6 text-right text-base tabular-nums">
                        <div className="flex items-center justify-end gap-3">
                          <span className="h-2.5 w-28 overflow-hidden rounded-full bg-accent-soft">
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{
                                width: `${Math.max(4, (m.faturamento_total / maxFaturamento) * 100)}%`,
                              }}
                            />
                          </span>
                          <span className="min-w-[110px] font-medium">
                            {moeda(m.faturamento_total)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Link
        href="/app/integrations/treenity-bot"
        className="inline-block text-base font-medium text-muted-foreground hover:text-foreground hover:underline"
      >
        {traduzir("Ver conexão e conversas precisando de atenção →", idioma)}
      </Link>
    </div>
  );
}
