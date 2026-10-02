"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  signupSchema,
  signupComConviteSchema,
  type SignupInput,
  type SignupComConviteInput,
} from "@/lib/auth/schemas";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { audit, hashEmail } from "@/lib/audit";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

export type SignUpResult =
  | {
      ok: true;
      /**
       * O provedor de auth JÁ abriu a sessão neste `signUp()` — quer dizer,
       * "Confirm email" está DESLIGADO nele e não vai existir link nenhum para
       * clicar. Quem chama precisa saber disto: a tela de "confirme seu e-mail"
       * é uma instrução impossível de cumprir nesse estado, e a pessoa fica
       * esperando para sempre um e-mail que nunca sai — autenticada, sem
       * organização, sem motivo para navegar até a saída que existe.
       *
       * Medido em 2026-09-05 na `origin/main` @ `4d50f63f`, com
       * `GOTRUE_MAILER_AUTOCONFIRM=true`: a tela dizia "Enviamos um link de
       * confirmação para …", e ao mesmo tempo o cookie `sb-deskcomm-auth`
       * estava no browser e `user_organizations` do usuário vinha `[]`.
       *
       * Achado de @KIRAzinx566, com um cliente real travado nessa tela.
       */
      sessao_ativa: boolean;
    }
  | {
      ok: false;
      error: "validation_error" | "rate_limited" | "signup_failed";
      details?: Record<string, unknown>;
    };

/**
 * Signup self-service: cria o usuário no GoTrue e dispara o e-mail de
 * confirmação. O tenant só é provisionado quando o link é confirmado em
 * /auth/confirm (evita orgs órfãs de cadastros nunca confirmados).
 *
 * Anti-enumeração: e-mail já cadastrado recebe a MESMA resposta de sucesso —
 * o GoTrue devolve um usuário ofuscado (identities vazio) sem erro, e nós não
 * diferenciamos. Rate limit de envio de e-mail é do próprio GoTrue.
 */
export async function signUp(
  input: SignupInput | SignupComConviteInput,
  /**
   * Token de convite, quando a conta está sendo criada para ACEITAR um convite.
   * Viaja até `/auth/confirm` pelo `user_metadata` — o mesmo canal que
   * `org_name` já usa e que o e2e do signup exercita. Ele não dá acesso a nada
   * sozinho: quem decide é `decidirConviteDoSignup`, comparando a assinatura do
   * token com o e-mail que o provedor de auth confirmou.
   */
  inviteToken?: string,
): Promise<SignUpResult> {
  const temConvite = typeof inviteToken === "string" && inviteToken.trim() !== "";
  const parsed = temConvite
    ? signupComConviteSchema.safeParse(input)
    : signupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? env.NEXT_PUBLIC_APP_URL;
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Criar conta é fluxo raro por pessoa: teto baixo por IP evita fábrica de
  // organizações (cada signup provisiona tenant). Issue #64.
  if (await authRateLimited("signup", null, AUTH_LIMITS.signup)) {
    return { ok: false, error: "rate_limited" };
  }

  // Só vira convite se o token verificar E for para este e-mail. Divergência
  // aqui não é erro do usuário — é tentativa de entrar em organização alheia
  // colando um token que chegou para outra pessoa.
  let convite: string | null = null;
  if (temConvite && inviteToken) {
    const payload = verifyInviteToken(inviteToken);
    if (!payload) {
      return { ok: false, error: "validation_error", details: { invite: ["convite_invalido"] } };
    }
    if (payload.email.trim().toLowerCase() !== parsed.data.email.trim().toLowerCase()) {
      return { ok: false, error: "validation_error", details: { invite: ["email_divergente"] } };
    }
    convite = inviteToken;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Ver comentário equivalente em requestPasswordReset.ts: ?type=signup
      // sobrevive ao redirect do GoTrue e é o que distingue este fluxo do de
      // recovery quando a verificação chega via `code` (PKCE), não `token_hash`.
      emailRedirectTo: `${origin}/auth/confirm?type=signup`,
      // O convite é revalidado no servidor mesmo tendo sido validado ao montar
      // a tela: o campo de e-mail do formulário é adulterável no cliente, e a
      // decisão que importa acontece com o e-mail JÁ confirmado pelo provedor.
      data: convite
        ? { invite_token: convite }
        : { org_name: (parsed.data as SignupInput).org_name },
    },
  });

  if (error && convite && cadastroFechado(error)) {
    return criarContaDoConvidado(supabase, parsed.data.email, parsed.data.password, convite, {
      requestId,
      ip,
      userAgent,
    });
  }

  if (error) {
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    await audit({
      action: "auth.signup_failed",
      metadata: {
        email_hash: hashEmail(parsed.data.email),
        reason: error.message,
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "signup_failed" };
  }

  await audit({
    action: "auth.signup_requested",
    actorUserId: data.user?.id ?? null,
    metadata: { email_hash: hashEmail(parsed.data.email) },
    requestId,
    ip,
    userAgent,
  });

  // `data.session` é o único sinal confiável de que o provedor não vai mandar
  // e-mail nenhum: ele vem preenchido exatamente quando a confirmação está
  // desligada (ou já resolvida) e o GoTrue devolveu tokens junto do usuário.
  return { ok: true, sessao_ativa: data.session !== null };
}

/**
 * "Allow new users to sign up" DESLIGADO no provedor de auth — a Treenity deixa
 * assim para ninguém abrir empresa pela tela pública. O efeito colateral era o
 * convite: quem é convidado e ainda não tem conta caía em "Signups not allowed
 * for this instance" (medido em 2026-10-02 no `api_audit_log`).
 */
function cadastroFechado(error: { code?: string; message?: string }): boolean {
  return error.code === "signup_disabled" || /signups not allowed/i.test(error.message ?? "");
}

/**
 * Cria a conta do CONVIDADO por dentro, com a chave de serviço. Só chega aqui
 * quem passou pela verificação do token acima: assinatura válida E e-mail do
 * token igual ao digitado. O convite é a prova de que a pessoa foi chamada para
 * aquela empresa; por isso a conta já nasce confirmada e a sessão é aberta na
 * hora — a tela segue para `/team/accept-invite/<token>`, que cria o vínculo.
 * Cadastro sem convite continua fechado.
 */
async function criarContaDoConvidado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
  password: string,
  convite: string,
  ctx: { requestId: string | null; ip: string | null; userAgent: string | null },
): Promise<SignUpResult> {
  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { invite_token: convite },
  });
  if (error || !data.user) {
    await audit({
      action: "auth.signup_failed",
      metadata: { email_hash: hashEmail(email), reason: error?.message ?? "sem usuário", via: "convite" },
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    // Conta que já existe cai aqui: a saída é "Entrar", que a tela já oferece.
    return { ok: false, error: "signup_failed" };
  }
  await audit({
    action: "auth.signup_requested",
    actorUserId: data.user.id,
    metadata: { email_hash: hashEmail(email), via: "convite" },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  const { data: login } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: true, sessao_ativa: !!login?.session };
}
