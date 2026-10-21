/**
 * O NOME NO MENU É O DA MARCA, e só.
 *
 * Havia uma linha extra com o nome cadastrado da empresa abaixo do logo
 * (pedido de 02/10). Em 21/10 o Dono decidiu o contrário: o nome que aparece é o
 * que ele define em Configurações → Marca; sem isso, vale o da instalação. Uma
 * linha com um segundo nome confundia ("de onde vem este Top Ultra?").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: {
  user: Pick<AuthUser, "is_platform_admin" | "organizations">;
  activeOrg: ActiveOrg | null;
} = { user: { is_platform_admin: false, organizations: [] }, activeOrg: null };

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef, usePermission: () => false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ prefetch: vi.fn() }),
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({ ConnectionHealthDot: () => null }));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({ toggleSidebar: vi.fn() }));
vi.mock("@/components/shell/VersionFooter", () => ({ VersionFooter: () => null }));

const membro = { organization_id: "org-1" } as AuthUser["organizations"][number];

afterEach(cleanup);

describe("nome da empresa no menu", () => {
  it("⭐ sem nome em Marca, não aparece o nome cadastrado da empresa", () => {
    authRef.user = { is_platform_admin: false, organizations: [membro] };
    authRef.activeOrg = { orgId: "org-1", name: "Top Ultra", role: "admin" };
    render(<Sidebar collapsed={false} />);
    expect(screen.queryByText("Top Ultra")).toBeNull();
  });

  it("com nome definido em Marca, o cabeçalho mostra esse nome", () => {
    authRef.user = { is_platform_admin: false, organizations: [membro] };
    authRef.activeOrg = { orgId: "org-1", name: "Razão X", role: "admin", marca: { nome: "Top Ultra" } };
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText("Top Ultra")).toBeTruthy();
  });
});
