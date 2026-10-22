import { beforeAll, describe, expect, it } from "vitest";

import { countAs, lastLine, sql } from "./gov-helpers";

/**
 * 0246 · O CATÁLOGO DE PRODUTOS DO BOT.
 *
 * O n8n conecta como postgres (passa por cima da RLS) e só conhece o phone_number_id
 * da Meta. Toda a separação entre empresas, nesse caminho, depende das funções
 * resolverem a empresa pelo número e filtrarem por ela. Aqui se mede:
 *   - quem lê: buscar/detalhar com o número da empresa A nunca traz produto da B;
 *     número desconhecido ou de canal arquivado não traz nada; membro de outra
 *     empresa não lê pela RLS; anon e authenticated não executam as funções.
 *   - quem escreve: só o servidor; usuário logado não grava; conhecimento e termos
 *     não podem apontar para produto de outra empresa.
 *   - o que é apagado: nada que o leitor do site não leu (nulo mantém o anterior,
 *     conhecimento e termos intactos); apagar o produto leva conhecimento e termos.
 */

const ORG_A = "d0d0d0d0-0000-4000-8000-000000000001";
const ORG_B = "d0d0d0d0-0000-4000-8000-000000000002";
const USER_A = "d0d0d0d0-1111-4000-8000-000000000001";
const USER_B = "d0d0d0d0-1111-4000-8000-000000000002";
const PROD_BIOTOP_A = "d0d0d0d0-3333-4000-8000-000000000001";
const PROD_KIT_A = "d0d0d0d0-3333-4000-8000-000000000002";
const PROD_BIONP_A = "d0d0d0d0-3333-4000-8000-000000000003";
const PROD_OLEO_A = "d0d0d0d0-3333-4000-8000-000000000004";
const PROD_INATIVO_A = "d0d0d0d0-3333-4000-8000-000000000005";
const PROD_BIOTOP_B = "d0d0d0d0-3333-4000-8000-000000000011";
const PN_A = "pn-catalogo-a";
const PN_B = "pn-catalogo-b";
const PN_ARQUIVADO = "pn-catalogo-arquivado";

/** Ids devolvidos por catalogo_buscar, na ordem. */
function buscar(pn: string, busca: string, limite = 5): string[] {
  const out = sql(
    `select produto_id from public.catalogo_buscar('${pn}', '${busca}', ${limite});`,
  );
  return out === "" ? [] : out.split("\n");
}

