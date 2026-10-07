import { describe, expect, it } from "vitest";

import { caminhoDoAnexo, montarMensagemComAnexo, separarAnexo } from "./anexo-de-cliente";

const ID = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";

describe("cliente anexado no Chat da equipe", () => {
  it("vai e volta: texto + anexo viram uma mensagem e se separam de novo", () => {
    const conteudo = montarMensagemComAnexo("Por que você ofereceu desconto?", { conversaId: ID, nome: "João da Silva" });
    expect(conteudo).toBe(`Por que você ofereceu desconto?\n\n📎 João da Silva · /app/inbox?id=${ID}`);
    expect(separarAnexo(conteudo)).toEqual({
      texto: "Por que você ofereceu desconto?",
      anexo: { conversaId: ID, nome: "João da Silva" },
    });
  });

  it("dá para mandar só o cliente, sem texto", () => {
    const conteudo = montarMensagemComAnexo("   ", { conversaId: ID, nome: "Maria" });
    expect(separarAnexo(conteudo)).toEqual({ texto: "", anexo: { conversaId: ID, nome: "Maria" } });
  });

  it("mensagem comum continua inteira", () => {
    expect(separarAnexo("bom dia\ntudo certo?")).toEqual({ texto: "bom dia\ntudo certo?", anexo: null });
  });

  it("caminho no meio do texto não vira cartão — só a última linha no formato", () => {
    const texto = `olha /app/inbox?id=${ID} depois\nok`;
    expect(separarAnexo(texto).anexo).toBeNull();
  });

  it("nome com quebra de linha ou com o separador não quebra o cartão", () => {
    const conteudo = montarMensagemComAnexo("", { conversaId: ID, nome: "Ana\nPaula · Fazenda" });
    expect(separarAnexo(conteudo).anexo).toEqual({ conversaId: ID, nome: "Ana Paula - Fazenda" });
  });

  it("o cartão abre a conversa no Inbox", () => {
    expect(caminhoDoAnexo({ conversaId: ID, nome: "x" })).toBe(`/app/inbox?id=${ID}`);
  });
});
