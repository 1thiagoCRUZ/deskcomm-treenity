import { beforeAll, describe, expect, it } from "vitest";

import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas";
import { PREFIXO_DO_PEDIDO_DE_ESPECIALISTA } from "@/lib/treenity-bot/pediu-especialista";

import { sql } from "./gov-helpers";

/**
 * ÍNDICES DE DESEMPENHO (migration 0245).
 *
 * Só índices: nada aqui muda quem lê o quê. O que este arquivo guarda é que cada
 * índice CHEGOU pelo baseline e que o planejador o USA com a consulta que o código
 * realmente faz. Índice com predicado diferente do da consulta fica no banco,
 * custando escrita, e nunca é usado: o símbolo presente não prova nada.
 *
 * Volume: duas empresas, 20 mil contatos e conversas (2 mil da empresa A),
 * 10 mil vendas e 40 mil eventos, quase todos já processados.
 *
 * O seed termina com VACUUM, e não só ANALYZE, de propósito. Aqui os índices
 * existem ANTES das linhas (vêm do baseline), e um índice GIN guarda o que
 * chega numa lista pendente até o vacuum a incorporar. Com 20 mil linhas na
 * lista o planejador estima o trigram caro demais e não o escolhe (medido). Em
 * produção o autovacuum faz essa incorporação sozinho.
 */
const ORG_A = "0be7a70a-2580-4000-8000-000000000245";
const ORG_B = "0be7a70a-2580-4000-8000-000000000246";
const SESSAO = "0be7a70a-2580-4000-8000-0000000002ff";

const STATUS_TERMINAIS = CONVERSATION_TERMINAL_STATUSES.map((s) => `'${s}'`).join(",");

function plano(consulta: string): string {
  return sql(`explain ${consulta}`);
}

beforeAll(() => {
  sql(`
    set session_replication_role = replica;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'org-indices-a', 'Org Indices A LTDA', 'Org Indices A'),
      ('${ORG_B}', 'org-indices-b', 'Org Indices B LTDA', 'Org Indices B')
    on conflict (id) do nothing;

    insert into public.contacts (organization_id, display_name, phone_number, email)
    select case when g % 10 = 0 then '${ORG_A}'::uuid else '${ORG_B}'::uuid end,
           (array['Ana','Bruno','Carla','Diego','Elisa'])[1 + g % 5] || ' ' ||
           (array['Silva','Souza','Rocha','Lima','Costa','Alves','Gomes'])[1 + g % 7] || ' ' || g,
           '+55' || (11900000000 + (g::bigint * 7919) % 99999999)::text,
           'cliente' || g || '@exemplo.com'
      from generate_series(1, 20000) g;

    insert into public.conversations
      (organization_id, contact_id, channel_session_id, status, last_message_at,
       assigned_to_user_id, last_handoff_reason)
    select c.organization_id, c.id, '${SESSAO}',
           case when abs(hashtext(c.id::text)) % 10 < 7 then 'closed' else 'open' end,
           now() - (abs(hashtext(c.id::text || 't')) % 100000) * interval '37 seconds',
           null,
           case when abs(hashtext(c.id::text || 'h')) % 10 = 0
                then '${PREFIXO_DO_PEDIDO_DE_ESPECIALISTA}PAGAMENTO' end
      from public.contacts c
     where c.organization_id in ('${ORG_A}', '${ORG_B}');

    insert into public.conversa_vendas (organization_id, conversation_id, iniciada_em, fechada_em)
    select v.organization_id, v.id, now() - (n % 5000) * interval '23 minutes' - interval '1 hour',
           now() - (n % 5000) * interval '23 minutes'
      from (select id, organization_id, row_number() over () as n
              from public.conversations
             where organization_id in ('${ORG_A}', '${ORG_B}')) v
     where n % 2 = 0;

    insert into public.event_log (organization_id, event_type, entity_kind, entity_id, status, created_at)
    select case when g % 2 = 0 then '${ORG_A}'::uuid else '${ORG_B}'::uuid end,
           case when g % 5 = 0 then 'conversation.routing_requested' else 'lead.stage_changed' end,
           'conversation', gen_random_uuid(),
           case when g <= 2000 and g % 5 <> 0 then 'pending'
                when g between 2001 and 2100 and g % 5 = 0 then 'pending'
                else 'done' end,
           now() - (40000 - g) * interval '9 seconds'
      from generate_series(1, 40000) g;

    set session_replication_role = origin;
    vacuum analyze public.contacts;
    vacuum analyze public.conversations;
    vacuum analyze public.conversa_vendas;
    vacuum analyze public.event_log;
  `);
});