function casouPor(pn: string, busca: string, produto: string): string {
  return sql(
    `select casou_por from public.catalogo_buscar('${pn}', '${busca}', 50) where produto_id = '${produto}';`,
  );
}

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o comando passou, e devia ter sido recusado");
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'catalogo-a@invariant.test'),
      ('${USER_B}', 'catalogo-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'inv-catalogo-a', 'Catalogo A', 'Catalogo A'),
      ('${ORG_B}', 'inv-catalogo-b', 'Catalogo B', 'Catalogo B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'viewer', now()),
      ('${USER_B}', '${ORG_B}', 'viewer', now())
      on conflict do nothing;
    insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
      values ('${ORG_A}', 'meta_cloud', '${PN_A}', '\\x00'::bytea),
             ('${ORG_B}', 'meta_cloud', '${PN_B}', '\\x00'::bytea);
    insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted, archived_at)
      values ('${ORG_B}', 'meta_cloud', '${PN_ARQUIVADO}', '\\x00'::bytea, now());

    insert into public.produtos (id, organization_id, origem, sku, nome, categoria, preco, estoque, ativo) values
      ('${PROD_BIOTOP_A}', '${ORG_A}', 'site', 'BT-1', 'BIOTOP', 'Inseticida biológico', 120.00, 10, true),
      ('${PROD_KIT_A}', '${ORG_A}', 'site', 'KIT-1', 'Kit Adjuvante Herbicida', 'Kit adjuvante para herbicida', 300.00, 5, true),
      ('${PROD_BIONP_A}', '${ORG_A}', 'site', 'NP-1', 'BIO NP', 'Adubação biológica', 90.00, 7, true),
      ('${PROD_OLEO_A}', '${ORG_A}', 'manual', 'OL-1', 'Óleo Vegetal Top', 'Óleo vegetal adjuvante', 50.00, null, true),
      ('${PROD_INATIVO_A}', '${ORG_A}', 'manual', 'OFF-1', 'Produto Antigo', 'Estabilizante de calda', 10.00, 1, false),
      ('${PROD_BIOTOP_B}', '${ORG_B}', 'site', 'BT-1', 'BIOTOP', 'Inseticida biológico', 999.00, 1, true);

    insert into public.produto_conhecimento (produto_id, organization_id, para_que_serve, indicacoes, dose_recomendada) values
      ('${PROD_BIOTOP_A}', '${ORG_A}', 'Controle biológico de insetos', array['Percevejo marrom'], '1 L/ha'),
      ('${PROD_BIOTOP_B}', '${ORG_B}', 'Texto da empresa B', array['Percevejo marrom'], 'B');

    insert into public.produto_termos (organization_id, produto_id, termo, tipo) values
      ('${ORG_A}', '${PROD_BIOTOP_A}', 'Cigarrinha', 'praga'),
      ('${ORG_A}', '${PROD_KIT_A}', 'Rabo-de-Burro', 'nome_regional'),
      ('${ORG_A}', '${PROD_BIONP_A}', 'solo fraco', 'problema'),
      ('${ORG_A}', '${PROD_OLEO_A}', 'oi', 'sinonimo'),
      ('${ORG_B}', '${PROD_BIOTOP_B}', 'cigarrinha', 'praga');
  `);
});

describe("0246 · empresa vem do número, e nunca a de outro", () => {
  it("o número da empresa A resolve a empresa A; desconhecido, vazio e arquivado não resolvem", () => {
    expect(sql(`select public.catalogo_org_por_numero('${PN_A}');`)).toBe(ORG_A);
    expect(sql(`select coalesce(public.catalogo_org_por_numero('nao-existe')::text, 'NULO');`)).toBe("NULO");
    expect(sql(`select coalesce(public.catalogo_org_por_numero('')::text, 'NULO');`)).toBe("NULO");
    expect(sql(`select coalesce(public.catalogo_org_por_numero(null)::text, 'NULO');`)).toBe("NULO");
    expect(sql(`select coalesce(public.catalogo_org_por_numero('${PN_ARQUIVADO}')::text, 'NULO');`)).toBe("NULO");
  });

  it("buscar com o número da A só traz produto da A (mesmo nome, sku e termo na B)", () => {
    const a = buscar(PN_A, "cigarrinha", 50);
    expect(a).toContain(PROD_BIOTOP_A);
    expect(a).not.toContain(PROD_BIOTOP_B);
    const b = buscar(PN_B, "cigarrinha", 50);
    expect(b).toEqual([PROD_BIOTOP_B]);
    // busca vazia (lista) também respeita a empresa
    expect(buscar(PN_B, "", 50)).toEqual([PROD_BIOTOP_B]);
  });

  it("número desconhecido ou arquivado não devolve nada, nem na lista", () => {
    expect(buscar("nao-existe", "")).toEqual([]);
    expect(buscar("nao-existe", "biotop")).toEqual([]);
    expect(buscar(PN_ARQUIVADO, "biotop")).toEqual([]);
  });

  it("detalhes com o id de produto da B, pelo número da A, é nulo", () => {
    expect(sql(`select coalesce(public.catalogo_detalhes('${PN_A}', '${PROD_BIOTOP_B}')::text, 'NULO');`)).toBe("NULO");
    expect(sql(`select coalesce(public.catalogo_detalhes('nao-existe', 'biotop')::text, 'NULO');`)).toBe("NULO");
    // pelo nome, a A recebe o texto dela, nunca o da B
    expect(sql(`select public.catalogo_detalhes('${PN_A}', 'biotop') ->> 'para_que_serve';`)).toBe(
      "Controle biológico de insetos",
    );
  });
});

describe("0246 · busca: palavra inteira, sem acento, frase do cliente", () => {
  it("o termo fica gravado normalizado", () => {
    expect(sql(`select termo from public.produto_termos where produto_id = '${PROD_KIT_A}';`)).toBe("rabo de burro");
  });

  it("termo cadastrado dentro da frase do cliente vem em primeiro", () => {
    const r = buscar(PN_A, "Meu milho tá com RABO DE BURRO, o que uso?");
    expect(r[0]).toBe(PROD_KIT_A);
    expect(casouPor(PN_A, "Meu milho tá com RABO DE BURRO, o que uso?", PROD_KIT_A)).toBe("termo:rabo de burro");
  });

  it("'oi' não casa dentro de 'coisa'; casa como palavra solta", () => {
    expect(buscar(PN_A, "uma coisa", 50)).not.toContain(PROD_OLEO_A);
    expect(buscar(PN_A, "oi, tudo bem?", 50)).toContain(PROD_OLEO_A);
  });

  it("'bio' casa BIO NP (palavra inteira) e não BIOTOP", () => {
    const r = buscar(PN_A, "bio", 50);
    expect(r).toContain(PROD_BIONP_A);
    expect(r).not.toContain(PROD_BIOTOP_A);
  });

  it("acento e maiúscula não importam", () => {
    expect(buscar(PN_A, "OLEO vegetal")[0]).toBe(PROD_OLEO_A);
    expect(buscar(PN_A, "óleo")).toContain(PROD_OLEO_A);
    expect(buscar(PN_A, "inseticida biologico")).toContain(PROD_BIOTOP_A);
  });

  it("nome exato vem em primeiro, com relevância máxima", () => {
    expect(buscar(PN_A, "biotop")[0]).toBe(PROD_BIOTOP_A);
    expect(casouPor(PN_A, "biotop", PROD_BIOTOP_A)).toBe("nome_exato");
  });

  it("indicação do conhecimento casa a frase do cliente", () => {
    expect(buscar(PN_A, "tenho percevejo marrom na soja")).toContain(PROD_BIOTOP_A);
  });

  it("produto inativo não aparece, nem na lista; o limite vale", () => {
    expect(buscar(PN_A, "produto antigo", 50)).not.toContain(PROD_INATIVO_A);
    expect(buscar(PN_A, "", 50)).not.toContain(PROD_INATIVO_A);
    expect(buscar(PN_A, "", 50)).toHaveLength(4);
    expect(buscar(PN_A, "", 2)).toHaveLength(2);
  });
});

describe("0246 · detalhes", () => {
  it("acha por id, por sku (sem caixa) e por nome sem acento; traz conhecimento e termos", () => {
    expect(sql(`select public.catalogo_detalhes('${PN_A}', '${PROD_BIOTOP_A}') ->> 'nome';`)).toBe("BIOTOP");
    expect(sql(`select public.catalogo_detalhes('${PN_A}', 'bt-1') ->> 'produto_id';`)).toBe(PROD_BIOTOP_A);
    expect(sql(`select public.catalogo_detalhes('${PN_A}', 'oleo vegetal top') ->> 'produto_id';`)).toBe(PROD_OLEO_A);
    const ficha = sql(`select public.catalogo_detalhes('${PN_A}', 'biotop')::text;`);
    const j = JSON.parse(ficha) as Record<string, unknown>;
    expect(j.dose_recomendada).toBe("1 L/ha");
    expect(j.indicacoes).toEqual(["Percevejo marrom"]);
    expect(j.termos).toEqual([{ termo: "cigarrinha", tipo: "praga" }]);
    expect(j).not.toHaveProperty("organization_id");
  });

  it("produto inativo e texto vazio dão nulo", () => {
    expect(sql(`select coalesce(public.catalogo_detalhes('${PN_A}', 'produto antigo')::text, 'NULO');`)).toBe("NULO");
    expect(sql(`select coalesce(public.catalogo_detalhes('${PN_A}', '')::text, 'NULO');`)).toBe("NULO");
  });
});

describe("0246 · gravar do site: só colunas da loja, nulo não apaga", () => {
  it("nulo e ausente mantêm preço e estoque; conhecimento e termos ficam intactos", () => {
    const id = lastLine(
      sql(`select public.catalogo_gravar_do_site('${ORG_A}',
        '{"sku":"BT-1","nome":"BIOTOP 1L","preco":null,"estoque":null,"link":"https://loja.test/biotop"}'::jsonb);`),
    );
    expect(id).toBe(PROD_BIOTOP_A);
    expect(sql(`select nome || '|' || preco || '|' || estoque || '|' || link || '|' || (lido_do_site_em is not null)
                  from public.produtos where id = '${PROD_BIOTOP_A}';`)).toBe("BIOTOP 1L|120.00|10|https://loja.test/biotop|true");
    expect(sql(`select para_que_serve || '|' || dose_recomendada from public.produto_conhecimento where produto_id = '${PROD_BIOTOP_A}';`))
      .toBe("Controle biológico de insetos|1 L/ha");
    expect(sql(`select count(*) from public.produto_termos where produto_id = '${PROD_BIOTOP_A}';`)).toBe("1");
  });

  it("valor novo atualiza, inclusive estoque zero e preço em texto brasileiro", () => {
    sql(`select public.catalogo_gravar_do_site('${ORG_A}',
      '{"sku":"BT-1","nome":"BIOTOP","preco":"R$ 1.234,56","estoque":0,"disponivel":false}'::jsonb);`);
    expect(sql(`select preco || '|' || estoque || '|' || disponivel from public.produtos where id = '${PROD_BIOTOP_A}';`))
      .toBe("1234.56|0|false");
  });

  it("gravar não mexe no produto de mesmo sku da outra empresa", () => {
    expect(sql(`select preco || '|' || nome from public.produtos where id = '${PROD_BIOTOP_B}';`)).toBe("999.00|BIOTOP");
  });

  it("produto novo é inserido como ativo, origem site", () => {
    const id = lastLine(
      sql(`select public.catalogo_gravar_do_site('${ORG_A}',
        '{"sku":"EST-1","nome":"Estabilizante X","categoria":"Estabilizante de calda","preco":40}'::jsonb);`),
    );
    expect(sql(`select organization_id || '|' || origem || '|' || ativo from public.produtos where id = '${id}';`))
      .toBe(`${ORG_A}|site|true`);
  });

  it("religa produto inativo que voltou ao site", () => {
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"OFF-1","nome":"Produto Antigo"}'::jsonb);`);
    expect(sql(`select ativo from public.produtos where id = '${PROD_INATIVO_A}';`)).toBe("t");
    sql(`update public.produtos set ativo = false where id = '${PROD_INATIVO_A}';`);
  });

  it("recusa sem nome, preço negativo, número inválido e empresa inexistente", () => {
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"X-1"}'::jsonb);`)))
      .toContain("nome do produto é obrigatório");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"BT-1","nome":"B","preco":-1}'::jsonb);`)))
      .toContain("preço negativo");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"BT-1","nome":"B","preco":"abc"}'::jsonb);`)))
      .toContain("não é um número");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('d0d0d0d0-9999-4000-8000-000000000000', '{"nome":"B"}'::jsonb);`)))
      .toContain("empresa não encontrada");
    // nada disso alterou o produto
    expect(sql(`select preco from public.produtos where id = '${PROD_BIOTOP_A}';`)).toBe("1234.56");
  });
});

describe("0246 · quem lê e quem escreve", () => {
  for (const tabela of ["produtos", "produto_conhecimento", "produto_termos"]) {
    it(`membro da A não lê ${tabela} da B, e lê os da A`, () => {
      expect(countAs(USER_A, `select count(*) from public.${tabela} where organization_id = '${ORG_B}';`)).toBe(0);
      expect(countAs(USER_A, `select count(*) from public.${tabela} where organization_id = '${ORG_A}';`))
        .toBeGreaterThanOrEqual(1);
      expect(countAs(USER_B, `select count(*) from public.${tabela} where organization_id = '${ORG_A}';`)).toBe(0);
    });

    it(`anon não tem nada em ${tabela}; authenticated só lê`, () => {
      expect(sql(`select has_table_privilege('anon', 'public.${tabela}', 'select');`)).toBe("f");
      expect(sql(`select has_table_privilege('authenticated', 'public.${tabela}', 'select');`)).toBe("t");
      for (const p of ["insert", "update", "delete"]) {
        expect(sql(`select has_table_privilege('authenticated', 'public.${tabela}', '${p}');`)).toBe("f");
      }
    });
  }

  it("usuário logado não grava produto nem na própria empresa", () => {
    const erro = erroDe(() =>
      sql(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${USER_A}"}', false);
        insert into public.produtos (organization_id, nome) values ('${ORG_A}', 'invasor');
      `),
    );
    expect(erro).toMatch(/permission denied|row-level security/);
  });

  it("as funções do catálogo não executam por anon nem authenticated; service_role executa", () => {
    const fns = [
      "public.catalogo_normalizar(text)",
      "public.catalogo_org_por_numero(text)",
      "public.catalogo_buscar(text, text, int)",
      "public.catalogo_detalhes(text, text)",
      "public.catalogo_ler_numero(jsonb, text)",
      "public.catalogo_gravar_do_site(uuid, jsonb)",
      "public.catalogo_desativar_nao_lidos(uuid, timestamptz)",
    ];
    for (const f of fns) {
      expect(sql(`select has_function_privilege('anon', '${f}', 'execute');`), f).toBe("f");
      expect(sql(`select has_function_privilege('authenticated', '${f}', 'execute');`), f).toBe("f");
      expect(sql(`select has_function_privilege('service_role', '${f}', 'execute');`), f).toBe("t");
    }
  });

  it("conhecimento e termo não podem apontar para produto de outra empresa", () => {
    expect(
      erroDe(() =>
        sql(`insert into public.produto_termos (organization_id, produto_id, termo) values ('${ORG_B}', '${PROD_KIT_A}', 'furo');`),
      ),
    ).toContain("produto_termos_produto_fk");
    expect(
      erroDe(() =>
        sql(`insert into public.produto_conhecimento (produto_id, organization_id) values ('${PROD_KIT_A}', '${ORG_B}');`),
      ),
    ).toContain("produto_conhecimento_produto_fk");
  });
});

