/**
 * POST /api/v1/team/members — o admin cadastra um membro direto, com senha.
 *
 * Existe porque o convite por link (`/api/v1/team/invite`) manda quem ainda
 * não tem conta para `/signup`, que usa o cadastro público do Supabase — e
 * instalações que o desligam (o correto, num banco compartilhado) ficariam sem
 * jeito de trazer gente nova. Aqui a conta nasce pela Auth Admin API, já
 * confirmada, e entra na organização pela MESMA RPC do aceite de convite
 * (`fn_accept_team_invite`), então revogação, papel e escopo de interface
 * seguem as regras de sempre.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit, isServiceRoleConfigured } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { INTERFACE_COMPLETA } from "@/lib/navigation/interface";
import { createMemberSchema, validateRequest } from "@/lib/schemas";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  if (!isServiceRoleConfigured()) {
    return fail("not_configured", "SUPABASE_SERVICE_ROLE_KEY ausente neste ambiente.", 501, { requestId });
  }

  let input;
  try {
    input = await validateRequest(createMemberSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const admin = createAdminClient();
  const email = input.email.trim().toLowerCase();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, locale: authUser.idioma },
  });

  if (createError || !created?.user) {
    if (createError?.code === "email_exists" || /already|registered/i.test(createError?.message ?? "")) {
      return fail(
        "already_registered",
        "Já existe uma conta com este e-mail. Use “Convidar membros”: a pessoa entra com a senha dela e aceita o convite.",
        409,
        { requestId },
      );
    }
    return fail("create_failed", "Não foi possível criar a conta agora.", 502, { requestId });
  }

  const userId = created.user.id;
  const { data: membership, error: membershipError } = await admin.rpc("fn_accept_team_invite", {
    p_interface_settings: INTERFACE_COMPLETA,
    p_user: userId,
    p_org: activeOrg.orgId,
    p_role: input.role,
    p_invited_by: authUser.id,
    p_issued_at: null,
    p_invited_at: new Date().toISOString(),
  });

  if (membershipError) {
    // Sem vínculo a conta ficaria órfã (existiria no Auth e não em organização nenhuma).
    await admin.auth.admin.deleteUser(userId);
    return fail("membership_failed", "A conta foi criada mas não entrou na organização; desfeita.", 502, { requestId });
  }

  await audit({
    action: "member.accepted",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: (membership as { id?: string } | null)?.id,
    metadata: { created_by_admin: true, role: input.role },
  });

  return ok({ user_id: userId, email, role: input.role }, { status: 201, requestId });
}
