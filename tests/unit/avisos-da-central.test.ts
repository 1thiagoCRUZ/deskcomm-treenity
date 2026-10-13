import { describe, expect, it, vi } from "vitest";

import { abrirAvisoDeEspecialista, abrirAvisoDeVenda, resolverAvisosDaConversa } from "@/lib/treenity-bot/avisos-da-central";

/** Cliente falso: toda consulta encadeia e termina devolvendo `existente`. */
function falso(existente: unknown) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn();
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq", "like", "limit"]) cadeia[m] = () => cadeia;
  cadeia.maybeSingle = () => Promise.resolve({ data: existente });
  cadeia.insert = insert;
  cadeia.update = (v: unknown) => {
    update(v);
    return cadeia;
  };
  return { admin: { from: () => cadeia } as never, insert, update };
}

describe("avisos da central", () => {
  it("abre o aviso de especialista ligado à conversa", async () => {
    const f = falso(null);
    await abrirAvisoDeEspecialista(f.admin, { organizationId: "o", conversationId: "c", cliente: "Ana", motivo: "quer desconto" });
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "handoff", ref_kind: "conversation", ref_id: "c", severity: "critical" }));
  });

  it("não duplica o aviso de especialista aberto", async () => {
    const f = falso({ id: "x" });
    await abrirAvisoDeEspecialista(f.admin, { organizationId: "o", conversationId: "c", cliente: null, motivo: "m" });
    expect(f.insert).not.toHaveBeenCalled();
  });

  it("abre o aviso de venda com o valor em reais e não repete a mesma venda", async () => {
    const f = falso(null);
    await abrirAvisoDeVenda(f.admin, { organizationId: "o", conversationId: null, cliente: "Ana", total: 150, itens: "2 caixas", idVenda: "v1" });
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "other", title: expect.stringContaining("150,00") }));
    const g = falso({ id: "x" });
    await abrirAvisoDeVenda(g.admin, { organizationId: "o", conversationId: null, cliente: null, total: 1, itens: null, idVenda: "v1" });
    expect(g.insert).not.toHaveBeenCalled();
  });

  it("resolve os avisos da conversa", async () => {
    const f = falso(null);
    await resolverAvisosDaConversa(f.admin, "o", "c");
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ status: "resolved" }));
  });
});
