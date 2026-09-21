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
import { NextResponse } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";
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

  // Admin da organização leva a permissão de painel no token: é ela que coloca o
  // socket dele na sala de avisos em tempo real (vendas/atendimentos ao vivo).
  // Quem não é admin recebe um token comum e nunca entra nessa sala. A decisão é
  // tomada aqui, no servidor — o navegador só recebe o resultado.
  const org = await resolveActiveOrg(user);
  const painelAdmin = roleAtLeast(org?.role, "admin");

  const sessao = await trocarToken({ email: user.email, nome: user.full_name ?? user.email }, { painelAdmin });
  if (!sessao) {
    return NextResponse.json({ error: "treenity_bot_unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    accessToken: sessao.accessToken,
    apiUrl: config.apiUrl,
    usuario: sessao.usuario,
  });
}
