/**
 * G4-02 — Inbox com escopo (acceptance 1 e 4). Prova que a visão 'Todas' é
 * ocultada para `agent` em modo own* e visível para manager/admin/viewer, e que
 * as contagens por visão são renderizadas a partir do hook RLS-scoped
 * (useConversationCounts → /api/v1/conversations/counts, client user-scoped).
 *
 * A garantia REAL de escopo (agent forçando ?filter=all não vaza) é da RLS —
 * provada em tests/invariants/gov-5b-inbox-scope-counts.test.ts (contagem sob a
 * role agent = escopo, não total da org). Aqui é a superfície de UI.
 *
 * O segundo bloco cobre o SELETOR DE NÚMERO, que ganhou comportamento quando o
 * canal excluído sumiu da listagem: o alternador some com o penúltimo número, e
 * some junto com ele o único controle capaz de desfazer um filtro que continua
 * valendo — inbox filtrado, às vezes vazio, sem nada na tela dizendo por quê.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InboxFilters, visibleInboxTabs, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";
import type { ActiveOrg } from "@/lib/auth/types";
import type { FunilDoFiltro } from "@/lib/inbox/etapas-do-filtro";

const activeOrgRef: { current: ActiveOrg | null } = { current: null };
/** `undefined` = listagem ainda carregando (ou que falhou) — não é "zero canais". */
const canaisRef: { current: ChannelSession[] | undefined } = { current: [] };
/** Os funis do filtro "Etapa". `undefined` = ainda carregando. */
const etapasRef: { current: FunilDoFiltro[] | undefined } = { current: [] };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: activeOrgRef.current }),
}));
// Só a listagem é dublada: `channelLabel` do módulo real é o que resolve o rótulo
// de cada opção do seletor, e é parte do que está sob teste aqui.
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => ({ data: canaisRef.current }) };
});
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useEtapasDoInbox", () => ({
  useEtapasDoInbox: () => ({ data: etapasRef.current }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { unassigned: 3, mine: 2, all: 5 } }),
}));

const VALUE: InboxFiltersValue = { tab: "unassigned", search: "", onlyUnread: false };

function setOrg(role: ActiveOrg["role"], visibility_mode: ActiveOrg["visibility_mode"]) {
  activeOrgRef.current = { orgId: "org-1", name: "Org", role, visibility_mode };
}

function canal(over: Partial<ChannelSession> = {}): ChannelSession {
  return {
    id: "canal-1",
    display_name: "Vendas",
    phone_number: "5511999999999",
    status: "WORKING",
    status_reason: null,
    last_health_check_at: null,
    last_status_change_at: null,
    daily_message_limit: 250,
    is_warmup_complete: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

const SELETOR = "Filtrar por número de WhatsApp";

beforeEach(() => {
  setOrg("agent", "own_and_unassigned");
  canaisRef.current = [];
  etapasRef.current = [];
});
afterEach(cleanup);

describe("visibleInboxTabs (lógica pura de visões)", () => {
  it("agent em own_and_unassigned NÃO vê 'all'", () => {
    expect(visibleInboxTabs("agent", "own_and_unassigned")).not.toContain("all");
  });
  it("agent em 'own' NÃO vê 'all'", () => {
    expect(visibleInboxTabs("agent", "own")).not.toContain("all");
  });
  it("agent em 'all' VÊ 'all'", () => {
    expect(visibleInboxTabs("agent", "all")).toContain("all");
  });
  it("manager sempre vê 'all' (org-wide read)", () => {
    expect(visibleInboxTabs("manager", "own")).toContain("all");
  });
  it("viewer sempre vê 'all' (org-wide read)", () => {
    expect(visibleInboxTabs("viewer", "own")).toContain("all");
  });
  it("admin sempre vê 'all'", () => {
    expect(visibleInboxTabs("admin", "own")).toContain("all");
  });
  it("as 3 visões nomeadas existem (Minhas/Fila/Todas) para manager", () => {
    const tabs = visibleInboxTabs("manager", "own_and_unassigned");
    expect(tabs).toEqual(expect.arrayContaining(["mine", "unassigned", "all"]));
  });
});

describe("InboxFilters render — 3 visões + escopo", () => {
  it("agent em modo own*: mostra Minhas e Fila, esconde Todas", () => {
    setOrg("agent", "own_and_unassigned");
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /Minhas/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Fila/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Todas/ })).not.toBeInTheDocument();
  });

  it("manager: mostra Todas", () => {
    setOrg("manager", "own_and_unassigned");
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /Todas/ })).toBeInTheDocument();
  });

  it("contagens por visão são renderizadas (Fila=3, Minhas=2)", () => {
    setOrg("manager", "all");
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /Fila/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /Minhas/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Todas/ })).toHaveTextContent("5");
  });
});

