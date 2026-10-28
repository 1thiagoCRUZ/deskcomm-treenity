/**
 * O "Me lembrar" do Inbox vencendo: conversas com `snooze_until` vencido.
 *
 * Para cada uma, limpa o lembrete SEMPRE (não reprocessa no próximo tick), e,
 * se a conversa não está arquivada, reabre (`status='open'`, sobe na lista) e
 * cria um aviso interno `snooze_expired` — nada é enviado ao cliente.
 *
 * Avisa SEMPRE, mesmo que o cliente tenha respondido e mesmo com a conversa
 * fechada (pedido do Rodrigo, 27/10/2026): o lembrete é da pessoa que o marcou
 * ("voltar no cliente daqui a 3 meses"). Até então o prazo curto (1 h, 3 h,
 * 24 h) só avisava se o cliente não respondesse; esse papel passou para a parte
 * "Janela aberta", que manda a mensagem ao cliente
 * (`lib/inbox/mensagens-agendadas.ts`).
 *
 * Saiu de dentro de `app/api/v1/cron/snooze-watcher` para ter dois chamadores:
 *   - o cron da instalação (VPS: o contêiner `scheduler`), todas as empresas;
 *   - `/api/treenity-bot/lembretes/vencer`, que o n8n chama a cada 5 minutos com
 *     a chave `tbw_` de UMA empresa. Na Vercel (plano Hobby) não há cron de 5 min,
 *     e sem isto o lembrete nunca vencia: o botão dizia "Lembrete ativo" e nada
 *     acontecia (medido em 10/10).
 *
 * O aviso leva no `body` quem criou o lembrete (`{"lembrete_de": <user id>}`):
 * é por ele que a tela avisa SÓ essa pessoa (`/api/v1/inbox/lembretes-vencidos`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Max conversas processadas por invocação (safety cap). */
const SCAN_LIMIT = 200;

interface ConversaVencida {
  id: string;
  organization_id: string;
  snoozed_at: string | null;
  snooze_until: string | null;
  snoozed_by_user_id: string | null;
  status: string;
}

export interface ResultadoDosLembretes {
  scanned: number;
  reopened: number;
}

export async function vencerLembretes(
  admin: SupabaseClient,
  opts: { organizationId?: string; agora?: Date } = {},
): Promise<ResultadoDosLembretes> {
  const nowIso = (opts.agora ?? new Date()).toISOString();
  let consulta = admin
    .from("conversations")
    .select("id, organization_id, snoozed_at, snooze_until, snoozed_by_user_id, status")
    .not("snooze_until", "is", null)
    .lte("snooze_until", nowIso);
  if (opts.organizationId) consulta = consulta.eq("organization_id", opts.organizationId);
  const { data: due, error } = await consulta.limit(SCAN_LIMIT);
  if (error) throw new Error(`lembretes vencidos: ${error.message}`);

  const conversas = (due ?? []) as ConversaVencida[];
  let reopened = 0;

  for (const c of conversas) {
    // Quem criou o lembrete é lido ANTES de limpar: o clear zera a coluna.
    const autor = c.snoozed_by_user_id;
    const clear = { snooze_until: null, snoozed_at: null, snoozed_by_user_id: null };
    const willReopen = c.status !== "archived";
    const fields = willReopen ? { ...clear, status: "open", last_message_at: nowIso } : clear;

    // O clear É o claim atômico: `.not("snooze_until","is",null)` garante que só
    // quem ainda vê o lembrete não-nulo processa a row. Dois ticks concorrentes
    // (o cron e o n8n, ou um curl manual) nunca geram aviso duplicado.
    const { data: claimed } = await admin
      .from("conversations")
      .update(fields)
      .eq("id", c.id)
      .eq("organization_id", c.organization_id)
      .not("snooze_until", "is", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    if (willReopen) {
      await admin.from("agent_inbox_items").insert({
        organization_id: c.organization_id,
        kind: "snooze_expired",
        severity: "warn",
        title: "Lembrete: hora de falar com o cliente",
        body: autor ? JSON.stringify({ lembrete_de: autor }) : null,
        ref_kind: "conversation",
        ref_id: c.id,
      });
      reopened++;
    }
  }

  return { scanned: conversas.length, reopened };
}
