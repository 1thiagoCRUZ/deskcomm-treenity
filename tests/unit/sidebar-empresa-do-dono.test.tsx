/**
 * O DONO PRECISA LER O NOME DA PRÓPRIA EMPRESA.
 *
 * O TenantSwitcher some com ≤1 organização, e o cabeçalho do menu mostra a
 * marca da instalação ("TreenityCRM"). Medido em 2026-10-02: o dono da Top Ultra
 * renomeou a empresa e não achou o nome em lugar nenhum da tela.
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
  it("⭐ dono de uma empresa só vê o nome dela", () => {
    authRef.user = { is_platform_admin: false, organizations: [membro] };
    authRef.activeOrg = { orgId: "org-1", name: "Top Ultra", role: "admin" };
    render(<Sidebar collapsed={false} />);
    expect(screen.getByText("Top Ultra")).toBeTruthy();
  });

  it("quem tem várias empresas já lê o nome no seletor — não repete", () => {
    authRef.user = { is_platform_admin: false, organizations: [membro, { ...membro, organization_id: "org-2" }] };
    authRef.activeOrg = { orgId: "org-1", name: "Top Ultra", role: "admin" };
    render(<Sidebar collapsed={false} />);
    expect(screen.queryByText("Top Ultra")).toBeNull();
  });

  it("menu recolhido não mostra a linha", () => {
    authRef.user = { is_platform_admin: false, organizations: [membro] };
    authRef.activeOrg = { orgId: "org-1", name: "Top Ultra", role: "admin" };
    render(<Sidebar collapsed />);
    expect(screen.queryByText("Top Ultra")).toBeNull();
  });
});
