import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { CPF_ENCRYPTION_KEY: "chave-de-teste" } }));

import { gravarDadosDeNota } from "./dados-de-nota";

/** Banco falso: guarda o contato e a linha de nota; e-mail em uso = 23505. */
function bancoFalso(emailEmUso: string | null = null) {
  const contato: Record<string, unknown> = { name: null, email: null };
  let nota: Record<string, unknown> | null = null;
  const filtros = (resolver: () => unknown) => {
    const c: Record<string, unknown> = {
      eq: () => c,
      maybeSingle: async () => resolver(),
      single: async () => resolver(),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(resolver()).then(ok),
    };
    return c;
  };
  return {
    contato: () => contato,
    nota: () => nota,
    from(tabela: string) {
      if (tabela === "contacts") {
        return {
          update: (patch: Record<string, unknown>) =>
            filtros(() => {
              if (emailEmUso && patch.email === emailEmUso) return { error: { code: "23505", message: "dup" } };
              Object.assign(contato, patch);
              return { error: null };
            }),
          select: () => filtros(() => ({ data: { ...contato }, error: null })),
        };
      }
      return {
        upsert: (linha: Record<string, unknown>) => ({
          select: () =>
            filtros(() => {
              nota = { ...(nota ?? {}), ...linha };
              return { data: { ...nota }, error: null };
            }),
        }),
      };
    },
  };
}

describe("gravar dados de nota: nome e e-mail no contato", () => {
  it("nome e e-mail vão para o contato e saem da reserva", async () => {
    const db = bancoFalso();
    const linha = await gravarDadosDeNota(db as never, "org", "ct", { nome: "Fernando", email: "f@x.com", cidade: "Marília" }, "bot");
    expect(db.contato()).toMatchObject({ name: "Fernando", email: "f@x.com" });
    expect(db.nota()).toMatchObject({ nome: null, email: null, cidade: "Marília" });
    expect(linha).toMatchObject({ nome: "Fernando", email: "f@x.com" });
  });

  it("e-mail que já é de OUTRO contato: nome vai, e-mail fica na reserva, sem erro", async () => {
    const db = bancoFalso("dono@x.com");
    const linha = await gravarDadosDeNota(db as never, "org", "ct", { nome: "Maria", email: "dono@x.com" }, "bot");
    expect(db.contato()).toMatchObject({ name: "Maria", email: null });
    expect(db.nota()).toMatchObject({ nome: null, email: "dono@x.com" });
    expect(linha.email).toBe("dono@x.com");
  });
});
