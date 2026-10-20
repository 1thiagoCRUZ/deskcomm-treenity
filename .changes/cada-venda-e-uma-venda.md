---
impacto: exige_acao
secao: alterado
titulo: Cada venda é uma venda: Fechadas lista uma linha por venda, e o selo vira "Já é nosso cliente"
---

A aba Fechadas passa a listar as vendas das últimas 24 horas, uma linha por venda. O cliente que
comprou duas vezes tem duas linhas, e cada uma abre o atendimento e o painel de venda dela, sem que a
compra nova esconda a antiga. O selo "Já comprou" passa a se chamar "Já é nosso cliente".

## Requer atenção

Aplicar a migration `0244_conversa_vendas_id_no_bot.sql` no Supabase de produção. As vendas fechadas
antes dela continuam abrindo a conversa, mas o painel de venda mostra a mais recente do cliente.
