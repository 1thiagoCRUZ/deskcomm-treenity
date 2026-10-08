-- 0237 — Dados de nota, segunda parte (08/10).
--
-- 1. `transportadora_preferida`: na compra seguinte o bot oferece a MESMA
--    transportadora, com o frete RECALCULADO (o valor depende do peso e da
--    quantidade de cada pedido, então só a escolha é reaproveitada).
--
-- 2. `fn_mascarar_cpf_nas_conversas`: o CPF que o cliente digita no WhatsApp
--    ficava em TEXTO PURO na conversa guardada, mesmo com o quadro do contato
--    cifrado. Depois que o CPF é gravado nos dados de nota, esta função troca
--    toda ocorrência dele por `***.***.***-NN`:
--      - no Inbox: `messages.body` e `conversations.last_message_preview` das
--        conversas DESTE contato, nesta organização;
--      - nas tabelas do bot de atendimento, QUANDO EXISTEM (`mensagens.conteudo`
--        e `n8n_chat_histories.message`) — numa instalação sem o bot elas não
--        existem e a função só pula. Elas não têm organização: a busca é pelo
--        próprio CPF, que identifica a pessoa.
--    Aceita o número com ou sem pontos, traço ou espaço, e nunca casa no meio
--    de um número maior. Devolve quantas linhas mudou em cada lugar.
--    `security definer` só para o service_role: as duas origens de EXECUTE
--    (PUBLIC e o default privilege de anon) são revogadas.

alter table public.contato_dados_de_nota
  add column if not exists transportadora_preferida text;

create or replace function public.fn_mascarar_cpf_nas_conversas(
  p_organization_id uuid,
  p_contact_id uuid,
  p_cpf text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  sep text := '[.[:space:]/-]?';
  padrao text;
  mascara text;
  n_inbox int := 0;
  n_previa int := 0;
  n_bot int := 0;
  n_memoria int := 0;
begin
  if length(d) <> 11 then
    return jsonb_build_object('erro', 'cpf_invalido');
  end if;
  padrao := '(?<![0-9])' || substr(d, 1, 3) || sep || substr(d, 4, 3) || sep
            || substr(d, 7, 3) || sep || substr(d, 10, 2) || '(?![0-9])';
  mascara := '***.***.***-' || substr(d, 10, 2);

  update public.messages m
     set body = regexp_replace(m.body, padrao, mascara, 'g')
   where m.organization_id = p_organization_id
     and m.conversation_id in (
       select c.id from public.conversations c
        where c.organization_id = p_organization_id and c.contact_id = p_contact_id)
     and m.body ~ padrao;
  get diagnostics n_inbox = row_count;

  update public.conversations c
     set last_message_preview = regexp_replace(c.last_message_preview, padrao, mascara, 'g')
   where c.organization_id = p_organization_id
     and c.contact_id = p_contact_id
     and c.last_message_preview ~ padrao;
  get diagnostics n_previa = row_count;

  if to_regclass('public.mensagens') is not null then
    execute 'update public.mensagens set conteudo = regexp_replace(conteudo, $1, $2, ''g'') where conteudo ~ $1'
      using padrao, mascara;
    get diagnostics n_bot = row_count;
  end if;

  if to_regclass('public.n8n_chat_histories') is not null then
    execute 'update public.n8n_chat_histories set message = regexp_replace(message::text, $1, $2, ''g'')::jsonb where message::text ~ $1'
      using padrao, mascara;
    get diagnostics n_memoria = row_count;
  end if;

  return jsonb_build_object(
    'inbox', n_inbox, 'previa', n_previa, 'bot', n_bot, 'memoria_do_bot', n_memoria);
end;
$$;

revoke execute on function public.fn_mascarar_cpf_nas_conversas(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_mascarar_cpf_nas_conversas(uuid, uuid, text) to service_role;
