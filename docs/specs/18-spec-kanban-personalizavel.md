# Spec 18 — Kanban do funil de vendas 100% personalizável

> Status: **rascunho para aprovação** · Autor: sessão de 2026-11-11 · Repos envolvidos: `deskcomm-treenity` (este) e `api-treenity-bot` (a API do bot)
>
> Esta spec é executada **em fases (F0…F6)**. Cada fase termina com gate verde e pode virar um PR sozinho. Marque os checkboxes conforme avançar.

## 1. Pedido (nas palavras do cliente)

Um Kanban **personalizável por inteiro**:

1. **cor** de cada etapa;
2. **nome** de cada etapa;
3. **mais de um funil**;
4. **filtrar o Inbox pela etapa**.

Etapas de partida do funil de vendas do cliente (11):
`Iniciado` · `Orçamento` · `Retorno de orçamento` · `Envio de dados` · `Aguardando pagamento` · `Pagamento realizado` · `Pagamento não realizado` · `Envio` · `Feedback (entrega + 15 dias)` · `Venda ganha` · `Venda perdida`.

Restrição de produto: **não copiar o Kanban da Kommo** (o cliente não gostou). A experiência tem de ser mais simples: o leigo muda cor e nome **na própria coluna**, sem ir a uma tela de configuração escondida.

## 2. O que já existe (medido no código em 2026-11-11 — não refazer)

| Peça | Estado | Onde |
|---|---|---|
| Vários funis | **Existe.** Lista `/app/kanban` (cria, renomeia, reordena, arquiva); cada funil abre em `/app/pipelines/[id]` | `app/app/kanban/page.tsx`, `app/api/v1/pipelines/` |
| Renomear / criar / reordenar / arquivar etapa | **Existe.** API + tela de configuração | `app/api/v1/pipelines/[id]/stages/`, `lib/leads/stage-editing.ts`, `app/app/settings/tenant/pipelines/_stages.tsx` |
| Coluna `crm_stages.color` | **Existe no banco** (`#RRGGBB`, CHECK `crm_stages_color_format`) e **o quadro já pinta** a coluna com ela | baseline.sql:1505-1513, `components/kanban/StageColumn.tsx:90` |
| Escolher a cor | **NÃO existe.** `POST` só aceita `{name}`; `PATCH` só `name, is_won, is_lost, depois_de` (`.strict()`); `_stages.tsx` não tem seletor | `stages/route.ts:39`, `stages/[stageId]/route.ts:42-48` |
| Funil modelo de vendas (as 11 etapas) | **NÃO existe.** O gatilho semeia um funil de e-commerce de 8 etapas ("Carrinho abandonado"…) em toda org nova | baseline.sql:~695-715 (`fn_seed_default_pipeline_for_org`) |
| Trocar de funil **dentro** do quadro | **NÃO existe.** Só voltando à lista | `app/app/pipelines/[id]/_client.tsx` |
| Filtro do Inbox por etapa | **NÃO existe.** Filtros atuais: status, atendente, comando, tag, canal, busca | `components/inbox/InboxFilters.tsx`, `app/api/v1/conversations/route.ts`, `lib/schemas/messaging.ts:223` |
| Gatilho de follow-up por mudança de etapa | **Existe** (`trigger_config.kind='stage_change'`) | `lib/followup/` |

**Conclusão:** dois dos quatro pedidos (nome, vários funis) já estão prontos. O trabalho real é **cor editável, modelo das 11 etapas, trocar funil no quadro e o filtro do Inbox**.

## 3. Decisões de desenho

1. **Sem migration de schema nas fases F0–F4.** `color`, `name`, `position`, `is_won/is_lost` já existem. Se uma fase descobrir que precisa de schema, aplica a Doutrina de Migrations (migration + apêndice no `baseline.sql` + MANIFEST) **e** revoga `EXECUTE` das duas origens em função nova.
2. **Won/lost são marcas, não nomes.** Só `Venda ganha` (`is_won`) e `Venda perdida` (`is_lost`) encerram o lead. `Pagamento realizado` e `Pagamento não realizado` são etapas **comuns** — o índice `uniq_crm_stages_pipeline_won/lost` permite uma de cada por funil, e o cliente separou "pagou" de "ganhou" de propósito (o pós-pagamento — envio, feedback — acontece antes de a venda ser ganha).
3. **O filtro do Inbox é por lead aberto do contato.** Conversa não tem etapa; o **lead** (`crm_leads.contact_id`, `stage_id`, `status='open'`) tem. Filtrar "etapa X" = conversas cujo contato tem lead aberto nessa etapa. Contato com 2 leads em funis diferentes aparece em ambos os filtros (correto).
4. **Modelo de funil é semente, não vínculo.** Criar funil "a partir do modelo" copia as etapas; depois o funil é do cliente e ninguém o sincroniza de volta (evita o anti-pattern 2, duplicação sem source of truth).
5. **Cor fora do vocabulário livre:** a UI oferece uma **paleta curta** (≈12 cores já legíveis em tema claro e escuro) **mais** "outra cor" (input hex). O banco aceita qualquer `#RRGGBB`.
6. **A tela é provada por UI** (doutrina de QA Visual): Playwright dirigindo o browser, banco fresco do `baseline.sql`, sem envs opcionais. `curl` não conta.

