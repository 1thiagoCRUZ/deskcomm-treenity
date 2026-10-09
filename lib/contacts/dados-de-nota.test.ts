import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { CPF_ENCRYPTION_KEY: "chave-de-teste" } }));

import {
  camposFaltando,
  cifrarCpf,
  colunasParaGravar,
  dadosDeNotaEntradaSchema,
  decifrarCpf,
  paraTela,
  resumoParaOBot,
  type LinhaDadosDeNota,
} from "./dados-de-nota";

const CPF = "52998224725"; // válido (dígitos verificadores)

const linha = (mudanca: Partial<LinhaDadosDeNota> = {}): LinhaDadosDeNota => ({
  id: "l1",
  organization_id: "org",
  contact_id: "ct",
  nome: "João da Silva",
  cpf_cifrado: cifrarCpf(CPF),
  cpf_final: "25",
  telefone: "14999990000",
  email: "joao@exemplo.com",
  cep: "17500000",
  endereco: "Rua A, 10",
  cidade: "Marília",
  estado: "SP",
  propriedade_nome: null,
  propriedade_cnpj: null,
  propriedade_ie: null,
  propriedade_cep: null,
  propriedade_endereco: null,
  transportadora_preferida: "Sedex",
  preenchido_por: "bot",
  updated_at: "2026-10-07T12:00:00Z",
  ...mudanca,
});

describe("entrada dos dados para nota", () => {
  it("normaliza CPF, CEP, telefone, e-mail e estado", () => {
    const r = dadosDeNotaEntradaSchema.parse({
      cpf: "529.982.247-25",
      cep: "17500-000",
      telefone: "(14) 99999-0000",
      email: " Joao@Exemplo.COM ",
      estado: "sp",
    });
    expect(r).toMatchObject({ cpf: CPF, cep: "17500000", telefone: "14999990000", email: "joao@exemplo.com", estado: "SP" });
  });

  it("recusa CPF com dígito errado, CEP curto, estado inexistente e CNPJ curto", () => {
    expect(dadosDeNotaEntradaSchema.safeParse({ cpf: "52998224724" }).success).toBe(false);
    expect(dadosDeNotaEntradaSchema.safeParse({ cep: "1750" }).success).toBe(false);
    expect(dadosDeNotaEntradaSchema.safeParse({ estado: "XX" }).success).toBe(false);
    expect(dadosDeNotaEntradaSchema.parse({ estado: "São Paulo" }).estado).toBe("SP");
    expect(dadosDeNotaEntradaSchema.parse({ estado: "mato grosso do sul" }).estado).toBe("MS");
    expect(dadosDeNotaEntradaSchema.safeParse({ propriedade_cnpj: "123" }).success).toBe(false);
  });

  it("campo ausente não entra na gravação; vazio apaga", () => {
    const cols = colunasParaGravar(dadosDeNotaEntradaSchema.parse({ cidade: "Marília", endereco: "" }));
    expect(cols).toEqual({ cidade: "Marília", endereco: null });
  });
});

describe("CPF cifrado", () => {
  it("vai e volta, e o banco nunca recebe o número", () => {
    const cols = colunasParaGravar(dadosDeNotaEntradaSchema.parse({ cpf: CPF }));
    expect(cols.cpf_cifrado).not.toContain(CPF);
    expect(cols.cpf_final).toBe("25");
    expect(decifrarCpf(cols.cpf_cifrado!)).toBe(CPF);
  });

  it("valor corrompido devolve null em vez de quebrar a tela", () => {
    expect(decifrarCpf("lixo")).toBeNull();
  });

  it("a tela recebe mascarado; inteiro só quando se pede para revelar", () => {
    expect(paraTela(linha()).cpf_mascarado).toBe("***.***.***-25");
    expect(paraTela(linha())).not.toHaveProperty("cpf");
    expect(paraTela(linha(), true).cpf).toBe(CPF);
  });
});

describe("o que falta e o que o bot vê", () => {
  it("lista o que falta pedir", () => {
    expect(camposFaltando(linha({ email: null, cpf_cifrado: null }))).toEqual(["cpf", "email"]);
    expect(camposFaltando(null)).toHaveLength(8);
  });

  it("o bot recebe os dados MASCARADOS para o cliente conferir, mais CEP e transportadora", () => {
    const r = resumoParaOBot(linha({ propriedade_nome: "Fazenda Boa Vista", propriedade_cnpj: "12345678000195" }));
    expect(r.dados_mascarados).toBe(
      [
        "Nome: João da Silva",
        "CPF: ***.***.***-25",
        "Telefone: (14) *****-0000",
        "E-mail: j*****@exemplo.com",
        "Entrega: Rua A, 10, Marília/SP, CEP 17500-000",
        "Propriedade na nota: Fazenda Boa Vista, CNPJ **.***.***/****-95",
      ].join("\n"),
    );
    expect(r).toMatchObject({ tem_dados: true, faltando: [], cep: "17500000", transportadora_preferida: "Sedex", tem_propriedade: true });
    const tudo = JSON.stringify(r);
    expect(tudo).not.toContain(CPF);
    expect(tudo).not.toContain("joao@exemplo.com");
    expect(tudo).not.toContain("14999990000");
    expect(tudo).not.toContain("12345678000195");
  });

  it("cliente novo: nada para confirmar, tudo para pedir", () => {
    expect(resumoParaOBot(null)).toMatchObject({ tem_dados: false, dados_mascarados: null, transportadora_preferida: null });
    expect(resumoParaOBot(null).faltando).toContain("CPF");
  });
});
