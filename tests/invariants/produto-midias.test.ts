import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

/**
 * 0248 · AS MÍDIAS DO PRODUTO DO CATÁLOGO DO BOT.
 *
 * O n8n conecta como postgres (passa por cima da RLS) e só conhece o phone_number_id
 * da Meta. A separação entre empresas, nesse caminho, depende de catalogo_apresentacao
 * resolver a empresa pelo número e filtrar por ela. Aqui se mede:
 *   - quem lê: membro da A lê as mídias da A e não as da B; anon nada; a função não
 *     executa por anon/authenticated; o número da B nunca traz mídia da A.
 *   - quem escreve: só o servidor; mídia não aponta para produto de outra empresa.
 *   - o que é apagado: apagar o produto leva as mídias; mídia desligada não sai.
 */

const ORG_A = "d1d1d1d1-0000-4000-8000-000000000001";
const ORG_B = "d1d1d1d1-0000-4000-8000-000000000002";
const USER_A = "d1d1d1d1-1111-4000-8000-000000000001";
const USER_B = "d1d1d1d1-1111-4000-8000-000000000002";
const PROD_A = "d1d1d1d1-3333-4000-8000-000000000001";
const PROD_TOPFIX1_A = "d1d1d1d1-3333-4000-8000-000000000002";
const PROD_TOPFIX2_A = "d1d1d1d1-3333-4000-8000-000000000003";
const PROD_CHECKS_A = "d1d1d1d1-3333-4000-8000-000000000004";
const PROD_APAGAR_A = "d1d1d1d1-3333-4000-8000-000000000005";
const PROD_B = "d1d1d1d1-3333-4000-8000-000000000011";
const PN_A = "pn-midias-a";
const PN_B = "pn-midias-b";
const PN_ARQUIVADO_A = "pn-midias-arquivado-a";
const ORG_C = "d1d1d1d1-0000-4000-8000-000000000003";
const PROD_C = "d1d1d1d1-3333-4000-8000-000000000021";
const BASE = "https://conta.blob.core.windows.net/midias";

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o comando passou, e devia ter sido recusado");
}

function inserirMidia(org: string, produto: string, papel: string, tipo: string, url: string): void {
  sql(`
    insert into public.produto_midias (organization_id, produto_id, papel, tipo, url)
      values ('${org}', '${produto}', '${papel}', '${tipo}', '${url}');
  `);
}

