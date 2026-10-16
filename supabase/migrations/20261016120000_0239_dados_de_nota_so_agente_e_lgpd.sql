-- 0239 — Dados de nota: só quem atende lê e escreve, e anonimizar o contato apaga a linha.
--
-- Achados de 16/10/2026 (suíte de invariantes, depois que o baseline voltou a instalar):
--
--  1. `contato_dados_de_nota` guarda CPF cifrado, endereço, CEP e dados da propriedade, e nasceu
--     com a policy de isolamento por organização e mais nada: qualquer papel da organização
--     (inclusive `viewer`) lia e gravava direto pelo PostgREST. A rota já exigia `agent`; o banco
--     agora exige o mesmo, que é onde a regra não pode ser contornada.
--
--  2. Anonimizar um contato apagava a linha só pela aplicação (`lib/lgpd/redact-cascade.ts`). Quem
--     anonimiza por outro caminho (a rota direta, um DBA à mão) deixava o CPF vivo. O trigger
--     pendura a limpeza no FATO (`is_anonymized` virou true), como já é feito para as propostas
--     do contato (`fn_apaga_propostas_de_contato_anonimizado`).
--
-- Idempotente.

drop policy if exists "tenant_isolation_contato_dados_de_nota_all" on public.contato_dados_de_nota;
drop policy if exists "contato_dados_de_nota_agente_all" on public.contato_dados_de_nota;

create policy "contato_dados_de_nota_agente_all" on public.contato_dados_de_nota
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent'))
  )
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent'))
  );

create or replace function public.fn_apaga_dados_de_nota_de_contato_anonimizado()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.contato_dados_de_nota where contact_id = new.id;
  return new;
end$$;

revoke all on function public.fn_apaga_dados_de_nota_de_contato_anonimizado() from public;
revoke execute on function public.fn_apaga_dados_de_nota_de_contato_anonimizado() from anon;
revoke execute on function public.fn_apaga_dados_de_nota_de_contato_anonimizado() from authenticated;

drop trigger if exists trg_contacts_anonimizado_limpa_dados_de_nota on public.contacts;
create trigger trg_contacts_anonimizado_limpa_dados_de_nota
  after update of is_anonymized on public.contacts
  for each row
  when (new.is_anonymized = true and coalesce(old.is_anonymized, false) = false)
  execute function public.fn_apaga_dados_de_nota_de_contato_anonimizado();
