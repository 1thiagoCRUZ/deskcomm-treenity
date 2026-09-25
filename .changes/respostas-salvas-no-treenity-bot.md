---
impacto: capacidade_nova
secao: adicionado
titulo: O Treenity Bot responde sozinho com as respostas salvas
---

Uma resposta compartilhada em Respostas rápidas pode ganhar gatilhos: quando a mensagem do cliente contém uma dessas frases, o Treenity Bot manda o texto na hora, sem consumir IA. A mesma resposta continua no `/` do Inbox para a equipe.

Liga-se por organização em Integrações › Treenity Bot › "O bot usa as respostas salvas". A lista mostra "Não chegou ao bot" quando o envio falha; salvar de novo reenvia.

Exige a migration 0235 e a versão da API do bot com as rotas `/api/respostas-rapidas/origem/:id`.
