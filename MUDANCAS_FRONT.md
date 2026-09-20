# Mudanças no Front — Sessão TreenityCRM

Registro do que foi alterado no visual do produto durante a sessão de rebrand para **TreenityCRM**. Escopo: cores base, tela de login, tela de marca e painel de customização no topbar.

---

## 1. O que foi feito

### 1.1 Identidade base (globais)
- **Nome do produto**: `DeskcommCRM` → `TreenityCRM`
  - `lib/branding.ts` — `DEFAULT_APP_NAME` trocado.
- **Cor de destaque (accent)**: paleta Sage (verde `#506D48`) → **Treenity blue `#3B64DE`**
  - Rampa completa de 11 stops (`--color-accent-50` a `--color-accent-950`) reescrita em `app/globals.css` nos blocos `:root` e `[data-theme="dark"]`.
- **Fundo (bg)**:
  - Light: `#F7F7F7`
  - Dark: `#26292F`
- **Texto base**:
  - `--color-text` = `#26292F` (light)
  - `--color-text-muted` = `#3D4149` (mais escuro que o Sage anterior, ganha legibilidade)
- **Fontes carregadas**: além de Atkinson Hyperlegible (default) e IBM Plex Mono, agora `app/layout.tsx` carrega via `next/font/google`:
  - Inter, Manrope, DM Sans, Bricolage Grotesque, Fraunces
  - Cada uma expõe uma variável CSS (`--font-inter`, `--font-manrope`, etc.).

### 1.2 Painel de customização no topbar (`components/branding/CustomizacaoPopover.tsx`)
- Novo componente montado em `components/shell/TopBar.tsx` entre `AlertsBell` e `ThemeToggle`.
- **Visível apenas para admin** (`usePermission("settings.write")`).
- Conteúdo:
  - Picker de cor com input `type="color"` + 6 presets (Treenity padrão, Sage, Grafite, Rosé, Âmbar, Índigo).
  - Seletor de fonte com 6 opções (grid 3×2 mostrando amostra na própria fonte).
  - Toggle de tema (light / dark / system).
  - Upload de logo local (só preview, não persiste).
- **Preview vivo no site inteiro** via `<style id="custom-preview-marca">` injetado no `<head>`, sobrescrevendo `--color-accent`, `--ring`, `--primary` e `--font-sans`.
- Botão **Descartar** volta ao Treenity padrão; **OK** apenas fecha (persistência real fica em Configurações › Marca).
- Fonte da lista em `lib/customizacao/fontes.ts`.

### 1.3 Tela de login (`app/(public)/**`)
- **Layout split 2 colunas** (`lg:grid-cols-2`) em `app/(public)/layout.tsx`.
- **Esquerda**:
  - `bg-surface` branco, logo/nome no topo, form alinhado à esquerda (`max-w-md`).
  - `text-text` explícito no wrapper (fix para herança de cor quando SO está em dark).
- **Direita** (só `lg+`):
  - Base `#1a1c22` com gradiente cinza.
  - SVG com 3 blobs orgânicos cinza (tons distintos `#2e3138` → `#3d424c`) com blur suave.
  - 2 glows azuis difusos (`#3B64DE` opacity ≤ 0.35).
  - Linhas curvas cross-grid (opacity 0.06).
  - Texto "Seu atendimento em um só lugar." centralizado vertical (mesma altura do form).
- **Escopo forçado light** via `data-theme="light"` no wrapper — telas de acesso ignoram preferência dark do SO.
- **Form** (`components/auth/LoginForm.tsx`):
  - Inputs altura 44px (`h-11`) com placeholders (`voce@empresa.com`, `••••••••`).
  - Botão altura 44px, texto `text-base font-medium`.
  - Spacing `space-y-5`.
- **Página** (`app/(public)/login/page.tsx`):
  - H1 `text-4xl font-bold`.
  - Subtítulo `text-base` "Bem-vindo ao TreenityCRM.".
  - Alinhamento à esquerda (removido `text-center`).

