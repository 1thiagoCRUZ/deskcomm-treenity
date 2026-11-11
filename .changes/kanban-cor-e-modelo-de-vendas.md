---
impacto: capacidade_nova
secao: adicionado
titulo: Kanban personalizável — cor e nome da etapa direto na coluna, e funil de vendas com 11 etapas
---

Quem é gerente ou administrador agora muda a **cor** e o **nome** de cada etapa no próprio quadro: a bolinha da coluna abre uma paleta (ou "outra cor", em `#RRGGBB`), e o lápis ao lado do título renomeia. A cor aparece como uma faixa no topo da coluna. A mesma bolinha existe em Configurações › Funis, ao lado do nome de cada etapa. Quem é atendente ou só visualiza continua vendo o quadro como antes, sem os controles.

Ao criar um funil, dá para escolher **"Começar de: Funil de vendas"**: ele já nasce com as 11 etapas (Iniciado, Orçamento, Retorno de orçamento, Envio de dados, Aguardando pagamento, Pagamento realizado, Pagamento não realizado, Envio, Feedback, Venda ganha e Venda perdida), cada uma com uma cor. Só "Venda ganha" e "Venda perdida" encerram o negócio. "Em branco" continua sendo o padrão, com as 4 etapas de sempre.

Não exige ação: nenhuma migration, nenhuma variável nova. O funil padrão de organização nova segue sendo o de e-commerce. A API de etapas (`POST` e `PATCH …/stages`) passa a aceitar `color` (`#RRGGBB` ou `null`), e `POST /api/v1/pipelines` aceita `modelo` (`vendas` ou `em_branco`).
