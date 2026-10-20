/**
 * POST /api/treenity-bot/conversas/{id}/venda-vista — alguém abriu a venda desta
 * conversa: o aviso de "venda nova" se resolve e a bolinha verde de Fechadas
 * apaga. Só resolve avisos de venda da PRÓPRIA organização.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarAcessoAoBot } from "@/lib/treenity-bot/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverAvisosDeVenda } from "@/lib/treenity-bot/avisos-da-central";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
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
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("validation_failed", "Conversa inválida.", 422, { requestId });
  await resolverAvisosDeVenda(createAdminClient(), authz.org.orgId, id);
  return ok({ vista: true }, { requestId });
}
