-- 0233 — tarefas criadas por integração (hoje: "Conferir pagamento PIX" do Treenity Bot).
--
-- `external_ref` identifica de onde a tarefa veio (`treenity:venda:<id da venda>`).
-- O índice único parcial é o que torna a criação idempotente: o sincronizador roda
-- de vários lugares (cron, navegador do admin) e duas execuções simultâneas nunca
-- geram duas tarefas para a mesma venda. Tarefas manuais têm `external_ref` nulo e
-- não são afetadas.

alter table public.crm_tasks add column if not exists external_ref text;

create unique index if not exists crm_tasks_org_external_ref_uidx
  on public.crm_tasks (organization_id, external_ref)
  where external_ref is not null;
