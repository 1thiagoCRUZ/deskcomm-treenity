/**
 * GET /api/v1/vendas-fechadas?horas=24 — as VENDAS fechadas nas últimas N horas (a aba
 * Fechadas do Inbox), uma linha por venda, da mais recente para a mais antiga.
 *
 * Uma venda é uma venda: o cliente que comprou às 12h e voltou às 20h aparece duas
 * vezes, e cada uma abre a sua própria conversa. RLS-scoped: só entram as vendas de
 * conversas que quem pergunta enxerga.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface VendaFechadaDaLista {
  id: string;
  conversation_id: string;
  fechada_em: string;
  valor: number | null;
  contact: {
    id: string;
    display_name: string | null;
    name: string | null;
    phone_number: string | null;
    is_anonymized: boolean | null;
    avatar_storage_path: string | null;
  } | null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
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

  const horasBrutas = Number(new URL(req.url).searchParams.get("horas") ?? "24");
  const horas = Number.isFinite(horasBrutas) ? Math.min(Math.max(Math.trunc(horasBrutas), 1), 8760) : 24;
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();

  const { data, error } = await supabase
    .from("conversa_vendas")
    .select(
      "id, conversation_id, fechada_em, valor, conversations:conversation_id(contacts:contact_id(id, display_name, name, phone_number, is_anonymized, avatar_storage_path))",
    )
    .eq("organization_id", activeOrg.orgId)
    .gte("fechada_em", desde)
    .order("fechada_em", { ascending: false })
    .limit(100);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  type Linha = {
    id: string;
    conversation_id: string;
    fechada_em: string;
    valor: number | string | null;
    conversations: { contacts: VendaFechadaDaLista["contact"] } | { contacts: VendaFechadaDaLista["contact"] }[] | null;
  };
  const vendas: VendaFechadaDaLista[] = ((data ?? []) as unknown as Linha[]).map((l) => {
    const conversa = Array.isArray(l.conversations) ? (l.conversations[0] ?? null) : l.conversations;
    return {
      id: l.id,
      conversation_id: l.conversation_id,
      fechada_em: l.fechada_em,
      valor: l.valor === null ? null : Number(l.valor),
      contact: conversa?.contacts ?? null,
    };
  });
  return ok(vendas, { requestId });
}
