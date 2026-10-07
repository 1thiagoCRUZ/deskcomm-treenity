import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { CartaoDoCliente } from "@/components/treenity-bot/CartaoDoCliente";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Pedido do Dono (reunião de 02/10): levar uma conversa do Inbox para o Chat da
 * equipe ("por que você fez isso?" / "fica de olho nesse cliente"), e quem
 * recebe abre a conversa pelo cartão.
 */

const botNoInbox = { ativo: true };
vi.mock("@/hooks/inbox/useFecharComoTerminou", () => ({
  useTreenityBotNoInbox: () => ({ data: botNoInbox.ativo }),
  useFecharComoTerminou: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/inbox/FecharComoTerminou", () => ({ FecharComoTerminou: () => null }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "admin" } }),
}));

const ID = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";

const conversa = {
  id: ID,
  organization_id: "org-1",
  contact_id: "ct1",
  status: "open",
  assigned_to_user_id: "u-2",
  assignee_kind: "user",
  snooze_until: null,
  tags: [],
  contacts: { id: "ct1", display_name: "João & Filhos", name: null, phone_number: "+5514999" },
} as unknown as ConversationWithContact;

function pintarCabecalho() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversationHeader conversation={conversa} />
    </QueryClientProvider>,
  );
}

describe("Inbox → Chat da equipe", () => {
  it("'Falar com a equipe' abre o chat com a conversa anexada", () => {
    botNoInbox.ativo = true;
    pintarCabecalho();
    const link = screen.getByTestId("falar-com-a-equipe");
    expect(link).toHaveTextContent("Falar com a equipe");
    expect(link.getAttribute("href")).toBe(
      `/app/integrations/treenity-bot/chat?anexo=${ID}&nome=${encodeURIComponent("João & Filhos")}`,
    );
  });

  it("sem o Treenity Bot não há chat, e o botão não aparece", () => {
    botNoInbox.ativo = false;
    pintarCabecalho();
    expect(screen.queryByTestId("falar-com-a-equipe")).toBeNull();
    botNoInbox.ativo = true;
  });
});

describe("cartão do cliente", () => {
  it("na mensagem, leva à conversa no Inbox", () => {
    render(<CartaoDoCliente anexo={{ conversaId: ID, nome: "Maria" }} />);
    expect(screen.getByText("Maria")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Abrir conversa/ })).toHaveAttribute("href", `/app/inbox?id=${ID}`);
  });

  it("no rascunho, tem remover em vez do link", () => {
    const remover = vi.fn();
    render(<CartaoDoCliente anexo={{ conversaId: ID, nome: "Maria" }} onRemover={remover} />);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remover cliente" }));
    expect(remover).toHaveBeenCalledOnce();
  });
});
