/**
 * Gestão Treenity sem empresa começa no painel da plataforma (/admin), e não
 * num Inbox sem organização. Quem é membro segue para a home da interface.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

const requireAuth = vi.fn();
const resolveActiveOrg = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  requireAuth: () => requireAuth(),
  resolveActiveOrg: (u: unknown) => resolveActiveOrg(u),
}));

async function destino(): Promise<string> {
  const { default: AppHome } = await import("./page");
  try {
    await AppHome();
  } catch (e) {
    return String((e as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("não redirecionou");
}

describe("home do /app", () => {
  beforeEach(() => {
    redirect.mockClear();
    requireAuth.mockReset();
    resolveActiveOrg.mockReset();
  });

  it("⭐ Gestão Treenity sem empresa → /admin", async () => {
    requireAuth.mockResolvedValue({ is_platform_admin: true, support: null, organizations: [] });
    resolveActiveOrg.mockResolvedValue(null);
    expect(await destino()).toBe("/admin");
  });

  it("dono com empresa → Inbox", async () => {
    requireAuth.mockResolvedValue({ is_platform_admin: false, support: null, organizations: [{}] });
    resolveActiveOrg.mockResolvedValue({ orgId: "o", name: "Top Ultra", role: "admin" });
    expect(await destino()).toBe("/app/inbox");
  });

  it("Gestão em acompanhamento de um cliente → Inbox do cliente, não /admin", async () => {
    requireAuth.mockResolvedValue({ is_platform_admin: true, support: { status: "active" }, organizations: [] });
    resolveActiveOrg.mockResolvedValue({ orgId: "o", name: "Top Ultra", role: "admin" });
    expect(await destino()).toBe("/app/inbox");
  });
});
