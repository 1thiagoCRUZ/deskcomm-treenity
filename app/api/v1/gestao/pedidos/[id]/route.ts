/**
 * PATCH /api/v1/gestao/pedidos/[id] — a Gestão Treenity marca o pedido como atendido ou cancelado.
 *
 * Só a Gestão (`ehGestaoTreenity`): o Dono cria o pedido mas não decide sobre ele. A RLS repete
 * isso no banco (update só para platform admin).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DE_PEDIDO, pedidoParaDto, resolverPedidoSchema } from "@/lib/gestao/pedidos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { ehGestaoTreenity } from "@/lib/treenity/papeis";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Sessão de suporte somente leitura (ou encerrada) não cria nem decide nada.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await params;
  const authz = await requireRole("admin", {
    requestId,
    resource: "pedidos_a_gestao",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  if (!ehGestaoTreenity(authz.user)) {
    return fail("forbidden_role", t("Esta ação é da equipe Treenity."), 403, { requestId });
  }

  let corpo: unknown = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const parsed = resolverPedidoSchema.safeParse(corpo);
  if (!parsed.success) return fail("validation_failed", t("Dados inválidos."), 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos_a_gestao")
    .update({
      status: parsed.data.status,
      resolvido_por: authz.user.id,
      resolvido_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "aberto")
    .select(COLUNAS_DE_PEDIDO)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Pedido não encontrado ou já resolvido."), 404, { requestId });

  void audit({
    action: "gestao.pedido_resolvido",
    actorUserId: authz.user.id,
    organizationId: data.organization_id,
    resourceType: "pedido_a_gestao",
    resourceId: data.id,
    requestId,
    metadata: { status: parsed.data.status },
  });

  return ok(pedidoParaDto(data), { requestId });
}
