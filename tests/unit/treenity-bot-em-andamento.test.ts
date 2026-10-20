import { describe, expect, it } from "vitest";
import {
  contarPorEtapa,
  estaEncerrado,
  etapaDoAndamento,
  filtrarPorEtapa,
  soEmAndamento,
} from "@/app/app/integrations/treenity-bot/(painel)/_painel/em-andamento";
import type { AtendimentoPainel } from "@/lib/treenity-bot/client";

function at(id: string, statusFunil: string | null, atualizadoEm: string | null = null): AtendimentoPainel {
  return {
    id, cliente: null, canal: null, origem: null, statusFunil, qualidadeIa: null, categoriaFeedback: null,
    precisaAtencaoHumana: false, criadoEm: null, atualizadoEm, totalMensagens: 0, ultimaMensagem: null, venda: null,
  };
}

describe("em andamento", () => {
  it("reconhece encerrados com ou sem acento", () => {
    expect(estaEncerrado("Fechada")).toBe(true);
    expect(estaEncerrado("perdida")).toBe(true);
    expect(estaEncerrado("Em Negociacao")).toBe(false);
    expect(estaEncerrado(null)).toBe(false);
  });
  it("agrupa as etapas", () => {
    expect(etapaDoAndamento("Iniciou")).toBe("iniciou");
    expect(etapaDoAndamento(null)).toBe("iniciou");
    expect(etapaDoAndamento("Em Negociação")).toBe("negociacao");
    expect(etapaDoAndamento("Em Negociacao")).toBe("negociacao");
    expect(etapaDoAndamento("Proposta")).toBe("proposta");
    expect(etapaDoAndamento("Proposta enviada")).toBe("proposta");
  });
  it("tira encerrados, ordena e conta", () => {
    const lista = soEmAndamento([
      at("a", "Fechada"), at("b", "Proposta", "2026-10-01"), at("c", "Iniciou", "2026-10-02"), at("d", "Perdida"),
    ]);
    expect(lista.map((i) => i.id)).toEqual(["c", "b"]);
    expect(contarPorEtapa(lista)).toEqual({ iniciou: 1, negociacao: 0, proposta: 1 });
    expect(filtrarPorEtapa(lista, "proposta").map((i) => i.id)).toEqual(["b"]);
    expect(filtrarPorEtapa(lista, null)).toHaveLength(2);
  });
});
