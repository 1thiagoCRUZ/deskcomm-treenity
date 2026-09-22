/**
 * GET/POST /api/v1/cron/treenity-funil — sincroniza o funil de leads do
 * Treenity Bot (ver lib/treenity-bot/funil-de-leads.ts).
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET,
 * fail-closed). Agendada a cada ~5 min via GitHub Actions
 * (.github/workflows/treenity-funil.yml) — rede de segurança para quando
 * ninguém está com o painel aberto (o navegador de um admin já dispara isto
 * na hora quando chega aviso de atendimento/venda).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sincronizarFunilDoTreenityBot } from "@/lib/treenity-bot/funil-de-leads";

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
    return ok(await sincronizarFunilDoTreenityBot(), { requestId });
  } catch (error) {
    logger.error("[treenity-funil] falhou", {
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return fail("internal_error", "Failed to sync Treenity Bot funnel.", 500, { requestId });
  }
}

export const GET = handle;
export const POST = handle;
