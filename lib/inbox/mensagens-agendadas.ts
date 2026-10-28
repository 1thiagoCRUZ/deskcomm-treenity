/**
 * O "Lembrar" do Inbox, parte "Janela aberta": manda ao cliente, no horário
 * marcado, a mensagem que a pessoa escreveu (tabela `mensagens_agendadas`,
 * migration 0249).
 *
 * Confere de novo NA HORA, porque o mundo mudou desde o agendamento:
 *   - o cliente respondeu depois do agendamento -> não manda: um "conseguiu
 *     ver?" logo depois de ele ter respondido soa como robô sem ouvido;
 *   - a janela de 24 h fechou -> não manda: fora dela só sai modelo pago, e a
 *     plataforma recusaria o texto (131047);
 *   - a conversa foi arquivada -> não manda.
 * Em todos esses casos quem marcou recebe o aviso (`snooze_expired` com
 * `lembrete_de`, o mesmo toast do "Me lembrar"), e a conversa sobe no Inbox.
 *
 * O envio é o caminho de qualquer mensagem (`sendMessageHandler`), em nome de
 * quem marcou: aparece na conversa como mensagem dela. Não assume a conversa
 * no Treenity Bot (o "responder assume" é de quem está na tela respondendo);
 * se o cliente responder, o atendimento segue como estava.
 *
 * Dois chamadores, como `vencer-lembretes.ts`: o cron da instalação
 * (`snooze-watcher`) e `/api/treenity-bot/lembretes/vencer` (n8n, 5 em 5 min).
 * O horário marcado tem, portanto, até 5 minutos de folga.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { estadoDaJanela } from "@/lib/channels/janela";
import { logger } from "@/lib/logger";

const SCAN_LIMIT = 100;

export type MotivoDeNaoEnviar =
  | "cliente_respondeu"
  | "janela_fechada"
  | "conversa_arquivada"
  | "sem_autor"
  | "falha_no_envio";

const TITULO: Record<MotivoDeNaoEnviar, string> = {
  cliente_respondeu: "Mensagem marcada não foi: o cliente respondeu antes",
  janela_fechada: "Mensagem marcada não foi: a janela de 24 horas fechou",
  conversa_arquivada: "Mensagem marcada não foi: a conversa foi arquivada",
  sem_autor: "Mensagem marcada não foi: quem marcou saiu da equipe",
  falha_no_envio: "Mensagem marcada não saiu: veja a conversa",
};

interface Agendada {
  id: string;
  organization_id: string;
  conversation_id: string;
  criado_por_user_id: string | null;
  body: string;
  created_at: string;
}

interface Conversa {
  status: string;
  last_inbound_at: string | null;
  channel_sessions: { provider: string | null } | { provider: string | null }[] | null;
}

export interface ResultadoDasAgendadas {
  scanned: number;
  enviadas: number;
  nao_enviadas: number;
}

/** O que impede o envio agora, ou `null` se pode mandar. Puro, para teste. */
export function motivoParaNaoEnviar(
  agendada: Pick<Agendada, "criado_por_user_id" | "created_at">,
  conversa: Conversa | null,
  agora: Date,
): Exclude<MotivoDeNaoEnviar, "falha_no_envio"> | null {
  if (!conversa || conversa.status === "archived") return "conversa_arquivada";
  if (!agendada.criado_por_user_id) return "sem_autor";
  if (
    conversa.last_inbound_at &&
    new Date(conversa.last_inbound_at).getTime() > new Date(agendada.created_at).getTime()
  ) {
    return "cliente_respondeu";
  }
  const sessao = Array.isArray(conversa.channel_sessions) ? conversa.channel_sessions[0] : conversa.channel_sessions;
  if (estadoDaJanela(sessao?.provider ?? null, conversa.last_inbound_at, agora).tipo === "fechada") {
    return "janela_fechada";
  }
  return null;
}

export async function enviarMensagensAgendadas(
  admin: SupabaseClient,
  opts: { organizationId?: string; agora?: Date } = {},
): Promise<ResultadoDasAgendadas> {
  const agora = opts.agora ?? new Date();
  let consulta = admin
    .from("mensagens_agendadas")
    .select("id, organization_id, conversation_id, criado_por_user_id, body, created_at")
    .eq("status", "agendada")
    .lte("enviar_em", agora.toISOString());
  if (opts.organizationId) consulta = consulta.eq("organization_id", opts.organizationId);
  const { data, error } = await consulta.order("enviar_em").limit(SCAN_LIMIT);
  if (error) throw new Error(`mensagens agendadas: ${error.message}`);

  const resultado: ResultadoDasAgendadas = { scanned: data?.length ?? 0, enviadas: 0, nao_enviadas: 0 };

  for (const a of (data ?? []) as Agendada[]) {
    // Claim atômico: só quem vira 'agendada' -> 'enviando' manda.
    const { data: claimed } = await admin
      .from("mensagens_agendadas")
      .update({ status: "enviando" })
      .eq("id", a.id)
      .eq("organization_id", a.organization_id)
      .eq("status", "agendada")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: conv } = await admin
      .from("conversations")
      .select("status, last_inbound_at, channel_sessions:channel_session_id(provider)")
      .eq("id", a.conversation_id)
      .eq("organization_id", a.organization_id)
      .maybeSingle();

    let motivo: MotivoDeNaoEnviar | null = motivoParaNaoEnviar(a, conv as Conversa | null, agora);
    let messageId: string | null = null;

    if (!motivo) {
      try {
        const msg = await sendMessageHandler(
          admin,
          {
            organization_id: a.organization_id,
            actor: { type: "user", id: a.criado_por_user_id as string },
            requestId: `mensagem-agendada:${a.id}`,
          },
          {
            conversation_id: a.conversation_id,
            type: "text",
            body: a.body,
            metadata: { mensagem_agendada_id: a.id },
          } as Parameters<typeof sendMessageHandler>[2],
        );
        messageId = msg.id;
        // O desfecho vem do estado da mensagem: o handler marca `failed` e devolve normalmente.
        if (msg.status === "failed") motivo = "falha_no_envio";
      } catch (err) {
        logger.warn("[mensagens-agendadas] envio falhou", {
          mensagem_agendada_id: a.id,
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        });
        motivo = "falha_no_envio";
      }
    }

    await admin
      .from("mensagens_agendadas")
      .update(motivo ? { status: "nao_enviada", motivo, message_id: messageId } : { status: "enviada", message_id: messageId })
      .eq("id", a.id)
      .eq("organization_id", a.organization_id);

    if (!motivo) {
      resultado.enviadas++;
      continue;
    }
    resultado.nao_enviadas++;

    // Avisa quem marcou e sobe a conversa (arquivada fica onde está).
    if (motivo !== "conversa_arquivada") {
      await admin
        .from("conversations")
        .update({ status: "open", last_message_at: agora.toISOString() })
        .eq("id", a.conversation_id)
        .eq("organization_id", a.organization_id)
        .neq("status", "archived");
    }
    await admin.from("agent_inbox_items").insert({
      organization_id: a.organization_id,
      kind: "snooze_expired",
      severity: "warn",
      title: TITULO[motivo],
      body: JSON.stringify(a.criado_por_user_id ? { lembrete_de: a.criado_por_user_id, motivo } : { motivo }),
      ref_kind: "conversation",
      ref_id: a.conversation_id,
    });
  }

  return resultado;
}
