import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import {
  PREFIXO_DO_PEDIDO_DE_ESPECIALISTA,
  pedidoDeEspecialistaAberto,
} from "@/lib/treenity-bot/pediu-especialista";

/**
 * Pedido do Dono (reunião de 02/10): quando o bot chama o especialista, a
 * conversa fica DESTACADA no Inbox até alguém assumir — na lista (selo) e
 * dentro da conversa (faixa com o motivo).
 */

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
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "manager" } }),
}));

const MOTIVO = "produtor quer desconto para 50 litros";

const base = {
  id: "c1",
  organization_id: "org-1",
  contact_id: "ct1",
  channel_session_id: "s1",
  channel: "whatsapp",
  status: "open",
  assigned_to_user_id: null,
  assignee_kind: null,
  bot_silenced_until: "infinity",
  snooze_until: null,
  tags: [],
  last_message_at: new Date().toISOString(),
  last_message_preview: "quero falar com alguém",
  unread_count_for_assignee: 0,
  created_at: new Date().toISOString(),
  last_handoff_at: new Date().toISOString(),
  last_handoff_reason: `${PREFIXO_DO_PEDIDO_DE_ESPECIALISTA}${MOTIVO}`,
  contacts: { id: "ct1", display_name: "Cliente", name: null, phone_number: "+5514999", tags: [], is_blocked: false, is_anonymized: false },
} as unknown as ConversationWithContact;

const com = (mudanca: Partial<ConversationWithContact>) =>
  ({ ...base, ...mudanca }) as ConversationWithContact;

function pintarLinha(conv: ConversationWithContact) {
  return render(<ConversationListItem conversation={conv} isSelected={false} onSelect={() => {}} />);
}

function pintarCabecalho(conv: ConversationWithContact) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversationHeader conversation={conv} />
    </QueryClientProvider>,
  );
}

describe("pedidoDeEspecialistaAberto", () => {
  it("devolve o motivo quando o bot chamou e ninguém assumiu", () => {
    expect(pedidoDeEspecialistaAberto(base)).toBe(MOTIVO);
  });

  it("some quando alguém assume", () => {
    expect(pedidoDeEspecialistaAberto(com({ assigned_to_user_id: "u-1" }))).toBeNull();
  });

  it("some quando a conversa é encerrada", () => {
    expect(pedidoDeEspecialistaAberto(com({ status: "closed" }))).toBeNull();
  });

  it("não confunde com outro motivo de passagem", () => {
    expect(
      pedidoDeEspecialistaAberto(com({ last_handoff_reason: "Pausado manualmente" })),
    ).toBeNull();
    expect(pedidoDeEspecialistaAberto(com({ last_handoff_reason: null }))).toBeNull();
  });
});

describe("lista do Inbox", () => {
  it("mostra o selo 'Pediu especialista' com o motivo no title", () => {
    pintarLinha(base);
    expect(screen.getByText("Pediu especialista")).toBeInTheDocument();
    expect(screen.getByTitle(MOTIVO)).toBeInTheDocument();
  });

  it("não mostra o selo depois que alguém assumiu", () => {
    pintarLinha(com({ assigned_to_user_id: "u-1", assignee_kind: "user" }));
    expect(screen.queryByText("Pediu especialista")).not.toBeInTheDocument();
  });
});

describe("cabeçalho da conversa", () => {
  it("mostra a faixa com o motivo do bot", () => {
    pintarCabecalho(base);
    const faixa = screen.getByTestId("faixa-pediu-especialista");
    expect(faixa).toHaveTextContent("O bot pediu um especialista.");
    expect(faixa).toHaveTextContent(MOTIVO);
  });

  it("não mostra a faixa em conversa sem pedido", () => {
    pintarCabecalho(com({ last_handoff_reason: null }));
    expect(screen.queryByTestId("faixa-pediu-especialista")).not.toBeInTheDocument();
  });
});
