/**
 * GET /api/treenity-bot/vendas — uma página de vendas do bot, só para ADMIN.
 *
 * O navegador não fala com a API do bot para isto: quem troca a identidade por
 * um token com a permissão de painel (`painel_admin`) é o SERVIDOR, depois de
 * confirmar aqui que a pessoa é admin da organização. O token fica no servidor;
 * o navegador recebe só as vendas. Ver `carregarVendasTreenityBot`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { carregarVendasTreenityBot } from "@/lib/treenity-bot/client";
import { getConfig } from "@/lib/treenity-bot/config";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  status: z.string().min(1).max(60).optional(),
  canal: z.string().min(1).max(60).optional(),
  desde: z.string().regex(DIA).optional(),
  ate: z.string().regex(DIA).optional(),
  cursor: z.string().min(1).max(300).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
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

  const pagina = await carregarVendasTreenityBot(
    { email: authz.user.email, nome: authz.user.full_name ?? authz.user.email },
    parsed.data,
  );
  if (!pagina) {
    return fail("treenity_bot_unavailable", "Não foi possível carregar as vendas agora.", 503, { requestId });
  }

  return ok(pagina, { requestId });
}
