---
impacto: exige_acao
secao: corrigido
titulo: O aviso "O bot pediu um especialista" da venda anterior não reaparece quando o cliente volta
---

Ao encerrar a conversa, o pedido de especialista que o bot tinha feito acaba junto. Antes, quando o
cliente escrevia de novo, a conversa reabria e o aviso da venda que já tinha sido fechada voltava
como se fosse novo.

## Requer atenção

Aplicar a migration `0242_fechar_limpa_pedido_de_especialista.sql` no Supabase de produção.
