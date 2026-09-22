/**
 * Funil de leads do Treenity Bot.
 *
 * Cada atendimento que já virou negociação de verdade (chegou em "Proposta"
 * ou tem uma venda vinculada) vira um lead num funil dedicado — as mesmas 4
 * etapas do bot (Iniciou / Em Negociação / Proposta / Fechada) mais uma quinta,
 * "Perdida", que só a autocura preenche (o bot não tem esse conceito).
 *
 * Reaproveita os handlers de verdade de `/api/v1/leads` (create/move) e
 * `encerraDemanda` (ganhar/perder) em vez de escrever direto em `crm_leads` —
 * mesma trilha de atividade, mesmo `emit_event`, mesma regra que a IA nativa
 * usa para fechar negócio. O ator é `webhook_source`, o mesmo tipo que a
 * automação `create_or_move_lead` já usa para escritas sem usuário logado.
 *
 * Idempotente por `(organization_id, source='treenity_bot', external_id=<id
 * do atendimento>)` — índice único que já existe no baseline
 * (`uniq_crm_leads_org_source_external`).
 *
 * ─── Autocura de "perdido" ───────────────────────────────────────────────
 * O bot não marca atendimento como perdido/cancelado — um cliente que some
 * ficaria aberto no funil pra sempre. A cada atendimento tocado gravamos a
 * última atividade em `custom_fields.treenity_bot_atividade_em`; a varredura
 * fecha como "lost" (motivo `no_response`) todo lead aberto cuja atividade
 * está mais velha que `TREENITY_BOT_FUNIL_PERDIDO_DIAS` (padrão 7).
 *
 * ─── Configuração ────────────────────────────────────────────────────────────
 * Por organização, em `organizations.settings.treenity_bot.funil` — ligar,
 * desligar, "desde" e os dias até "perdido" são decisão do cliente, pela tela
 * (ver lib/treenity-bot/configuracao.ts). Organização sem isso ligado não
 * cria nenhum lead.
 */
import { createLeadHandler, moveLeadHandler, updateLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgsComFunilAtivo, type OrgComFunilAtivo } from "./configuracao";
import { carregarAtendimentosTreenityBot, type AtendimentoPainel } from "./client";

const SOURCE = "treenity_bot";
const SLUG_DO_FUNIL = "treenity-bot";
const CAMPO_ATIVIDADE = "treenity_bot_atividade_em";
const MAX_PAGINAS = 5;

const ETAPAS = ["Iniciou", "Em Negociacao", "Proposta", "Fechada"] as const;
type Etapa = (typeof ETAPAS)[number];

const NOME_DA_ETAPA: Record<Etapa, string> = {
  Iniciou: "Iniciou",
  "Em Negociacao": "Em Negociação",
  Proposta: "Proposta",
  Fechada: "Fechada",
};
const COR_DA_ETAPA: Record<Etapa, string> = {
  Iniciou: "#94a3b8",
  "Em Negociacao": "#60a5fa",
  Proposta: "#f59e0b",
  Fechada: "#22c55e",
};

const ATOR = { type: "webhook_source", id: "treenity-bot" } as const;

// ─── Bootstrap: garante o funil dedicado (idempotente) ──────────────────────

interface FunilPronto {
  pipelineId: string;
  stagePorEtapa: Record<Etapa, string>;
  stagePerdida: string;
}

