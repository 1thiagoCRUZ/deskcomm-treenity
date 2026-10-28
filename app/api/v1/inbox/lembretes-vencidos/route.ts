/**
 * GET /api/v1/inbox/lembretes-vencidos — os avisos do "Lembrar" das últimas
 * 12 horas, criados por QUEM PERGUNTA: o "Me lembrar" que venceu e a mensagem
 * marcada que não foi (cliente respondeu antes, janela fechou). `titulo` diz qual.
 *
 * Quem chama é a tela (`components/app/AvisoDeLembretes.tsx`), a cada minuto,
 * para avisar com toast e notificação do sistema. O aviso é o `snooze_expired`
 * que `lib/inbox/vencer-lembretes.ts` grava; o `body` diz quem criou o lembrete.
 * Lembrete sem autor (anterior a esta versão) avisa qualquer pessoa da equipe.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const JANELA_MS = 12 * 60 * 60 * 1000;

function autorDoLembrete(body: string | null): string | null {
  if (!body) return null;
  try {
    const lido = JSON.parse(body) as { lembrete_de?: unknown };
    return typeof lido.lembrete_de === "string" ? lido.lembrete_de : null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "agent_inbox_items" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { data: itens, error } = await supabase
    .from("agent_inbox_items")
    .select("id, ref_id, title, body, created_at")
    .eq("organization_id", authz.org.orgId)
    .eq("kind", "snooze_expired")
    .is("resolved_at", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const meus = (itens ?? []).filter((i) => {
    const autor = autorDoLembrete(i.body as string | null);
    return autor === null || autor === authz.user.id;
  });
  if (meus.length === 0) return ok([], { requestId });

  const ids = [...new Set(meus.map((i) => i.ref_id as string).filter(Boolean))];
  const { data: conversas } = await supabase
    .from("conversations")
    .select("id, contacts:contact_id (display_name, name, phone_number)")
    .eq("organization_id", authz.org.orgId)
    .in("id", ids);
  const nomePorConversa = new Map(
    (conversas ?? []).map((c) => {
      const contato = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
      return [c.id as string, rotuloDoContato(contato ?? null)];
    }),
  );

  return ok(
    meus.map((i) => ({
      id: i.id as string,
      conversa_id: i.ref_id as string,
      contato: nomePorConversa.get(i.ref_id as string) ?? "Cliente",
      titulo: (i.title as string | null) ?? null,
      vencido_em: i.created_at as string,
    })),
    { requestId },
  );
}
