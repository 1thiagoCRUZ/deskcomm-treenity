---
impacto: exige_acao
secao: alterado
titulo: Em Fechadas se abre a venda, com só a conversa daquele atendimento
---

Ao abrir um item da aba Fechadas, o Inbox mostra apenas o atendimento que terminou naquela venda,
do começo ao fechamento, em modo somente leitura e com o valor e a data. As mensagens que o cliente
mandar depois ficam na conversa atual, e o botão "Abrir conversa atual" leva até ela. Cada venda
fechada pelo botão Fechar guarda o seu recorte de tempo.

## Requer atenção

Aplicar a migration `0243_conversa_vendas.sql` no Supabase de produção antes de publicar. As vendas
que já estavam em Fechadas passam a mostrar a conversa desde o início até o fechamento.
