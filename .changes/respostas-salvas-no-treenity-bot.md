---
impacto: capacidade_nova
secao: adicionado
titulo: Respostas rápidas guardadas no Treenity Bot, um cadastro para a equipe e o bot
---

Com Integrações › Treenity Bot › "Guardar as respostas rápidas no bot" ligado, a tela de Respostas rápidas e o `/` do Inbox passam a ler e gravar direto na tabela do Treenity Bot. É um cadastro só: a equipe cola o texto pelo `/`, e, quando a resposta tem gatilhos, o bot manda o texto sozinho, na hora e sem consumir IA. O deskcomm não guarda cópia, então não existe resposta salva aqui que não chegou ao bot.

Ligado, toda resposta é da loja: não há resposta pessoal, e só manager+ cria, edita ou apaga. As respostas que já existiam em `message_templates` deixam de aparecer na tela (continuam no banco e voltam se o interruptor for desligado). Os follow-ups continuam escolhendo modelos de `message_templates`.

Exige a versão da API do bot com a coluna `atalho` em `respostas_rapidas` (migrations 0009 e 0010 de lá). As colunas `bot_synced_at` e `bot_sync_error` da migration 0235 ficam sem uso.
