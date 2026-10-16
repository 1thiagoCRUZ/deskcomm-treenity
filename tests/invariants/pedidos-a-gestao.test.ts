import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_MANAGER,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * PEDIDOS DO CLIENTE À GESTÃO (0240): QUEM LÊ, QUEM CRIA, QUEM DECIDE.
 *
 *   ler    — `agent`+ da organização (e a Gestão);
 *   criar  — só o `admin` (o Dono), em nome dele;
 *   mudar  — só a Gestão. O Dono cria o pedido mas não o resolve.
 *
 * O viewer fora da leitura e o agente fora da escrita são o que as rotas já dizem; aqui a mesma
 * regra é provada no banco, onde ela não se contorna pelo PostgREST.
 */

const PEDIDO = "dddddddd-0000-4000-8000-000000000001";

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.pedidos_a_gestao (id, organization_id, tipo, detalhe, criado_por)
      values ('${PEDIDO}', '${GOV_ORG}', 'trocar_numero', '{"numero_novo":"+5514900000000"}', '${GOV_ADMIN}')
      on conflict (id) do nothing;
  `);
});

const doPedido = `select count(*) from public.pedidos_a_gestao where id = '${PEDIDO}';`;

const novoPedido = (usuario: string, status = "aberto", criadoPor: string = usuario) =>
  writeCountAs(
    usuario,
    `insert into public.pedidos_a_gestao (organization_id, tipo, detalhe, criado_por, status)
       values ('${GOV_ORG}', 'trocar_numero', '{"numero_novo":"+5514911111111"}', '${criadoPor}', '${status}')`,
  );

describe("leitura", () => {
  it("agent, manager e admin leem (controle positivo)", () => {
    for (const u of [GOV_AGENT_A, GOV_MANAGER, GOV_ADMIN]) expect(countAs(u, doPedido)).toBe(1);
  });

  it("viewer não lê", () => {
    expect(countAs(GOV_VIEWER, doPedido)).toBe(0);
  });
});

describe("criação", () => {
  it("o admin cria em nome dele (controle positivo)", () => {
    expect(novoPedido(GOV_ADMIN)).toBe(1);
  });

  it("agent, manager e viewer não criam", () => {
    for (const u of [GOV_AGENT_A, GOV_MANAGER, GOV_VIEWER]) expect(novoPedido(u), u).toBe(0);
  });

  it("o admin não cria em nome de OUTRA pessoa", () => {
    expect(novoPedido(GOV_ADMIN, "aberto", GOV_AGENT_A)).toBe(0);
  });

  it("o admin não cria um pedido já 'atendido'", () => {
    expect(novoPedido(GOV_ADMIN, "atendido")).toBe(0);
  });
});

describe("decisão", () => {
  it("nem o admin da empresa muda o pedido — só a Gestão", () => {
    expect(
      writeCountAs(GOV_ADMIN, `update public.pedidos_a_gestao set status = 'atendido' where id = '${PEDIDO}'`),
    ).toBe(0);
    expect(sql(`select status from public.pedidos_a_gestao where id = '${PEDIDO}';`)).toBe("aberto");
  });

  it("nem apaga", () => {
    expect(writeCountAs(GOV_ADMIN, `delete from public.pedidos_a_gestao where id = '${PEDIDO}'`)).toBe(0);
  });
});
