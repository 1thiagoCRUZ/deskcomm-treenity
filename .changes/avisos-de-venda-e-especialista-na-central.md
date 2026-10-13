---
impacto: capacidade_nova
secao: adicionado
titulo: Venda nova e pedido de especialista do Treenity Bot viram avisos na Central, com bolinha laranja na Fila
---

O toast de venda e de especialista só aparecia com o sistema aberto numa aba — quem entrava de
manhã não via o que aconteceu de noite. Agora os dois ficam gravados na Central de avisos (o
sino do topo): "Venda nova: cliente — valor" e "cliente pediu um especialista", este com
atalho para a conversa. O aviso de especialista se resolve sozinho quando alguém assume ou
fecha a conversa. A aba Fila do Inbox ganha uma bolinha laranja enquanto houver pedido de
especialista sem dono.

A venda chega pela nova rota `POST /api/treenity-bot/whatsapp/venda-nova` (mesma chave `tbw_`),
chamada pela API do bot.
