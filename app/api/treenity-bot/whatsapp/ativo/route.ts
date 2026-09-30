/**
 * GET /api/treenity-bot/whatsapp/ativo — a organização ativa usa o Treenity
 * Bot pelo Inbox? A tela da conversa pergunta aqui para trocar o "Fechar"
 * comum pelo "Como terminou?". Qualquer atendente pode perguntar: é um sim ou
 * não, sem nada da configuração (a rota de configurações é só de admin).
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { botDoTreenityAtende } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "treenity_bot" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", authz.org.orgId).maybeSingle();
  return ok({ ativo: botDoTreenityAtende(data?.settings ?? null) }, { requestId });
}
