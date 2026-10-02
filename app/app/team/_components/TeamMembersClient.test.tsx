/**
 * Seletor de TIPO DE ACESSO por membro (papéis do produto, lib/treenity/papeis.ts).
 *
 * Cobre: o rótulo Dono / Funcionário / Personalizado; escolher um papel chama
 * as duas rotas que já existem (papel, depois menu); papel recusado não mexe
 * no menu; seletor ausente para quem não administra.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/types";
import type { TeamMember } from "@/hooks/team/useTeamMembers";

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { TeamMembersClient } from "./TeamMembersClient";

// Polyfills que o Radix Select exige e o jsdom não tem.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function members(): TeamMember[] {
  return [
    {
      user_id: ADMIN_ID,
      role: "admin",
      invited_at: null,
      accepted_at: "2026-01-01T00:00:00Z",
      revoked_at: null,
      created_at: "2026-01-01T00:00:00Z",
      email: "admin@example.com",
      full_name: "Admin",
      last_sign_in_at: null,
    },
    {
      user_id: AGENT_ID,
      role: "agent",
      invited_at: null,
      accepted_at: "2026-01-02T00:00:00Z",
      revoked_at: null,
      created_at: "2026-01-02T00:00:00Z",
      email: "agente@example.com",
      full_name: "Agente",
      last_sign_in_at: null,
    },
  ];
}

function renderClient(props: Partial<{ canManage: boolean }> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TeamMembersClient currentUserId={ADMIN_ID} canManage={props.canManage ?? true} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.get).mockResolvedValue({ data: members() });
});

describe("TeamMembersClient — tipo de acesso do produto (Dono / Funcionário)", () => {
  it("quem não administra vê só o rótulo; papel ou menu mexidos à mão aparecem como Personalizado", async () => {
    const rows = members();
    rows[1]!.interface_settings = { preset: "completa", destinos: ["/app/tasks"] };
    vi.mocked(apiClient.get).mockResolvedValue({ data: rows });
    renderClient({ canManage: false });
    expect(await screen.findByText("agente@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // admin com o menu completo = Dono; agent com uma tela escolhida à mão = Personalizado.
    expect(screen.getByText("Dono")).toBeInTheDocument();
    expect(screen.getAllByText("Personalizado").length).toBeGreaterThan(0);
  });

  it("escolher Funcionário aplica o papel E o menu padrão, pelas duas rotas que já existem", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderClient();

    const trigger = await screen.findByRole("combobox", { name: /Tipo de acesso de Agente/i });
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Funcionário" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Tipo de acesso atualizado."));
    expect(apiClient.patch).toHaveBeenNthCalledWith(1, `/api/v1/team/${AGENT_ID}`, { role: "agent" });
    expect(apiClient.patch).toHaveBeenNthCalledWith(2, `/api/v1/team/${AGENT_ID}/interface`, {
      interface_settings: {
        preset: "simplificada",
        destinos: ["/app/inbox", "/app/templates", "/app/contacts", "/app/tasks", "/app/integrations/treenity-bot/chat"],
      },
    });
  });

  it("se o papel é recusado (ex.: último dono), o menu não é mexido e aparece o erro", async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(409, "state_conflict", undefined, "req-1", "Não é possível rebaixar o último admin do tenant."),
    );
    const user = userEvent.setup();
    renderClient();

    const trigger = await screen.findByRole("combobox", { name: /Tipo de acesso de Agente/i });
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Dono" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
