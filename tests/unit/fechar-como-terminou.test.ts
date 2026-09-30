import { describe, expect, it } from "vitest";

import { lerValorEmReais } from "@/components/inbox/FecharComoTerminou";
import { desfechoDoFechamento } from "@/lib/treenity-bot/funil-de-leads";
import { assumirAoResponder } from "@/lib/treenity-bot/responder-assume";

describe("valor da venda digitado no Inbox", () => {
  it("aceita o jeito brasileiro e o com ponto", () => {
    expect(lerValorEmReais("1.250,00")).toBe(1250);
    expect(lerValorEmReais("R$ 150,5")).toBe(150.5);
    expect(lerValorEmReais("99.90")).toBe(99.9);
    expect(lerValorEmReais("300")).toBe(300);
  });
  it("recusa o que não é valor", () => {
    expect(lerValorEmReais("")).toBeNull();
    expect(lerValorEmReais("abc")).toBeNull();
    expect(lerValorEmReais("0")).toBeNull();
    expect(lerValorEmReais("1,2,3")).toBeNull();
  });
});

describe("\"Fechada\" no bot é atendimento encerrado, não venda", () => {
  it("com venda, o card é ganho", () => {
    expect(desfechoDoFechamento({ venda: { total: 100 } } as never)).toEqual({ desfecho: "won" });
  });
  it("sem venda, o card é perdido — com um motivo que o banco aceita", () => {
    expect(desfechoDoFechamento({ venda: null } as never)).toEqual({ desfecho: "lost", motivo: "other" });
  });
});

/** Supabase falso: organização, conversa e a RPC de assumir. */
function supabaseCom(opcoes: { treenity: boolean; dono: string | null; rpcDevolve?: unknown[] }) {
  const chamadas: { rpc: Record<string, unknown>[] } = { rpc: [] };
  const sb = {
    chamadas,
    from(tabela: string) {
      const linha =
        tabela === "organizations"
          ? { settings: opcoes.treenity ? { treenity_bot: { whatsapp: { ativo: true } } } : {} }
          : { id: "cv1", contact_id: null, assigned_to_user_id: opcoes.dono };
      const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: linha, error: null }) };
      return c;
    },
    rpc: async (_nome: string, args: Record<string, unknown>) => {
      chamadas.rpc.push(args);
      return { data: opcoes.rpcDevolve ?? [{ id: "cv1" }], error: null };
    },
  };
  return sb;
}

const pedido = { organizationId: "org", conversationId: "cv1", actor: { type: "user" as const, id: "u1" } };

describe("responder pelo Inbox já assume (Treenity Bot)", () => {
  it("conversa sem dono passa para quem respondeu, pela mesma RPC do botão, só se estiver livre", async () => {
    const sb = supabaseCom({ treenity: true, dono: null });
    expect(await assumirAoResponder(sb as never, pedido)).toBe("assumida");
    expect(sb.chamadas.rpc[0]).toMatchObject({ p_to_user_id: "u1", p_reason: "claim", p_enforce_expected: true });
    expect(sb.chamadas.rpc[0]).not.toHaveProperty("p_expected_assignee");
  });

  it("nunca tira a conversa de outra pessoa da equipe", async () => {
    const sb = supabaseCom({ treenity: true, dono: "outra-pessoa" });
    expect(await assumirAoResponder(sb as never, pedido)).toBe("ja_tem_dono");
    expect(sb.chamadas.rpc).toHaveLength(0);
  });

  it("fora do Treenity Bot nada muda (segue a janela de 5 minutos do DeskComm)", async () => {
    const sb = supabaseCom({ treenity: false, dono: null });
    expect(await assumirAoResponder(sb as never, pedido)).toBe("nao_se_aplica");
    expect(sb.chamadas.rpc).toHaveLength(0);
  });

  it("alguém assumiu no mesmo instante: não é erro", async () => {
    const sb = supabaseCom({ treenity: true, dono: null, rpcDevolve: [] });
    expect(await assumirAoResponder(sb as never, pedido)).toBe("ja_tem_dono");
  });
});
