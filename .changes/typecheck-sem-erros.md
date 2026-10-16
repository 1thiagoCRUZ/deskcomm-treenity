---
impacto: nada_mudou
secao: corrigido
titulo: O typecheck volta a passar (versões do Playwright alinhadas e um teste do bot corrigido)
---

`@playwright/test` e `playwright` estavam em versões diferentes (1.62 e 1.63), o que duplicava os
tipos e reprovava o `pnpm typecheck` (e o job `verify` do CI). Alinhados em 1.63. Também corrigido
um acesso possivelmente indefinido em `tests/unit/treenity-bot-whatsapp.test.ts`.
