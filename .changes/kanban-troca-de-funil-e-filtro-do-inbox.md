---
impacto: capacidade_nova
secao: adicionado
titulo: Trocar de funil dentro do quadro e filtrar o Inbox pela etapa do funil
---

Com mais de um funil, o título do quadro vira um seletor: dá para ir de um funil ao outro sem voltar à lista de funis. Os filtros do quadro anterior não vão junto, porque etiqueta e responsável de um funil não valem no outro.

No Inbox, o filtro **Etapa** lista as etapas de todos os funis (com a cor de cada uma) e mostra só as conversas cujo contato está naquela etapa — por exemplo, todo mundo que está em "Aguardando pagamento". Combina com os filtros de aba, número e tag. Se a etapa escolhida for arquivada, o filtro avisa "Etapa removida" e dá para voltar a "Todas as etapas".

Não exige ação: nenhuma migration, nenhuma variável nova. A lista de conversas (`GET /api/v1/conversations`) passa a aceitar `?etapa=<id da etapa>`, e há uma rota nova de leitura, `GET /api/v1/conversations/etapas`, que alimenta o seletor.
