-- 0236 — Dados para nota e envio do contato (pedido do Dono da Top Ultra, 02/10).
--
-- O que a loja pede ao cliente no fechamento da venda para emitir a nota e
-- despachar: dados do comprador e, opcionalmente, da propriedade rural que vai
-- na nota. Quem preenche é o bot (no fechamento) ou a equipe (tela de Contatos).
-- Uma linha por contato. O CPF fica CIFRADO pela aplicação (AES-256-GCM com
-- CPF_ENCRYPTION_KEY, ver lib/contacts/dados-de-nota.ts); aqui só o texto
-- cifrado e os 2 últimos dígitos para a máscara.
--
-- "nome" e "email" existem também em contacts, de propósito: são o que vai na
-- NOTA (nome completo, e-mail para o boleto/nota), que nem sempre é o nome do
-- perfil do WhatsApp. Idempotente.

create table if not exists public.contato_dados_de_nota (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  contact_id            uuid not null references public.contacts(id) on delete cascade,
  nome                  text,
  cpf_cifrado           text,
  cpf_final             text,
  telefone              text,
  email                 text,
  cep                   text,
  endereco              text,
  cidade                text,
  estado                text,
  propriedade_nome      text,
  propriedade_cnpj      text,
  propriedade_ie        text,
  propriedade_cep       text,
  propriedade_endereco  text,
  preenchido_por        text not null default 'equipe',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint contato_dados_de_nota_contato_unico unique (organization_id, contact_id),
  constraint contato_dados_de_nota_preenchido_por_check check (preenchido_por in ('bot', 'equipe'))
);

create index if not exists contato_dados_de_nota_contact_idx
  on public.contato_dados_de_nota (contact_id);

alter table public.contato_dados_de_nota enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polname = 'tenant_isolation_contato_dados_de_nota_all'
      and polrelid = 'public.contato_dados_de_nota'::regclass
  ) then
    create policy "tenant_isolation_contato_dados_de_nota_all" on public.contato_dados_de_nota
      using ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin())
      with check ((organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin());
  end if;
end $$;
