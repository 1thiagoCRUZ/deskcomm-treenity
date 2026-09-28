/**
 * POST /api/treenity-bot/configuracoes/chave-whatsapp — gera a chave que o n8n
 * usa para enviar as respostas do bot pelo DeskComm (ver
 * `lib/treenity-bot/whatsapp.ts`). Só admin.
 *
 * O texto da chave volta UMA vez, nesta resposta; no banco fica só o hash.
 * Gerar de novo invalida a anterior na hora — é assim que se troca uma chave
 * vazada.
 */
import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { gerarChave, gravarConfigDoWhatsApp, lerConfigDoWhatsApp } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "treenity_bot_config" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  const { data: org, error: selErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (selErr || !org) {
    return fail("internal_error", t("Erro ao carregar a configuração."), 500, { requestId });
  }

  const settings =
    org.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
      ? (org.settings as Record<string, unknown>)
      : {};
  const treenityBot =
    settings.treenity_bot && typeof settings.treenity_bot === "object" && !Array.isArray(settings.treenity_bot)
      ? (settings.treenity_bot as Record<string, unknown>)
      : {};

  const { chave, hash } = gerarChave(authz.org.orgId);
  const criadaEm = new Date().toISOString();
  const whatsapp = { ...lerConfigDoWhatsApp(treenityBot), chaveHash: hash, chaveCriadaEm: criadaEm };

  const { error: updErr } = await admin
    .from("organizations")
    .update({
      settings: { ...settings, treenity_bot: { ...treenityBot, whatsapp: gravarConfigDoWhatsApp(whatsapp) } },
    })
    .eq("id", authz.org.orgId);
  if (updErr) {
    return fail("internal_error", t("Erro ao salvar a configuração."), 500, { requestId });
  }

  await audit({
    action: "token.created",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "treenity_bot_whatsapp_key",
    requestId,
    metadata: { criada_em: criadaEm },
  });

  return ok({ chave, criada_em: criadaEm }, { requestId });
}
