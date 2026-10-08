import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/** Ver o CPF inteiro nos dados de nota é só do Dono (decisão de 08/10). */

vi.mock("@/lib/env", () => ({ env: { CPF_ENCRYPTION_KEY: "chave-de-teste" } }));
const papel = { atual: "agent" as string };
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "u-1" }, org: { orgId: "org-1", role: papel.atual } }),
}));
const auditar = vi.fn(async () => {});
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditar(...(a as [])) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "ct-1" }, error: null }) }) }) }) }),
  }),
}));
vi.mock("@/lib/contacts/dados-de-nota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/contacts/dados-de-nota")>();
  return {
    ...real,
    lerDadosDeNota: async () => ({
      id: "l1", organization_id: "org-1", contact_id: "ct-1", nome: "João",
      cpf_cifrado: real.cifrarCpf("52998224725"), cpf_final: "25", telefone: null, email: null,
      cep: null, endereco: null, cidade: null, estado: null, propriedade_nome: null, propriedade_cnpj: null,
      propriedade_ie: null, propriedade_cep: null, propriedade_endereco: null, transportadora_preferida: null,
      preenchido_por: "bot", updated_at: "",
    }),
  };
});

import { GET } from "@/app/api/v1/contacts/[id]/dados-de-nota/route";

const pedir = (revelar: boolean) =>
  GET(new NextRequest(`https://x.test/api/v1/contacts/ct-1/dados-de-nota${revelar ? "?revelar=cpf" : ""}`), {
    params: Promise.resolve({ id: "ct-1" }),
  });

beforeEach(() => auditar.mockClear());

describe("CPF inteiro só para o Dono", () => {
  it("funcionário vê mascarado", async () => {
    papel.atual = "agent";
    const corpo = await (await pedir(false)).json();
    expect(corpo.data.cpf_mascarado).toBe("***.***.***-25");
    expect(corpo.data).not.toHaveProperty("cpf");
  });

  it("funcionário pedindo para revelar: 403, e nada no audit", async () => {
    papel.atual = "agent";
    const r = await pedir(true);
    expect(r.status).toBe(403);
    expect(auditar).not.toHaveBeenCalled();
  });

  it("Dono revela, e fica registrado quem viu", async () => {
    papel.atual = "admin";
    const corpo = await (await pedir(true)).json();
    expect(corpo.data.cpf).toBe("52998224725");
    expect(auditar).toHaveBeenCalledWith(expect.objectContaining({ action: "contact.cpf_revealed", actorUserId: "u-1" }));
  });
});
