import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

/**
 * Pedido de 09/10: a tela do contato tinha dois quadros, com dois "Nome", dois
 * "E-mail" e dois "Telefone". Agora é UM quadro, e nome/e-mail têm fonte única.
 */

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1", role: "admin" } }),
}));
const respostaDaApi = { data: null as unknown };
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(async () => respostaDaApi), put: vi.fn() },
}));

import { DadosDeNota } from "@/components/contacts/DadosDeNota";
import type { Contact } from "@/lib/types/contacts";

const contato = {
  id: "ct-1",
  name: "Fernando Costa",
  display_name: "Devmenthors",
  email: "fernando@exemplo.com",
  phone_number: "+5514998364820",
  source: "whatsapp",
  last_activity_at: "2026-10-09T22:30:00Z",
  created_at: "2026-10-08T12:00:00Z",
  tags: [],
} as unknown as Contact;

const dados = (mudanca: Record<string, unknown> = {}) => ({
  nome: "Fernando Costa", cpf_mascarado: "***.***.***-46", telefone: "14998364820",
  email: "fernando@exemplo.com", cep: "17502894", endereco: "Rua das Glicínias", cidade: "Marília",
  estado: "SP", propriedade_nome: null, propriedade_cnpj: null, propriedade_ie: null,
  propriedade_cep: null, propriedade_endereco: null, transportadora_preferida: "Sedex",
  preenchido_por: "bot", atualizado_em: "", faltando: [], ...mudanca,
});

async function pintar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DadosDeNota contactId="ct-1" contato={contato} />
    </QueryClientProvider>,
  );
  return screen.findByText("Rua das Glicínias").catch(() => null);
}

const rotulos = () =>
  within(screen.getByTestId("dados-de-nota"))
    .getAllByRole("term")
    .map((el) => el.textContent?.trim().toLowerCase());

describe("contato: um quadro só, sem campo repetido", () => {
  it("Nome, E-mail e Telefone aparecem UMA vez", async () => {
    respostaDaApi.data = dados();
    await pintar();
    const r = rotulos();
    for (const campo of ["nome", "e-mail", "telefone"]) {
      expect(r.filter((x) => x === campo), campo).toHaveLength(1);
    }
    expect(screen.getByText("Sedex")).toBeInTheDocument();
  });

  it("telefone da nota igual ao do WhatsApp não vira 'Outro telefone'", async () => {
    respostaDaApi.data = dados({ telefone: "14998364820" });
    await pintar();
    expect(rotulos()).not.toContain("outro telefone");
  });

  it("telefone da nota DIFERENTE aparece como 'Outro telefone'", async () => {
    respostaDaApi.data = dados({ telefone: "1433334444" });
    await pintar();
    expect(rotulos()).toContain("outro telefone");
    expect(screen.getByText("1433334444")).toBeInTheDocument();
  });

  it("sem dados de nota ainda: nome e e-mail vêm do contato", async () => {
    respostaDaApi.data = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DadosDeNota contactId="ct-1" contato={contato} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Fernando Costa")).toBeInTheDocument();
    expect(screen.getByText("fernando@exemplo.com")).toBeInTheDocument();
  });
});
