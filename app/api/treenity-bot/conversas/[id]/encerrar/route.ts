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
    .select("id, organization_id, contact_id, service_revision, contacts:contact_id(phone_number)")
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
    contacts: { phone_number: string | null } | null;
  };

  const valor = corpo.data.desfecho === "venda" ? corpo.data.valor : null;
  const telefone = c.contacts?.phone_number ?? null;
  const noBot = telefone
    ? await encerrarAtendimentoNoBot({
        telefone,
        usuario: { email: authz.user.email, nome: authz.user.full_name ?? authz.user.email },
        valorDaVenda: valor,
      })
    : "sem_atendimento_aberto";
  if (noBot === "falhou") {
    return fail(
      "upstream_unavailable",
      t("Não foi possível avisar o Treenity Bot. Nada foi fechado — tente de novo em instantes."),
      502,
      { requestId },
    );
  }

  const admin = createAdminClient();
  const { error: erroFechar } = await admin.rpc("fn_service_status", {
    p_org: c.organization_id,
    p_conversation: c.id,
    p_status: "closed",
    p_expected: c.service_revision,
  });
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
    .update({ bot_silenced_until: null })
    .eq("organization_id", c.organization_id)
    .eq("id", c.id);
  if (c.contact_id) {
    await admin
      .from("contacts")
      .update({ force_human: false })
      .eq("organization_id", c.organization_id)
      .eq("id", c.contact_id);
  }

  await audit({
    action: "conversation.closed",
    actorUserId: authz.user.id,
    organizationId: c.organization_id,
    resourceType: "conversation",
    resourceId: c.id,
    requestId,
    metadata: { desfecho: corpo.data.desfecho, valor, treenity_bot: noBot },
  });

  after(() =>
    sincronizarFunilDoTreenityBot().catch((err) => {
      logger.warn("[treenity-bot] sincronismo do funil após fechar falhou (a rodada agendada cobre)", {
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      });
    }),
  );

  return ok({ fechada: true, treenity_bot: noBot }, { requestId });
}