function apresentacao(pn: string, produto: string): Record<string, unknown> | null {
  const out = sql(`select coalesce(public.catalogo_apresentacao('${pn}', '${produto}')::text, 'NULO');`);
  return out === "NULO" ? null : (JSON.parse(out) as Record<string, unknown>);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'midias-a@invariant.test'),
      ('${USER_B}', 'midias-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'inv-midias-a', 'Midias A', 'Midias A'),
      ('${ORG_B}', 'inv-midias-b', 'Midias B', 'Midias B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'viewer', now()),
      ('${USER_B}', '${ORG_B}', 'viewer', now())
      on conflict do nothing;
    insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
      values ('${ORG_A}', 'meta_cloud', '${PN_A}', '\\x00'::bytea),
             ('${ORG_B}', 'meta_cloud', '${PN_B}', '\\x00'::bytea);
    insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted, archived_at)
      values ('${ORG_A}', 'meta_cloud', '${PN_ARQUIVADO_A}', '\\x00'::bytea, now());

    insert into public.produtos (id, organization_id, origem, sku, nome, imagem_url) values
      ('${PROD_A}', '${ORG_A}', 'site', 'BM-1', 'Biomax Raiz', '${BASE}/site-a.jpg'),
      ('${PROD_TOPFIX1_A}', '${ORG_A}', 'site', 'TF-1', 'Topfix Um', null),
      ('${PROD_TOPFIX2_A}', '${ORG_A}', 'site', 'TF-2', 'Topfix Dois', null),
      ('${PROD_CHECKS_A}', '${ORG_A}', 'manual', 'CK-1', 'Produto Checagem', null),
      ('${PROD_APAGAR_A}', '${ORG_A}', 'manual', 'AP-1', 'Produto Apagar', null),
      ('${PROD_B}', '${ORG_B}', 'site', 'BM-1', 'Biomax Raiz', '${BASE}/site-b.jpg');

    insert into public.produto_midias (organization_id, produto_id, papel, tipo, url, legenda, ordem, ativo, created_at) values
      ('${ORG_A}', '${PROD_A}', 'extra', 'video', '${BASE}/a-video.mp4', null, 10, true, now() - interval '3 minutes'),
      ('${ORG_A}', '${PROD_A}', 'extra', 'imagem', '${BASE}/a-extra-1.PNG', 'Antes e depois', 10, true, now() - interval '2 minutes'),
      ('${ORG_A}', '${PROD_A}', 'extra', 'imagem', '${BASE}/a-extra-0.jpeg', null, 5, true, now()),
      ('${ORG_A}', '${PROD_A}', 'extra', 'imagem', '${BASE}/a-desligada.jpg', null, 1, false, now()),
      ('${ORG_A}', '${PROD_A}', 'principal', 'imagem', '${BASE}/a-principal.jpg', null, 999, true, now()),
      ('${ORG_A}', '${PROD_TOPFIX1_A}', 'extra', 'imagem', '${BASE}/tf1.jpg', null, 100, true, now()),
      ('${ORG_B}', '${PROD_B}', 'principal', 'imagem', '${BASE}/b-principal.jpg', null, 100, true, now()),
      ('${ORG_B}', '${PROD_B}', 'extra', 'video', '${BASE}/b-video.mp4', null, 1, true, now());
  `);
});

describe("0248 · quem lê e quem escreve", () => {
  it("membro da A lê as mídias da A e não as da B; membro da B não lê as da A", () => {
    expect(countAs(USER_A, `select count(*) from public.produto_midias where organization_id = '${ORG_B}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.produto_midias where organization_id = '${ORG_A}';`))
      .toBeGreaterThanOrEqual(6);
    expect(countAs(USER_B, `select count(*) from public.produto_midias where organization_id = '${ORG_A}';`)).toBe(0);
  });

  it("anon não tem nada; authenticated só lê", () => {
    expect(sql(`select has_table_privilege('anon', 'public.produto_midias', 'select');`)).toBe("f");
    expect(sql(`select has_table_privilege('authenticated', 'public.produto_midias', 'select');`)).toBe("t");
    for (const p of ["insert", "update", "delete", "truncate"]) {
      expect(sql(`select has_table_privilege('authenticated', 'public.produto_midias', '${p}');`), p).toBe("f");
    }
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.produto_midias'::regclass;`)).toBe("t");
    expect(
      sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = 'produto_midias' and cmd <> 'SELECT';`),
    ).toBe("0");
  });

  it("usuário logado não grava, não altera e não apaga mídia nem na própria empresa", () => {
    const claims = `set role authenticated; select set_config('request.jwt.claims', '{"sub":"${USER_A}"}', false);`;
    for (const dml of [
      `insert into public.produto_midias (organization_id, produto_id, tipo, url) values ('${ORG_A}', '${PROD_A}', 'imagem', '${BASE}/invasor.jpg');`,
      `update public.produto_midias set ativo = false where organization_id = '${ORG_A}';`,
      `delete from public.produto_midias where organization_id = '${ORG_A}';`,
    ]) {
      expect(erroDe(() => sql(`${claims} ${dml}`)), dml).toMatch(/permission denied|row-level security/);
    }
  });

  it("catalogo_apresentacao não executa por anon nem authenticated; service_role executa", () => {
    const f = "public.catalogo_apresentacao(text, text)";
    expect(sql(`select has_function_privilege('anon', '${f}', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', '${f}', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('public', '${f}', 'execute');`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', '${f}', 'execute');`)).toBe("t");
    expect(sql(`select prosecdef from pg_proc where oid = '${f}'::regprocedure;`)).toBe("f");
  });

  it("o servidor não move mídia da B para produto da A por update (FK composta)", () => {
    expect(
      erroDe(() =>
        sql(`update public.produto_midias set produto_id = '${PROD_A}'
              where organization_id = '${ORG_B}' and url = '${BASE}/b-video.mp4';`),
      ),
    ).toMatch(/produto_midias_produto_fk/);
  });

  it("mídia da empresa B não se liga a produto da empresa A (FK composta)", () => {
    expect(
      erroDe(() => inserirMidia(ORG_B, PROD_A, "extra", "imagem", `${BASE}/cruzada.jpg`)),
    ).toMatch(/produto_midias_produto_fk/);
  });
});

describe("0248 · o que a mídia aceita", () => {
  const recusas: Array<[string, string, string, string, RegExp]> = [
    ["url http", "extra", "imagem", "http://conta.blob.core.windows.net/x.jpg", /produto_midias_url_formato/],
    ["url com SAS", "extra", "imagem", `${BASE}/x.jpg?sv=2024&sig=abc.jpg`, /produto_midias_url_formato/],
    ["url com espaço", "extra", "imagem", `${BASE}/com espaco.jpg`, /produto_midias_url_formato/],
    ["url com âncora", "extra", "imagem", `${BASE}/x.jpg#topo.jpg`, /produto_midias_url_formato/],
    ["webp como imagem", "extra", "imagem", `${BASE}/x.webp`, /produto_midias_url_extensao/],
    ["mp4 como imagem", "extra", "imagem", `${BASE}/x.mp4`, /produto_midias_url_extensao/],
    ["jpg como vídeo", "extra", "video", `${BASE}/x.jpg`, /produto_midias_url_extensao/],
    ["principal vídeo", "principal", "video", `${BASE}/x.mp4`, /produto_midias_principal_e_imagem/],
    ["papel inválido", "capa", "imagem", `${BASE}/x.jpg`, /produto_midias_papel_check/],
    ["tipo inválido", "extra", "audio", `${BASE}/x.jpg`, /produto_midias_tipo_check/],
  ];
  for (const [nome, papel, tipo, url, erro] of recusas) {
    it(`recusa ${nome}`, () => {
      expect(erroDe(() => inserirMidia(ORG_A, PROD_CHECKS_A, papel, tipo, url))).toMatch(erro);
    });
  }

  it("recusa legenda acima de 1024 caracteres e aceita 1024", () => {
    expect(
      erroDe(() =>
        sql(`insert into public.produto_midias (organization_id, produto_id, tipo, url, legenda)
               values ('${ORG_A}', '${PROD_CHECKS_A}', 'imagem', '${BASE}/legenda-longa.jpg', repeat('a', 1025));`),
      ),
    ).toMatch(/produto_midias_legenda_tamanho/);
    sql(`insert into public.produto_midias (organization_id, produto_id, tipo, url, legenda)
           values ('${ORG_A}', '${PROD_CHECKS_A}', 'imagem', '${BASE}/legenda-1024.jpg', repeat('a', 1024));`);
  });

  it("segunda principal ativa no mesmo produto é recusada; desligar a antiga libera a nova", () => {
    inserirMidia(ORG_A, PROD_CHECKS_A, "principal", "imagem", `${BASE}/ck-principal-1.jpg`);
    expect(
      erroDe(() => inserirMidia(ORG_A, PROD_CHECKS_A, "principal", "imagem", `${BASE}/ck-principal-2.jpg`)),
    ).toMatch(/produto_midias_principal_ativa_uidx/);
    sql(`update public.produto_midias set ativo = false
          where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-principal-1.jpg';`);
    inserirMidia(ORG_A, PROD_CHECKS_A, "principal", "imagem", `${BASE}/ck-principal-2.jpg`);
    expect(
      sql(`select count(*) from public.produto_midias where produto_id = '${PROD_CHECKS_A}' and papel = 'principal';`),
    ).toBe("2");
  });

  it("update também respeita as regras: religar segunda principal, virar principal, principal virar vídeo", () => {
    // ck-principal-1 está desligada e ck-principal-2 ligada (teste anterior)
    expect(
      erroDe(() =>
        sql(`update public.produto_midias set ativo = true
              where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-principal-1.jpg';`),
      ),
    ).toMatch(/produto_midias_principal_ativa_uidx/);
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ck-promover.jpg`);
    expect(
      erroDe(() =>
        sql(`update public.produto_midias set papel = 'principal'
              where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-promover.jpg';`),
      ),
    ).toMatch(/produto_midias_principal_ativa_uidx/);
    expect(
      erroDe(() =>
        sql(`update public.produto_midias set tipo = 'video'
              where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-principal-2.jpg';`),
      ),
    ).toMatch(/produto_midias_principal_e_imagem|produto_midias_url_extensao/);
  });

  it("updated_at anda no update", () => {
    const mudou = sql(`
      update public.produto_midias set updated_at = now() - interval '1 day', created_at = now() - interval '1 day'
       where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-promover.jpg';
      update public.produto_midias set ordem = 7
       where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-promover.jpg';
      select updated_at > created_at + interval '1 hour' from public.produto_midias
       where produto_id = '${PROD_CHECKS_A}' and url = '${BASE}/ck-promover.jpg';
    `);
    expect(mudou.split("\n").pop()).toBe("t");
  });

  it("a mesma url não se repete no mesmo produto", () => {
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ck-dup.jpg`);
    expect(
      erroDe(() => inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ck-dup.jpg`)),
    ).toMatch(/produto_midias_produto_url_key/);
  });

  it("aceita jpg, jpeg e png em qualquer caixa como imagem, e mp4 como vídeo", () => {
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ok-1.JPG`);
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ok-2.jpeg`);
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "imagem", `${BASE}/ok-3.png`);
    inserirMidia(ORG_A, PROD_CHECKS_A, "extra", "video", `${BASE}/ok-4.mp4`);
  });
});

