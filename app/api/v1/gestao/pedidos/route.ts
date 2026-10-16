/**
 * GET  /api/v1/gestao/pedidos — os pedidos da organização ativa (a Gestão, além disso, pode
 *                               pedir `?abertos=1&todas=1` para ver os abertos de todas as empresas).
 * POST /api/v1/gestao/pedidos — o Dono pede algo à Gestão Treenity (hoje: trocar número).
 *
 * `organization_id` vem da sessão, nunca do corpo. A RLS de `pedidos_a_gestao` repete a regra no
 * banco: só o `admin` da organização cria, e sempre em nome dele.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { COLUNAS_DE_PEDIDO, criarPedidoSchema, pedidoParaDto } from "@/lib/gestao/pedidos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { ehGestaoTreenity } from "@/lib/treenity/papeis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "pedidos_a_gestao",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const todasAsEmpresas =
    ehGestaoTreenity(authz.user) && req.nextUrl.searchParams.get("todas") === "1";
  const soAbertos = req.nextUrl.searchParams.get("abertos") === "1";

  let q = supabase.from("pedidos_a_gestao").select(COLUNAS_DE_PEDIDO).order("criado_em", { ascending: false }).limit(100);
  if (!todasAsEmpresas) q = q.eq("organization_id", authz.org.orgId);
  if (soAbertos) q = q.eq("status", "aberto");

  const { data, error } = await q;
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok((data ?? []).map(pedidoParaDto), { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  // Sessão de suporte somente leitura (ou encerrada) não cria nem decide nada.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "pedidos_a_gestao" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let corpo: unknown = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const parsed = criarPedidoSchema.safeParse(corpo);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  // Um pedido aberto de cada tipo por vez: repetir não acelera, só enche a fila da Gestão.
  const { count } = await supabase
    .from("pedidos_a_gestao")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", authz.org.orgId)
    .eq("tipo", parsed.data.tipo)
    .eq("status", "aberto");
  if ((count ?? 0) > 0) {
    return fail("conflict", t("Já existe um pedido desse tipo em andamento."), 409, { requestId });
  }

  const { data, error } = await supabase
    .from("pedidos_a_gestao")
    .insert({
      organization_id: authz.org.orgId,
      tipo: parsed.data.tipo,
      detalhe: {
        numero_novo: parsed.data.numero_novo,
        ...(parsed.data.observacao ? { observacao: parsed.data.observacao } : {}),
      },
      criado_por: authz.user.id,
    })
    .select(COLUNAS_DE_PEDIDO)
    .single();
  if (error || !data) {
    return fail("internal_error", t("Não foi possível registrar o pedido."), 500, { requestId });
  }

  void audit({
    action: "gestao.pedido_criado",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "pedido_a_gestao",
    resourceId: data.id,
    requestId,
    // O número novo é dado da empresa, não do cliente final; ainda assim fica fora do audit
    // (append-only, 5 anos): quem precisa dele lê o pedido.
    metadata: { tipo: parsed.data.tipo },
  });

  return ok(pedidoParaDto(data), { requestId, status: 201 });
}
