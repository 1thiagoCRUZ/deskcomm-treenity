import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET    /api/v1/conversations/[id]/mensagem-agendada — a mensagem marcada desta conversa (ou `null`).
 * POST   /api/v1/conversations/[id]/mensagem-agendada — marca: `{ minutos, texto }`.
 * DELETE /api/v1/conversations/[id]/mensagem-agendada — cancela a marcada.
 *
 * O "Lembrar" do Inbox, parte "Janela aberta" (pedido do Rodrigo, 27/10/2026):
 * quem envia na hora é `lib/inbox/mensagens-agendadas.ts`. Aqui só se marca, e
 * só DENTRO da janela de 24 h desta conversa: com a janela fechada, ou com o
 * horário depois do fim dela, a resposta é 422 com o motivo (texto livre fora
 * da janela não sai; só modelo pago).
 *
 * Uma marcada por conversa (índice parcial da 0249): a segunda é 409.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, noContent, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { estadoDaJanela } from "@/lib/channels/janela";
import { traduzir } from "@/lib/i18n/dicionario";
import { mensagemAgendadaSchema } from "@/lib/schemas/snooze";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const COLUNAS = "id, body, enviar_em, criado_por_user_id, created_at";

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensagens_agendadas")
    .select(COLUNAS)
    .eq("organization_id", authz.org.orgId)
    .eq("conversation_id", id)
    .eq("status", "agendada")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? null, { requestId });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = mensagemAgendadaSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, last_inbound_at, channel_sessions:channel_session_id(provider)")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const sessao = Array.isArray(conv.channel_sessions) ? conv.channel_sessions[0] : conv.channel_sessions;
  const agora = new Date();
  const janela = estadoDaJanela(
    (sessao as { provider?: string | null } | null)?.provider ?? null,
    conv.last_inbound_at as string | null,
    agora,
  );
  const enviarEm = new Date(agora.getTime() + parsed.data.minutos * 60_000);
  if (janela.tipo === "fechada") {
    return fail(
      "janela_fechada",
      t("A janela de 24 horas está fechada: só dá para mandar mensagem depois que o cliente escrever. Use \"Me lembrar\"."),
      422,
      { requestId },
    );
  }
  if (janela.tipo === "aberta" && parsed.data.minutos * 60_000 > janela.restanteMs) {
    return fail(
      "depois_da_janela",
      t("Esse horário passa do fim da janela de 24 horas. Escolha um horário mais cedo."),
      422,
      { requestId, details: { janela_fecha_em: new Date(agora.getTime() + janela.restanteMs).toISOString() } },
    );
  }

  const { data, error } = await supabase
    .from("mensagens_agendadas")
    .insert({
      organization_id: org.orgId,
      conversation_id: conv.id,
      criado_por_user_id: user.id,
      body: parsed.data.texto,
      enviar_em: enviarEm.toISOString(),
    })
    .select(COLUNAS)
    .single();
  if (error?.code === "23505") {
    return fail("ja_marcada", t("Já tem uma mensagem marcada nesta conversa. Cancele a outra antes."), 409, { requestId });
  }
  if (error || !data) return fail("internal_error", error?.message ?? "insert_failed", 500, { requestId });

  void audit({
    action: "conversation.mensagem_agendada",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
    metadata: { mensagem_agendada_id: data.id, enviar_em: data.enviar_em, minutos: parsed.data.minutos },
  });
  return ok(data, { status: 201, requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensagens_agendadas")
    .update({ status: "cancelada" })
    .eq("organization_id", org.orgId)
    .eq("conversation_id", id)
    .eq("status", "agendada")
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("not_found", t("Não há mensagem marcada nesta conversa."), 404, { requestId });

  void audit({
    action: "conversation.mensagem_agendada_cancelada",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: id,
    requestId,
    metadata: { mensagem_agendada_id: data.id },
  });
  return noContent(requestId);
}
