/**
 * O "Lembrar" do Inbox vencendo: conversas com `snooze_until` vencido.
 *
 * Para cada uma, limpa o lembrete SEMPRE (não reprocessa no próximo tick). Se o
 * cliente NÃO respondeu desde que o lembrete foi criado e a conversa não está
 * fechada/arquivada, reabre (`status='open'`, sobe na lista) e cria um aviso
 * interno `snooze_expired` — nada é enviado ao cliente.
 *
 * RETORNO (7 dias, 15 dias, 1 mês ou data escolhida; ver `ehRetorno`): avisa e
 * reabre SEMPRE, mesmo que o cliente tenha respondido e mesmo com a conversa
 * fechada — é o "voltar no cliente depois da venda". Arquivada continua de fora.
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

import { ehRetorno } from "@/lib/schemas/snooze";

/** Max conversas processadas por invocação (safety cap). */
const SCAN_LIMIT = 200;

interface ConversaVencida {
  id: string;
  organization_id: string;
  snoozed_at: string | null;
  snooze_until: string | null;
  snoozed_by_user_id: string | null;
  last_inbound_at: string | null;
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
    .select("id, organization_id, snoozed_at, snooze_until, snoozed_by_user_id, last_inbound_at, status")
    .not("snooze_until", "is", null)
    .lte("snooze_until", nowIso);
  if (opts.organizationId) consulta = consulta.eq("organization_id", opts.organizationId);
  const { data: due, error } = await consulta.limit(SCAN_LIMIT);
  if (error) throw new Error(`lembretes vencidos: ${error.message}`);

  const conversas = (due ?? []) as ConversaVencida[];
  let reopened = 0;

  for (const c of conversas) {
    // Comparar como Date, não string: dois timestamptz ISO com formatos sutilmente
    // diferentes (Z vs +00:00, frações de precisão distinta) quebrariam a ordem
    // lexicográfica — e esta comparação decide se a conversa reabre.
    const leadReplied = !!(
      c.last_inbound_at &&
      c.snoozed_at &&
      new Date(c.last_inbound_at).getTime() > new Date(c.snoozed_at).getTime()
    );
    // Quem criou o lembrete é lido ANTES de limpar: o clear zera a coluna.
    const autor = c.snoozed_by_user_id;
    const clear = { snooze_until: null, snoozed_at: null, snoozed_by_user_id: null };
    const retorno = ehRetorno(c.snoozed_at, c.snooze_until);
    const willReopen = retorno
      ? c.status !== "archived"
      : !leadReplied && c.status !== "closed" && c.status !== "archived";
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
        title: retorno ? "Retorno combinado: hora de falar com o cliente" : "Lead não respondeu no prazo",
        body: autor ? JSON.stringify({ lembrete_de: autor }) : null,
        ref_kind: "conversation",
        ref_id: c.id,
      });
      reopened++;
    }
  }

  return { scanned: conversas.length, reopened };
}
