/**
 * POST /api/treenity-bot/sincronizar-tarefas — o navegador de um ADMIN pede o
 * sincronismo quando o painel avisa de uma venda nova, para a tarefa aparecer em
 * segundos em vez de esperar o agendamento. Só admin: o resultado não depende de
 * nada do corpo, mas não há por que qualquer um disparar chamadas ao bot.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { sincronizarTarefasDeVenda } from "@/lib/treenity-bot/tarefas-de-venda";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_tasks" });
  if (!authz.ok) return authz.response;

  try {
    return ok(await sincronizarTarefasDeVenda(), { requestId });
  } catch (error) {
    logger.error("[treenity-vendas] falhou", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return fail("internal_error", "Failed to sync sale tasks.", 500, { requestId });
  }
}
