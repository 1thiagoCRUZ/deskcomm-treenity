import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/message-templates — lista os templates visíveis (pessoais + compartilhados
 *      da org ativa; a RLS `message_templates_select` já filtra).
 * POST /api/v1/message-templates — cria um template. `shared=true` grava owner_user_id
 *      null (compartilhado) e exige role manager+; `shared=false` (default) grava
 *      owner_user_id = user.id (pessoal, role agent+ já garantido pelo requireRole).
 *
 * Organização com as respostas no Treenity Bot: as duas rotas leem e gravam na
 * tabela do bot, pela API dele, e aqui não fica cópia — ver
 * `lib/treenity-bot/respostas-salvas.ts`. `?origem=crm` força a tabela daqui:
 * os follow-ups guardam o id de um `message_templates` e não entendem o do bot.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { createTemplateSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { criarRespostaNoBot, listarRespostasDoBot } from "@/lib/treenity-bot/client";
import { erroDoBot, paraBotNovo, paraTemplate, respostasNoBot } from "@/lib/treenity-bot/respostas-salvas";

export const dynamic = "force-dynamic";
const COLS =
  "id, organization_id, owner_user_id, title, body, shortcut, bot_triggers, bot_context, bot_max_chars, bot_enabled, usage_count, last_used_at, created_by_user_id, created_at, updated_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const soDoCrm = req.nextUrl.searchParams.get("origem") === "crm";
  if (!soDoCrm && (await respostasNoBot(createAdminClient(), org.orgId))) {
    const t = (texto: string) => traduzir(texto, authz.user.idioma);
    const resultado = await listarRespostasDoBot();
    if (!resultado.ok) {
      const erro = erroDoBot(resultado);
      return fail(erro.code, t(erro.mensagem), erro.status, { requestId });
    }
    return ok(
      resultado.dados.map((linha) => paraTemplate(linha, org.orgId)),
      { requestId },
    );
  }

  const supabase = await createClient();
  // RLS já limita a compartilhados + próprios da org ativa.
  const { data, error } = await supabase
    .from("message_templates")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .order("updated_at", { ascending: false });
  if (error) return fail("internal_error", "Erro ao listar templates.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = createTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { title, body, shortcut, shared, bot_triggers, bot_context, bot_max_chars, bot_enabled } =
    parsed.data;

  // No bot, toda resposta é da loja — a mesma regra do compartilhado: manager+.
  if (await respostasNoBot(createAdminClient(), org.orgId)) {
    if (!roleAtLeast(org.role, "manager")) {
      return fail("forbidden", t("Só manager+ cria resposta da loja."), 403, { requestId });
    }
    const resultado = await criarRespostaNoBot(paraBotNovo(parsed.data));
    if (!resultado.ok) {
      const erro = erroDoBot(resultado);
      return fail(erro.code, t(erro.mensagem), erro.status, { requestId });
    }
    void audit({
      action: "template.created",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "message_template",
      // `resource_id` é uuid e o id do bot é numérico: vai no metadata.
      resourceId: null,
      requestId,
      metadata: { title, onde: "treenity_bot", resposta_id: resultado.dados.id },
    });
    return ok(paraTemplate(resultado.dados, org.orgId), { requestId, status: 201 });
  }

  // Compartilhado exige manager+. requireRole já resolveu o role efetivo do
  // banco em org.role — reusar em vez de uma 2ª chamada/RPC. A RLS with_check
  // barra de qualquer forma; isto só dá um erro claro antes do insert.
  if (shared && !roleAtLeast(org.role, "manager")) {
    return fail("forbidden", t("Só manager+ cria template compartilhado."), 403, { requestId });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      organization_id: org.orgId,
      owner_user_id: shared ? null : user.id,
      title,
      body,
      shortcut: shortcut ?? null,
      // Omitidos, os `bot_*` caem no default do banco: sem gatilho e desligado,
      // ou seja, o template continua sendo só o atalho do atendente. Quem não
      // conhece o recurso nunca liga o bot sem querer.
      bot_triggers: bot_triggers ?? [],
      bot_context: bot_context ?? "any",
      ...(bot_max_chars === undefined ? {} : { bot_max_chars }),
      bot_enabled: bot_enabled ?? false,
      created_by_user_id: user.id,
    })
    .select(COLS)
    .single();
  if (error || !data) return fail("internal_error", "Erro ao criar template.", 500, { requestId });

  void audit({
    action: "template.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: data.id,
    requestId,
    metadata: { shared, title },
  });

  return ok(data, { requestId, status: 201 });
}
