-- 0235 — estado do espelho das respostas salvas no Treenity Bot.
--
-- A 0234 previa o bot (n8n) buscando os gatilhos por `GET /api/v1/message-templates`
-- num cron. Esse caminho foi substituído: agora, a cada salvamento, o servidor
-- do deskcomm manda a resposta para a API do bot
-- (`PUT /api/respostas-rapidas/origem/:id`), e o bot usa já na mensagem
-- seguinte — sem cron e sem atraso (`lib/treenity-bot/respostas-salvas.ts`).
--
-- O envio é uma chamada de rede para outro servidor e pode falhar. Sem guardar
-- o resultado, a tela diria "salvo" e o bot seguiria com o texto antigo, e
-- ninguém entenderia por quê. As duas colunas são o laço de retorno:
--
--   bot_synced_at   último envio confirmado. NULL = esta resposta não está no
--                   bot (nunca foi, ou foi tirada). É também o que evita chamar
--                   a API do bot ao salvar uma resposta que nunca teve gatilho.
--   bot_sync_error  por que o último envio falhou. NULL = em dia. A lista mostra
--                   o aviso, e salvar de novo reenvia (o envio é idempotente).

alter table public.message_templates
  add column if not exists bot_synced_at  timestamptz,
  add column if not exists bot_sync_error text;

comment on column public.message_templates.bot_synced_at is
  'Último envio confirmado ao Treenity Bot. NULL = a resposta não está no bot.';
comment on column public.message_templates.bot_sync_error is
  'Motivo do último envio ao Treenity Bot que falhou. NULL = em dia.';