describe("0246 · gravar do site: casos de borda da revisão", () => {
  it("preço com milhar sem centavos, R$ minúsculo e espaço não separável", () => {
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida","preco":"R$ 1.234"}'::jsonb);`);
    expect(sql(`select preco from public.produtos where id = '${PROD_KIT_A}';`)).toBe("1234.00");
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida","preco":"r$\\u00a0312,50"}'::jsonb);`);
    expect(sql(`select preco from public.produtos where id = '${PROD_KIT_A}';`)).toBe("312.50");
    // em peso o ponto é decimal
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida","peso_kg":"1.250"}'::jsonb);`);
    expect(sql(`select peso_kg from public.produtos where id = '${PROD_KIT_A}';`)).toBe("1.250");
  });

  it("disponivel aceita sim/não e recusa outra coisa com mensagem clara; estoque negativo recusa", () => {
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida","disponivel":"Não"}'::jsonb);`);
    expect(sql(`select disponivel from public.produtos where id = '${PROD_KIT_A}';`)).toBe("f");
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida","disponivel":"sim"}'::jsonb);`);
    expect(sql(`select disponivel from public.produtos where id = '${PROD_KIT_A}';`)).toBe("t");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"K","disponivel":"talvez"}'::jsonb);`)))
      .toContain("não é sim/não");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"K","estoque":-3}'::jsonb);`)))
      .toContain("estoque negativo");
  });

  it("produto gravado antes sem sku ganha o sku em vez de duplicar", () => {
    const antes = lastLine(sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"nome":"Adubo Sem Código","preco":10}'::jsonb);`));
    const depois = lastLine(sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"nome":"adubo sem codigo","sku":"ASC-1","preco":11}'::jsonb);`));
    expect(depois).toBe(antes);
    expect(sql(`select sku || '|' || preco from public.produtos where id = '${antes}';`)).toBe("ASC-1|11.00");
  });

  it("nome repetido sem sku recusa em vez de criar mais uma cópia", () => {
    sql(`insert into public.produtos (organization_id, nome) values ('${ORG_A}', 'Vaso'), ('${ORG_A}', 'VASO');`);
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"nome":"Vaso","preco":10}'::jsonb);`)))
      .toContain("nome ambíguo");
    expect(sql(`select count(*) from public.produtos where organization_id = '${ORG_A}' and lower(nome) = 'vaso';`)).toBe("2");
    sql(`delete from public.produtos where organization_id = '${ORG_A}' and lower(nome) = 'vaso';`);
  });

  it("sku e external_id de produtos diferentes: erro claro, nada muda", () => {
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"external_id":"E-NP","sku":"NP-1","nome":"BIO NP"}'::jsonb);`);
    expect(sql(`select external_id from public.produtos where id = '${PROD_BIONP_A}';`)).toBe("E-NP");
    expect(erroDe(() => sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"external_id":"E-NP","sku":"KIT-1","nome":"BIO NP"}'::jsonb);`)))
      .toContain("já pertence a outro produto");
    expect(sql(`select sku from public.produtos where id = '${PROD_BIONP_A}';`)).toBe("NP-1");
  });
});

