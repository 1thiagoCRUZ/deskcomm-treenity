-- O pedido "O bot chamou o especialista" pertence ao atendimento em que foi feito.
-- Ao encerrar a conversa o pedido acaba; sem isto, o cliente que volta a escrever
-- reabre a conversa e o aviso da venda anterior reaparece como se fosse novo.
create or replace function public.fn_limpa_pedido_ao_encerrar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('closed','resolved','archived')
     and old.status is distinct from new.status
     and new.last_handoff_reason like 'O bot chamou o especialista: %' then
    new.last_handoff_reason := null;
  end if;
  return new;
end; $$;
revoke execute on function public.fn_limpa_pedido_ao_encerrar() from public, anon, authenticated;

drop trigger if exists trg_limpa_pedido_ao_encerrar on public.conversations;
create trigger trg_limpa_pedido_ao_encerrar
  before update of status on public.conversations
  for each row execute function public.fn_limpa_pedido_ao_encerrar();

-- Conversas que já tinham fechado venda e reabriram com o aviso velho.
update public.conversations set last_handoff_reason = null
 where last_handoff_reason like 'O bot chamou o especialista: %'
   and venda_fechada_em is not null
   and (last_handoff_at is null or last_handoff_at <= venda_fechada_em);
