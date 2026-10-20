import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Perf do Inbox: (1) a aba vive em estado local e a URL é só espelhada por
 * `history.replaceState(null, ...)` (sem ida ao servidor); (2) a espera pelo
 * "automático da org" tem teto — endpoint pendurado não segura a Fila.
 */

const { ORG, CONVERSA, CONVERSA_ROW } = vi.hoisted(() => {
  const ORG = "00000000-0000-4000-8000-0000000000aa";
  const CONVERSA = "00000000-0000-4000-8000-0000000000cc";
  const CONTATO = "00000000-0000-4000-8000-0000000000c1";
  return {
    ORG,
    CONVERSA,
    CONVERSA_ROW: {
      id: CONVERSA,
      organization_id: ORG,
      contact_id: CONTATO,
      // Fechada: e o caso do CI — nenhuma aba da Fila a devolve, entao a lista
      // jamais traria este objeto, por mais que se esperasse por ela.
      status: "closed",
      tags: [],
      contacts: {
        id: CONTATO,
        display_name: "Cliente Encerramento",
        name: null,
        phone_number: "+5511999887666",
        tags: [],
      },
    },
  };
});

const get = vi.fn(async (bruta?: string): Promise<unknown> => {
  // `?? ""` porque sob concorrência de CPU um hook fora do escopo deste teste
  // chegou a chamar o cliente já desmontado, sem URL. Coagir é melhor que
  // estourar: o caso mede QUEM foi pedido, e uma chamada sem URL não é pedido.
  const url = bruta ?? "";
  if (url.startsWith("/api/v1/conversations?")) return new Promise(() => {});
  if (url === "/api/v1/atendimento/automatico-ativo") return new Promise(() => {}); // pendurado
  if (url === `/api/v1/conversations/${CONVERSA}`) {
    return { data: CONVERSA_ROW };
  }
  if (url === "/api/v1/conversations/counts") return { data: {} };
  if (url === "/api/v1/conversation-tags") return { data: [] };
  return { data: [] };
});

vi.mock("@/lib/api/client", () => ({ apiClient: { get: (url: string) => get(url) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({
  prepareRealtimeAuthentication: vi.fn().mockResolvedValue(undefined),
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-1", role: "admin" }, activeOrg: { orgId: ORG } }),
  usePermission: () => true,
}));
vi.mock("@/hooks/inbox/useMarkAsRead", () => ({ useMarkAsRead: () => undefined }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

/** O painel do contato vira sonda: ele diz de QUAL conversa recebeu objeto. */
vi.mock("@/components/inbox/CRMSidePanel", () => ({
  CRMSidePanel: ({ conversation }: { conversation: { id: string } | null }) => (
    <div data-testid="painel">{conversation ? conversation.id : "sem-conversa"}</div>
  ),
}));
vi.mock("@/components/inbox/ConversationList", () => ({ ConversationList: () => null }));
vi.mock("@/components/inbox/InboxFilters", () => ({
  InboxFilters: ({
    value,
    onChange,
  }: {
    value: { tab: string };
    onChange: (v: { tab: string; search: string; onlyUnread: boolean }) => void;
  }) => (
    <button
      data-testid="aba"
      onClick={() => onChange({ ...value, tab: "closed", search: "", onlyUnread: false })}
    >
      {value.tab}
    </button>
  ),
}));
vi.mock("@/components/inbox/ChatThread", () => ({ ChatThread: () => null }));
vi.mock("@/components/inbox/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/inbox/ConversationHeader", () => ({ ConversationHeader: () => null }));
vi.mock("@/components/inbox/RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/InboxKeyboardShortcuts", () => ({
  InboxKeyboardShortcuts: () => null,
}));
vi.mock("@/components/inbox/ShortcutsHelpDialog", () => ({ ShortcutsHelpDialog: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));

import { InboxLayout } from "@/components/inbox/InboxLayout";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // elemento NOVO a cada vez (o mesmo elemento faz o React pular o render)
  const ui = () => (
    <QueryClientProvider client={qc}>
      <InboxLayout />
    </QueryClientProvider>
  );
  const r = render(ui());
  return { ...r, remontar: () => r.rerender(ui()) };
}

const listaPedida = () =>
  get.mock.calls.some((c) => (c[0] ?? "").startsWith("/api/v1/conversations?"));

describe("aba local espelhada na URL", () => {
  beforeEach(() => {
    get.mockClear();
    window.history.replaceState(null, "", "/app/inbox");
  });

  it("o clique troca a aba, grava ?filter= com state null, e o link para o filtro original volta a aba", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    const { remontar } = montar();
    expect(screen.getByTestId("aba")).toHaveTextContent("unassigned");

    fireEvent.click(screen.getByTestId("aba"));
    expect(screen.getByTestId("aba")).toHaveTextContent("closed");
    // state null: reaproveitar o state do App Router (`__NA`) faria o Next pular a atualização
    expect(spy).toHaveBeenCalledWith(null, "", expect.stringContaining("filter=closed"));
    // useSearchParams (lido de window.location) reflete o novo filtro
    expect(new URLSearchParams(window.location.search).get("filter")).toBe("closed");

    // um link para o filtro original muda a URL por fora: a aba acompanha
    window.history.replaceState(null, "", "/app/inbox?filter=unassigned");
    act(() => remontar());
    expect(screen.getByTestId("aba")).toHaveTextContent("unassigned");
    spy.mockRestore();
  });
});

describe("automático pendurado não segura a Fila", () => {
  beforeEach(() => {
    get.mockClear();
    window.history.replaceState(null, "", "/app/inbox");
  });

  it("não pede a lista de imediato, mas pede depois do teto de ~1 s", async () => {
    montar();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(listaPedida()).toBe(false);
    await waitFor(() => expect(listaPedida()).toBe(true), { timeout: 3000 });
  });
});
