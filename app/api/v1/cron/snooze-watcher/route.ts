/**
 * GET/POST /api/v1/cron/snooze-watcher — Onda 5.3 (snooze por conversa).
 *
 * Varre conversas com `snooze_until` vencido (<= now). Para cada uma, limpa
 * o snooze SEMPRE (evita reprocessar no próximo tick). Se o lead NÃO
 * respondeu desde que o snooze foi criado (last_inbound_at <= snoozed_at, ou
 * nunca respondeu) e a conversa não está closed/archived, reabre
 * (status='open') e cria um aviso interno `snooze_expired` — nada é enviado
 * ao cliente.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed).
 *
 * NOTA DE DEPLOY: não há `vercel.json` neste repo (self-host). O kit
 * self-host precisa agendar esta rota (ex.: a cada 5 min) no container
 * `scheduler` com o Bearer secret configurado — sem isso o snooze nunca
 * expira sozinho.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { vencerLembretes } from "@/lib/inbox/vencer-lembretes";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let resultado;
  try {
    resultado = await vencerLembretes(createAdminClient());
  } catch (err) {
    logger.error("[snooze-watcher] query failed", {
      error: err instanceof Error ? err.message : "desconhecido",
      requestId,
    });
    return fail("internal_error", "Failed to query conversations.", 500, { requestId });
  }
  const { scanned, reopened } = resultado;

  // Ver comentário em followup-flow-worker: varredura que não reabriu nada não
  // é mutação, e não tem por que ocupar linha na auditoria.
  if (reopened > 0) {
    void audit({
      action: "conversation.snooze_watcher_run",
      organizationId: null,
      bypassedRls: true,
      metadata: { scanned, reopened },
      requestId,
    });
  }

  return ok({ scanned, reopened }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
