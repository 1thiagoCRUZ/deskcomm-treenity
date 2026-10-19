-- A venda como registro próprio: o recorte de tempo do atendimento que terminou em venda.
-- Uma conversa é uma só por cliente e as mensagens de várias compras ficam no mesmo fio;
-- aqui fica de que hora a que hora foi ESTA venda, para a aba Fechadas mostrar só a conversa
-- dela, mesmo que o cliente já tenha voltado a escrever. Gravada pelo botão Fechar (service
-- role); lida por quem enxerga a conversa.
create table if not exists public.conversa_vendas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  iniciada_em     timestamptz not null,
  fechada_em      timestamptz not null default now(),
  valor           numeric(14,2),
  fechada_por     uuid references auth.users(id) on delete set null,
  constraint conversa_vendas_periodo_check check (fechada_em >= iniciada_em)
);

create index if not exists conversa_vendas_conversa_idx
  on public.conversa_vendas (conversation_id, fechada_em desc);

alter table public.conversa_vendas enable row level security;

drop policy if exists "conversa_vendas_select" on public.conversa_vendas;
create policy "conversa_vendas_select" on public.conversa_vendas
  for select using (
    organization_id in (select public.fn_user_org_ids())
    and exists (
      select 1 from public.conversations c
       where c.id = conversa_vendas.conversation_id
         and c.organization_id = conversa_vendas.organization_id
    )
  );

-- Vendas que já tinham sido fechadas antes desta tabela: o começo é o da conversa, que é o
-- melhor que se sabe (a data de início do atendimento não foi guardada).
insert into public.conversa_vendas (organization_id, conversation_id, iniciada_em, fechada_em)
select c.organization_id, c.id, least(c.created_at, c.venda_fechada_em), c.venda_fechada_em
  from public.conversations c
 where c.venda_fechada_em is not null
   and not exists (select 1 from public.conversa_vendas v where v.conversation_id = c.id);