describe("0246 · busca: ordem", () => {
  beforeAll(() => {
    sql(`
      insert into public.produtos (id, organization_id, origem, nome) values
        ('d0d0d0d0-3333-4000-8000-000000000021', '${ORG_A}', 'manual', 'Fertilizante X'),
        ('d0d0d0d0-3333-4000-8000-000000000022', '${ORG_A}', 'manual', 'Super Crescimento'),
        ('d0d0d0d0-3333-4000-8000-000000000023', '${ORG_A}', 'manual', 'Adubo Orquídea'),
        ('d0d0d0d0-3333-4000-8000-000000000024', '${ORG_A}', 'manual', 'Adubo Bonsai');
      insert into public.produto_termos (organization_id, produto_id, termo)
        values ('${ORG_A}', 'd0d0d0d0-3333-4000-8000-000000000022', 'fertilizante');
    `);
  });

  it("nome inteiro citado na frase vem antes de um termo genérico", () => {
    expect(buscar(PN_A, "quero o fertilizante x")[0]).toBe("d0d0d0d0-3333-4000-8000-000000000021");
  });

  it("mais palavras casadas, mais relevância", () => {
    expect(buscar(PN_A, "adubo para orquidea de vaso")[0]).toBe("d0d0d0d0-3333-4000-8000-000000000023");
  });
});

