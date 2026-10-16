---
impacto: exige_acao
secao: alterado
titulo: Só a API oficial da Meta conecta WhatsApp; saem o QR (WAHA), o provedor parceiro e as telas de IA nativa
---

O WhatsApp passa a ser conectado só pela API oficial da Meta. Saem do sistema a conexão por QR
(WAHA), o provedor parceiro, o webhook do WAHA, o assistente de conexão do onboarding e os
trabalhos que só existiam para eles (telefone e foto de perfil do contato). Também saem as telas e
rotas da IA nativa do DeskComm (agentes, base de conhecimento, follow-ups, roteadores, MCP), os
workers de IA e a tela de Webhooks de saída. A Central de avisos (sino de alertas) permanece.

## Requer atenção

Antes de publicar, conferir em `channel_sessions` que nenhum canal ativo usa `provider = 'waha'`
ou `'zernio'`: um canal assim deixa de enviar e receber. As tabelas de IA e de conexão antigas
seguem no banco até a etapa de limpeza de schema.
