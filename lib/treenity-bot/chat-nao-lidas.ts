"use client";

/**
 * Quantas mensagens do Chat da equipe você ainda não leu — o número do selo no
 * menu, como o do WhatsApp (pedido do Dono, reunião de 02/10).
 *
 * Um valor só para a aba inteira, sem React Query: quem ESCREVE é o
 * `TreenityBotAlertProvider` (que já mantém o socket do bot aberto em todo o
 * /app e ouve `chat_nova_mensagem`) e a tela do chat (quando você lê); quem LÊ
 * é a barra lateral. A fonte da verdade é a API do bot (`/api/chat/nao-lidas`):
 * aqui só se guarda a última resposta dela.
 */

import { useSyncExternalStore } from "react";
import { buscarSessaoChat, totalNaoLidasBot, type SessaoChatBot } from "./chat-client";

let total = 0;
const ouvintes = new Set<() => void>();

function definir(n: number) {
  if (n === total) return;
  total = n;
  for (const avisar of ouvintes) avisar();
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

/** O número atual. Zero no servidor e até a primeira resposta da API. */
export function useChatNaoLidas(): number {
  return useSyncExternalStore(assinar, () => total, () => 0);
}

/** Pergunta de novo à API do bot. Falha de rede mantém o número anterior. */
export async function atualizarChatNaoLidas(sessao?: SessaoChatBot | null): Promise<void> {
  const s = sessao ?? (await buscarSessaoChat());
  if (!s) return;
  const n = await totalNaoLidasBot(s);
  if (n !== null) definir(n);
}

/** Só para testes. */
export function __definirChatNaoLidasParaTeste(n: number) {
  definir(n);
}