describe("0248 · catalogo_apresentacao", () => {
  it("devolve a ficha + as mídias ativas, principal primeiro, depois ordem e criação", () => {
    const r = apresentacao(PN_A, "biomax raiz");
    expect(r).not.toBeNull();
    expect(r?.produto_id).toBe(PROD_A);
    expect(r?.imagem_url).toBe(`${BASE}/site-a.jpg`);
    const midias = r?.midias as Array<Record<string, unknown>>;
    expect(midias.map((m) => m.url)).toEqual([
      `${BASE}/a-principal.jpg`,
      `${BASE}/a-extra-0.jpeg`,
      `${BASE}/a-video.mp4`,
      `${BASE}/a-extra-1.PNG`,
    ]);
    expect(Object.keys(midias[0] ?? {}).sort()).toEqual(["legenda", "ordem", "papel", "tipo", "url"]);
    expect(midias[0]).toMatchObject({ papel: "principal", tipo: "imagem", ordem: 999, legenda: null });
    expect(midias[3]).toMatchObject({ papel: "extra", tipo: "imagem", legenda: "Antes e depois" });
  });

  it("o número da B, com o mesmo nome e até com o id do produto da A, não vê a A", () => {
    const b = apresentacao(PN_B, "biomax raiz");
    expect(b?.produto_id).toBe(PROD_B);
    expect((b?.midias as Array<Record<string, unknown>>).map((m) => m.url)).toEqual([
      `${BASE}/b-principal.jpg`,
      `${BASE}/b-video.mp4`,
    ]);
    expect(apresentacao(PN_B, PROD_A)).toBeNull();
    expect(apresentacao(PN_A, PROD_B)).toBeNull();
  });

  it("número desconhecido ou de canal arquivado devolve nulo", () => {
    expect(apresentacao("nao-existe", "biomax raiz")).toBeNull();
    expect(apresentacao(PN_ARQUIVADO_A, "biomax raiz")).toBeNull();
    expect(apresentacao("nao-existe", PROD_A)).toBeNull();
  });

  it("nome ambíguo devolve só os candidatos, sem mídias", () => {
    const r = apresentacao(PN_A, "topfix");
    expect(r).toEqual({ candidatos: ["Topfix Um", "Topfix Dois"] });
  });

  it("produto sem mídia devolve midias vazia", () => {
    expect(apresentacao(PN_A, "topfix dois")?.midias).toEqual([]);
  });
});