## 4. Fases

### F0 — Modelo "Funil de vendas" com as 11 etapas

**Objetivo:** criar um funil já nascido com as etapas do cliente, cores sugeridas e marcas won/lost corretas.

- [ ] Definir o modelo em um único módulo TS (ex.: `lib/pipelines/modelos.ts`): lista `{ name, slug, color, is_won, is_lost }` — slugs ASCII (`iniciado`, `orcamento`, `retorno_de_orcamento`, `envio_de_dados`, `aguardando_pagamento`, `pagamento_realizado`, `pagamento_nao_realizado`, `envio`, `feedback`, `venda_ganha`, `venda_perdida`) e **o nome com acento** como o cliente escreveu. Slug tem de bater `^[a-z0-9_-]{2,40}$`.
- [ ] O `POST /api/v1/pipelines` aceita `modelo?: "vendas" | "em_branco"` (hoje cria funil vazio; ver `_handler.ts`/`_funis.ts`). Sem `modelo` = comportamento atual (retrocompatível).
- [ ] `FunisClient` (criar funil) ganha a escolha **"Começar de: Funil de vendas · Em branco"**.
- [ ] Decidir com o dono: o **funil padrão de uma org nova** continua o de e-commerce ("Pedidos") ou passa a ser o de vendas? *Padrão desta spec: não mexer no gatilho `fn_seed_default_pipeline_for_org` (mexer exige migration + baseline) — o cliente cria o funil de vendas pelo modelo.* **Decidido (2026-11-11): manter** — o gatilho `fn_seed_default_pipeline_for_org` não é tocado; o funil de vendas nasce pelo modelo.
- [ ] Testes: unit do módulo (slugs válidos, 1 won + 1 lost, sem duplicata); rota (cria com modelo, audita, respeita `Idempotency-Key`); isolamento entre 2 orgs.

**Aceite:** criar funil pelo modelo gera 11 colunas na ordem, com cor, e o lead ganho/perdido encerra normalmente.

### F1 — Cor da etapa editável (e nome na própria coluna)

- [ ] **API:** `PATCH .../stages/[stageId]` aceita `color: string | null` (regex `^#[0-9a-fA-F]{6}$`, `null` = sem cor); `POST .../stages` aceita `color?` opcional. Zod `.strict()` mantido. A recusa usa o texto do usuário, nunca o nome da constraint (padrão de `stage-editing.ts`).
- [ ] **Regra pura** em `lib/leads/stage-editing.ts`: `validarCorDeEtapa(cor)` (normaliza para minúscula; recusa formato inválido com mensagem em PT).
- [ ] **Audit:** o `PATCH` de cor já cai no fluxo que audita mutação — conferir que o `details` do audit registra `color` antes/depois.
- [ ] **UI (a parte que o cliente vê):**
  - em `_stages.tsx` (configuração): bolinha de cor por etapa abre a paleta + "outra cor";
  - **no cabeçalho da coluna do quadro** (`StageColumn.tsx`), menu `⋯` → "Renomear" e "Cor" (só `manager+`; para `viewer/agent` o menu não aparece — não prometer o que o servidor recusa);
  - cor refletida na hora (Realtime do quadro já assina `crm_leads`; a mudança de **etapa** precisa invalidar o `useBoard` — conferir se o board escuta `crm_stages`, senão invalidar no `onSuccess`).
- [ ] Contraste: texto do título da coluna calculado a partir da cor (claro/escuro), medido por `getComputedStyle`, não a olho.
- [ ] i18n: textos novos em `lib/i18n/dicionario.ts`.
- [ ] Testes: unit da validação; rota (cor válida, inválida, `null`, org alheia → 404); componente da paleta; E2E "leigo troca a cor e vê a coluna mudar".

**Aceite:** manager muda cor e nome de uma etapa direto no quadro; agent não vê o menu; cor inválida é recusada com mensagem clara.