### 1.4 Tela de marca (`/app/settings/marca`)
- Form **ocupa largura total** (removido `max-w-3xl`).
- Rótulo **"Cor da sua marca"** → **"Cor primária"**.
- Novo campo **"Cor secundária"** ao lado (grid 2 colunas), default `#6b7078` (cinza).
- **Prévia rápida**: barra com swatches "Primária" | "Secundária" e aviso *"Secundária ainda não persiste — em breve"*.
- **Bg decorativo**: SVG com 4 blobs cinza `#d5d7da` blurados nos cantos, opacity 40%, atrás do conteúdo.

### 1.5 Fixes técnicos
- `suppressHydrationWarning` no `<body>` de `app/layout.tsx` — silencia aviso causado pela extensão **ColorZilla** injetar `cz-shortcut-listen="true"`.
- Preset "Treenity (padrão)" no CustomizacaoPopover marcado explicitamente.

---

## 2. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `app/globals.css` | Tokens `:root`, `[data-theme="light"]`, `[data-theme="dark"]` — cores accent, bg, text |
| `app/layout.tsx` | + 5 fontes Google, className com todas variables, `suppressHydrationWarning` no body |
| `app/(public)/layout.tsx` | Reescrita completa: split layout, painel SVG decorativo, `data-theme="light"` |
| `app/(public)/login/page.tsx` | H1 maior, alinhamento esquerda, copy "Bem-vindo ao TreenityCRM" |
| `app/app/settings/marca/page.tsx` | Bg decorativo SVG, wrapper `relative` |
| `app/app/settings/marca/_form.tsx` | Removido `max-w-3xl`, "Cor primária" + "Cor secundária" (grid), swatch preview |
| `components/shell/TopBar.tsx` | + `<CustomizacaoPopover />` + `<ThemeToggle />` |
| `components/auth/LoginForm.tsx` | Inputs `h-11`, placeholders, botão `h-11 text-base` |
| `components/branding/CustomizacaoPopover.tsx` | **NOVO** — painel de personalização |
| `lib/branding.ts` | `DEFAULT_APP_NAME` = `"TreenityCRM"` |
| `lib/customizacao/fontes.ts` | **NOVO** — mapa `IdDeFonte` → variável CSS + amostra |

---

## 3. O que falta

### 3.1 Persistência (exige migration versionada)
- **Cor secundária** hoje é só state local no form. Persistir requer:
  1. Migration em `supabase/migrations/<ts>_<NNNN>_marca_org_cor_secundaria.sql` + apêndice idempotente em `supabase/baseline.sql` + linha em `MANIFEST.md`.
  2. Alterar RPC `fn_definir_marca_da_organizacao` para aceitar `p_secondary_hex`.
  3. Estender `marcaDaOrganizacaoSchema` em `lib/schemas/settings.ts`.
  4. Estender `updateMarcaDaOrganizacao` action.
  5. Ler no `resolverMarcaDaOrganizacao` e emitir token CSS `--color-secondary` via `lib/branding/css.ts`.
- **Fonte escolhida no popover** hoje só vive na sessão. Mesmo caminho: migration + schema + resolver + campo no `_form.tsx`.
- **Logo do popover** — só preview, não sobe pro Storage (upload real já existe na tela de marca via `CampoDeLogo`).

### 3.2 UI/UX
- Preview **lado a lado light | dark** dentro da tela de marca (rota A que ficou parada).
- Botão "Salvar como padrão da organização" dentro do CustomizacaoPopover reusando a action.
- Suporte a `<CustomizacaoPopover>` em rotas onde o `TopBar` não aparece (`/admin`, `/onboarding`).

### 3.3 Ambiente de dev (local desta máquina)
- `supabase/migrations` foi renomeado para `supabase/migrations.bak` para permitir `supabase start` (a cadeia fresh não sobe — documentado no CLAUDE.md). Restaurar antes de rodar `pnpm test:db` local.
- `.env.local` gravado com JWTs demo do Supabase local (`iss: supabase-demo`). Não é segredo — são chaves públicas defaults do `supabase start`.
- Scripts temporários criados: `tmp-screenshot.mjs`, `tmp-marca.mjs`, `tmp-login.png`, `tmp-marca.png`, `baseline-apply.log`, `dev.log`. Podem ser deletados.

