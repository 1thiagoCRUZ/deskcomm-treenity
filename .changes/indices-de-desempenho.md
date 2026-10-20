---
impacto: exige_acao
secao: alterado
titulo: Busca de contatos, lista do Inbox, aba Fechadas e contadores ficam mais rápidos em bases grandes
---

Seis índices novos no banco para as consultas que o painel faz o tempo todo: a busca de contato
pelo nome que aparece na tela e pelo telefone, a lista de conversas do Inbox, a aba Fechadas, a
bolinha "pediu especialista" e a fila do distribuidor de conversas. Nada muda no que cada pessoa
vê; só a velocidade.

## Requer atenção

Recomendado aplicar a migration `0245_indices_de_desempenho.sql` no Supabase. Se não for aplicada,
nada quebra: o painel continua funcionando como antes, só sem o ganho de velocidade. Criar um
índice segura as gravações da tabela por alguns instantes; em base grande, aplique fora do
horário de movimento.
