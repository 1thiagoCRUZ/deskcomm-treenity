/**
 * POST /api/treenity-bot/conversas/{id}/encerrar — o "Fechar" do Inbox em
 * organização com o Treenity Bot: a pessoa diz como terminou, e um clique
 * fecha nos três lugares.
 *
 * 1. **Bot:** encerra o atendimento e, com venda, registra a venda com o valor
 *    (ver `encerrarAtendimentoNoBot`). É o que alimenta o faturamento e o
 *    card do funil "Treenity Bot" (ganho com venda, perdido sem).
 * 2. **Inbox:** fecha a conversa (a mesma RPC do "Fechar" comum) e solta o
 *    silêncio do automático — o próximo contato do cliente é um atendimento
 *    novo, e o CADU atende. A reabertura na próxima mensagem já existe
 *    (`fn_service_inbound`).
 * 3. **Funil:** roda o sincronismo depois da resposta, para o card não esperar
 *    a rodada agendada.
 *
 * **Venda = paga.** Fechar com "teve venda" é a confirmação de que o cliente pagou: o bot
 * marca a venda como "Paga" (a do atendimento; sem atendimento aberto, a única que estiver
 * aguardando) e grava quem confirmou. Com mais de uma aguardando, nada é adivinhado: a
 * resposta traz `aviso_pagamento` e a tela pede para conferir em Vendas. Nenhum texto de
 * mensagem entra nessa decisão, só o clique.
 *
 * Se o bot falhar, a conversa NÃO é fechada: fechar só no Inbox deixaria o
 * atendimento aberto no bot e a venda fora do faturamento — o desencontro que
 * esta rota existe para evitar. A pessoa vê o erro e tenta de novo.
 */
import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolverAvisosDaConversa } from "@/lib/treenity-bot/avisos-da-central";
import { encerrarAtendimentoNoBot } from "@/lib/treenity-bot/encerrar-no-bot";
import { sincronizarFunilDoTreenityBot } from "@/lib/treenity-bot/funil-de-leads";
import { botDoTreenityAtende } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";

