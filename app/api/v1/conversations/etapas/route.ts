/**
 * GET /api/v1/conversations/etapas — os funis da organização com as etapas de cada
 * um, para o filtro "Etapa" do Inbox (Spec 18, F3).
 *
 * ⚠️ É UMA ROTA DO SERVIDOR, e não uma leitura direta do browser, pelo mesmo motivo de
 * `conversation-tags`: o cookie de sessão é HttpOnly, então o client do browser não
 * lê a sessão e consultaria como `anon`.
 *
 * ⚠️ O PAPEL É `viewer`, e não `manager` como em `GET /api/v1/pipelines`. Aquela rota é
 * a da TELA DE GESTÃO de funis; esta é uma leitura de rótulos para filtrar — quem vê o
 * Inbox precisa dela, e o que ela devolve (nome, cor e id de etapa) o quadro já mostra
 * a qualquer papel. Nada de contagem, lead ou configuração viaja aqui.
 *
 * ⚠️ `organization_id` SAI DO JWT, e o filtro é explícito nas DUAS tabelas: a RLS de
 * `crm_pipelines`/`crm_stages` libera TODAS as organizações do usuário, e quem participa
 * de duas veria os funis das duas misturados no mesmo seletor.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import type { EtapaDoFiltro, FunilDoFiltro } from "@/lib/inbox/etapas-do-filtro";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const supabase = await createClient();

  const { data: funis, error: funisErr } = await supabase
    .from("crm_pipelines")
    .select("id, name, is_default")
    .eq("organization_id", orgId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (funisErr) return fail("internal_error", funisErr.message, 500, { requestId });

  const { data: etapas, error: etapasErr } = await supabase
    .from("crm_stages")
    .select("id, pipeline_id, name, color, is_won, is_lost")
    .eq("organization_id", orgId)
    .eq("is_archived", false)
    .order("position", { ascending: true });
  if (etapasErr) return fail("internal_error", etapasErr.message, 500, { requestId });

  const porFunil = new Map<string, EtapaDoFiltro[]>();
  for (const e of (etapas ?? []) as Array<EtapaDoFiltro & { pipeline_id: string }>) {
    const lista = porFunil.get(e.pipeline_id) ?? [];
    lista.push({ id: e.id, name: e.name, color: e.color, is_won: e.is_won, is_lost: e.is_lost });
    porFunil.set(e.pipeline_id, lista);
  }

  const corpo: FunilDoFiltro[] = ((funis ?? []) as Array<{ id: string; name: string; is_default: boolean }>)
    // Funil sem etapa não tem o que filtrar: o seletor mostraria um grupo vazio.
    .filter((f) => (porFunil.get(f.id)?.length ?? 0) > 0)
    .map((f) => ({ id: f.id, name: f.name, is_default: f.is_default, etapas: porFunil.get(f.id) ?? [] }));

  return ok(corpo, { requestId });
}