async function garantirFunil(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<FunilPronto> {
  const { data: existente } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", SLUG_DO_FUNIL)
    .maybeSingle();

  let pipelineId = (existente as { id: string } | null)?.id ?? null;

  if (!pipelineId) {
    const { data: criado, error } = await admin
      .from("crm_pipelines")
      .insert({
        organization_id: orgId,
        name: "Treenity Bot",
        slug: SLUG_DO_FUNIL,
        description: "Negociações abertas pelo bot de vendas (WhatsApp/Facebook/Instagram).",
      })
      .select("id")
      .single();
    if (error || !criado) throw new Error(`falha ao criar o funil do Treenity Bot: ${error?.message}`);
    pipelineId = (criado as { id: string }).id;
  }

  const { data: stages } = await admin
    .from("crm_stages")
    .select("id, slug")
    .eq("organization_id", orgId)
    .eq("pipeline_id", pipelineId);

  const porSlug = new Map(((stages ?? []) as { id: string; slug: string }[]).map((s) => [s.slug, s.id]));

  const definicoes = [
    ...ETAPAS.map((etapa, i) => ({
      slug: etapa.toLowerCase().replace(/\s+/g, "-"),
      name: NOME_DA_ETAPA[etapa],
      position: (i + 1) * 1000,
      color: COR_DA_ETAPA[etapa],
      is_won: etapa === "Fechada",
      is_lost: false,
    })),
    // Só a autocura preenche esta — o bot não tem "perdida" no vocabulário dele.
    { slug: "perdida", name: "Perdida", position: 5000, color: "#94a3b8", is_won: false, is_lost: true },
  ];

  for (const def of definicoes) {
    if (porSlug.has(def.slug)) continue;
    const { data: criado, error } = await admin
      .from("crm_stages")
      .insert({ organization_id: orgId, pipeline_id: pipelineId, ...def })
      .select("id")
      .single();
    if (error || !criado) throw new Error(`falha ao criar a etapa "${def.name}" do funil do Treenity Bot: ${error?.message}`);
    porSlug.set(def.slug, (criado as { id: string }).id);
  }

  const stagePorEtapa = Object.fromEntries(
    ETAPAS.map((etapa) => [etapa, porSlug.get(etapa.toLowerCase().replace(/\s+/g, "-"))!]),
  ) as Record<Etapa, string>;

  return { pipelineId, stagePorEtapa, stagePerdida: porSlug.get("perdida")! };
}

// ─── Busca no bot: atendimentos que já viraram negociação ───────────────────

async function buscarQualificados(desde: string): Promise<Map<string, AtendimentoPainel>> {
  const usuario = { email: "treenity-funil@sistema.interno", nome: "Sincronismo de Funil" };
  const porId = new Map<string, AtendimentoPainel>();

  for (const filtroBase of [{ etapa: "Proposta" }, { etapa: "Fechada" }, { comVenda: true }] as const) {
    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const resposta = await carregarAtendimentosTreenityBot(usuario, { ...filtroBase, desde, cursor, limit: 100 });
      if (!resposta) break; // bot fora do ar: segue com o que já tem, tenta de novo na próxima
      for (const item of resposta.itens) porId.set(item.id, item);
      if (!resposta.proximoCursor) break;
      cursor = resposta.proximoCursor;
    }
  }
  return porId;
}

// ─── Sincronismo ─────────────────────────────────────────────────────────────

export interface ResultadoDoFunil {
  ativo: boolean;
  organizacoes: number;
  criados: number;
  movidos: number;
  fechados: number;
  perdidosAutomaticamente: number;
}

function etapaConhecida(statusFunil: string | null): Etapa {
  return (ETAPAS as readonly string[]).includes(statusFunil ?? "") ? (statusFunil as Etapa) : "Em Negociacao";
}

function tituloDoLead(a: AtendimentoPainel): string {
  const nome = a.cliente?.nome || "Cliente";
  return `${nome}${a.canal ? ` (${a.canal})` : ""}`.slice(0, 200);
}