---

## 4. Impactos e riscos

### 4.1 Testes que provavelmente reprovam
- `tests/unit/branding-marca-css.test.ts` — asserts em valores da paleta Sage.
- `tests/unit/branding-rampa.test.ts` — rampa gerada esperava seed Sage.
- `tests/unit/branding-pares-pintados.test.ts` — pares de contraste esperavam paleta anterior.
- `tests/unit/tailwind-tokens.test.ts` — valida presença/valor dos tokens em `globals.css`.
- `tests/unit/branding.test.ts` — varredura antivazamento de marca; se o nome "TreenityCRM" for hardcoded em código, aparece no relatório.
- E2E `tests/e2e/icone-da-marca.spec.ts`, `tests/e2e/marca-logo.spec.ts` — asserts no nome/logo default.
- E2E de login (qualquer spec que assume centralização) — o split layout mudou seletor de posição.

**Rodar antes de PR**: `pnpm test:unit` no mínimo. `pnpm test:db` e `pnpm test:e2e` também se for pra main.

### 4.2 Doutrina do repo
- Editar `app/globals.css` direto **viola a doutrina de marca própria** (`CLAUDE.md § Marca própria (white-label)`): a doutrina diz que cor default do produto vive em `platform_branding`/`.env`, não em CSS. Justificativa deste PR: user pediu explicitamente "não quero env, nada de banco, no código".
- Mesmo motivo vale para renomear `DEFAULT_APP_NAME`: quebra o pressuposto de imagem única servindo todas as marcas.
- Se o produto for continuar aceitando revendedores, essas duas mudanças precisam sair do CSS e voltar para camadas resolvíveis por instalação.

### 4.3 Compatibilidade
- Fontes novas (`Inter`, `Manrope`, `DM Sans`, `Bricolage Grotesque`, `Fraunces`) baixadas em build via `next/font/google`. Aumenta bundle inicial em ~40–60 KB por fonte. Todas sempre carregam, mesmo se ninguém trocar de padrão.
- `data-theme="light"` forçado nas telas públicas **quebra** quem preferiria login em dark. Decisão de produto.
- `suppressHydrationWarning` no body: fecha ruído da extensão ColorZilla mas também **silencia** qualquer futuro mismatch real de hidratação nesse elemento. Diagnosticar no elemento pai se algo aparecer estranho.

### 4.4 Persistência
- Nada foi gravado no banco. Todas as cores e o nome novo saem do código. **Rebuild da imagem** é necessário para clones/prod verem essas mudanças — não basta reiniciar o worker.

### 4.5 Cascade de fonte
- CustomizacaoPopover sobrescreve `--font-sans` no `<html>`. Sobrevive à navegação (é DOM). **Perde** ao dar refresh (nada persiste). Comportamento esperado até integrar a rota A.

---

## 4b. Mocks (o que finge estar salvo mas não está)

Nada persiste no banco. Tudo abaixo vive só no state React e some no F5:

| Onde | O que | Como se comporta hoje | O que precisaria pra ficar real |
|---|---|---|---|
| `components/branding/CustomizacaoPopover.tsx` — campo cor | Picker + 6 presets, aplica ao vivo | `<style>` injetado no `<head>`, sobrescreve `--color-accent` | Reusar `updateMarcaDaOrganizacao` (action já existe, aceita `accent_hex`) |
| `components/branding/CustomizacaoPopover.tsx` — campo fonte | 6 opções, aplica ao vivo | Sobrescreve `--font-sans` no `<style>` injetado | RPC + migration pra aceitar `font_id` em `settings.branding` |
| `components/branding/CustomizacaoPopover.tsx` — upload logo | Preview via `FileReader.readAsDataURL` | data URL no state, some ao fechar popover | Upload real ao Storage — já existe em `CampoDeLogo` (tela de marca) |
| `components/branding/CustomizacaoPopover.tsx` — botão "OK" | Toast informando pra usar Configurações › Marca | Não grava nada | Trocar por call à action se integrar |
| `app/app/settings/marca/_form.tsx` — cor secundária | `useState("#6b7078")`, picker funciona | Não vai no payload do `Salvar` | RPC + migration + `marcaDaOrganizacaoSchema` + resolver + CSS token `--color-secondary` |
| Fontes carregadas em `app/layout.tsx` | Inter, Manrope, DM Sans, Bricolage, Fraunces | Todas baixam sempre | Se ninguém mais precisar, tirar imports não usados |

