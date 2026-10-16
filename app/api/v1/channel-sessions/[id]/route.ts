/**
 * DELETE /api/v1/channel-sessions/[id] — remove um número de WhatsApp da empresa. Só a Gestão Treenity.
 *
 * Na verdade ARQUIVA: conversas e mensagens referenciam o canal por FK, e apagar a linha levaria o
 * histórico junto. Arquivado, o canal some das telas, do envio e do webhook. Para o canal oficial
 * da Meta isso também:
 *   - apaga a credencial guardada (`meta_token_encrypted`), e
 *   - troca o código secreto do endereço de webhook (`webhook_path_token`), o que CORTA a entrega
 *     da Meta ao canal antigo — é de propósito. Ao conectar o número novo, a tela mostra o
 *     endereço novo para colar na Meta.
 *
 * A Gestão (e não o Dono) executa porque o passo seguinte é na Meta, e esquecê-lo deixa a empresa
 * sem receber mensagens. O Dono pede a troca em `/api/v1/gestao/pedidos`.
 *
 * `organization_id` vem da sessão — nunca do path ou do corpo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { ehGestaoTreenity } from "@/lib/treenity/papeis";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await params;
  const authz = await requireRole("admin", {
    requestId,
    resource: "channel_sessions",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  if (!ehGestaoTreenity(authz.user)) {
    return fail("forbidden_role", t("Remover um número é da equipe Treenity. Peça pela tela de Conexões."), 403, {
      requestId,
    });
  }
  if (await mfaEmDivida()) {
    return fail("mfa_required", t("Confirme a verificação em duas etapas."), 403, { requestId });
  }

  const supabase = await createClient();
  const { data: sessao } = await supabase
    .from("channel_sessions")
    .select("id, provider, phone_number")
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!sessao) return fail("not_found", t("Canal não encontrado."), 404, { requestId });

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("channel_sessions")
    .update({
      archived_at: agora,
      status: "STOPPED",
      last_status_change_at: agora,
      meta_token_encrypted: null,
      webhook_path_token: randomUUID().replace(/-/g, ""),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", id);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "channel.archived",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    metadata: { provider: sessao.provider, phone_number: sessao.phone_number },
  });

  return ok({ id, archived: true }, { requestId });
}
