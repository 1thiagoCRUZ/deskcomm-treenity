/**
 * Quem pode pedir ao servidor uma sessão/chamada na API do Treenity Bot.
 *
 * A API do bot NÃO separa empresas: quem tem um token dela enxerga o que o bot
 * guarda. Então a separação acontece aqui, antes de qualquer token ser emitido:
 *
 *   1. o papel da pessoa na empresa ativa tem de bastar (`minimo`);
 *   2. a empresa ativa tem de ter o bot ligado
 *      (`organizations.settings.treenity_bot.whatsapp.ativo === true`, a mesma
 *      flag que `botDoTreenityAtende` lê para o Inbox);
 *   3. a Gestão Treenity (administradora da plataforma) é a equipe do próprio
 *      bot: fica de fora das duas regras, como já era antes deste gate.
 *
 * Escopo de `is_platform_admin` (decisão mantida): inclui a Gestão em suporte
 * somente leitura (`support_readonly`). Ela passa o gate, mas só recebe
 * `painelAdmin` no token / dados de painel se o papel dela na empresa ativa for
 * admin (suporte "full"); em somente leitura o papel é viewer. Quem chama fora
 * do `requireRole` (ex.: o SSO) confere MFA e suporte vencido por conta própria.
 *
 * A decisão é pura (`decidirAcessoAoBot`) para ser testada sem montar o app.
 */
import { roleAtLeast, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

import { botDoTreenityAtende } from "./whatsapp";

export type MotivoDeNegacaoDoBot = "sem_papel" | "bot_desligado";

export type DecisaoDeAcessoAoBot = { permitido: true } | { permitido: false; motivo: MotivoDeNegacaoDoBot };

export function decidirAcessoAoBot(entrada: {
  /** Papel efetivo na empresa ativa; `null` = sem empresa ativa. */
  papel: string | null | undefined;
  ehGestao: boolean;
  /** `organizations.settings` da empresa ativa. */
  settings: unknown;
  minimo: Role;
}): DecisaoDeAcessoAoBot {
  if (entrada.ehGestao) return { permitido: true };
  if (!roleAtLeast(entrada.papel, entrada.minimo)) return { permitido: false, motivo: "sem_papel" };
  if (!botDoTreenityAtende(entrada.settings)) return { permitido: false, motivo: "bot_desligado" };
  return { permitido: true };
}

/**
 * Lê `settings` da empresa ativa (cliente do usuário, passa pela RLS, filtrado
 * pela empresa que veio da sessão) e decide. Falha de leitura = negado.
 */
export async function carregarAcessoAoBot(entrada: {
  user: { is_platform_admin: boolean };
  org: { orgId: string; role: string } | null;
  minimo: Role;
}): Promise<DecisaoDeAcessoAoBot> {
  const { user, org, minimo } = entrada;
  if (user.is_platform_admin) return { permitido: true };
  if (!org || !roleAtLeast(org.role, minimo)) return { permitido: false, motivo: "sem_papel" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  return decidirAcessoAoBot({
    papel: org.role,
    ehGestao: false,
    settings: data?.settings ?? null,
    minimo,
  });
}