Nenhuma dessas coisas quebra por não estar salvando — só perdem preferência ao recarregar.

## 4c. Comentários removidos do código (agora vivem aqui)

Depois de "user pediu: sem comentários no código". O contexto que eles carregavam:

- **`app/globals.css`**: os tokens `--color-accent-*` no `:root` e `[data-theme="dark"]` são a rampa Treenity de 11 stops derivada de `#3B64DE`. Os blocos `light/dark` cobrem as mesmas 59 props (invariante `branding-tema-claro-escopavel.test.ts`). Não trocar valor sem checar aquele teste.
- **`app/(public)/layout.tsx`**: `<div data-theme="light">` no wrapper força tema claro nas telas de acesso, ignorando preferência dark do SO. `text-text` no wrapper e no lado esquerdo é obrigatório senão a herança de cor do body (calculada em `<html data-theme=dark>` quando o SO é dark) faz `<Label>` e `<h1>` sem classe explícita ficarem brancos sobre branco. O SVG do lado direito tem 3 blobs orgânicos com gradient + 2 glows azuis + linhas cross-grid — é decoração; escala sem quebrar em outros viewports por causa do `preserveAspectRatio="xMidYMid slice"`.
- **`app/app/settings/marca/page.tsx`**: o `<svg>` com blobs cinza fica atrás do conteúdo por `absolute inset-0` + wrapper `relative`. `pointer-events-none` garante que o SVG não bloqueia cliques no form. Opacity 40% para não competir com os campos.
- **`components/branding/CustomizacaoPopover.tsx`**: só monta se `usePermission("settings.write")` (equivale a admin). `<style id="custom-preview-marca">` é o carregador do preview vivo — `descartar()` remove a tag. `salvar()` hoje só mostra toast; ponto de entrada pra integrar `updateMarcaDaOrganizacao`.
- **`app/layout.tsx`**: `suppressHydrationWarning` no `<body>` silencia o `cz-shortcut-listen="true"` que a extensão ColorZilla injeta. Se aparecer outro mismatch real de hidratação no body, o silêncio esconde — investigar no elemento pai.
- **`lib/customizacao/fontes.ts`**: cada `IdDeFonte` precisa bater com a `variable` passada em `app/layout.tsx` (`--font-inter`, `--font-manrope`, etc.). Trocar aqui sem trocar lá deixa a fonte "escolhida" cair no fallback do navegador.

---

## 5. Como subir o ambiente do zero (Windows)

Quem clonar o repo e quiser rodar precisa disto **antes** de `pnpm dev`. As mudanças do banco foram desfeitas — a lista abaixo reproduz o estado que estava funcionando.

### 5.1 Pré-requisitos (instalar uma vez)

