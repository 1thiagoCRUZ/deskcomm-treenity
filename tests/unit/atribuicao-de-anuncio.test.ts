import { describe, expect, it, vi } from "vitest";

import { extrairAtribuicaoMeta } from "@/lib/channels/atribuicao-de-anuncio-oficial";
import { estamparAtribuicaoDoContato } from "@/lib/leads/atribuicao-de-anuncio";

describe("extrairAtribuicaoMeta — referral do webhook oficial", () => {
  it("extrai um referral de anúncio na forma documentada (snake_case)", () => {
    const r = extrairAtribuicaoMeta({
      source_type: "ad",
      source_id: "120210000000000",
      source_url: "https://fb.me/anuncio123",
      headline: "Agende sua consulta",
      body: "Clique e fale com a gente",
      ctwa_clid: "AfE...clid",
    });
    expect(r).toEqual({
      plataforma: "meta_ads",
      sourceId: "AfE...clid",
      titulo: "Agende sua consulta",
      corpo: "Clique e fale com a gente",
      sourceUrl: "https://fb.me/anuncio123",
      bruto: expect.objectContaining({ source_type: "ad" }),
    });
  });

  it("aceita camelCase (caso o agregador normalize)", () => {
    const r = extrairAtribuicaoMeta({
      sourceType: "ad",
      ctwaClid: "clid-123",
      sourceUrl: "https://fb.me/x",
    });
    expect(r?.sourceId).toBe("clid-123");
    expect(r?.sourceUrl).toBe("https://fb.me/x");
  });

  it("cai pra source_id quando não há ctwa_clid", () => {
    const r = extrairAtribuicaoMeta({ source_type: "ad", source_id: "abc" });
    expect(r?.sourceId).toBe("abc");
  });

  it("rejeita source_type 'post' — orgânico, não anúncio pago", () => {
    expect(extrairAtribuicaoMeta({ source_type: "post", source_id: "abc" })).toBeNull();
  });

  it("nulo quando não há nenhum campo que identifique o anúncio", () => {
    expect(extrairAtribuicaoMeta({ body: "só um corpo, sem id nem título nem url" })).toBeNull();
  });

  it("nulo pra payload ausente/vazio/tipo errado", () => {
    expect(extrairAtribuicaoMeta(null)).toBeNull();
    expect(extrairAtribuicaoMeta(undefined)).toBeNull();
    expect(extrairAtribuicaoMeta("string crua")).toBeNull();
    expect(extrairAtribuicaoMeta([])).toBeNull();
  });
});

describe("estamparAtribuicaoDoContato", () => {
  it("chama a RPC com plataforma e metadata montados a partir da atribuição", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const admin = { rpc } as never;

    await estamparAtribuicaoDoContato(admin, "contact-1", {
      plataforma: "meta_ads",
      sourceId: "clid-1",
      titulo: "Título",
      corpo: "Corpo",
      sourceUrl: "https://fb.me/x",
      bruto: { fonte: "teste" },
    });

    expect(rpc).toHaveBeenCalledWith(
      "fn_estampar_atribuicao_de_anuncio",
      expect.objectContaining({
        p_contact: "contact-1",
        p_platform: "meta_ads",
        p_metadata: expect.objectContaining({
          ad_platform: "meta_ads",
          ad_source_id: "clid-1",
          ad_title: "Título",
          ad_body: "Corpo",
          ad_source_url: "https://fb.me/x",
          ad_raw: { fonte: "teste" },
        }),
      }),
    );
  });

  it("não lança quando a RPC falha — só registra o erro", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const admin = { rpc } as never;

    await expect(
      estamparAtribuicaoDoContato(admin, "contact-1", {
        plataforma: "meta_ads",
        sourceId: null,
        titulo: null,
        corpo: null,
        sourceUrl: null,
        bruto: {},
      }),
    ).resolves.toBeUndefined();
  });
});
