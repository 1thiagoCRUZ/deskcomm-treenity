/**
 * GET /api/v1/conversations/[id]/venda — a ÚLTIMA venda fechada nesta conversa e o
 * recorte de tempo do atendimento dela (`desde`/`ate`, para o endpoint de mensagens).
 *
 * `ate` é a primeira mensagem do cliente DEPOIS do fechamento, ou `null` se ele não
 * voltou. Vale mais que a hora do fechamento porque inclui o "obrigado pela compra"
 * que sai logo depois, e para exatamente onde o atendimento seguinte começa.
 *
 * RLS-scoped: quem não enxerga a conversa não enxerga a venda (policy de `conversa_vendas`).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail("unauthenticated", "Auth required.", 401, { requestId });

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail("no_active_org", traduzir("No active organization.", authUser?.idioma ?? "pt-BR"), 403, {
      requestId,
    });
  }

  const { data: venda, error } = await supabase
    .from("conversa_vendas")
    .select("id, iniciada_em, fechada_em, valor")
    .eq("organization_id", activeOrg.orgId)
    .eq("conversation_id", id)
    .order("fechada_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!venda) return ok(null, { requestId });

  const { data: proxima } = await supabase
    .from("messages")
    .select("sent_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("conversation_id", id)
    .eq("direction", "inbound")
    .gt("sent_at", venda.fechada_em)
    .order("sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return ok(
    {
      id: venda.id,
      iniciada_em: venda.iniciada_em,
      fechada_em: venda.fechada_em,
      valor: venda.valor === null ? null : Number(venda.valor),
      ate: proxima?.sent_at ?? null,
    },
    { requestId },
  );
}
