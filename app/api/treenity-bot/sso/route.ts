/**
 * GET /api/treenity-bot/sso — ponte de SSO pro chat interno do Treenity Bot.
 *
 * O segredo compartilhado (`TREENITY_BOT_SSO_SECRET`) nunca pode chegar no
 * navegador — por isso essa troca acontece aqui, no servidor, e devolve só o
 * resultado (accessToken de curta duração + a URL da API) pro componente
 * cliente usar. Ver `lib/treenity-bot/client.ts` (trocarToken) e o desenho
 * completo na seção "Integração externa (SSO)" do README do api-treenity-bot.
 *
 * Cada chamada aqui gera um accessToken (e um refresh token novo, descartado)
 * do lado do bot — aceitável pro volume de uso desse chat interno; se isso
 * virar gargalo, dá pra cachear por alguns minutos.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast, type ActiveOrg } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { ehGestaoTreenity } from "@/lib/treenity/papeis";
import { carregarAcessoAoBot } from "@/lib/treenity-bot/acesso";
import { getConfig } from "@/lib/treenity-bot/config";
import { trocarToken } from "@/lib/treenity-bot/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await loadAuthUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const config = getConfig();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }

  // A API do bot não separa empresas: o token só sai para atendente (ou mais) de
  // uma empresa que TEM o bot ligado. A Gestão Treenity (equipe do próprio bot)
  // segue como antes — sem esse gate, inclusive em suporte somente leitura.
  const requestId = randomUUID();
  let org: ActiveOrg | null;
  if (ehGestaoTreenity(user)) {
    // Fora do requireRole, então MFA e acompanhamento vencido são conferidos aqui:
    // senha vazada da Gestão (aal1) ou suporte expirado não emitem token.
    if (user.support && user.support.status !== "active") {
      return fail("forbidden", "O acompanhamento terminou. Saia para continuar.", 403, { requestId });
    }
    if (await mfaEmDivida()) {
      return fail(
        "mfa_required",
        traduzir(
          "Esta sessão precisa da verificação em duas etapas. Entre novamente com o código do aplicativo.",
          user.idioma,
        ),
        403,
        { requestId },
      );
    }
    org = await resolveActiveOrg(user);
  } else {
    const authz = await requireRole("agent", { requestId, resource: "treenity_bot" });
    if (!authz.ok) return authz.response;
    org = authz.org;
    const acesso = await carregarAcessoAoBot({ user, org, minimo: "agent" });
    if (!acesso.permitido) {
      return fail(
        "forbidden",
        traduzir("O Treenity Bot não está ligado nesta empresa.", user.idioma),
        403,
        { requestId },
      );
    }
  }

  // Admin da organização leva a permissão de painel no token: é ela que coloca o
  // socket dele na sala de avisos em tempo real (vendas/atendimentos ao vivo).
  // Quem não é admin recebe um token comum e nunca entra nessa sala. A decisão é
  // tomada aqui, no servidor — o navegador só recebe o resultado.
  const painelAdmin = roleAtLeast(org?.role, "admin");

  // O chat da equipe separa as empresas por este id. A Gestão, quando entra na
  // empresa de um cliente para dar suporte, NÃO vira colega dele: fica numa
  // "empresa" própria e não aparece na lista de ninguém.
  const organizacaoId = user.support ? "gestao-treenity" : org?.orgId;

  const sessao = await trocarToken(
    { email: user.email, nome: user.full_name ?? user.email },
    { painelAdmin, organizacaoId },
  );
  if (!sessao) {
    return NextResponse.json({ error: "treenity_bot_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    accessToken: sessao.accessToken,
    apiUrl: config.apiUrl,
    usuario: sessao.usuario,
  });
}
