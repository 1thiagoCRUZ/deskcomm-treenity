-- 0240 — Pedidos do cliente à Gestão Treenity (hoje: trocar ou adicionar número de WhatsApp).
--
-- O Dono não configura a Meta (credencial, webhook, verificação do número): isso é da Gestão.
-- Mas ele precisa de um caminho para PEDIR — por exemplo, quando troca de número. O pedido fica
-- numa tabela própria, e não na Central de avisos, porque a Central limita os tipos por constraint
-- e é por organização; aqui a Gestão precisa enxergar os abertos de TODAS as empresas.
--
-- Quem pode o quê:
--   ler    — qualquer `agent`+ da organização (acompanha o que foi pedido) e a Gestão;
--   criar  — só o `admin` da organização (o Dono), sempre em nome dele (`criado_por = auth.uid()`);
--   mudar  — só a Gestão (platform admin): marca como atendido ou cancelado.
--
-- Idempotente.

create table if not exists public.pedidos_a_gestao (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  tipo             text not null,
  detalhe          jsonb not null default '{}'::jsonb,
  status           text not null default 'aberto',
  criado_por       uuid references auth.users(id) on delete set null,
  criado_em        timestamptz not null default now(),
  resolvido_por    uuid references auth.users(id) on delete set null,
  resolvido_em     timestamptz,
  constraint pedidos_a_gestao_tipo_check check (tipo in ('trocar_numero')),
  constraint pedidos_a_gestao_status_check check (status in ('aberto', 'atendido', 'cancelado'))
);

create index if not exists pedidos_a_gestao_org_idx
  on public.pedidos_a_gestao (organization_id, criado_em desc);
create index if not exists pedidos_a_gestao_abertos_idx
  on public.pedidos_a_gestao (criado_em desc) where status = 'aberto';

alter table public.pedidos_a_gestao enable row level security;

drop policy if exists "pedidos_a_gestao_select" on public.pedidos_a_gestao;
create policy "pedidos_a_gestao_select" on public.pedidos_a_gestao
  for select using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent'))
  );

drop policy if exists "pedidos_a_gestao_insert" on public.pedidos_a_gestao;
create policy "pedidos_a_gestao_insert" on public.pedidos_a_gestao
  for insert with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
    and criado_por = auth.uid()
    and status = 'aberto'
  );

drop policy if exists "pedidos_a_gestao_update" on public.pedidos_a_gestao;
create policy "pedidos_a_gestao_update" on public.pedidos_a_gestao
  for update using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());
