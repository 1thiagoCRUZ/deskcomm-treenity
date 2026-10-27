import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST   /api/v1/conversations/[id]/snooze — define lembrete: `duration_hours` (1, 3, 24 h = "avise se
 *        o lead não responder"; 7, 15, 30 dias = retorno) ou `ate` (data escolhida, retorno).
 * DELETE /api/v1/conversations/[id]/snooze — cancela o lembrete ativo.
 *
 * Reabertura + aviso interno no vencimento é responsabilidade do cron
 * `snooze-watcher` — nada é enviado ao cliente aqui.
 *
 * `.eq("organization_id", org.orgId)` é defesa extra; a RLS
 * `conversations_tenant_isolation_all` já cobre o UPDATE por membro da org.
 * `.select("id").maybeSingle()` confirma que a linha existia e era escrevível —
 * sem isso, um UPDATE barrado pela RLS afeta 0 linhas mas ainda retornaria
 * sucesso + audit falso (mutação que não ocorreu). Mesma lição do DELETE de
 * message-templates.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { MAX_DIAS_DATA, RETORNO_A_PARTIR_HORAS, snoozeSchema } from "@/lib/schemas/snooze";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = snoozeSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const agora = Date.now();
  const nowIso = new Date(agora).toISOString();
  let snoozeUntil: string;
  if ("ate" in parsed.data) {
    // Data escolhida: retorno, de 2 dias a 1 ano. Antes disso, os prazos curtos servem.
    const ate = new Date(parsed.data.ate).getTime();
    if (ate < agora + RETORNO_A_PARTIR_HORAS * 3600_000 - 60_000 || ate > agora + MAX_DIAS_DATA * 86_400_000) {
      return fail("validation_failed", t("Escolha uma data entre 2 dias e 1 ano a partir de hoje."), 422, { requestId });
    }
    snoozeUntil = new Date(ate).toISOString();
  } else {
    snoozeUntil = new Date(agora + parsed.data.duration_hours * 3600_000).toISOString();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ snooze_until: snoozeUntil, snoozed_at: nowIso, snoozed_by_user_id: user.id })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  void audit({
    action: "conversation.snoozed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: data.id,
    requestId,
    metadata: { ...parsed.data, snooze_until: snoozeUntil },
  });
  return ok({ snooze_until: snoozeUntil }, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .update({ snooze_until: null, snoozed_at: null, snoozed_by_user_id: null })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  void audit({
    action: "conversation.snooze_cancelled",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: data.id,
    requestId,
  });
  return noContent(requestId);
}
