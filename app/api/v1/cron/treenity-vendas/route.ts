/**
 * GET/POST /api/v1/cron/treenity-vendas — cria as tarefas "Conferir pagamento PIX"
 * das vendas novas do Treenity Bot (e refaz a confirmação de pagamento que falhou).
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET,
 * fail-closed). Agendada por um workflow do GitHub Actions a cada ~5 min
 * (`.github/workflows/treenity-vendas.yml`) — o Vercel Hobby não tem cron frequente.
 * Ver `lib/treenity-bot/tarefas-de-venda.ts`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sincronizarTarefasDeVenda } from "@/lib/treenity-bot/tarefas-de-venda";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

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

export const GET = handle;
export const POST = handle;
