"use server";
/**
 * Server Action do botão "Encerrar atendimento" na transcrição do Treenity Bot.
 *
 * Sem isso, um atendimento sinalizado (IA pausada esperando um humano) ficava
 * PRA SEMPRE nesse estado depois que alguém assumia na mão — nada no painel
 * avisava a API do bot que a situação foi resolvida. `POST /:id/encerrar`
 * marca `statusFunil: 'Fechada'`; a próxima mensagem desse cliente no bot abre
 * um atendimento novo e a IA volta a responder normalmente.
 *
 * Só o Dono (admin) de uma empresa com o bot ligado: a API do bot não separa
 * empresas, então a separação é feita aqui, antes de qualquer token.
 */
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { carregarAcessoAoBot } from "@/lib/treenity-bot/acesso";
import { getConfig } from "@/lib/treenity-bot/config";
import { comRenovacaoEm401, trocarToken } from "@/lib/treenity-bot/client";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function encerrarAtendimentoAction(atendimentoId: string): Promise<ActionResult> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return { ok: false, error: "forbidden" };

  const authz = await requireRole("admin", { resource: "treenity_bot" });
  if (!authz.ok) return { ok: false, error: authz.response.status === 401 ? "unauthenticated" : "forbidden" };
  const user = authz.user;

  const acesso = await carregarAcessoAoBot({ user, org: authz.org, minimo: "admin" });
  if (!acesso.permitido) return { ok: false, error: "forbidden" };

  const config = getConfig();
  if (!config) return { ok: false, error: "not_configured" };

  const sessao = await trocarToken({ email: user.email, nome: user.full_name ?? user.email });
  if (!sessao) return { ok: false, error: "treenity_bot_unavailable" };

  try {
    const res = await comRenovacaoEm401(
      { email: user.email, nome: user.full_name ?? user.email },
      sessao.accessToken,
      (accessToken) =>
        fetch(`${config.apiUrl}/api/atendimentos/${encodeURIComponent(atendimentoId)}/encerrar`, {
          method: "POST",
          // Segredo de servidor: a API do bot passa a exigi-lo nas mutações. Nunca vai ao navegador nem a log.
          headers: { Authorization: `Bearer ${accessToken}`, "X-SSO-Secret": config.ssoSecret },
          cache: "no-store",
        }),
    );
    if (!res.ok) return { ok: false, error: "request_failed" };
  } catch {
    return { ok: false, error: "request_failed" };
  }

  revalidatePath(`/app/integrations/treenity-bot/${atendimentoId}`);
  revalidatePath("/app/integrations/treenity-bot");
  return { ok: true };
}
