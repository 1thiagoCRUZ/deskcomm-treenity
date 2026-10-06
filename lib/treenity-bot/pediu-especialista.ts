/**
 * O bot chamou o especialista e ninguém atendeu ainda?
 *
 * Quando o bot do Treenity aciona `chamar_especialista`, a API do bot avisa o
 * DeskComm (`/api/treenity-bot/whatsapp/pediu-ajuda`) e `marcarPediuAjuda`
 * grava na conversa o silêncio do automático e o motivo, com o PREFIXO abaixo.
 * A conversa ia para a Fila com a mesma cara de qualquer outra — e o Dono
 * pediu (reunião de 02/10) que ela fique destacada até alguém assumir.
 *
 * Não nasce coluna nova (doutrina DIRC: calcular antes de duplicar): o alerta é
 * uma função pura sobre `last_handoff_reason`, `assigned_to_user_id` e
 * `status`, que a lista já recebe e o realtime já atualiza. Some sozinho quando
 * alguém assume (ganha dono), quando a conversa é encerrada, ou quando outro
 * motivo de passagem sobrescreve o do bot (ex.: "Pausado manualmente").
 */

export const PREFIXO_DO_PEDIDO_DE_ESPECIALISTA = "O bot chamou o especialista: ";

const ENCERRADA = new Set(["closed", "archived", "resolved"]);

export interface FatosDoPedido {
  status: string;
  assigned_to_user_id: string | null;
  last_handoff_reason?: string | null;
}

/** O motivo que o bot deu, quando o pedido está em aberto; senão `null`. */
export function pedidoDeEspecialistaAberto(c: FatosDoPedido): string | null {
  const razao = c.last_handoff_reason ?? "";
  if (!razao.startsWith(PREFIXO_DO_PEDIDO_DE_ESPECIALISTA)) return null;
  if (c.assigned_to_user_id !== null) return null;
  if (ENCERRADA.has(c.status)) return null;
  return razao.slice(PREFIXO_DO_PEDIDO_DE_ESPECIALISTA.length).trim() || null;
}
