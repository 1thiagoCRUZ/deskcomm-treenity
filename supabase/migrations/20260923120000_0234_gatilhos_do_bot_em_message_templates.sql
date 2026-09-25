-- 0234 — gatilhos do bot em message_templates.
--
-- POR QUE AQUI, E NÃO NUMA TABELA NOVA: `message_templates` já é "o que a loja
-- fala". Hoje só o atendente usa, digitando `/` no composer. Uma resposta que o
-- bot manda sozinho é a MESMA frase, com um critério a mais de quando usar —
-- não outra entidade. Duas tabelas dariam duas telas, e o cliente nunca
-- entenderia por que a mesma frase precisa ser cadastrada duas vezes.
--
-- Um template sem gatilho continua exatamente o que era: atalho de digitação.
-- Com gatilho, o bot passa a responder sozinho, sem consumir IA.
--
-- Estas colunas são lidas pelo bot (n8n), que sincroniza por
-- `GET /api/v1/message-templates` com um token de `api_tokens`. Por isso os
-- gatilhos são guardados JÁ NORMALIZADOS (minúsculo, sem acento, sem
-- pontuação): a comparação do lado do bot usa a mesma normalização, e um
-- gatilho gravado "Bom dia!" nunca casaria com o que chega.

alter table public.message_templates
  add column if not exists bot_triggers  text[]      not null default '{}'::text[],
  add column if not exists bot_context   text        not null default 'any',
  add column if not exists bot_max_chars integer     not null default 60,
  add column if not exists bot_enabled   boolean     not null default false,
  add column if not exists usage_count   integer     not null default 0,
  add column if not exists last_used_at  timestamptz;

comment on column public.message_templates.bot_triggers is
  'Frases que o cliente escreve, já normalizadas (minúsculo, sem acento). Vazio = só o atendente usa.';
comment on column public.message_templates.bot_context is
  'any = pode disparar a qualquer momento; opening = só na primeira mensagem do atendimento.';
comment on column public.message_templates.bot_max_chars is
  'Teto de tamanho da mensagem do cliente. Impede que uma pergunta de verdade caia num texto pronto.';
comment on column public.message_templates.usage_count is
  'Quantas vezes esta resposta foi usada (bot ou atendente). Sem isto o cliente não sabe qual vale a pena.';

-- `opening` e `any` são os dois únicos estados que o bot sabe avaliar; qualquer
-- outro valor faria o casamento cair em silêncio, respondendo sempre ou nunca.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'message_templates_bot_context_check'
  ) then
    alter table public.message_templates
      add constraint message_templates_bot_context_check
      check (bot_context in ('any', 'opening'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'message_templates_bot_max_chars_check'
  ) then
    alter table public.message_templates
      add constraint message_templates_bot_max_chars_check
      check (bot_max_chars between 10 and 400);
  end if;

  -- Ligado sem gatilho nenhum não é um estado: seria uma resposta "automática"
  -- que nunca dispara, e o cliente passaria a tarde procurando o defeito.
  if not exists (
    select 1 from pg_constraint where conname = 'message_templates_bot_enabled_precisa_gatilho'
  ) then
    alter table public.message_templates
      add constraint message_templates_bot_enabled_precisa_gatilho
      check (not bot_enabled or coalesce(array_length(bot_triggers, 1), 0) >= 1);
  end if;
end $$;

-- O bot busca por gatilho em toda mensagem que chega: é o caminho quente.
create index if not exists message_templates_bot_triggers_gin
  on public.message_templates using gin (bot_triggers)
  where bot_enabled;
