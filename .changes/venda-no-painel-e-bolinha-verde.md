---
impacto: capacidade_nova
secao: adicionado
titulo: Painel da conversa mostra a venda (valor, frete, pagamento, quem fechou) e Fechadas ganha bolinha verde
---

No painel lateral do Inbox, quem é admin passa a ver a venda do cliente da conversa: valor total,
produtos, frete (grátis ou quanto), forma de pagamento, situação e quem fechou — o bot (CADU) ou
a pessoa que usou o "Fechar". Enquanto houver venda que ninguém abriu, a aba **Fechadas** mostra
uma bolinha verde; ao abrir a conversa e ver a venda, ela apaga (e o aviso da Central se resolve).

Exige a versão nova da API do bot (colunas `forma_pagamento` e `fechada_por` em `vendas`,
migration 0012, e filtro `id_face` na lista de vendas).
