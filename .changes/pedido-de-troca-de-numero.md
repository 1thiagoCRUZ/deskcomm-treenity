---
impacto: exige_acao
secao: adicionado
titulo: O Dono pede a troca de número pela tela, e a Gestão atende, remove o número e vê o pedido no painel
---

Em Conexões, o Dono ganha o botão "Trocar ou adicionar número": informa o número novo e acompanha o
andamento do pedido. A Gestão Treenity vê o pedido no topo de Conexões (com o passo a passo e os
botões "Marcar como atendido" e "Cancelar pedido") e no painel da plataforma. Volta também o botão
"Remover este número" (só Gestão): arquiva o canal da Meta, apaga a credencial guardada e troca o
código do webhook, preservando o histórico de conversas. Os campos da credencial deixam de ser
preenchidos pelo navegador com e-mail ou senha salvos.

## Requer atenção

Aplicar a migration `0240_pedidos_a_gestao.sql` no Supabase de produção. Sem ela, o botão do Dono
retorna erro ao enviar o pedido.
