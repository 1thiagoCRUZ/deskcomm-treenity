/**
 * O cabeçalho da coluna: cor e nome editáveis NO quadro.
 *
 * O que estes testes medem é só o que nasce na tela: (a) quem NÃO é manager+ não
 * recebe controle nenhum — a rota recusaria, e oferecer seria prometer o que não se
 * cumpre; (b) a escolha vira exatamente um PATCH com o corpo certo; (c) a recusa do
 * servidor chega como toast em português; (d) o quadro é relido depois. As regras de
 * verdade (formato da cor, nome duplicado) são da API e têm testes próprios.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/types";
import type { Stage } from "@/lib/kanban/types";

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useActiveOrg: vi.fn() }));

import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { CabecalhoEditavelDaEtapa } from "./CabecalhoEditavelDaEtapa";

// Polyfills que o Radix exige e o jsdom não tem.
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const PIPE = "11111111-1111-4111-8111-111111111111";

const ETAPA: Stage = {
  id: "e2",
  organization_id: "o1",
  pipeline_id: PIPE,
  name: "Orçamento",
  slug: "orcamento",
  position: 2000,
  color: "#3b82f6",
  is_won: false,
  is_lost: false,
  is_archived: false,
  expected_duration_hours: null,
};

function comPapel(role: "viewer" | "agent" | "manager" | "admin") {
  vi.mocked(useActiveOrg).mockReturnValue({ orgId: "o1", role } as never);
}

function montar(stage: Stage = ETAPA) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidar = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <CabecalhoEditavelDaEtapa stage={stage} pipelineId={PIPE} />
    </QueryClientProvider>,
  );
  return { invalidar };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.patch).mockResolvedValue({ data: { etapas: [] } } as never);
});

describe("CabecalhoEditavelDaEtapa", () => {
  it.each(["viewer", "agent"] as const)(
    "%s não recebe NENHUM controle de edição — só o título",
    (role) => {
      comPapel(role);
      montar();

      expect(screen.getByText("Orçamento")).toBeInTheDocument();
      expect(screen.queryByTestId("coluna-e2-cor-gatilho")).not.toBeInTheDocument();
      expect(screen.queryByTestId("coluna-e2-renomear")).not.toBeInTheDocument();
    },
  );

  it.each(["manager", "admin"] as const)("%s vê a bolinha de cor e o lápis", (role) => {
    comPapel(role);
    montar();

    expect(screen.getByTestId("coluna-e2-cor-gatilho")).toBeInTheDocument();
    expect(screen.getByTestId("coluna-e2-renomear")).toBeInTheDocument();
  });

  it("escolher uma cor da paleta → UM PATCH só com a cor, e relê funil E quadro", async () => {
    comPapel("manager");
    const user = userEvent.setup();
    const { invalidar } = montar();

    await user.click(screen.getByTestId("coluna-e2-cor-gatilho"));
    await user.click(await screen.findByTestId("coluna-e2-cor-cor-22c55e"));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect(apiClient.patch).toHaveBeenCalledWith(`/api/v1/pipelines/${PIPE}/stages/e2`, {
      color: "#22c55e",
    });

    await waitFor(() => {
      const chaves = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(chaves).toContain(JSON.stringify(["board", PIPE]));
      expect(chaves).toContain(JSON.stringify(["agent-mapping", PIPE]));
    });
  });

  it("'Sem cor' manda color: null", async () => {
    comPapel("manager");
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByTestId("coluna-e2-cor-gatilho"));
    await user.click(await screen.findByTestId("coluna-e2-cor-sem-cor"));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalled());
    expect(apiClient.patch).toHaveBeenCalledWith(expect.any(String), { color: null });
  });

  it("'Outra cor' só habilita com #RRGGBB completo, e manda em minúscula", async () => {
    comPapel("manager");
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByTestId("coluna-e2-cor-gatilho"));
    const campo = await screen.findByTestId("coluna-e2-cor-outra");
    const usar = screen.getByTestId("coluna-e2-cor-usar-outra");

    await user.type(campo, "#3B8");
    expect(usar).toBeDisabled();

    await user.clear(campo);
    await user.type(campo, "#A855F7");
    expect(usar).toBeEnabled();
    await user.click(usar);

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect(apiClient.patch).toHaveBeenCalledWith(expect.any(String), { color: "#a855f7" });
  });

  it("a recusa do servidor (422) chega como toast em português, sem texto de infraestrutura", async () => {
    comPapel("manager");
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(422, "unprocessable_entity", undefined, "r1", "Já existe uma etapa chamada «Envio» neste funil. Escolha outro nome."),
    );
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByTestId("coluna-e2-renomear"));
    const campo = await screen.findByTestId("coluna-e2-nome-campo");
    await user.clear(campo);
    await user.type(campo, "Envio{Enter}");

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toMatch(/Já existe uma etapa chamada «Envio»/);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("renomear manda só o nome; nome igual ao atual não manda nada", async () => {
    comPapel("manager");
    const user = userEvent.setup();
    montar();

    // Igual ao atual → nenhuma chamada.
    await user.click(screen.getByTestId("coluna-e2-renomear"));
    await user.type(await screen.findByTestId("coluna-e2-nome-campo"), "{Enter}");
    expect(apiClient.patch).not.toHaveBeenCalled();

    // Novo nome → um PATCH só com `name`.
    await user.click(screen.getByTestId("coluna-e2-renomear"));
    const campo = await screen.findByTestId("coluna-e2-nome-campo");
    await user.clear(campo);
    await user.type(campo, "Proposta enviada{Enter}");

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    expect(apiClient.patch).toHaveBeenCalledWith(`/api/v1/pipelines/${PIPE}/stages/e2`, {
      name: "Proposta enviada",
    });
  });

  it("Escape cancela a renomeação sem mandar nada", async () => {
    comPapel("manager");
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByTestId("coluna-e2-renomear"));
    const campo = await screen.findByTestId("coluna-e2-nome-campo");
    await user.clear(campo);
    await user.type(campo, "Qualquer coisa{Escape}");

    expect(apiClient.patch).not.toHaveBeenCalled();
    expect(screen.getByTestId("coluna-e2-nome")).toHaveTextContent("Orçamento");
  });
});
