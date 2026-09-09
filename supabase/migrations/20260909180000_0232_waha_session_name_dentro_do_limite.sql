-- 0232 — waha_session_name dentro do limite do WAHA (54 caracteres).
--
-- `fn_reserve_channel_connection` (0228/0230) gerava o nome da sessão como
-- 'org_' || org_uuid_sem_hifen (32) || '_' || uuid_aleatorio_sem_hifen (32) —
-- 69 caracteres. O WAHA valida `name` com `@MaxLength(54)` no
-- `POST /api/sessions` e recusa com 400 ("name must be shorter than or equal
-- to 54 characters"), then `waha.createSession` sobe `WahaSessionError` e
-- `connectWahaChannel` marca o canal FAILED. Toda instalação nova (onboarding
-- do primeiro WhatsApp) batia nisso 100% das vezes — medido numa instalação
-- self-host fresca (0 mensagens, 1º canal).
--
-- Fix: encurta para 'org_' + 12 hex do org + '_' + 16 hex aleatórios = 33
-- caracteres, bem abaixo do limite. Unicidade prática preservada (64 bits de
-- aleatoriedade no sufixo); o prefixo do org deixa de ser injetivo sozinho,
-- mas quem desambigua duas sessões do mesmo org é o sufixo aleatório, como já
-- era antes. Só a expressão do INSERT muda — reserva/replay/lease/idempotência
-- e a busca da sessão de onboarding (linha do `left(p_org::text,8)`, que já
-- era curta) continuam como na 0230.
create or replace function public.fn_reserve_channel_connection(p_org uuid,p_key uuid,p_hash text,p_display_name text default null,p_onboarding boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare receipt public.channel_connection_requests; channel public.channel_sessions; token uuid:=gen_random_uuid();
begin
 if auth.uid() is null or not public.fn_role_at_least(p_org,'admin') or not public.fn_support_write_allowed(p_org)
 then raise exception 'connection_forbidden' using errcode='42501';end if;
 if not public.fn_session_mfa_proven() then raise exception 'connection_mfa_required' using errcode='42501';end if;
 if p_key is null or p_hash is null or length(p_hash)<>64 or length(coalesce(p_display_name,''))>100 then
  raise exception 'connection_invalid_request' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,2281));
 delete from public.channel_connection_requests where organization_id=p_org and idempotency_key=p_key
  and state='succeeded' and updated_at<now()-interval '24 hours';
 select * into receipt from public.channel_connection_requests where organization_id=p_org and idempotency_key=p_key for update;
 if found then
  if receipt.request_hash<>p_hash then raise exception 'idempotency_conflict' using errcode='22023';end if;
  if receipt.state='succeeded' then
   select * into channel from public.channel_sessions where organization_id=p_org and id=receipt.channel_session_id;
   return jsonb_build_object('replay',true,'channel',to_jsonb(channel),'receipt_id',receipt.id);
  end if;
  if receipt.state='processing' and receipt.lease_until>now() then
   raise exception 'connection_in_progress' using errcode='55P03';end if;
  select * into channel from public.channel_sessions where organization_id=p_org and id=receipt.channel_session_id for update;
  if not found then raise exception 'connection_reservation_missing' using errcode='P0002';end if;
 else
  if p_onboarding then
   select * into channel from public.channel_sessions where organization_id=p_org and provider='waha'
    and (metadata->>'onboarding'='true' or waha_session_name='org_'||left(p_org::text,8))
    order by created_at limit 1 for update;
  end if;
  if channel.id is null then
   insert into public.channel_sessions(organization_id,waha_session_name,display_name,engine,webhook_path_token,
     webhook_secret_encrypted,status,last_status_change_at,consecutive_health_fails,daily_message_limit,metadata)
   values(p_org,'org_'||substr(replace(p_org::text,'-',''),1,12)||'_'||substr(replace(gen_random_uuid()::text,'-',''),1,16),p_display_name,'NOWEB',
     replace(gen_random_uuid()::text,'-',''),'\x00'::bytea,'STARTING',now(),0,250,
     '{"ai_gate":"allowlist","ai_gate_mode":"pre_go_live","ai_test_phone_numbers":[]}'::jsonb
     || case when p_onboarding then '{"onboarding":true}'::jsonb else '{}'::jsonb end) returning * into channel;
  end if;
  if exists(select 1 from public.channel_connection_requests where organization_id=p_org and channel_session_id=channel.id
    and (state='processing' and lease_until>now())) then raise exception 'connection_in_progress' using errcode='55P03';end if;
  insert into public.channel_connection_requests(organization_id,idempotency_key,request_hash,channel_session_id)
   values(p_org,p_key,p_hash,channel.id) returning * into receipt;
 end if;
 if exists(select 1 from public.channel_connection_requests where organization_id=p_org and channel_session_id=channel.id
   and id<>receipt.id and (state='processing' and lease_until>now())) then raise exception 'connection_in_progress' using errcode='55P03';end if;
 update public.channel_connection_requests set state='processing',lease_token=token,lease_until=now()+interval '5 minutes',
  remote_created=false,updated_at=now() where organization_id=p_org and id=receipt.id;
 -- Não ressuscita antes da pós-condição remota. Arquivado permanece invisível
 -- até finish; falha conserva identidade e estado FAILED para reparo.
 update public.channel_sessions set status='STARTING',status_reason='connection_pending',last_status_change_at=now()
  where organization_id=p_org and id=channel.id returning * into channel;
 return jsonb_build_object('replay',false,'channel',to_jsonb(channel),'receipt_id',receipt.id,'lease_token',token);
end;
$$;
revoke all on function public.fn_reserve_channel_connection(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.fn_reserve_channel_connection(uuid,uuid,text,text,boolean) to authenticated;

-- Auto-cura de instalações já quebradas por este bug: sessão WAHA de
-- onboarding que nunca chegou a existir do lado do WAHA (o POST 400 morre
-- ANTES do createSession confirmar) fica presa em public.channel_sessions com
-- nome >54 chars e sem contraparte remota — nada para desconectar, nada para
-- perder. Sem isto, o clone que já bateu no bug herda a sessão travada e o
-- onboarding não tenta de novo (a query do trecho `if p_onboarding` acha essa
-- linha por metadata->>'onboarding' e reusa o nome quebrado).
delete from public.channel_connection_requests
 where channel_session_id in (
   select id from public.channel_sessions
    where provider='waha' and length(waha_session_name)>54 and status in ('STOPPED','FAILED')
 );
delete from public.channel_sessions
 where provider='waha' and length(waha_session_name)>54 and status in ('STOPPED','FAILED');
