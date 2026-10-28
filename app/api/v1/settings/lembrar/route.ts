import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/settings/lembrar — os botões do "Lembrar" do Inbox (agent+: quem
 *     usa o botão precisa lê-los). `{ janela: minutos[], interno: minutos[] }`.
 * PUT /api/v1/settings/lembrar — troca os botões (manager+), em
 *     `organizations.settings.lembrar`.
 *
 * Pedido do Rodrigo (27/10/2026): a empresa monta os próprios prazos. A parte
 * "Janela aberta" vai até 24 h (depois disso a mensagem não sai sem modelo
 * pago); "Me lembrar" vai até 5 anos. Os limites são de `lembrarOpcoesSchema`.
 * Sem nada salvo, valem `OPCOES_PADRAO`.
 *
 * A escrita em `organizations` vai pelo admin client pelo mesmo motivo de
 * `settings/routing` (a policy de escrita da tabela é só de platform admin);
 * o gate é o papel, e o filtro por `organization_id` é explícito.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { lembrarOpcoesSchema, opcoesDoLembrar } from "@/lib/schemas/snooze";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "settings_lembrar" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(opcoesDoLembrar(data?.settings ?? null), { requestId });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "settings_lembrar" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const raw = await req.json().catch(() => null);
  const parsed = lembrarOpcoesSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  const { data: orgRow, error: readErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (readErr) return fail("internal_error", readErr.message, 500, { requestId });

  const atual = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const { error: updErr } = await admin
    .from("organizations")
    .update({ settings: { ...atual, lembrar: parsed.data } })
    .eq("id", authz.org.orgId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  void audit({
    action: "settings.lembrar_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: parsed.data,
  });
  return ok(parsed.data, { requestId });
}
