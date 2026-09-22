/**
 * POST /api/treenity-bot/sincronizar-funil — o navegador de um ADMIN pede o
 * sincronismo do funil de leads quando o painel avisa de atendimento/venda
 * nova, pro card aparecer em segundos em vez de esperar o agendamento.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { sincronizarFunilDoTreenityBot } from "@/lib/treenity-bot/funil-de-leads";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;

  try {
    return ok(await sincronizarFunilDoTreenityBot(), { requestId });
  } catch (error) {
    logger.error("[treenity-funil] falhou", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return fail("internal_error", "Failed to sync Treenity Bot funnel.", 500, { requestId });
  }
}