### F2 — Vários funis: trocar de funil sem sair do quadro

- [ ] Seletor de funil no cabeçalho de `/app/pipelines/[id]` (dropdown com os funis não arquivados da org ativa, mesmo filtro `organization_id` da lista — a RLS libera todas as orgs do usuário, o filtro explícito é obrigatório).
- [ ] Lembrar o último funil aberto por usuário (preferência local; sem schema) e abrir nele a partir do menu.
- [ ] A lista `/app/kanban` continua sendo onde se gerencia (criar/renomear/reordenar/arquivar).
- [ ] Testes: E2E com 2 funis (`scripts/seed-e2e-funis.ts` já existe — estender, não duplicar).

**Aceite:** com 2 funis, o usuário alterna entre eles no próprio quadro e cada um mostra só as suas etapas e leads.

### F3 — Filtro do Inbox por etapa (e funil)

- [ ] **Query:** `listConversationsQuerySchema` ganha `etapa` (uuid da etapa) e, opcionalmente, `funil` (uuid) para o seletor em dois níveis.
- [ ] **⚠️ Rota E schema E handler:** a rota `conversations/route.ts` lê cada param **à mão** — o schema aceitar não basta (já quebrou com `tag` e `comando`). `tests/unit/rota-le-todo-filtro-do-schema.test.ts` reprova o esquecimento; rodá-lo.
- [ ] **Handler:** restringir a conversas cujo `contact_id` tenha `crm_leads` com `status='open'` e `stage_id = :etapa`, **sempre com `organization_id`** resolvido do contexto (nunca do query string). Preferir *embedded filter* do PostgREST (`contacts!inner(crm_leads!inner(...))`) ou subquery/RPC a montar `contact_id.in.(...)` com milhares de ids — o próprio `_handler.ts:42` documenta o teto de tamanho de URL. Se virar função SQL: migration + baseline + MANIFEST + revogar `EXECUTE` de `public, anon`.
- [ ] **`/conversations/counts`:** mesmo filtro, senão o badge contradiz a lista (aconteceu com "Fila 1" vs 5 conversas).
- [ ] **UI:** `InboxFilters.tsx` ganha o select "Etapa" (agrupado por funil, com a **bolinha de cor** da etapa); combinável com os demais filtros; estado na URL.
- [ ] **Etiqueta na lista:** `ConversationListItem` mostra a etapa do lead aberto (chip colorido). Se o contato tiver mais de um lead aberto, mostrar o de funil padrão + "+N".
- [ ] Testes: unit do handler (etapa de outra org não vaza; sem lead → fora do filtro); invariante RLS (2 tenants); E2E "filtro por etapa mostra só as conversas certas e o contador bate".

**Aceite:** escolher "Aguardando pagamento" no Inbox lista só as conversas cujo contato está nessa etapa, e o badge de contagem concorda.

### F4 — ~~Automação por etapa~~ (FORA DE ESCOPO)

**Decidido (2026-11-11):** "Feedback (entrega + 15 dias)" é uma etapa **comum e manual** — o retorno vem do **cliente**, quando vem, e o atendente move o card. Nenhuma automação de tempo nesta spec. Efeito no modelo da F0: `Feedback` é só mais uma coluna (sem `expected_duration_hours`, sem gatilho). O foco é o Kanban.

### F5 — Fechamento

