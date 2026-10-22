import { beforeAll, describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

/**
 * 0247 · A IDENTIDADE DO CANAL SÓ MUDA PELO SERVIDOR.
 *
 * O catálogo do bot (0246) e o roteamento acham a empresa pelo
 * meta_phone_number_id do canal. Antes da 0247 o Dono, com o próprio JWT pelo
 * PostgREST, gravava ali o número de OUTRA empresa (canal dela arquivado ou ainda
 * não cadastrado) e passava a receber o que era dela. Aqui se mede:
 *   - quem escreve: Dono e Funcionário não inserem canal nem trocam número,
 *     WABA, provider, empresa, token do webhook, telefone ou arquivamento;
 *     anon também não; service role, postgres e função SECURITY DEFINER sim;
 *   - a Gestão continua arquivando pelo cliente do usuário (rota DELETE);
 *   - o que o Dono edita hoje (nome, status, metadata) continua editável;
 *   - o efeito de ponta: o número da outra empresa não passa a apontar para a dele.
 */

const ORG_A = "e7e70247-0000-4000-8000-000000000001";
const ORG_B = "e7e70247-0000-4000-8000-000000000002";
const DONO_A = "e7e70247-1111-4000-8000-000000000001";
const FUNC_A = "e7e70247-1111-4000-8000-000000000002";
const GESTAO = "e7e70247-1111-4000-8000-000000000003";
const CANAL_A = "e7e70247-2222-4000-8000-000000000001";
const CANAL_B_ARQUIVADO = "e7e70247-2222-4000-8000-000000000002";
const CANAL_GESTAO = "e7e70247-2222-4000-8000-000000000003";
const CANAL_SERVIDOR = "e7e70247-2222-4000-8000-000000000004";
const PN_A = "pn-0247-a";
const PN_B = "pn-0247-b";
const PN_GESTAO = "pn-0247-gestao";
const PN_LIVRE = "pn-0247-livre";

interface Resultado {
  linhas: number;
  erro: string | null;
}

/** DML como um papel do banco (authenticated com o JWT do usuário, anon ou service_role). */
function como(papel: "authenticated" | "anon" | "service_role", userId: string | null, dml: string): Resultado {
  const claims = userId
    ? `{"sub":"${userId}","role":"${papel}"}`
    : `{"role":"${papel}"}`;
  try {
    const out = sql(`
      set role ${papel};
      select set_config('request.jwt.claims', '${claims}', false);
      with w as (${dml} returning 1) select count(*) from w;
    `);
    return { linhas: Number(lastLine(out)), erro: null };
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    return { linhas: 0, erro: stderr };
  }
}

function valor(coluna: string, id: string): string {
  return sql(`select coalesce(${coluna}::text, '<nulo>') from public.channel_sessions where id = '${id}';`);
}

const RECUSA_INSERT = "canal só pode ser criado pelo servidor";
const RECUSA_UPDATE = "número e identidade do canal só podem ser alterados pelo servidor";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${DONO_A}', 'dono-0247@invariant.test'),
      ('${FUNC_A}', 'func-0247@invariant.test'),
      ('${GESTAO}', 'gestao-0247@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'inv-0247-a', 'Empresa A 0247', 'A 0247'),
      ('${ORG_B}', 'inv-0247-b', 'Empresa B 0247', 'B 0247')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${DONO_A}', '${ORG_A}', 'admin', now()),
      ('${FUNC_A}', '${ORG_A}', 'agent', now())
      on conflict do nothing;
    insert into public.platform_admins (user_id, granted_by, scope, mfa_required, reason)
      values ('${GESTAO}', '${GESTAO}', 'full', false, 'teste 0247')
      on conflict (user_id) do nothing;
    insert into public.channel_sessions
      (id, organization_id, provider, meta_phone_number_id, meta_waba_id, phone_number, display_name, webhook_secret_encrypted, metadata)
      values
      ('${CANAL_A}', '${ORG_A}', 'meta_cloud', '${PN_A}', 'waba-a', '+5511900000247', 'Canal A', '\\x00'::bytea, '{}'::jsonb),
      ('${CANAL_GESTAO}', '${ORG_A}', 'meta_cloud', '${PN_GESTAO}', 'waba-g', null, 'Canal da Gestão', '\\x00'::bytea, '{}'::jsonb)
      on conflict do nothing;
    insert into public.channel_sessions
      (id, organization_id, provider, meta_phone_number_id, meta_waba_id, webhook_secret_encrypted, archived_at)
      values ('${CANAL_B_ARQUIVADO}', '${ORG_B}', 'meta_cloud', '${PN_B}', 'waba-b', '\\x00'::bytea, now())
      on conflict do nothing;
  `);
});

describe("0247 · Dono (admin da empresa) não mexe na identidade do canal", () => {
  it("não insere canal com o número da outra empresa", () => {
    const r = como(
      "authenticated",
      DONO_A,
      `insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
         values ('${ORG_A}', 'meta_cloud', '${PN_B}', '\\x00'::bytea)`,
    );
    expect(r.erro).toContain(RECUSA_INSERT);
    expect(
      sql(`select count(*) from public.channel_sessions where meta_phone_number_id = '${PN_B}' and organization_id = '${ORG_A}';`),
    ).toBe("0");
  });

  it("não troca o meta_phone_number_id do próprio canal pelo da outra empresa", () => {
    const r = como(
      "authenticated",
      DONO_A,
      `update public.channel_sessions set meta_phone_number_id = '${PN_B}' where id = '${CANAL_A}'`,
    );
    expect(r.erro).toContain(RECUSA_UPDATE);
    expect(valor("meta_phone_number_id", CANAL_A)).toBe(PN_A);
  });

  it("efeito de ponta: o número da outra empresa não passa a apontar para a dele", () => {
    // B arquivado: o número não resolve para ninguém. O Dono tenta as duas portas
    // (inserir e trocar) e o número continua sem dono.
    como("authenticated", DONO_A,
      `insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
         values ('${ORG_A}', 'meta_cloud', '${PN_B}', '\\x00'::bytea)`);
    como("authenticated", DONO_A,
      `update public.channel_sessions set meta_phone_number_id = '${PN_B}' where id = '${CANAL_A}'`);
    expect(sql(`select coalesce(public.catalogo_org_por_numero('${PN_B}')::text, '<nulo>');`)).toBe("<nulo>");
  });

  it.each([
    ["meta_waba_id", "'waba-b'"],
    ["id", "'e7e70247-2222-4000-8000-0000000000ff'"],
    ["provider", "'zernio'"],
    ["organization_id", `'${ORG_B}'`],
    ["webhook_path_token", "'token-escolhido-pelo-dono-0247'"],
    ["webhook_secret_encrypted", "'\\x01'::bytea"],
    ["meta_token_encrypted", "'\\x01'::bytea"],
    ["zernio_account_id", "'zernio-0247'"],
    ["waha_session_name", "'waha-0247'"],
    ["phone_number", "'+5511999990247'"],
    ["archived_at", "now()"],
  ])("não altera %s", (coluna, novo) => {
    const antes = valor(coluna, CANAL_A);
    const r = como("authenticated", DONO_A, `update public.channel_sessions set ${coluna} = ${novo} where id = '${CANAL_A}'`);
    expect(r.erro).toContain(RECUSA_UPDATE);
    expect(valor(coluna, CANAL_A)).toBe(antes);
  });

  it("não desarquiva canal da própria empresa (devolveria um número antigo ao catálogo)", () => {
    sql(`update public.channel_sessions set archived_at = now() where id = '${CANAL_GESTAO}';`);
    const r = como("authenticated", DONO_A, `update public.channel_sessions set archived_at = null where id = '${CANAL_GESTAO}'`);
    expect(r.erro).toContain(RECUSA_UPDATE);
    expect(valor("archived_at", CANAL_GESTAO)).not.toBe("<nulo>");
    sql(`update public.channel_sessions set archived_at = null where id = '${CANAL_GESTAO}';`);
  });

  it("CONTROLE POSITIVO: continua editando nome, status e metadata", () => {
    expect(
      como(
        "authenticated",
        DONO_A,
        `update public.channel_sessions set display_name = 'Loja A', status = 'STOPPED', metadata = metadata || '{"x":1}'::jsonb where id = '${CANAL_A}'`,
      ),
    ).toEqual({ linhas: 1, erro: null });
    expect(valor("display_name", CANAL_A)).toBe("Loja A");
    expect(valor("status", CANAL_A)).toBe("STOPPED");
  });

  it("CONTROLE POSITIVO: reenviar o MESMO número (sem mudar) não é recusado", () => {
    expect(
      como(
        "authenticated",
        DONO_A,
        `update public.channel_sessions set meta_phone_number_id = '${PN_A}', display_name = 'Loja A' where id = '${CANAL_A}'`,
      ),
    ).toEqual({ linhas: 1, erro: null });
  });
});

describe("0247 · Funcionário e anon também não", () => {
  it("Funcionário não insere canal", () => {
    const r = como(
      "authenticated",
      FUNC_A,
      `insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
         values ('${ORG_A}', 'meta_cloud', '${PN_LIVRE}', '\\x00'::bytea)`,
    );
    expect(r.erro).toContain(RECUSA_INSERT);
    expect(sql(`select count(*) from public.channel_sessions where meta_phone_number_id = '${PN_LIVRE}';`)).toBe("0");
  });

  it("Funcionário não troca o número (a RLS da 0150 já esconde a linha dele para escrita)", () => {
    const r = como(
      "authenticated",
      FUNC_A,
      `update public.channel_sessions set meta_phone_number_id = '${PN_B}' where id = '${CANAL_A}'`,
    );
    expect(r.linhas).toBe(0);
    expect(valor("meta_phone_number_id", CANAL_A)).toBe(PN_A);
  });

  it("anon não insere canal", () => {
    // Para anon a policy da 0150 barra antes do trigger (anon não executa
    // fn_user_org_ids). O que se mede é a recusa e a ausência da linha.
    const r = como(
      "anon",
      null,
      `insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
         values ('${ORG_A}', 'meta_cloud', '${PN_LIVRE}', '\\x00'::bytea)`,
    );
    expect(r.erro).toMatch(/permission denied|canal só pode ser criado pelo servidor/);
    expect(sql(`select count(*) from public.channel_sessions where meta_phone_number_id = '${PN_LIVRE}';`)).toBe("0");
  });

  it("nem a Gestão insere canal pelo cliente do usuário (nenhuma rota faz isso)", () => {
    const r = como(
      "authenticated",
      GESTAO,
      `insert into public.channel_sessions (organization_id, provider, meta_phone_number_id, webhook_secret_encrypted)
         values ('${ORG_A}', 'meta_cloud', '${PN_LIVRE}', '\\x00'::bytea)`,
    );
    expect(r.erro).toContain(RECUSA_INSERT);
    expect(sql(`select count(*) from public.channel_sessions where meta_phone_number_id = '${PN_LIVRE}';`)).toBe("0");
  });
});

describe("0247 · os caminhos legítimos continuam funcionando", () => {
  it("service role (POST /channels/official) insere e troca o número", () => {
    expect(
      como(
        "service_role",
        null,
        `insert into public.channel_sessions (id, organization_id, provider, meta_phone_number_id, meta_waba_id, webhook_secret_encrypted)
           values ('${CANAL_SERVIDOR}', '${ORG_A}', 'meta_cloud', 'pn-0247-servidor', 'waba-s', '\\x00'::bytea)`,
      ),
    ).toEqual({ linhas: 1, erro: null });
    expect(
      como(
        "service_role",
        null,
        `update public.channel_sessions set meta_phone_number_id = 'pn-0247-servidor-2', meta_waba_id = 'waba-s2',
           archived_at = null, phone_number = '+5511988880247' where id = '${CANAL_SERVIDOR}'`,
      ),
    ).toEqual({ linhas: 1, erro: null });
    expect(valor("meta_phone_number_id", CANAL_SERVIDOR)).toBe("pn-0247-servidor-2");
  });

  it("Gestão arquiva o canal pelo cliente do usuário (rota DELETE /channel-sessions/[id])", () => {
    // Sem mudar status: o trigger de auditoria de status (emit_event) exige que a
    // Gestão esteja numa sessão de suporte da empresa, o que não é desta migration.
    // Aqui só se mede que as colunas de identidade passam para a Gestão.
    expect(
      como(
        "authenticated",
        GESTAO,
        `update public.channel_sessions
            set archived_at = now(), last_status_change_at = now(),
                meta_token_encrypted = null, webhook_path_token = 'token0247rotacionado'
          where organization_id = '${ORG_A}' and id = '${CANAL_GESTAO}'`,
      ),
    ).toEqual({ linhas: 1, erro: null });
    expect(valor("webhook_path_token", CANAL_GESTAO)).toBe("token0247rotacionado");
    expect(valor("archived_at", CANAL_GESTAO)).not.toBe("<nulo>");
  });

  it("função SECURITY DEFINER do dono do banco (como fn_reserve/fn_finish) grava mesmo chamada por authenticated", () => {
    // pg_temp: a função vive só nesta sessão e não aparece para as varreduras de public.
    const out = sql(`
      create function pg_temp.f0247() returns int language sql security definer as $f$
        update public.channel_sessions set meta_waba_id = 'waba-definer' where id = '${CANAL_SERVIDOR}' returning 1
      $f$;
      grant execute on function pg_temp.f0247() to authenticated;
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${DONO_A}","role":"authenticated"}', false);
      select pg_temp.f0247();
    `);
    expect(lastLine(out)).toBe("1");
    expect(valor("meta_waba_id", CANAL_SERVIDOR)).toBe("waba-definer");
  });

  it("postgres (scripts, n8n) grava direto", () => {
    sql(`update public.channel_sessions set meta_waba_id = 'waba-postgres' where id = '${CANAL_SERVIDOR}';`);
    expect(valor("meta_waba_id", CANAL_SERVIDOR)).toBe("waba-postgres");
  });

  it("a função do trigger não é executável por anon nem authenticated", () => {
    expect(
      sql(`select has_function_privilege('anon', 'public.fn_channel_sessions_identidade_so_servidor()', 'execute')::text
                || ',' || has_function_privilege('authenticated', 'public.fn_channel_sessions_identidade_so_servidor()', 'execute')::text;`),
    ).toBe("false,false");
  });
});
