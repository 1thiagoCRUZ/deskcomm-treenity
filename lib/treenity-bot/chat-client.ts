/**
 * Cliente de chat interno do Treenity Bot — SÓ roda no navegador.
 *
 * Diferente de `client.ts` (que busca dados prontos no servidor, pro dashboard
 * e a tela de atendimentos), o chat precisa de um socket.io persistente no
 * navegador, então aqui a gente fala direto com a API do bot: primeiro busca
 * um accessToken pela rota-ponte `/api/treenity-bot/sso` (que troca esse
 * pedido pelo segredo de SSO no servidor — o segredo em si nunca chega aqui),
 * depois usa esse token pra chamar a API do bot e abrir o socket.
 */
"use client";

import { io, type Socket } from "socket.io-client";

export interface SessaoChatBot {
  accessToken: string;
  apiUrl: string;
  usuario: { id: string; nome: string; email: string; papel: "admin" | "funcionario" };
}

export interface UsuarioBot {
  id: string;
  nome: string;
  papel: "admin" | "funcionario";
}

export interface ConversaBot {
  id: string;
  adminId: string;
  funcionarioId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MensagemBot {
  id: string;
  conversaId: string;
  remetenteId: string;
  conteudo: string;
  criadoEm: string;
}

/** Uma linha de `GET /api/chat/conversas`: a conversa, o outro lado e a última mensagem (prévia). */
export interface ConversaResumo {
  id: string;
  atualizadoEm: string;
  outroUsuario: UsuarioBot;
  ultimaMensagem: {
    id: string;
    remetenteId: string;
    /** `null` quando a mensagem está ilegível no bot. */
    conteudo: string | null;
    criadoEm: string;
  } | null;
}

/** Troca a sessão deskcomm atual por um accessToken da API do bot. `null` = não configurado ou indisponível. */
export async function buscarSessaoChat(): Promise<SessaoChatBot | null> {
  try {
    const res = await fetch("/api/treenity-bot/sso", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SessaoChatBot;
  } catch {
    return null;
  }
}

async function chamarApiBot<T>(sessao: SessaoChatBot, path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${sessao.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${sessao.accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as T) : null;
  } catch {
    return null;
  }
}

/** Diretório de usuários da plataforma do bot — pra escolher com quem conversar. */
export async function listarUsuariosBot(sessao: SessaoChatBot): Promise<UsuarioBot[]> {
  const usuarios = await chamarApiBot<UsuarioBot[]>(sessao, "/api/auth/usuarios");
  return (usuarios ?? []).filter((u) => u.id !== sessao.usuario.id);
}

/** Conversas do usuário, da mais recente pra mais antiga. `null` = falha (ou bot sem o endpoint ainda). */
export async function listarConversasBot(sessao: SessaoChatBot): Promise<ConversaResumo[] | null> {
  return chamarApiBot<ConversaResumo[]>(sessao, "/api/chat/conversas");
}

/**
 * Busca ou cria a conversa com outro usuário. Os nomes `adminId`/`funcionarioId`
 * são só rótulos herdados do schema do bot — a API trata os dois lados de
 * forma simétrica, não importa quem entra em qual campo.
 */
export async function iniciarConversa(sessao: SessaoChatBot, outroUsuarioId: string): Promise<ConversaBot | null> {
  return chamarApiBot<ConversaBot>(sessao, "/api/chat/init", {
    method: "POST",
    body: JSON.stringify({ adminId: sessao.usuario.id, funcionarioId: outroUsuarioId }),
  });
}

/** `null` = falha ao buscar (token vencido, API fora do ar); `[]` = conversa sem mensagens. */
export async function buscarHistorico(sessao: SessaoChatBot, conversaId: string): Promise<MensagemBot[] | null> {
  return chamarApiBot<MensagemBot[]>(sessao, `/api/chat/history/${encodeURIComponent(conversaId)}`);
}

/** Abre a conexão de socket autenticada — quem chama é responsável por fechar (`socket.disconnect()`). */
export function conectarSocketChat(sessao: SessaoChatBot): Socket {
  return io(`${sessao.apiUrl}/chat`, {
    auth: { token: sessao.accessToken },
    transports: ["websocket", "polling"],
  });
}
