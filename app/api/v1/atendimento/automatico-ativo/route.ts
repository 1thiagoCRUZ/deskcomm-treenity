/**
 * GET /api/v1/atendimento/automatico-ativo — existe atendimento automático nesta org?
 *
 * Devolve UM booleano para o Inbox parar de afirmar "Automático atendendo" quando
 * não há automático de pé (a frase tranquilizadora que a doutrina proíbe). Aberta
 * ao `agent`, que é quem vive no Inbox. A régua é `orgTemAutomatico`.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { orgTemAutomatico } from "@/lib/atendimento/automatico";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "atendimento_automatico" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const ativo = await orgTemAutomatico(supabase, authz.org.orgId);
  if (ativo === undefined) {
    return fail("internal_error", "Não foi possível ler o atendimento automático.", 500, { requestId });
  }
  return ok({ ativo }, { requestId });
}