describe("0248 · o que é apagado e a migration de novo", () => {
  it("desligar não apaga: a linha fica, some da apresentação e volta ao religar", () => {
    const url = `${BASE}/a-extra-0.jpeg`;
    sql(`update public.produto_midias set ativo = false where produto_id = '${PROD_A}' and url = '${url}';`);
    expect(sql(`select count(*) from public.produto_midias where produto_id = '${PROD_A}' and url = '${url}';`)).toBe("1");
    expect((apresentacao(PN_A, PROD_A)?.midias as Array<Record<string, unknown>>).map((m) => m.url)).not.toContain(url);
    sql(`update public.produto_midias set ativo = true where produto_id = '${PROD_A}' and url = '${url}';`);
    expect((apresentacao(PN_A, PROD_A)?.midias as Array<Record<string, unknown>>).map((m) => m.url)).toContain(url);
  });

  it("apagar a empresa apaga as mídias dela, e só as dela", () => {
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
        values ('${ORG_C}', 'inv-midias-c', 'Midias C', 'Midias C') on conflict do nothing;
      insert into public.produtos (id, organization_id, origem, nome) values ('${PROD_C}', '${ORG_C}', 'manual', 'Produto C');
    `);
    inserirMidia(ORG_C, PROD_C, "principal", "imagem", `${BASE}/c.jpg`);
    const outras = sql(`select count(*) from public.produto_midias where organization_id <> '${ORG_C}';`);
    sql(`delete from public.organizations where id = '${ORG_C}';`);
    expect(sql(`select count(*) from public.produto_midias where organization_id = '${ORG_C}';`)).toBe("0");
    expect(sql(`select count(*) from public.produto_midias where organization_id <> '${ORG_C}';`)).toBe(outras);
  });

  it("apagar o produto apaga as mídias dele", () => {
    inserirMidia(ORG_A, PROD_APAGAR_A, "principal", "imagem", `${BASE}/apagar.jpg`);
    inserirMidia(ORG_A, PROD_APAGAR_A, "extra", "video", `${BASE}/apagar.mp4`);
    expect(sql(`select count(*) from public.produto_midias where produto_id = '${PROD_APAGAR_A}';`)).toBe("2");
    sql(`delete from public.produtos where id = '${PROD_APAGAR_A}';`);
    expect(sql(`select count(*) from public.produto_midias where produto_id = '${PROD_APAGAR_A}';`)).toBe("0");
  });

  it("a migration roda duas vezes sem erro e sem mexer nos dados", () => {
    const antes = sql(`select count(*) from public.produto_midias;`);
    const mig = readFileSync("supabase/migrations/20261023120000_0248_produto_midias.sql", "utf8");
    sql(mig);
    sql(mig);
    expect(sql(`select count(*) from public.produto_midias;`)).toBe(antes);
    expect(sql(`select has_function_privilege('anon', 'public.catalogo_apresentacao(text, text)', 'execute');`)).toBe("f");
    expect(sql(`select has_table_privilege('authenticated', 'public.produto_midias', 'insert');`)).toBe("f");
  });
});
