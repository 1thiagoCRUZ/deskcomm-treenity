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
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarAcessoAoBot } from "@/lib/treenity-bot/acesso";
import { carregarAtendimentosTreenityBot } from "@/lib/treenity-bot/client";
import { getConfig } from "@/lib/treenity-bot/config";
import { ateParaOBot, desdeParaOBot, diaValido } from "@/lib/treenity-bot/periodo";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  desde: z.string().regex(DIA).refine(diaValido).optional(),
  /** Inclusivo para quem usa a tela; a rota converte para o exclusivo do bot. */
  ate: z.string().regex(DIA).refine(diaValido).optional(),
  busca: z.string().trim().min(1).max(100).optional(),
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

  // A API do bot não separa empresas: só o Dono de uma empresa com o bot ligado.
  const acesso = await carregarAcessoAoBot({ user: authz.user, org: authz.org, minimo: "admin" });
  if (!acesso.permitido) {
    return fail("forbidden", traduzir("O Treenity Bot não está ligado nesta empresa.", authz.user.idioma), 403, {
      requestId,
    });
  }

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
    { ...filtros, desde: desdeParaOBot(filtros.desde), ate: ateParaOBot(filtros.ate), comVenda: com_venda === undefined ? undefined : com_venda === "true" },
  );
  if (!pagina) {
    return fail("treenity_bot_unavailable", "Não foi possível carregar os atendimentos agora.", 503, { requestId });
  }

  return ok(pagina, { requestId });
}