- [ ] Fragmento em `.changes/` (`capacidade_nova`), conferido com `pnpm release:conferir`.
- [ ] Mapa de jornadas `docs/testing/user-journey-map.md`: casos novos (cor, modelo, filtro do Inbox), P0 de primeira impressão marcado.
- [ ] Mapa vivo `docs/architecture/` com a peça nova e ≥2 arestas (Living System Checklist).
- [ ] Porta de navegação: **nenhuma tela nova** é prevista — se surgir, `lib/navigation/registry.ts`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` (**sem caminho**, ler o rodapé) e `pnpm test:db` se F3 tocou SQL.

### F6 — ~~API do bot / métricas~~ (ADIADA)

**Decidido (2026-11-11):** foco no Kanban. Métricas por etapa e qualquer mudança na `api-treenity-bot` ficam para depois, em spec própria, se necessário. A §5 permanece como referência do que seria preciso.

## 5. Mudanças na `api-treenity-bot` (o que, e por quê)

Li `src/services/atendimento.service.js`, `src/services/deskcomm.service.js`, `src/db/schema.js` e `README.md`. **Não li** `dashboard.service.js` por inteiro, nem os fluxos do n8n.

**Resumo: para F0–F4 NÃO é preciso alterar a API.** Motivos:

- O funil que a API conhece é **o próprio, do bot**: a coluna `atendimentos.status_funil` (varchar, padrão `'Iniciou'`) com valores fixos `Iniciou / Em Negociacao / Proposta / Fechada` (+ `Perdida` pela autocura). `ETAPAS_ENCERRADAS = ['Fechada','Perdida']` está **hardcoded** no serviço (`atendimento.service.js:74`).
- No CRM, esse funil é **separado**: `lib/treenity-bot/funil-de-leads.ts` cria leads no funil de slug `treenity-bot` (`source='treenity_bot'`), idempotente por `external_id`. O funil de vendas das 11 etapas é **outro funil** e não toca nessa sincronização.
- O CRM já fala com a API só por HTTP + Bearer, e a API avisa o CRM (`deskcomm.service.js` → `/api/treenity-bot/whatsapp/venda-nova` e `/pediu-ajuda`). Nada disso depende de nome/cor de etapa.

**Alterações recomendadas (opcionais), com o porquê:**

| # | Alteração na API | Por quê | Fase |
|---|---|---|---|
| A1 | Nenhuma para o Kanban/Inbox | O funil de vendas vive 100% no CRM (Postgres do CRM); a API não é consultada pelo quadro nem pelo filtro do Inbox | F0–F4 |
| A2 | `venda.service` / `avisarVendaNova`: incluir no payload o `id_venda` (já enviado) **e**, se o cliente quiser que a venda do bot **mova o lead** para `Pagamento realizado`, o CRM precisa de um mapeamento "venda gravada → etapa". **Essa lógica deve ficar no CRM** (rota `venda-nova` decide a etapa), não na API | A API não deve conhecer nomes de etapa do cliente: se ela mandar o nome, renomear a etapa quebra a integração. O CRM resolve por **slug/ID**, nunca por nome | F6 |
| A3 | Se o dashboard da API precisar de métricas "por etapa do funil de vendas": expor no CRM um endpoint de leitura por etapa (Bearer) e a API **consome**, em vez de duplicar a etapa na tabela `dashboard_metrics_diarias` | Duplicar etapa na API cria 2 fontes da verdade (anti-pattern 2) e a métrica fica errada no instante em que o cliente renomeia/reordena | F6 |
| A4 | Tirar `ETAPAS_ENCERRADAS` do código **só se** o bot passar a usar etapas configuráveis | Hoje é consistente com o próprio `status_funil`; mexer sem necessidade arrisca o gate do n8n que cala o bot | — (não fazer agora) |

> **Regra de ouro para qualquer integração futura:** a API e o n8n referenciam etapa por **`slug` ou `id`**, nunca pelo nome exibido — o nome agora é editável pelo cliente.

## 6. Riscos e pontos de atenção

1. **Renomear etapa não muda o `slug`** (de propósito, `stage-editing.ts`). Quem filtra por nome no n8n/automação quebra — por isso a regra de ouro acima.
2. **Arquivar etapa com leads** exige destino (já implementado). A paleta/menu da coluna não pode ofuscar isso.
3. **Cor sem contraste** em tema escuro: medir, não confiar no olho.
4. **Filtro do Inbox com muitos leads:** não montar lista de ids na URL (teto do gateway). Medir com um tenant de 5–10 mil leads antes de declarar pronto.
5. **Multi-tenant:** toda leitura nova filtra `organization_id` explicitamente; teste de isolamento com 2 orgs obrigatório (RLS é piso, não escopo).
6. **Higiene de branches:** `main` está limpa e atualizada. Cada fase em branch própria saindo da `main` (`git fetch && git merge origin/main` antes de codar).

## 7. Definition of Done (resumo — vale o CLAUDE.md)

typecheck e lint zerados · `pnpm test:unit` (rodapé lido) · `pnpm test:db` se SQL · Zod em todo input novo · audit em mutação · sem `console.log` · i18n no dicionário · prova **pela tela** em ambiente fresco estilo VPS, com screenshot em `.superpowers/evidence/` · `.changes/` com o efeito no operador · `journey-map` atualizado.

## 8. Perguntas em aberto (preciso do dono)

Resolvidas em 2026-11-11:

1. Funil padrão de org nova → **mantém "Pedidos"**; o de vendas nasce pelo modelo. *(F0)*
2. "Feedback" → **manual**, retorno do cliente; sem automação. *(F4 fora de escopo)*
3. Venda do bot mover lead sozinha → **adiado** com a API. *(F6)*
4. Métricas por etapa → **adiado**. *(F6)*

Sem perguntas em aberto: F0 → F1 → F2 → F3 → F5 podem ser executadas em ordem.
