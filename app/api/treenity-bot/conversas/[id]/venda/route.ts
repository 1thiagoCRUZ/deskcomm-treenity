/**
 * GET /api/treenity-bot/conversas/{id}/venda — a venda mais recente do cliente
 * desta conversa, para o painel lateral do Inbox. Com `?venda_id=`, ESSA venda (a aba
 * Fechadas abre uma venda específica, e a compra nova não pode esconder a antiga). Só ADMIN: traz valores de
 * faturamento (mesma regra da lista de vendas). `data: null` = sem venda.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { carregarVendasTreenityBot } from "@/lib/treenity-bot/client";
import { getConfig } from "@/lib/treenity-bot/config";
import { idsFaceDoTelefone } from "@/lib/treenity-bot/devolver-ao-bot";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "treenity_bot" });
  if (!authz.ok) return authz.response;
  if (!getConfig()) return ok(null, { requestId });

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: conversa } = await supabase
    .from("conversations")
    .select("id, contacts:contact_id(phone_number)")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!conversa) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  const telefone = (conversa as unknown as { contacts: { phone_number: string | null } | null }).contacts?.phone_number;
  if (!telefone) return ok(null, { requestId });

  const usuario = { email: authz.user.email, nome: authz.user.full_name ?? authz.user.email };
  const vendaPedida = new URL(req.url).searchParams.get("venda_id");
  let escolhida = null;
  for (const idFace of idsFaceDoTelefone(telefone)) {
    const pagina = await carregarVendasTreenityBot(usuario, { id_face: idFace, limit: vendaPedida ? 100 : 1 });
    if (!pagina) return fail("treenity_bot_unavailable", "Não foi possível carregar a venda agora.", 503, { requestId });
    const candidata = vendaPedida ? pagina.itens.find((v) => v.id_venda === vendaPedida) : pagina.itens[0];
    if (candidata && (!escolhida || candidata.data_venda > escolhida.data_venda)) escolhida = candidata;
  }
  // A venda pedida sumiu do bot: cai na mais recente em vez de painel vazio.
  if (vendaPedida && !escolhida) {
    for (const idFace of idsFaceDoTelefone(telefone)) {
      const pagina = await carregarVendasTreenityBot(usuario, { id_face: idFace, limit: 1 });
      const venda = pagina?.itens[0];
      if (venda && (!escolhida || venda.data_venda > escolhida.data_venda)) escolhida = venda;
    }
  }
  return ok(escolhida, { requestId });
}
