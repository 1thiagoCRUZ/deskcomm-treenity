-- 0238 — Nome e e-mail dos dados de nota passam a morar no CONTATO (09/10).
--
-- A tela do contato mostrava dois "Nome" e dois "E-mail" (o do contato e o dos
-- dados de nota). Desde esta versão a aplicação grava nome e e-mail em
-- `contacts` (ver lib/contacts/dados-de-nota.ts). Esta migration move o que JÁ
-- foi gravado em `contato_dados_de_nota`:
--   * nome: vai para `contacts.name` (o que o cliente informou para a nota é o
--     dado mais recente e explícito) e sai da reserva;
--   * e-mail: vai para `contacts.email` só se nenhum OUTRO contato da mesma
--     empresa já usa esse e-mail (índice único `uniq_contacts_org_email`); se
--     usa, fica na reserva, como a aplicação faz.
-- Idempotente: rodar de novo não acha mais o que mover.

update public.contacts c
   set name = n.nome
  from public.contato_dados_de_nota n
 where n.contact_id = c.id
   and n.organization_id = c.organization_id
   and n.nome is not null;

update public.contato_dados_de_nota n
   set nome = null
  from public.contacts c
 where c.id = n.contact_id
   and c.organization_id = n.organization_id
   and n.nome is not null
   and c.name = n.nome;

update public.contacts c
   set email = n.email
  from public.contato_dados_de_nota n
 where n.contact_id = c.id
   and n.organization_id = c.organization_id
   and n.email is not null
   and not exists (
     select 1 from public.contacts o
      where o.organization_id = c.organization_id
        and o.id <> c.id
        and o.is_merged_into is null
        and o.email_normalized = lower(trim(n.email)));

update public.contato_dados_de_nota n
   set email = null
  from public.contacts c
 where c.id = n.contact_id
   and c.organization_id = n.organization_id
   and n.email is not null
   and c.email_normalized = lower(trim(n.email));
