import { describe, expect, it } from "vitest";

import { criarPedidoSchema, pedidoParaDto, resolverPedidoSchema } from "./pedidos";

describe("criarPedidoSchema", () => {
  it("aceita número com DDD em formatos comuns", () => {
    for (const n of ["+55 14 99731-7147", "+5514997317147", "(14) 99731-7147", "14997317147"]) {
      expect(criarPedidoSchema.safeParse({ tipo: "trocar_numero", numero_novo: n }).success, n).toBe(true);
    }
  });

  it("recusa o que não é telefone (texto livre não entra no campo do número)", () => {
    for (const n of ["", "abc", "meu outro numero", "+55 14 <script>", "123"]) {
      expect(criarPedidoSchema.safeParse({ tipo: "trocar_numero", numero_novo: n }).success, n).toBe(false);
    }
  });

  it("recusa tipo desconhecido e observação grande demais", () => {
    expect(criarPedidoSchema.safeParse({ tipo: "apagar_tudo", numero_novo: "+5514997317147" }).success).toBe(false);
    expect(
      criarPedidoSchema.safeParse({ tipo: "trocar_numero", numero_novo: "+5514997317147", observacao: "x".repeat(501) })
        .success,
    ).toBe(false);
  });
});

describe("resolverPedidoSchema", () => {
  it("só atendido ou cancelado — reabrir um pedido não é uma operação", () => {
    expect(resolverPedidoSchema.safeParse({ status: "atendido" }).success).toBe(true);
    expect(resolverPedidoSchema.safeParse({ status: "cancelado" }).success).toBe(true);
    expect(resolverPedidoSchema.safeParse({ status: "aberto" }).success).toBe(false);
  });
});

describe("pedidoParaDto", () => {
  const base = {
    id: "p1",
    organization_id: "o1",
    tipo: "trocar_numero",
    status: "aberto",
    criado_em: "2026-10-16T12:00:00Z",
    resolvido_em: null,
  };

  it("tira o número e a observação do jsonb", () => {
    const dto = pedidoParaDto({ ...base, detalhe: { numero_novo: "+5514997317147", observacao: "o antigo morreu" } });
    expect(dto.numero_novo).toBe("+5514997317147");
    expect(dto.observacao).toBe("o antigo morreu");
  });

  it("detalhe vazio, nulo ou de tipo errado vira null, nunca estoura", () => {
    expect(pedidoParaDto({ ...base, detalhe: null }).numero_novo).toBeNull();
    expect(pedidoParaDto({ ...base, detalhe: { numero_novo: 123 } }).numero_novo).toBeNull();
    expect(pedidoParaDto({ ...base, detalhe: {} }).observacao).toBeNull();
  });
});
