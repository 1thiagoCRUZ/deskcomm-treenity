-- "Lembrar" do Inbox, parte "Janela aberta" (pedido do Rodrigo, 27/10/2026): a pessoa escreve
-- uma mensagem e marca o horário; o servidor manda sozinho ao cliente.
--
-- Só dentro da janela de 24 horas: texto livre é grátis enquanto o cliente escreveu nas últimas
-- 24 h, e fora disso a plataforma só aceita modelo pago. A rota recusa horário depois do fim da
-- janela, e o envio confere de novo na hora (lib/inbox/mensagens-agendadas.ts):
--   - cliente respondeu depois do agendamento -> não manda (status 'nao_enviada', motivo
--     'cliente_respondeu') e avisa quem marcou;
--   - janela fechou -> não manda (motivo 'janela_fechada') e avisa quem marcou.
--
-- Uma agendada por conversa (índice parcial): a tela mostra e cancela UMA.
-- 'enviando' é o claim atômico do envio: dois ticks (cron da instalação e n8n) nunca mandam
-- a mesma mensagem duas vezes.

create table if not exists public.mensagens_agendadas (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  criado_por_user_id  uuid references auth.users(id) on delete set null,
  body                text not null,
  enviar_em           timestamptz not null,
  status              text not null default 'agendada',
  motivo              text,
  message_id          uuid references public.messages(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint mensagens_agendadas_status_check
    check (status in ('agendada', 'enviando', 'enviada', 'cancelada', 'nao_enviada')),
  constraint mensagens_agendadas_body_tamanho check (length(btrim(body)) between 1 and 4096)
);

create unique index if not exists mensagens_agendadas_uma_por_conversa_uidx
  on public.mensagens_agendadas (conversation_id) where status = 'agendada';
create index if not exists mensagens_agendadas_vencendo_idx
  on public.mensagens_agendadas (organization_id, enviar_em) where status = 'agendada';

drop trigger if exists trg_mensagens_agendadas_updated_at on public.mensagens_agendadas;
create trigger trg_mensagens_agendadas_updated_at
  before update on public.mensagens_agendadas
  for each row execute function public.fn_set_updated_at();

-- ---- RLS: membros da empresa agendam, veem e cancelam; o envio é do servidor ----
alter table public.mensagens_agendadas enable row level security;

drop policy if exists "tenant_isolation_mensagens_agendadas_all" on public.mensagens_agendadas;
create policy "tenant_isolation_mensagens_agendadas_all" on public.mensagens_agendadas
  for all
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

revoke all on public.mensagens_agendadas from anon;
revoke truncate, references, trigger on public.mensagens_agendadas from authenticated;
grant select, insert, update on public.mensagens_agendadas to authenticated;
grant all on public.mensagens_agendadas to service_role;