describe("InboxFilters — seletor de número e o filtro órfão", () => {
  it("um número só: não há o que alternar, o seletor não aparece", () => {
    setOrg("manager", "all");
    canaisRef.current = [canal()];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.queryByLabelText(SELETOR)).not.toBeInTheDocument();
  });

  it("dois números: o seletor aparece com os dois", () => {
    setOrg("manager", "all");
    canaisRef.current = [canal(), canal({ id: "canal-2", display_name: "Suporte" })];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByLabelText(SELETOR)).toBeInTheDocument();
  });

  /**
   * ⭐ O caso que o canal excluído criou: sobrou UM número, o filtro aponta para
   * o que sumiu. Pela regra dos "2+" o seletor sumiria levando junto o único
   * jeito de voltar para "Todos os números" — e o inbox seguiria filtrado,
   * possivelmente vazio, sem nada na tela explicando.
   */
  it("filtro aponta para número que saiu da lista: o seletor FICA e nomeia o número removido", () => {
    setOrg("manager", "all");
    canaisRef.current = [canal()];
    render(
      <InboxFilters value={{ ...VALUE, channel_session_id: "canal-excluido" }} onChange={() => {}} />,
    );
    const seletor = screen.getByLabelText(SELETOR);
    expect(seletor).toBeInTheDocument();
    expect(seletor).toHaveTextContent("Número removido");
  });

  it("filtro que casa com a lista: nada de 'Número removido'", () => {
    setOrg("manager", "all");
    canaisRef.current = [canal(), canal({ id: "canal-2", display_name: "Suporte" })];
    render(<InboxFilters value={{ ...VALUE, channel_session_id: "canal-2" }} onChange={() => {}} />);
    const seletor = screen.getByLabelText(SELETOR);
    expect(seletor).toHaveTextContent("Suporte");
    expect(seletor).not.toHaveTextContent("Número removido");
  });

  /**
   * Listagem que ainda não chegou (ou que falhou) é `undefined`, não lista vazia.
   * Chamar de "removido" um número que talvez esteja lá é a mesma família de
   * mentira que a tela de conexões cometia ao renderizar "primeira instalação"
   * quando a listagem falhava.
   */
  it("listagem ainda carregando: não afirma que o número foi removido", () => {
    setOrg("manager", "all");
    canaisRef.current = undefined;
    render(
      <InboxFilters value={{ ...VALUE, channel_session_id: "canal-1" }} onChange={() => {}} />,
    );
    expect(screen.queryByText("Número removido")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// O filtro "Etapa" (Spec 18, F3)
// ---------------------------------------------------------------------------

const ETAPA = "Filtrar por etapa do funil";

function funil(id: string, name: string, etapas: Array<[string, string]>): FunilDoFiltro {
  return {
    id,
    name,
    is_default: false,
    etapas: etapas.map(([eid, ename]) => ({ id: eid, name: ename, color: "#3b82f6", is_won: false, is_lost: false })),
  };
}

describe("InboxFilters — filtro por etapa", () => {
  // O Radix Select exige estes métodos, que o jsdom não tem.
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it("sem nenhuma etapa (org sem funil, ou ainda carregando), o seletor não aparece", () => {
    setOrg("manager", "all");
    etapasRef.current = [];
    const { unmount } = render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.queryByLabelText(ETAPA)).not.toBeInTheDocument();
    unmount();

    etapasRef.current = undefined;
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.queryByLabelText(ETAPA)).not.toBeInTheDocument();
  });

  it("com etapas, aparece com 'Todas as etapas' como padrão", () => {
    setOrg("agent", "own_and_unassigned");
    etapasRef.current = [funil("f1", "Vendas", [["e1", "Iniciado"]])];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByLabelText(ETAPA)).toHaveTextContent("Todas as etapas");
  });

  it("⭐ escolher uma etapa emite onChange com o id dela, preservando o resto do filtro", async () => {
    setOrg("manager", "all");
    etapasRef.current = [funil("f1", "Vendas", [["e1", "Iniciado"], ["e2", "Aguardando pagamento"]])];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InboxFilters value={{ ...VALUE, tab: "all", tag: "vip" }} onChange={onChange} />);

    await user.click(screen.getByLabelText(ETAPA));
    await user.click(await screen.findByTestId("filtro-etapa-e2"));

    expect(onChange).toHaveBeenCalledWith({ ...VALUE, tab: "all", tag: "vip", etapa: "e2" });
  });

  it("'Todas as etapas' LIMPA o filtro (etapa volta a undefined)", async () => {
    setOrg("manager", "all");
    etapasRef.current = [funil("f1", "Vendas", [["e1", "Iniciado"]])];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InboxFilters value={{ ...VALUE, etapa: "e1" }} onChange={onChange} />);

    await user.click(screen.getByLabelText(ETAPA));
    await user.click(await screen.findByRole("option", { name: "Todas as etapas" }));

    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ etapa: undefined });
  });

  it("com DOIS funis, o nome de cada um separa as etapas; com um só, é ruído e não aparece", async () => {
    setOrg("manager", "all");
    const user = userEvent.setup();

    etapasRef.current = [funil("f1", "Vendas", [["e1", "Orçamento"]]), funil("f2", "Pós-venda", [["e2", "Orçamento"]])];
    const { unmount } = render(<InboxFilters value={VALUE} onChange={() => {}} />);
    await user.click(screen.getByLabelText(ETAPA));
    expect(await screen.findByText("Vendas")).toBeInTheDocument();
    expect(screen.getByText("Pós-venda")).toBeInTheDocument();
    unmount();
    cleanup();

    etapasRef.current = [funil("f1", "Vendas", [["e1", "Orçamento"]])];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    await user.click(screen.getByLabelText(ETAPA));
    await screen.findByTestId("filtro-etapa-e1");
    expect(screen.queryByText("Vendas")).not.toBeInTheDocument();
  });

  /**
   * Mesma família do número removido: a etapa foi arquivada e o filtro continua apontando
   * para ela. Sem nomeá-la, o Inbox ficaria filtrado — vazio — sem nada dizendo por quê.
   */
  it("filtro aponta para etapa que saiu do quadro: o seletor nomeia 'Etapa removida'", () => {
    setOrg("manager", "all");
    etapasRef.current = [funil("f1", "Vendas", [["e1", "Iniciado"]])];
    render(<InboxFilters value={{ ...VALUE, etapa: "etapa-arquivada" }} onChange={() => {}} />);
    expect(screen.getByLabelText(ETAPA)).toHaveTextContent("Etapa removida");
  });

  it("lista ainda carregando: não afirma que a etapa foi removida", () => {
    setOrg("manager", "all");
    etapasRef.current = undefined;
    render(<InboxFilters value={{ ...VALUE, etapa: "e1" }} onChange={() => {}} />);
    expect(screen.queryByText("Etapa removida")).not.toBeInTheDocument();
  });
});
