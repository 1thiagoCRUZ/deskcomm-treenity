-- Quando a conversa teve uma VENDA fechada pelo botão "Fechar" do Inbox.
-- É o que alimenta a aba Fechadas (vendas das últimas 24h) e o selo "Já comprou".
-- Separado do `status`: o cliente que escreve de novo reabre a conversa
-- (status open, o bot volta a atender), mas a venda continua registrada aqui.
alter table public.conversations add column if not exists venda_fechada_em timestamptz;

-- Quem fechou nas últimas 24h antes desta coluna existir continua em Fechadas
-- até a janela vencer (não dá para saber se foi venda; é só uma ponte de 24h).
update public.conversations set venda_fechada_em = status_changed_at
 where status = 'closed' and venda_fechada_em is null
   and status_changed_at > now() - interval '24 hours';

create index if not exists conversations_venda_fechada_idx
  on public.conversations (organization_id, venda_fechada_em desc)
  where venda_fechada_em is not null;
