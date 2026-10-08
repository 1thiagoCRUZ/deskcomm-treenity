/**
 * Dados para nota e envio do contato, para a TELA (Contatos).
 *
 *   GET                 → os dados com o CPF mascarado (ou `data: null`).
 *   GET ?revelar=cpf    → inclui o CPF inteiro. SÓ O DONO (`admin`), decisão de
 *                         08/10; quem revelou fica no audit.
 *   PUT                 → grava só os campos que vieram (ver `dadosDeNotaEntradaSchema`).
 *
 * A organização vem da sessão (`requireRole`), nunca do corpo, e a leitura
 * passa pela RLS (`createClient`). Regras em `lib/contacts/dados-de-nota.ts`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  camposAlterados,
  dadosDeNotaEntradaSchema,
  gravarDadosDeNota,
  lerDadosDeNota,
  mascararCpfNasConversas,
  paraTela,
} from "@/lib/contacts/dados-de-nota";

export const dynamic = "force-dynamic";

async function contatoDaOrganizacao(contactId: string, organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { supabase, existe: Boolean(data), error };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { id: contactId } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "contato_dados_de_nota" });
  if (!authz.ok) return authz.response;

  const { supabase, existe, error } = await contatoDaOrganizacao(contactId, authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!existe) return fail("not_found", "Contato não encontrado.", 404, { requestId });

  const revelar = req.nextUrl.searchParams.get("revelar") === "cpf";
  if (revelar && authz.org.role !== "admin") {
    return fail("forbidden", "Só o Dono pode ver o CPF inteiro.", 403, { requestId });
  }
  try {
    const linha = await lerDadosDeNota(supabase, authz.org.orgId, contactId);
    if (linha && revelar && linha.cpf_cifrado) {
      await audit({
        action: "contact.cpf_revealed",
        actorUserId: authz.user.id,
        organizationId: authz.org.orgId,
        resourceType: "contact",
        resourceId: contactId,
        requestId,
        metadata: { motivo: "dados_de_nota" },
      });
    }
    return ok(linha ? paraTela(linha, revelar) : null, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "erro", 500, { requestId });
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = randomUUID();
  const { id: contactId } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "contato_dados_de_nota" });
  if (!authz.ok) return authz.response;
  const bloqueio = await requireSupportWrite(authz.org.orgId);
  if (bloqueio) return bloqueio;

  const entrada = dadosDeNotaEntradaSchema.safeParse(await req.json().catch(() => null));
  if (!entrada.success) {
    return fail("validation_failed", entrada.error.issues[0]?.message ?? "Dados inválidos.", 422, {
      requestId,
      details: entrada.error.issues,
    });
  }

  const { supabase, existe, error } = await contatoDaOrganizacao(contactId, authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!existe) return fail("not_found", "Contato não encontrado.", 404, { requestId });

  try {
    const linha = await gravarDadosDeNota(supabase, authz.org.orgId, contactId, entrada.data, "equipe");
    // A equipe copiou o CPF de uma conversa: ele sai do texto dela também.
    if (entrada.data.cpf) {
      await mascararCpfNasConversas(createAdminClient(), authz.org.orgId, contactId, entrada.data.cpf);
    }
    await audit({
      action: "contact.dados_de_nota_updated",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "contact",
      resourceId: contactId,
      requestId,
      metadata: { campos: camposAlterados(entrada.data), preenchido_por: "equipe" },
    });
    return ok(paraTela(linha), { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "erro", 500, { requestId });
  }
}
