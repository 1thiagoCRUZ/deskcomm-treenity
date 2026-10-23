/**
 * Fechar pelo Inbox avisa o bot de como o atendimento terminou.
 *
 * O bot só sabe que uma venda fechou quando ELE fecha (ferramenta de
 * pagamento). Venda conduzida por uma pessoa no Inbox ficava invisível: a
 * conversa aberta, o atendimento do bot aberto, o faturamento sem ela e o card
 * do funil parado. Esta chamada encerra o atendimento no bot
 * (`POST /api/atendimentos/encerrar-por-cliente`) e, com venda, registra a
 * venda lá — o card do funil "Treenity Bot" acompanha pelo sincronismo, que já
 * lê do bot (ganho com venda, perdido sem).
 *
 * Nunca lança: quem chama decide o que mostrar a partir do desfecho.
 */
import { logger } from "@/lib/logger";

import { comRenovacaoEm401, trocarToken } from "./client";
import { getConfig } from "./config";
import { idsFaceDoTelefone } from "./devolver-ao-bot";

export type DesfechoNoBot = "encerrado" | "sem_atendimento_aberto" | "falhou";

const TEMPO_MAXIMO_MS = 8_000;

export interface ResultadoDoEncerramento {
  desfecho: DesfechoNoBot;
  /** O id da venda no bot (criada ou atualizada), quando houve venda. */
  vendaId: string | null;
  /**
   * Vendas do cliente que seguem "Aguardando Pagamento" e NÃO foram marcadas (o bot não
   * escolhe entre várias). 0 também quando o bot é antigo e não informa.
   */
  aguardandoPendentes: number;
}

export async function encerrarAtendimentoNoBot(pedido: {
  telefone: string;
  usuario: { email: string; nome: string };
  /** Em reais. Ausente = terminou sem venda. */
  valorDaVenda: number | null;
  /** Só o primeiro nome de quem fechou (LGPD: nunca e-mail). */
  fechadaPor: string;
  /** Início do atendimento atual da conversa (ISO): só vendas criadas depois dele podem ser marcadas sozinhas. */
  desde?: string | null;
}): Promise<ResultadoDoEncerramento> {
  try {
    const config = getConfig();
    const sessao = config ? await trocarToken(pedido.usuario) : null;
    if (!config || !sessao) return { desfecho: "falhou", vendaId: null, aguardandoPendentes: 0 };

    const res = await comRenovacaoEm401(pedido.usuario, sessao.accessToken, (accessToken) => fetch(`${config.apiUrl}/api/atendimentos/encerrar-por-cliente`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Segredo de servidor: a API do bot passa a exigi-lo nas mutações. Nunca vai ao navegador nem a log.
        "X-SSO-Secret": config.ssoSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id_faces: idsFaceDoTelefone(pedido.telefone),
        ...(pedido.valorDaVenda !== null ? { venda: { valor_total: pedido.valorDaVenda } } : {}),
        fechada_por: pedido.fechadaPor,
        ...(pedido.desde ? { desde: pedido.desde } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    }));
    if (res.status === 404) return { desfecho: "sem_atendimento_aberto", vendaId: null, aguardandoPendentes: 0 };
    if (!res.ok) {
      logger.error("[treenity-bot] API do bot recusou o encerramento", { status: res.status });
      return { desfecho: "falhou", vendaId: null, aguardandoPendentes: 0 };
    }
    const json = (await res.json().catch(() => null)) as {
      data?: { atendimentoId?: string | null; vendaId?: string | null; aguardandoPendentes?: number };
    } | null;
    const pendentes = json?.data?.aguardandoPendentes;
    return {
      // Bot novo devolve atendimentoId null quando não havia atendimento aberto.
      desfecho: json?.data && json.data.atendimentoId === null ? "sem_atendimento_aberto" : "encerrado",
      vendaId: json?.data?.vendaId ?? null,
      aguardandoPendentes: typeof pendentes === "number" && pendentes > 0 ? Math.floor(pendentes) : 0,
    };
  } catch (err) {
    logger.error("[treenity-bot] não foi possível encerrar o atendimento no bot", {
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { desfecho: "falhou", vendaId: null, aguardandoPendentes: 0 };
  }
}
