/**
 * GET /api/treenity-bot/atendimentos — uma página da lista de atendimentos da
 * IA, só para ADMIN. Mesmo desenho de `../vendas/route.ts`: o admin é confirmado
 * aqui no servidor, e o token do bot com a permissão de painel nunca chega ao
 * navegador.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarAtendimentosTreenityBot } from "@/lib/treenity-bot/client";
import { getConfig } from "@/lib/treenity-bot/config";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  canal: z.string().min(1).max(60).optional(),
  etapa: z.string().min(1).max(60).optional(),
  com_venda: z.enum(["true", "false"]).optional(),
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "treenity_bot" });
  if (!authz.ok) return authz.response;

  if (!getConfig()) {
    return fail("not_configured", "Integração com o Treenity Bot não configurada.", 501, { requestId });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros inválidos.", 422, {
      requestId,
      details: parsed.error.flatten() as Record<string, unknown>,
    });
  }

  const { com_venda, ...filtros } = parsed.data;
  const pagina = await carregarAtendimentosTreenityBot(
    { email: authz.user.email, nome: authz.user.full_name ?? authz.user.email },
    { ...filtros, comVenda: com_venda === undefined ? undefined : com_venda === "true" },
  );
  if (!pagina) {
    return fail("treenity_bot_unavailable", "Não foi possível carregar os atendimentos agora.", 503, { requestId });
  }

  return ok(pagina, { requestId });
}
