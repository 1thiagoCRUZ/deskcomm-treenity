/**
 * CONVITE PRECISA FUNCIONAR COM O CADASTRO PÚBLICO FECHADO.
 *
 * A Treenity desliga "Allow new users to sign up" no provedor de auth. Antes,
 * o convidado sem conta recebia "Não foi possível criar a conta" — o provedor
 * respondia "Signups not allowed for this instance" (medido em 2026-10-02).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signInviteToken } from "@/lib/auth/invite-token";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));

const signUpDoProvedor = vi.fn();
const signIn = vi.fn();
const createUser = vi.fn();
const FECHADO = { data: { user: null, session: null }, error: { status: 422, code: "signup_disabled", message: "Signups not allowed for this instance" } };

let n = 0;
function cenario() {
  n++;
  const email = `convidado-${n}-${Date.now()}@exemplo.test`;
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === "x-forwarded-for" ? `203.0.113.${n % 250}` : null),
  } as never);
  return email;
}

describe("signUp com convite e cadastro público fechado", () => {
  beforeEach(() => {
    vi.resetModules();
    signUpDoProvedor.mockReset().mockResolvedValue(FECHADO);
    signIn.mockReset().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    createUser.mockReset().mockResolvedValue({ data: { user: { id: "u-novo" } }, error: null });
    vi.mocked(createClient).mockResolvedValue({
      auth: { signUp: signUpDoProvedor, signInWithPassword: signIn },
    } as never);
    vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { createUser } } } as never);
  });

  it("⭐ cria a conta confirmada por dentro e abre a sessão", async () => {
    const email = cenario();
    const token = signInviteToken({ invite_id: "11111111-1111-4111-8111-111111111111", organization_id: "44444444-4444-4444-8444-444444444444", email, role: "agent", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { signUp } = await import("./signUp");
    const res = await signUp({ email, password: "SenhaForte!2026", password_confirm: "SenhaForte!2026" }, token);

    expect(res).toEqual({ ok: true, sessao_ativa: true });
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email, email_confirm: true }));
    expect(signIn).toHaveBeenCalledWith({ email, password: "SenhaForte!2026" });
  });

  it("sem convite o cadastro continua fechado", async () => {
    const email = cenario();
    const { signUp } = await import("./signUp");
    const res = await signUp({ org_name: "Loja", email, password: "SenhaForte!2026", password_confirm: "SenhaForte!2026" });

    expect(res).toEqual({ ok: false, error: "signup_failed" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("convite de outro e-mail não cria conta", async () => {
    const email = cenario();
    const token = signInviteToken({ invite_id: "22222222-2222-4222-8222-222222222222", organization_id: "44444444-4444-4444-8444-444444444444", email: "outra@exemplo.test", role: "agent", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { signUp } = await import("./signUp");
    const res = await signUp({ email, password: "SenhaForte!2026", password_confirm: "SenhaForte!2026" }, token);

    expect(res.ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("conta que já existe: falha sem abrir sessão", async () => {
    const email = cenario();
    createUser.mockResolvedValue({ data: { user: null }, error: { message: "A user with this email address has already been registered" } });
    const token = signInviteToken({ invite_id: "33333333-3333-4333-8333-333333333333", organization_id: "44444444-4444-4444-8444-444444444444", email, role: "agent", exp: Math.floor(Date.now() / 1000) + 3600 });
    const { signUp } = await import("./signUp");
    const res = await signUp({ email, password: "SenhaForte!2026", password_confirm: "SenhaForte!2026" }, token);

    expect(res).toEqual({ ok: false, error: "signup_failed" });
    expect(signIn).not.toHaveBeenCalled();
  });
});
