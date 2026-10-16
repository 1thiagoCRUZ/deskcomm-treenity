import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_CONTACT_1,
  GOV_CONTACT_2,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * DADOS DE NOTA (CPF CIFRADO, ENDEREÇO, PROPRIEDADE): SÓ QUEM ATENDE LÊ E GRAVA,
 * E ANONIMIZAR O CONTATO APAGA A LINHA.
 *
 * `contato_dados_de_nota` nasceu (0236) com a policy de isolamento por organização
 * e nada além: um `viewer` lia e gravava direto pelo PostgREST, ainda que a rota
 * exigisse `agent`. A 0239 leva o mesmo gate para o banco, onde ele não se contorna.
 *
 * A segunda metade é a LGPD: o trigger apaga a linha na transição
 * `is_anonymized false → true`, qualquer que seja o caminho que anonimiza. A
 * aplicação já apagava (`lib/lgpd/redact-cascade.ts`); quem anonimiza por outro
 * lado (rota direta, DBA à mão) deixava o CPF vivo.
 */

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.contato_dados_de_nota (organization_id, contact_id, cep, cpf_final)
      values ('${GOV_ORG}', '${GOV_CONTACT_1}', '17500000', '46')
      on conflict (organization_id, contact_id) do nothing;
    insert into public.contato_dados_de_nota (organization_id, contact_id, cep)
      values ('${GOV_ORG}', '${GOV_CONTACT_2}', '17500001')
      on conflict (organization_id, contact_id) do nothing;
  `);
});

const dosContato = (c: string) =>
  `select count(*) from public.contato_dados_de_nota where contact_id = '${c}';`;

describe("o gate de papel mora no banco", () => {
  it("o agente da organização lê (controle positivo)", () => {
    expect(countAs(GOV_AGENT_A, dosContato(GOV_CONTACT_1))).toBe(1);
  });

  it("o viewer da MESMA organização não lê", () => {
    expect(countAs(GOV_VIEWER, dosContato(GOV_CONTACT_1))).toBe(0);
  });

  it("o viewer não altera", () => {
    expect(
      writeCountAs(
        GOV_VIEWER,
        `update public.contato_dados_de_nota set cep = '00000000' where contact_id = '${GOV_CONTACT_1}'`,
      ),
    ).toBe(0);
  });

  it("o viewer não insere", () => {
    expect(
      writeCountAs(
        GOV_VIEWER,
        `insert into public.contato_dados_de_nota (organization_id, contact_id, cep)
           values ('${GOV_ORG}', '${GOV_CONTACT_1}', '00000000')
           on conflict (organization_id, contact_id) do update set cep = excluded.cep`,
      ),
    ).toBe(0);
  });

  it("o agente altera (controle positivo da escrita)", () => {
    expect(
      writeCountAs(
        GOV_AGENT_A,
        `update public.contato_dados_de_nota set cep = '17500002' where contact_id = '${GOV_CONTACT_1}'`,
      ),
    ).toBe(1);
  });
});

describe("anonimizar o contato apaga os dados de nota dele", () => {
  it("ANTES: a linha existe (controle positivo)", () => {
    expect(sql(dosContato(GOV_CONTACT_2))).toBe("1");
  });

  it("DEPOIS: some a do contato anonimizado e fica a do vizinho", () => {
    // A função REAL da cascata (o caminho por onde a anonimização realmente passa);
    // o trigger dispara dentro da transação dela.
    sql(`select public.fn_lgpd_cascade_redact_contact('${GOV_ORG}', '${GOV_CONTACT_2}', gen_random_uuid());`);
    expect(sql(dosContato(GOV_CONTACT_2))).toBe("0");
    expect(sql(dosContato(GOV_CONTACT_1))).toBe("1");
  });
});
