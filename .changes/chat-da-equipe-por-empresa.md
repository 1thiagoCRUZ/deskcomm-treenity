---
impacto: exige_acao
secao: corrigido
titulo: O Chat da equipe só mostra pessoas da própria empresa
---

Antes, a lista "Pessoas" do Chat da equipe mostrava todos os usuários do bot, de todas as empresas.
Agora cada pessoa vê, e só consegue conversar com, quem é da mesma empresa. A Gestão, quando entra
numa empresa para dar suporte, não aparece na lista do cliente.

## Requer atenção

Aplicar a migration `0013_usuarios_organizacao.sql` no banco da API do bot e publicar a API do bot
(PR 9 do `api-treenity-bot`) antes de publicar este painel. Cada pessoa só reaparece na lista
depois de abrir o Chat da equipe uma vez.
