import { describe, expect, it } from "vitest";

import { textoDoAvisoDeVenda } from "./avisos";

describe("aviso de venda nova", () => {
  it("⭐ título com cliente e valor em reais, corpo com os itens", () => {
    const { title, body } = textoDoAvisoDeVenda({ cliente: "Mateus Amaro", total: 11097, itens: "3x Kit Top Ultra 20 L" });
    expect(title).toBe("Venda nova: Mateus Amaro — R$ 11.097,00");
    expect(body).toBe("3x Kit Top Ultra 20 L");
  });

  it("sem nome nem itens não quebra", () => {
    const { title, body } = textoDoAvisoDeVenda({ cliente: "", total: Number.NaN, itens: "" });
    expect(title).toBe("Venda nova: Cliente — R$ 0,00");
    expect(body).toBe("Pedido registrado pelo bot.");
  });
});
