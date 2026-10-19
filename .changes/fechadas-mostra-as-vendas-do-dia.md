---
impacto: exige_acao
secao: alterado
titulo: A aba Fechadas mostra as vendas das últimas 24 horas, e o cliente que volta já é atendido pelo bot
---

Fechadas passa a listar só as conversas em que o botão Fechar registrou uma venda nas últimas 24
horas. O encerramento sem venda não entra. Se o cliente escrever de novo, a conversa volta para o
atendimento normal (o bot responde em Automático) e a venda de hoje continua em Fechadas. Depois de
24 horas ela sai da aba, sem acumular. As conversas de quem já comprou ganham o selo "Já comprou".

## Requer atenção

Aplicar a migration `0241_venda_fechada_em.sql` no Supabase de produção antes de publicar. Sem ela,
a lista de conversas deixa de carregar. As conversas que já estavam fechadas há mais de 24 horas
deixam de aparecer em Fechadas.
