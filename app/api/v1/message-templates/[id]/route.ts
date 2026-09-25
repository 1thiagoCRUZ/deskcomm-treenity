import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * PATCH  /api/v1/message-templates/[id] — atualiza título/corpo/atalho e os
 *        gatilhos do bot (`bot_*`). O update espalha `parsed.data`, então um
 *        campo só entra quando veio no corpo: o schema é quem decide o que é
 *        aceito, e um PATCH parcial nunca zera o que não foi mandado.
 * DELETE /api/v1/message-templates/[id] — remove o template.
 *
 * Organização com as respostas no Treenity Bot: os dois alteram a linha na
 * tabela do bot, pela API dele, e aqui não existe cópia — ver
 * `lib/treenity-bot/respostas-salvas.ts`. Lá toda resposta é da loja, então
 * editar e apagar exigem manager+, a mesma regra do compartilhado daqui.
 *
 * O `.eq("organization_id", org.orgId)` é defesa extra, não substitui a RLS
 * `message_templates_write` — quem já não é dono (agent) nem manager (compartilhado)
 * é barrado pela policy antes de chegar aqui.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { updateTemplateSchema } from "@/lib/schemas/templates";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { apagarRespostaDoBot, atualizarRespostaNoBot } from "@/lib/treenity-bot/client";
import { erroDoBot, idDoBot, paraBot, paraTemplate, respostasNoBot } from "@/lib/treenity-bot/respostas-salvas";

export const dynamic = "force-dynamic";
const COLS =
  "id, organization_id, owner_user_id, title, body, shortcut, bot_triggers, bot_context, bot_max_chars, bot_enabled, usage_count, last_used_at, created_by_user_id, created_at, updated_at";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = updateTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  if (await respostasNoBot(createAdminClient(), org.orgId)) {
    if (!roleAtLeast(org.role, "manager")) {
      return fail("forbidden", t("Só manager+ altera resposta da loja."), 403, { requestId });
    }
    const idNoBot = idDoBot(id);
    if (idNoBot === null) return fail("not_found", t("Resposta não encontrada."), 404, { requestId });
    const resultado = await atualizarRespostaNoBot(idNoBot, paraBot(parsed.data));
    if (!resultado.ok) {
      const erro = erroDoBot(resultado);
      return fail(erro.code, t(erro.mensagem), erro.status, { requestId });
    }
    void audit({
      action: "template.updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "message_template",
      // `resource_id` é uuid e o id do bot é numérico: vai no metadata.
      resourceId: null,
      requestId,
      metadata: { fields: Object.keys(parsed.data), onde: "treenity_bot", resposta_id: idNoBot },
    });
    return ok(paraTemplate(resultado.dados, org.orgId), { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select(COLS)
    .single();
  if (error || !data) return fail("not_found", t("Template não encontrado."), 404, { requestId });

  void audit({
    action: "template.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: data.id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  if (await respostasNoBot(createAdminClient(), org.orgId)) {
    if (!roleAtLeast(org.role, "manager")) {
      return fail("forbidden", t("Só manager+ apaga resposta da loja."), 403, { requestId });
    }
    const idNoBot = idDoBot(id);
    if (idNoBot === null) return fail("not_found", t("Resposta não encontrada."), 404, { requestId });
    const resultado = await apagarRespostaDoBot(idNoBot);
    if (!resultado.ok) {
      const erro = erroDoBot(resultado);
      return fail(erro.code, t(erro.mensagem), erro.status, { requestId });
    }
    void audit({
      action: "template.deleted",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "message_template",
      resourceId: null,
      requestId,
      metadata: { onde: "treenity_bot", resposta_id: idNoBot },
    });
    return noContent(requestId);
  }

  const supabase = await createClient();

  // .select() confirma que a linha existia E era visível/apagável pela RLS.
  // Sem isso, um DELETE barrado pela RLS afeta 0 linhas mas ainda retornaria
  // 204 + audit falso (mutação que não ocorreu). Espelha a semântica do PATCH.
  const { data: deleted, error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao excluir template.", 500, { requestId });
  if (!deleted) return fail("not_found", t("Template não encontrado."), 404, { requestId });

  void audit({
    action: "template.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "message_template",
    resourceId: deleted.id,
    requestId,
  });
  return noContent(requestId);
}