describe("0246 · desligar o que sumiu do site", () => {
  it("leitura que não gravou nada não desliga nada", () => {
    expect(sql(`select public.catalogo_desativar_nao_lidos('${ORG_B}', clock_timestamp());`)).toBe("0");
    expect(sql(`select ativo from public.produtos where id = '${PROD_BIOTOP_B}';`)).toBe("t");
  });

  it("depois de uma leitura, só os produtos do site não lidos saem; manual fica; outra empresa não muda", () => {
    const inicio = sql(`select clock_timestamp();`);
    sql(`select public.catalogo_gravar_do_site('${ORG_A}', '{"sku":"KIT-1","nome":"Kit Adjuvante Herbicida"}'::jsonb);`);
    const n = Number(sql(`select public.catalogo_desativar_nao_lidos('${ORG_A}', '${inicio}');`));
    expect(n).toBeGreaterThanOrEqual(1);
    expect(sql(`select ativo from public.produtos where id = '${PROD_KIT_A}';`)).toBe("t");
    expect(sql(`select ativo from public.produtos where id = '${PROD_BIONP_A}';`)).toBe("f");
    expect(sql(`select ativo from public.produtos where id = '${PROD_OLEO_A}';`)).toBe("t");
    expect(sql(`select ativo from public.produtos where id = '${PROD_BIOTOP_B}';`)).toBe("t");
    expect(sql(`select count(*) from public.produto_termos where produto_id = '${PROD_BIONP_A}';`)).toBe("1");
  });
});

describe("0246 · o que é apagado", () => {
  it("apagar o produto leva conhecimento e termos junto", () => {
    sql(`delete from public.produtos where id = '${PROD_BIOTOP_A}';`);
    expect(sql(`select count(*) from public.produto_conhecimento where produto_id = '${PROD_BIOTOP_A}';`)).toBe("0");
    expect(sql(`select count(*) from public.produto_termos where produto_id = '${PROD_BIOTOP_A}';`)).toBe("0");
    // e não levou o da outra empresa
    expect(sql(`select count(*) from public.produto_termos where produto_id = '${PROD_BIOTOP_B}';`)).toBe("1");
  });
});