async function sincronizarOrg(
  admin: ReturnType<typeof createAdminClient>,
  org: OrgComFunilAtivo,
): Promise<{ criados: number; movidos: number; fechados: number; perdidosAutomaticamente: number }> {
  const funil = await garantirFunil(admin, org.orgId);
  const atendimentos = await buscarQualificados(org.desde);

  let criados = 0;
  let movidos = 0;
  let fechados = 0;

  for (const atendimento of atendimentos.values()) {
    const etapa = etapaConhecida(atendimento.statusFunil);
    const stageAlvo = funil.stagePorEtapa[etapa];
    const valueCents = atendimento.venda ? Math.round(atendimento.venda.total * 100) : null;
    const atividadeEm = atendimento.atualizadoEm ?? atendimento.criadoEm ?? new Date().toISOString();

    const ctx: HandlerCtx = { organization_id: org.orgId, actor: ATOR, requestId: `treenity-bot:funil:${atendimento.id}` };

    const { data: existente } = await admin
      .from("crm_leads")
      .select("*")
      .eq("organization_id", org.orgId)
      .eq("source", SOURCE)
      .eq("external_id", atendimento.id)
      .maybeSingle();

    try {
      if (!existente) {
        const lead = await createLeadHandler(admin, ctx, {
          pipeline_id: funil.pipelineId,
          stage_id: stageAlvo,
          title: tituloDoLead(atendimento),
          value_cents: valueCents,
          currency: "BRL",
          tags: [],
          source: SOURCE,
          external_id: atendimento.id,
          custom_fields: { [CAMPO_ATIVIDADE]: atividadeEm },
        });
        criados++;
        if (etapa === "Fechada") {
          await encerraDemanda(admin, ctx, { leadId: (lead as { id: string }).id, desfecho: "won" });
          fechados++;
        }
        continue;
      }

      const lead = existente as {
        id: string;
        status: string;
        stage_id: string;
        updated_at: string;
        value_cents: number | null;
      };
      if (lead.status !== "open") continue; // já fechado (ganho ou perdido) — encerrar é definitivo

      if (etapa === "Fechada") {
        await encerraDemanda(admin, ctx, { leadId: lead.id, desfecho: "won" });
        fechados++;
      } else if (lead.stage_id !== stageAlvo) {
        await moveLeadHandler(admin, ctx, lead.id, {
          to_stage_id: stageAlvo,
          expected_updated_at: lead.updated_at,
        });
        movidos++;
      }

      if (lead.value_cents !== valueCents) {
        await updateLeadHandler(admin, ctx, lead.id, { value_cents: valueCents });
      }
      // Atividade sempre atualizada (mesmo sem mudar etapa) — é o que a
      // autocura usa pra saber que o cliente ainda está conversando.
      await updateLeadHandler(admin, ctx, lead.id, { custom_fields: { [CAMPO_ATIVIDADE]: atividadeEm } });
    } catch (error) {
      logger.error("[treenity-funil] falha ao sincronizar atendimento", {
        org: org.orgId,
        atendimento: atendimento.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const perdidosAutomaticamente = await autocurarPerdidos(admin, org.orgId, org.perdidoDias);
  return { criados, movidos, fechados, perdidosAutomaticamente };
}

export async function sincronizarFunilDoTreenityBot(): Promise<ResultadoDoFunil> {
  const admin = createAdminClient();
  const orgs = await orgsComFunilAtivo(admin);
  if (orgs.length === 0) {
    return { ativo: false, organizacoes: 0, criados: 0, movidos: 0, fechados: 0, perdidosAutomaticamente: 0 };
  }

  let criados = 0;
  let movidos = 0;
  let fechados = 0;
  let perdidosAutomaticamente = 0;
  for (const org of orgs) {
    const resultado = await sincronizarOrg(admin, org);
    criados += resultado.criados;
    movidos += resultado.movidos;
    fechados += resultado.fechados;
    perdidosAutomaticamente += resultado.perdidosAutomaticamente;
  }

  return { ativo: true, organizacoes: orgs.length, criados, movidos, fechados, perdidosAutomaticamente };
}

async function autocurarPerdidos(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  perdidoDias: number,
): Promise<number> {
  const corte = new Date(Date.now() - perdidoDias * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidatos, error } = await admin
    .from("crm_leads")
    .select("id, custom_fields")
    .eq("organization_id", orgId)
    .eq("source", SOURCE)
    .eq("status", "open")
    .filter(`custom_fields->>${CAMPO_ATIVIDADE}`, "lt", corte);

  if (error) {
    logger.error("[treenity-funil] falha ao buscar leads parados", { error: error.message });
    return 0;
  }

  let perdidos = 0;
  for (const lead of (candidatos ?? []) as { id: string }[]) {
    const ctx: HandlerCtx = {
      organization_id: orgId,
      actor: ATOR,
      requestId: `treenity-bot:funil:perdido:${lead.id}`,
    };
    try {
      await encerraDemanda(admin, ctx, { leadId: lead.id, desfecho: "lost", motivo: "no_response" });
      perdidos++;
    } catch (error) {
      logger.error("[treenity-funil] falha ao marcar lead como perdido", {
        lead: lead.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return perdidos;
}