const corpoSchema = z.discriminatedUnion("desfecho", [
  z.object({ desfecho: z.literal("venda"), valor: z.number().positive().max(10_000_000) }),
  z.object({ desfecho: z.literal("sem_venda") }),
]);

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return fail("validation_failed", t("Informe como terminou e, se teve venda, o valor."), 422, { requestId });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).maybeSingle();
  if (!botDoTreenityAtende(org?.settings ?? null)) {
    return fail("state_conflict", t("Esta organização não usa o Treenity Bot no Inbox."), 409, { requestId });
  }

  const { data: conversa, error: erroLeitura } = await supabase
    .from("conversations")
    .select("id, organization_id, contact_id, service_revision, service_started_at, created_at, contacts:contact_id(phone_number)")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  const c = conversa as unknown as {
    id: string;
    organization_id: string;
    contact_id: string | null;
    service_revision: number;
    service_started_at: string | null;
    created_at: string;
    contacts: { phone_number: string | null } | null;
  };

  const valor = corpo.data.desfecho === "venda" ? corpo.data.valor : null;
  const telefone = c.contacts?.phone_number ?? null;
  const resultadoBot = telefone
    ? await encerrarAtendimentoNoBot({
        telefone,
        usuario: { email: authz.user.email, nome: authz.user.full_name ?? authz.user.email },
        valorDaVenda: valor,
      })
    : { desfecho: "sem_atendimento_aberto" as const, vendaId: null, aguardandoPendentes: 0 };
  const noBot = resultadoBot.desfecho;
  if (noBot === "falhou") {
    return fail(
      "upstream_unavailable",
      t("Não foi possível avisar o Treenity Bot. Nada foi fechado — tente de novo em instantes."),
      502,
      { requestId },
    );
  }

  const admin = createAdminClient();
  let { error: erroFechar } = await admin.rpc("fn_service_status", {
    p_org: c.organization_id,
    p_conversation: c.id,
    p_status: "closed",
    p_expected: c.service_revision,
  });
  // O bot já encerrou (e pagou) a esta altura: um conflito de revisão não pode obrigar a
  // repetir o Fechar, porque a repetição cairia em outra venda. Relê a revisão e tenta uma vez.
  if (erroFechar?.code === "40001") {
    const { data: atual } = await admin
      .from("conversations")
      .select("service_revision")
      .eq("organization_id", c.organization_id)
      .eq("id", c.id)
      .maybeSingle();
    if (atual) {
      ({ error: erroFechar } = await admin.rpc("fn_service_status", {
        p_org: c.organization_id,
        p_conversation: c.id,
        p_status: "closed",
        p_expected: atual.service_revision,
      }));
    }
  }
  if (erroFechar) {
    return fail(
      erroFechar.code === "40001" ? "conflict" : "internal_error",
      erroFechar.code === "40001" ? t("O atendimento mudou. Atualize e tente novamente.") : erroFechar.message,
      erroFechar.code === "40001" ? 409 : 500,
      { requestId },
    );
  }

  // O próximo contato é atendimento novo: o CADU volta. O fechamento comum só
  // solta o silêncio quando não houve handoff — aqui soltamos sempre.
  await admin
    .from("conversations")
    .update({
      bot_silenced_until: null,
      // O pedido de especialista era DESTE atendimento, que acabou de ser encerrado.
      // Sem limpar, a faixa "O bot pediu um especialista" ficava na conversa e
      // reaparecia quando o cliente voltava a escrever (compra nova), dizendo que
      // pediam ajuda para uma coisa que nem aconteceu naquele atendimento.
      last_handoff_reason: null,
      // Só a VENDA entra em Fechadas (e no selo "Já é nosso cliente"); o encerramento
      // sem venda não. A data fica mesmo que o cliente volte a escrever.
      ...(corpo.data.desfecho === "venda" ? { venda_fechada_em: new Date().toISOString() } : {}),
    })
    .eq("organization_id", c.organization_id)
    .eq("id", c.id);
  if (c.contact_id) {
    await admin
      .from("contacts")
      .update({ force_human: false })
      .eq("organization_id", c.organization_id)
      .eq("id", c.contact_id);
  }

  // A venda como registro próprio: de que hora a que hora foi este atendimento. É o que
  // deixa a aba Fechadas mostrar só a conversa DESTA venda, mesmo que o cliente volte a
  // escrever e a conversa reabra.
  if (corpo.data.desfecho === "venda") {
    const fechadaEm = new Date();
    const iniciadaEm = new Date(c.service_started_at ?? c.created_at);
    const { error: erroVenda } = await admin.from("conversa_vendas").insert({
      organization_id: c.organization_id,
      conversation_id: c.id,
      iniciada_em: (iniciadaEm > fechadaEm ? fechadaEm : iniciadaEm).toISOString(),
      fechada_em: fechadaEm.toISOString(),
      valor: corpo.data.valor,
      fechada_por: authz.user.id,
      venda_bot_id: resultadoBot.vendaId,
    });
    // O fechamento já aconteceu e o bot já foi avisado: falhar aqui não desfaz nada. Só o
    // recorte da conversa deixa de existir, e a aba cai no fio inteiro — registra e segue.
    if (erroVenda) {
      logger.error("[encerrar] não foi possível registrar o recorte da venda", {
        conversation_id: c.id,
        message: erroVenda.message,
      });
    }
  }

  await resolverAvisosDaConversa(admin, c.organization_id, c.id);

  await audit({
    action: "conversation.closed",
    actorUserId: authz.user.id,
    organizationId: c.organization_id,
    resourceType: "conversation",
    resourceId: c.id,
    requestId,
    metadata: {
      desfecho: corpo.data.desfecho,
      valor,
      treenity_bot: noBot,
      // Fechar com venda = venda PAGA: o bot marca "Paga" e guarda quem confirmou (o nome
      // de quem fechou). Aqui fica o registro do lado do painel: quem, e qual venda.
      venda_bot_id: resultadoBot.vendaId,
      venda_marcada_paga: corpo.data.desfecho === "venda" && resultadoBot.vendaId !== null,
      vendas_aguardando_pendentes: resultadoBot.aguardandoPendentes,
    },
  });

  after(() =>
    sincronizarFunilDoTreenityBot().catch((err) => {
      logger.warn("[treenity-bot] sincronismo do funil após fechar falhou (a rodada agendada cobre)", {
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      });
    }),
  );

  // Aviso (nunca erro): a conversa fechou, mas o pagamento precisa de olho humano.
  //  - "nao_marcada": disse que teve venda e nenhuma venda do bot pôde ser marcada como paga
  //    (sem venda aguardando, ou várias e o sistema não adivinha);
  //  - "outras_aguardando": a venda foi marcada, mas o cliente tem outras ainda aguardando.
  let aviso: "nao_marcada" | "outras_aguardando" | null = null;
  if (corpo.data.desfecho === "venda") {
    if (resultadoBot.vendaId === null) aviso = "nao_marcada";
    else if (resultadoBot.aguardandoPendentes > 0) aviso = "outras_aguardando";
  }

  return ok(
    {
      fechada: true,
      treenity_bot: noBot,
      venda_paga: corpo.data.desfecho === "venda" && resultadoBot.vendaId !== null,
      aviso_pagamento: aviso,
      vendas_aguardando_pendentes: resultadoBot.aguardandoPendentes,
    },
    { requestId },
  );
}
