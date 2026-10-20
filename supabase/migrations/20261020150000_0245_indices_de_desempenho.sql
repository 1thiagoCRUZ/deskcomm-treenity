-- Índices de desempenho para as consultas mais frequentes do painel. Só índices: nenhuma
-- tabela, coluna, policy, função ou trigger muda, então ninguém passa a ver nada que não via.
-- Cada um foi provado com EXPLAIN num Postgres descartável (80 mil contatos e conversas,
-- 40 mil vendas, 300 mil eventos) com a consulta copiada do código: o planejador passa a
-- usá-lo. Se faltar, o código continua funcionando, só fica mais lento.
--
-- ⚠️ create index (sem concurrently) segura as ESCRITAS da tabela enquanto o índice é
-- montado. Hoje as tabelas são pequenas e isso leva instantes; numa base grande, aplique
-- fora do horário de movimento (ou crie cada um à mão com concurrently, fora de transação).

-- Busca de contato pelo nome que aparece na tela (display_name) e pelo telefone, com o
-- termo no meio do texto (ilike '%termo%'). O de name já existia (idx_contacts_org_name_trgm).
-- Com os três, a busca do Inbox (conversations/_handler.ts) vira BitmapOr dos três índices
-- em vez de ler todos os contatos da empresa.
create index if not exists idx_contacts_display_name_trgm
  on public.contacts using gin (display_name public.gin_trgm_ops);
create index if not exists idx_contacts_phone_number_trgm
  on public.contacts using gin (phone_number public.gin_trgm_ops);

-- Lista do Inbox: ordena por last_message_at desc nulls last E por id desc (desempate do
-- cursor). O índice antigo (sem o id) obrigava a uma ordenação extra; este entrega a ordem
-- pronta. O antigo (idx_conversations_org_last_msg) passa a ser REDUNDANTE: é prefixo exato
-- deste, com a mesma direção, e cada mensagem grava nos dois. Fica por ora para não misturar
-- duas mudanças; remover numa migration futura (drop index if exists), depois de conferir
-- pg_stat_user_indexes.idx_scan em produção.
create index if not exists idx_conversations_org_last_msg_id
  on public.conversations (organization_id, last_message_at desc nulls last, id desc);

-- Aba Fechadas (vendas-fechadas/route.ts): vendas da empresa das últimas N horas, mais
-- recentes primeiro. Sem ele a tabela inteira era lida e ordenada.
create index if not exists idx_conversa_vendas_org_fechada
  on public.conversa_vendas (organization_id, fechada_em desc);

-- Bolinha laranja "pediu especialista" (conversations/counts/route.ts). O predicado é
-- CÓPIA do da consulta (PREFIXO_DO_PEDIDO_DE_ESPECIALISTA e CONVERSATION_TERMINAL_STATUSES):
-- se um dos dois mudar no código, este índice deixa de ser usado e precisa ser refeito.
-- Atenção: a função pura pedidoDeEspecialistaAberto (lib/treenity-bot/pediu-especialista.ts)
-- também trata 'resolved' como encerrada, e a contagem não. O índice segue a contagem; alinhar
-- uma das duas exige refazer este índice (o teste de invariante reprova se isso for esquecido).
create index if not exists idx_conversations_org_pediu_especialista
  on public.conversations (organization_id)
  where last_handoff_reason like 'O bot chamou o especialista: %'
    and assigned_to_user_id is null
    and status not in ('closed', 'archived');

-- Routing-worker (lib/routing/worker.ts): eventos pendentes de um tipo, mais antigos
-- primeiro, de todas as empresas. Entrega a ordem pronta em vez de juntar dois índices e
-- ordenar.
create index if not exists idx_event_log_pending_type_created
  on public.event_log (event_type, created_at)
  where status = 'pending';
