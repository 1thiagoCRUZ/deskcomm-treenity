---
impacto: nada_mudou
secao: alterado
titulo: Saem do sistema as telas e o código de Meta Ads e Conversões, que a Treenity não usa
---

Removidos Análise › Meta Ads, Configurações › Meta Ads e Configurações › Conversões, com suas rotas
(`/api/v1/ads/*`), o envio de vendas ao anúncio, a leitura de campanhas e os textos e ações de
auditoria dessas telas. Nenhuma delas aparecia no menu da Treenity. As tabelas
`ad_platform_connections`, `ad_insights_connections` e `ad_conversion_dispatches` continuam no
banco (sem uso e sem acesso para usuários) até a etapa de limpeza de schema, que exige backup.
