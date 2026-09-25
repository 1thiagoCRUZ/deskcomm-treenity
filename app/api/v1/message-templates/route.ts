import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/message-templates — lista os templates visíveis (pessoais + compartilhados
 *      da org ativa; a RLS `message_templates_select` já filtra).
 * POST /api/v1/message-templates — cria um template. `shared=true` grava owner_user_id
 *      null (compartilhado) e exige role manager+; `shared=false` (default) grava
 *      owner_user_id = user.id (pessoal, role agent+ já garantido pelo requireRole).
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
import { espelharResposta, type RespostaSalva } from "@/lib/treenity-bot/respostas-salvas";

export const dynamic = "force-dynamic";
// `bot_synced_at`/`bot_sync_error` dizem se a resposta chegou ao Treenity Bot
// (migration 0235): a lista avisa quando o último envio falhou.
const COLS =
  "id, organization_id, owner_user_id, title, body, shortcut, bot_triggers, bot_context, bot_max_chars, bot_enabled, bot_synced_at, bot_sync_error, usage_count, last_used_at, created_by_user_id, created_at, updated_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "message_templates" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

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

  // Com gatilho, a resposta vai para o bot agora. O resultado fica na linha
  // (bot_sync_error) e volta na resposta, para a tela avisar se não chegou.
  const noBot = await espelharResposta(createAdminClient(), org.orgId, data as RespostaSalva);
  if (noBot === "nada") return ok(data, { requestId, status: 201 });
  const { data: atualizada } = await supabase.from("message_templates").select(COLS).eq("id", data.id).single();
  return ok(atualizada ?? data, { requestId, status: 201 });
}
