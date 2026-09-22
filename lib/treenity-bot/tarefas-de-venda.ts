/**
 * Tarefas automáticas de venda do Treenity Bot.
 *
 * Quando o bot fecha uma venda por PIX ele só envia a chave — ninguém valida o
 * pagamento. Cada venda nova "Aguardando Pagamento" vira UMA tarefa "Conferir
 * pagamento PIX" para os admins, sem prazo (é só o lembrete: o pedido só é
 * montado depois de pago, então demorar não é problema). Concluir a tarefa marca
 * a venda como paga no bot (ver `app/api/v1/tasks/[id]/route.ts`).
 *
 * ─── Como não duplica ───────────────────────────────────────────────────────
 * `crm_tasks.external_ref = treenity:venda:<id>` + índice único parcial (0233).
 * O sincronizador roda de vários lugares (cron, navegador de um admin) e pode
 * rodar ao mesmo tempo: quem perde a corrida leva 23505 e segue.
 *
 * ─── Autocorreção ───────────────────────────────────────────────────────────
 * Se o admin concluiu a tarefa mas o bot estava fora do ar, a venda continua
 * "Aguardando Pagamento". A próxima execução vê a tarefa concluída + venda ainda
 * aguardando e refaz a chamada.
 *
 * ─── Configuração ────────────────────────────────────────────────────────────
 * Por organização, em `organizations.settings.treenity_bot.tarefas` — ligar,
 * desligar e o "desde" são decisão do cliente, pela tela (ver
 * lib/treenity-bot/configuracao.ts). Organização sem isso ligado não gera
 * nenhuma tarefa.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { orgsComTarefasAtivas, type OrgComTarefasAtivas } from "./configuracao";
import { definirPagamentoDaVenda, listarVendasAguardandoPagamento, type VendaPainel } from "./client";

export const PREFIXO_REF_VENDA = "treenity:venda:";

const MAX_PAGINAS = 5;

export const refDaVenda = (idVenda: string) => `${PREFIXO_REF_VENDA}${idVenda}`;

/** Id da venda a partir do `external_ref` da tarefa; `null` se não é uma tarefa de venda. */
export function idDaVendaNaRef(ref: string | null | undefined): string | null {
  return ref?.startsWith(PREFIXO_REF_VENDA) ? ref.slice(PREFIXO_REF_VENDA.length) || null : null;
}

export interface ResultadoDoSincronismo {
  ativo: boolean;
  organizacoes: number;
  criadas: number;
  pagamentosRefeitos: number;
}

const brl = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function montarTarefa(venda: VendaPainel) {
  const descricao = [
    `Cliente: ${venda.cliente}${venda.canal ? ` (${venda.canal})` : ""}`,
    `Itens: ${venda.itens || "—"}`,
    `Produtos: ${brl(venda.valor_produtos)} · Frete: ${brl(venda.frete)}${venda.transportadora ? ` (${venda.transportadora})` : ""}`,
    `Total a conferir: ${brl(venda.total)}`,
    venda.atendimento_detalhes.id ? `Conversa: /app/integrations/treenity-bot/${venda.atendimento_detalhes.id}` : null,
    "",
    "A API não valida o pagamento. Confira o PIX e conclua esta tarefa para marcar a venda como paga.",
  ]
    .filter((linha) => linha !== null)
    .join("\n");

  return {
    title: `Conferir pagamento PIX — ${brl(venda.total)} — ${venda.cliente}`.slice(0, 255),
    description: descricao,
  };
}

async function buscarVendasAguardando(desde: string): Promise<VendaPainel[] | null> {
  const vendas: VendaPainel[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const resposta = await listarVendasAguardandoPagamento(desde, cursor);
    if (!resposta) return null; // bot fora do ar: não faz nada agora, tenta na próxima
    vendas.push(...resposta.itens);
    if (!resposta.proximoCursor) break;
    cursor = resposta.proximoCursor;
  }
  return vendas;
}

async function sincronizarOrg(
  admin: ReturnType<typeof createAdminClient>,
  org: OrgComTarefasAtivas,
): Promise<{ criadas: number; pagamentosRefeitos: number }> {
  const vendas = await buscarVendasAguardando(org.desde);
  if (!vendas || vendas.length === 0) return { criadas: 0, pagamentosRefeitos: 0 };

  const refs = vendas.map((v) => refDaVenda(v.id_venda));
  const { data: existentes, error } = await admin
    .from("crm_tasks")
    .select("external_ref, status")
    .eq("organization_id", org.orgId)
    .in("external_ref", refs);
  if (error) {
    logger.error("[treenity-vendas] falha ao ler tarefas", { org: org.orgId, error: error.message });
    return { criadas: 0, pagamentosRefeitos: 0 };
  }

  const statusPorRef = new Map((existentes ?? []).map((t) => [t.external_ref as string, t.status as string]));
  let criadas = 0;
  let pagamentosRefeitos = 0;

  for (const venda of vendas) {
    const ref = refDaVenda(venda.id_venda);
    const situacao = statusPorRef.get(ref);

    if (situacao === undefined) {
      const { error: erroCriar } = await admin.from("crm_tasks").insert({
        organization_id: org.orgId,
        ...montarTarefa(venda),
        // Sem prazo de propósito: é um lembrete, não um compromisso — prazo
        // encheria a lista de "atrasadas" com vendas que só esperam o cliente pagar.
        due_date: null,
        priority: "high",
        status: "pending",
        external_ref: ref,
      });
      if (!erroCriar) criadas++;
      else if (erroCriar.code !== "23505") {
        // 23505 = outra execução criou primeiro; qualquer outra coisa é problema de verdade.
        logger.error("[treenity-vendas] falha ao criar tarefa", {
          org: org.orgId,
          error: erroCriar.message,
          venda: venda.id_venda,
        });
      }
    } else if (situacao === "done") {
      // Concluída, mas a venda segue aguardando: a chamada ao bot falhou antes.
      const feito = await definirPagamentoDaVenda(venda.id_venda, {
        pago: true,
        confirmadoPor: "tarefa concluída no deskcomm",
      });
      if (feito) pagamentosRefeitos++;
    }
  }

  return { criadas, pagamentosRefeitos };
}

export async function sincronizarTarefasDeVenda(): Promise<ResultadoDoSincronismo> {
  const admin = createAdminClient();
  const orgs = await orgsComTarefasAtivas(admin);
  if (orgs.length === 0) return { ativo: false, organizacoes: 0, criadas: 0, pagamentosRefeitos: 0 };

  let criadas = 0;
  let pagamentosRefeitos = 0;
  for (const org of orgs) {
    const resultado = await sincronizarOrg(admin, org);
    criadas += resultado.criadas;
    pagamentosRefeitos += resultado.pagamentosRefeitos;
  }

  return { ativo: true, organizacoes: orgs.length, criadas, pagamentosRefeitos };
}
