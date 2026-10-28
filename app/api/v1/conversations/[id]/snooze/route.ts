import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST   /api/v1/conversations/[id]/snooze — "Me lembrar" (aviso interno): `minutos` (qualquer prazo
 *        de 5 minutos a 5 anos; os botões vêm de `/api/v1/settings/lembrar`) ou `ate` (dia escolhido).
 * DELETE /api/v1/conversations/[id]/snooze — cancela o lembrete ativo.
 *
 * Reabertura + aviso interno no vencimento é responsabilidade do cron
 * `snooze-watcher` — nada é enviado ao cliente aqui (quem manda ao cliente é a
 * parte "Janela aberta": `mensagem-agendada`).
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
import { INTERNO_MAX_MINUTOS, snoozeSchema } from "@/lib/schemas/snooze";
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
    // Dia escolhido: do futuro até 5 anos (o mesmo teto do prazo).
    const ate = new Date(parsed.data.ate).getTime();
    if (ate <= agora || ate > agora + INTERNO_MAX_MINUTOS * 60_000) {
      return fail("validation_failed", t("Escolha uma data no futuro, até 5 anos a partir de hoje."), 422, { requestId });
    }
    snoozeUntil = new Date(ate).toISOString();
  } else {
    snoozeUntil = new Date(agora + parsed.data.minutos * 60_000).toISOString();
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
