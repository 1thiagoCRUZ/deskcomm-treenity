-- ---- identidade do canal só pelo servidor (migration 0247) ----
-- O PostgREST é exposto ao navegador e `authenticated` tem GRANT ALL em
-- channel_sessions. A policy channel_sessions_tenant_write (0150) deixa o admin
-- da empresa (Dono) inserir e alterar as linhas da PRÓPRIA empresa. Com o próprio
-- JWT, então, um Dono gravava em meta_phone_number_id o número de OUTRA empresa
-- (se o canal dela estivesse arquivado ou ainda não cadastrado). Como o catálogo
-- do bot (0246, catalogo_org_por_numero) e o roteamento resolvem a empresa por
-- esse número, isso virava vazamento entre empresas.
--
-- Quem grava a identidade do canal hoje, e por qual papel do banco:
--   - POST /api/v1/channels/official: service role (valida na Meta antes).
--   - fn_reserve_channel_connection / fn_finish_channel_connection: SECURITY
--     DEFINER (rodam como o dono da função, postgres).
--   - cron channel-health, webhooks, scripts e seeds: service role ou postgres.
--   - DELETE /api/v1/channel-sessions/[id] (arquivar, só a Gestão): cliente do
--     USUÁRIO (authenticated) com fn_is_platform_admin() = true. Grava
--     archived_at, status, meta_token_encrypted e webhook_path_token.
--
-- Regra: quando quem executa é `authenticated` ou `anon` (current_user, que dentro
-- de uma função SECURITY DEFINER é o dono dela, não o usuário):
--   - INSERT é recusado sempre (nenhum caminho legítimo insere pelo navegador);
--   - UPDATE que MUDA uma coluna de identidade é recusado, salvo Gestão
--     (fn_is_platform_admin), que arquiva pelo cliente do usuário.
-- Colunas de identidade: id, organization_id, provider, meta_phone_number_id,
-- meta_waba_id, meta_token_encrypted, zernio_account_id, zernio_token_encrypted,
-- waha_session_name, webhook_path_token, webhook_secret_encrypted, phone_number e
-- archived_at (desarquivar pelo navegador devolveria um número antigo ao catálogo).
-- O resto (display_name, status, metadata, limites) continua com a policy da 0150.
--
-- Trigger e não GRANT por coluna: o GRANT não distingue a Gestão do Dono (os dois
-- são `authenticated`), e um GRANT ALL futuro desfaria a proteção em silêncio.

create or replace function public.fn_channel_sessions_identidade_so_servidor()
  returns trigger
  language plpgsql
  security invoker
  set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'canal só pode ser criado pelo servidor'
      using errcode = '42501',
            hint = 'Conecte o número pela tela de Conexões.';
  end if;

  if public.fn_is_platform_admin() then
    return new;
  end if;

  if new.id                       is distinct from old.id
  or new.organization_id          is distinct from old.organization_id
  or new.provider                 is distinct from old.provider
  or new.meta_phone_number_id     is distinct from old.meta_phone_number_id
  or new.meta_waba_id             is distinct from old.meta_waba_id
  or new.meta_token_encrypted     is distinct from old.meta_token_encrypted
  or new.zernio_account_id        is distinct from old.zernio_account_id
  or new.zernio_token_encrypted   is distinct from old.zernio_token_encrypted
  or new.waha_session_name        is distinct from old.waha_session_name
  or new.webhook_path_token       is distinct from old.webhook_path_token
  or new.webhook_secret_encrypted is distinct from old.webhook_secret_encrypted
  or new.phone_number             is distinct from old.phone_number
  or new.archived_at              is distinct from old.archived_at
  then
    raise exception 'número e identidade do canal só podem ser alterados pelo servidor'
      using errcode = '42501',
            hint = 'Reconecte o número pela tela de Conexões.';
  end if;

  return new;
end
$$;

drop trigger if exists trg_channel_sessions_identidade_so_servidor on public.channel_sessions;
create trigger trg_channel_sessions_identidade_so_servidor
  before insert or update on public.channel_sessions
  for each row execute function public.fn_channel_sessions_identidade_so_servidor();

revoke execute on function public.fn_channel_sessions_identidade_so_servidor() from public, anon, authenticated;
grant execute on function public.fn_channel_sessions_identidade_so_servidor() to service_role;
