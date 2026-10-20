-- Liga cada venda registrada no Inbox à venda correspondente no Treenity Bot. Sem esse elo
-- o painel só sabia mostrar "a venda mais recente do cliente", e a compra nova escondia a
-- antiga. Nula nas vendas anteriores a esta coluna (o painel cai na mais recente).
alter table public.conversa_vendas add column if not exists venda_bot_id text;
