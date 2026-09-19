"use server";
/**
 * Server Action do botão "Encerrar atendimento" na transcrição do Treenity Bot.
 *
 * Sem isso, um atendimento sinalizado (IA pausada esperando um humano) ficava
 * PRA SEMPRE nesse estado depois que alguém assumia na mão — nada no painel
 * avisava a API do bot que a situação foi resolvida. `POST /:id/encerrar`
 * marca `statusFunil: 'Fechada'`; a próxima mensagem desse cliente no bot abre
 * um atendimento novo e a IA volta a responder normalmente.
 */
import { revalidatePath } from "next/cache";

import { loadAuthUser } from "@/lib/auth/server";
import { getConfig } from "@/lib/treenity-bot/config";
import { trocarToken } from "@/lib/treenity-bot/client";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function encerrarAtendimentoAction(atendimentoId: string): Promise<ActionResult> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const config = getConfig();
  if (!config) return { ok: false, error: "not_configured" };

  const sessao = await trocarToken({ email: user.email, nome: user.full_name ?? user.email });
  if (!sessao) return { ok: false, error: "treenity_bot_unavailable" };

  try {
    const res = await fetch(
      `${config.apiUrl}/api/atendimentos/${encodeURIComponent(atendimentoId)}/encerrar`,
      { method: "POST", headers: { Authorization: `Bearer ${sessao.accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) return { ok: false, error: "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }

  revalidatePath(`/app/integrations/treenity-bot/${atendimentoId}`);
  revalidatePath("/app/integrations/treenity-bot");
  return { ok: true };
}
