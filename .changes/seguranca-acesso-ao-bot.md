---
impacto: exige_acao
secao: alterado
titulo: O acesso ao Treenity Bot passa a exigir que a empresa tenha o bot ligado
---

Antes, qualquer pessoa logada recebia acesso ao Treenity Bot, mesmo de uma empresa que não usa o
bot. Agora as telas de vendas e atendimento exigem o papel de Dono, e o Chat da equipe exige
Funcionário ou Dono. Nos dois casos a empresa precisa ter o bot ligado.

## Requer atenção

Conferir que a empresa já tem `organizations.settings.treenity_bot.whatsapp.ativo = true`. Sem isso,
o Chat da equipe e a tela do Treenity Bot deixam de funcionar para ela.