describe("índices de desempenho (0245)", () => {
  it("os seis índices chegaram pelo baseline", () => {
    const nomes = sql(`
      select indexname from pg_indexes
       where schemaname = 'public'
         and indexname in ('idx_contacts_display_name_trgm', 'idx_contacts_phone_number_trgm',
                           'idx_conversations_org_last_msg_id', 'idx_conversa_vendas_org_fechada',
                           'idx_conversations_org_pediu_especialista', 'idx_event_log_pending_type_created')
       order by 1;
    `).split("\n");
    expect(nomes).toHaveLength(6);
  });

  it("o predicado do índice parcial é o mesmo da contagem (prefixo e status terminais do código)", () => {
    const def = sql(`select pg_get_indexdef('public.idx_conversations_org_pediu_especialista'::regclass);`);
    expect(def).toContain(`'${PREFIXO_DO_PEDIDO_DE_ESPECIALISTA}%'`);
    for (const s of CONVERSATION_TERMINAL_STATUSES) expect(def).toContain(`'${s}'`);
    expect(def).toMatch(/assigned_to_user_id IS NULL/);
  });

  it("busca de contato do Inbox (nome na tela ou telefone) usa os índices trigram", () => {
    const p = plano(`
      select id from public.contacts
       where organization_id = '${ORG_A}' and is_anonymized = false
         and (display_name ilike '%Rocha 1234%' or name ilike '%Rocha 1234%' or phone_number ilike '%1902%')
       limit 120;`);
    expect(p, p).toContain("idx_contacts_display_name_trgm");
    expect(p, p).toContain("idx_contacts_phone_number_trgm");
  });

  it("lista do Inbox sai pronta do índice com desempate por id, sem ordenar depois", () => {
    const p = plano(`
      select id from public.conversations
       where organization_id = '${ORG_A}'
       order by last_message_at desc nulls last, id desc limit 51;`);
    expect(p).toContain("idx_conversations_org_last_msg_id");
    expect(p).not.toMatch(/Sort/);
  });

  it("aba Fechadas usa o índice por empresa e data", () => {
    const p = plano(`
      select id, conversation_id, fechada_em, valor from public.conversa_vendas
       where organization_id = '${ORG_A}' and fechada_em >= now() - interval '24 hours'
       order by fechada_em desc limit 100;`);
    expect(p).toContain("idx_conversa_vendas_org_fechada");
    expect(p).not.toMatch(/Seq Scan/);
  });

  it("a contagem 'pediu especialista' usa o índice parcial e conta só a empresa pedida", () => {
    const consulta = `
      select count(*) from public.conversations
       where organization_id = '${ORG_A}'
         and last_handoff_reason like '${PREFIXO_DO_PEDIDO_DE_ESPECIALISTA}%'
         and assigned_to_user_id is null
         and not (status = any (array[${STATUS_TERMINAIS}]::text[]));`;
    expect(plano(consulta)).toContain("idx_conversations_org_pediu_especialista");

    // O índice não muda o resultado: a mesma contagem sem índice nenhum bate.
    const comIndice = sql(consulta);
    const semIndice = sql(`
      set enable_indexscan = off; set enable_bitmapscan = off; set enable_indexonlyscan = off;
      ${consulta}`).split("\n").pop();
    expect(Number(comIndice)).toBeGreaterThan(0);
    expect(semIndice).toBe(comIndice);
  });

  it("o routing-worker pega os pendentes do tipo, mais antigos primeiro, sem ordenar depois", () => {
    const p = plano(`
      select id from public.event_log
       where event_type = 'conversation.routing_requested' and status = 'pending'
         and (next_attempt_at is null or next_attempt_at <= now())
       order by created_at asc limit 50;`);
    expect(p).toContain("idx_event_log_pending_type_created");
    expect(p).not.toMatch(/Sort/);
  });
});