| Ferramenta | Como |
|---|---|
| Node 22 | `nvm install 22 && nvm use 22` (usa `.nvmrc`) |
| pnpm | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker Desktop | `winget install -e --id Docker.DockerDesktop` → reiniciar → abrir uma vez |
| Supabase CLI | Não está no winget. Baixar binário: `Invoke-RestMethod "https://api.github.com/repos/supabase/cli/releases/latest"` → asset `supabase_*_windows_amd64.tar.gz` → extrair em `%USERPROFILE%\.supabase-cli\` → adicionar ao PATH |

Adicionar ao PATH da sessão PowerShell (ou permanente no sistema):
```powershell
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;$env:USERPROFILE\.supabase-cli;$env:PATH"
```

### 5.2 Instalar dependências do projeto
```powershell
pnpm install
```

### 5.3 Preparar `.env.local`

Copiar `.env.example` para `.env.local` e preencher com as chaves demo do Supabase local (são **defaults públicos** que todo `supabase start` gera iguais):

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ADMIN_URL=http://localhost:3000

INTERNAL_SECRET=dev-local-internal-secret
CPF_ENCRYPTION_KEY=MaxslLlC8IrkIuE8RAXs8Eq0NkLjGyDztsujg7AQK5I=
WAHA_BYO_ENCRYPTION_KEY=k3n9pXG2vQd7hT1yR8mZ4bC6eL0sA5wF2uJ9gN7iK3o=
AI_CRED_AES_KEY=xW4tR9pL2mB7vC1nQ8hZ5jK0sD3fA6yE9uG2iM4oP7q=

OWNER_EMAIL=admin@treenity.local
OWNER_PASSWORD=DevLocal123!
OWNER_ORG_NAME=Treenity Dev
```

### 5.4 Renomear migrations (CLAUDE.md documenta: a cadeia fresca não sobe)

O `supabase start` tenta aplicar todas as migrations em ordem, mas a `0010` referencia `public.contacts` que só é criada mais tarde — quebra. O `baseline.sql` é o caminho correto para o banco fresco. Renomeia a pasta para tirar do caminho:

```powershell
Rename-Item supabase\migrations migrations.bak
```

### 5.5 Subir o stack Supabase local

```powershell
supabase start
```

Primeira vez baixa ~2 GB de imagens Docker (Postgres, Auth, Storage, Studio, Realtime). Sobe em `127.0.0.1:54321` (API), `54322` (Postgres), `54323` (Studio), `54324` (Mailpit).

### 5.6 Criar extensions e aplicar baseline

Extensions primeiro (o `drop schema public` do baseline mata as extensions que estão no schema — recriar antes de cada apply):

```powershell
docker exec supabase_db_deskcomm-crm psql -U postgres -d postgres -c 'create extension if not exists vector; create extension if not exists \"uuid-ossp\"; create extension if not exists pgcrypto; create extension if not exists citext; create extension if not exists pg_trgm; create extension if not exists btree_gin; create extension if not exists btree_gist; create extension if not exists unaccent;'
```

Copiar baseline pro container e aplicar dentro (o pipe do PowerShell corrompe UTF-8 e faz o md5 do baseline falhar — usa `docker cp` + `-f`):

```powershell
docker cp supabase\baseline.sql supabase_db_deskcomm-crm:/tmp/baseline.sql
docker exec supabase_db_deskcomm-crm psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/baseline.sql
```

Deve terminar sem `ERROR:`.

### 5.7 Criar o dono (bootstrap)

```powershell
pnpm tsx scripts/bootstrap-owner.ts
```

Cria user auth + organização + associação admin + platform_admin. Idempotente — pode rodar de novo.

### 5.8 Rodar o dev server

```powershell
pnpm dev
```

Abre em `http://localhost:3000`. Login com `admin@treenity.local` / `DevLocal123!`.

### 5.9 Comandos úteis do dia a dia

```powershell
supabase status        # confirma que containers estão up
supabase stop          # derruba tudo
supabase db reset      # zera o postgres (rerun 5.6 depois)

docker ps              # lista containers
docker logs supabase_db_deskcomm-crm --tail 50
```

Studio (visualiza tabelas): http://127.0.0.1:54323
Mailpit (e-mails locais como convites): http://127.0.0.1:54324

---

## 6. Comandos úteis (edição de front)

```bash
# Restaurar migrations pra rodar test:db
Rename-Item supabase\migrations.bak migrations

# Ver o estado das cores computadas
pnpm exec node tmp-screenshot.mjs

# Rodar suíte que provavelmente vai vermelhar
pnpm test:unit

# Reset visual completo (bg + accent volta ao que estava)
git diff app/globals.css
git checkout app/globals.css
```
