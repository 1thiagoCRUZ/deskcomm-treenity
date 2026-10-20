# Relógio no Vercel Hobby (follow-up não fica preso)

## Por que existe

No plano Hobby a Vercel só agenda **1 cron por dia**. Sem um relógio externo:

1. o lead responde "SIM" no WhatsApp;
2. a mensagem entra no banco (inbox OK);
3. o enrollment fica em `waiting_reply` / `cap_nome` para sempre.

O endpoint `POST /api/v1/system/relogio/tick` drena eventos, aplica respostas
inbound nos follow-ups e envia textos fixos pendentes. Quem precisa chamar
esse endpoint a cada poucos minutos é um **cron de fora** — grátis.

## Pré-requisito: um só deploy no domínio do WAHA

O webhook WAHA tem que bater no **mesmo** deployment que a UI/`webhooks/in`.

```bash
# Ver para onde o domínio aponta hoje
npx vercel alias ls | findstr /i "crm-gabrielle deskcomm-crm"

# Se ainda apontar para um deploy CLI antigo, reaponte para o da branch develop:
npx vercel alias set <url-do-deploy-develop> crm-gabrielle.vercel.app
```

Confirme nos logs: `POST /api/v1/webhooks/waha` e `POST /api/v1/webhooks/in`
devem compartilhar o **mesmo** `dep=dpl_…`.

## Opção A — GitHub Actions (grátis em repo público)

Arquivo: [`.github/workflows/relogio.yml`](../../.github/workflows/relogio.yml).

**Limitação:** o `schedule:` do Actions **só roda na branch default (`main`)**.
Se o workflow existir só em `develop`, o cron **nunca** dispara.

### Ligar

1. Mergeie `.github/workflows/relogio.yml` em `main` (ou copie o arquivo).
2. No GitHub do **seu** fork/instalação → Settings → Secrets and variables:

| Tipo | Nome | Valor |
|------|------|--------|
| Variable | `RELOGIO_LIGADO` | `1` |
| Secret | `RELOGIO_APP_URL` | `https://crm-gabrielle.vercel.app` (sem barra no fim) |
| Secret | `RELOGIO_SECRET` | o mesmo `INTERNAL_SECRET` do projeto na Vercel |

3. Actions → **relogio** → Run workflow (teste manual).
4. Espere o schedule `*/5` (o GitHub atrasa; 5–15 min é normal).

```bash
# Via CLI (com permissão de secrets no repo)
gh variable set RELOGIO_LIGADO -R SEU_USER/DeskcommCRM -b 1
gh secret set RELOGIO_APP_URL -R SEU_USER/DeskcommCRM -b "https://crm-gabrielle.vercel.app"
gh secret set RELOGIO_SECRET -R SEU_USER/DeskcommCRM -b "$INTERNAL_SECRET"
```

## Opção B — cron-job.org (grátis, a cada 1 minuto)

Melhor latência que o Actions. Conta free permite job a cada minuto.

1. Crie conta em [https://cron-job.org](https://cron-job.org).
2. Create cronjob:
   - **URL:** `https://crm-gabrielle.vercel.app/api/v1/system/relogio/tick`
   - **Schedule:** every 1 minute
   - **Request method:** POST
   - **Header:** `Authorization` = `Bearer <INTERNAL_SECRET>`
3. Enable e rode "Execute now".

O curl equivalente:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $INTERNAL_SECRET" \
  "https://crm-gabrielle.vercel.app/api/v1/system/relogio/tick"
```

## Como saber que está funcionando

Nos logs da Vercel (produção), a cada batida:

- `POST /api/v1/system/relogio/tick` → 200
- quando há "SIM" preso: `[relogio] follow-up avancou por resposta inbound`

Na fila de follow-ups, o status sai de **Aguardando resposta**.

## O que o tick faz (ordem)

1. `event-log-drain` — consome `message.received` (reatividade do follow-up)
2. `followup-flow-worker` — aplica texto inbound + claim de enrollments + envio fixo
3. `routing-worker`
4. `recover-stuck-messages`

### Tarefas diárias (só na janela das 03h20–03h59, horário de São Paulo)

O tick bate a cada ~5 min; estas duas só rodam quando a hora local de
`America/Sao_Paulo` é 3 e o minuto está entre 20 e 59 (`ehJanelaDiaria`). A
janela evita o começo da hora (06h00 UTC), quando o GitHub mais atrasa ou
descarta schedules. As tarefas são idempotentes e em lotes, e rodada vazia não
audita. Rodam depois das tarefas de minuto, com prazo de 40 s dentro do tick
(limite de 60 s); o que sobrar continua na batida seguinte.

Se o GitHub pular a janela inteira, o dia seguinte compensa (a poda é por idade
e a fila de mídia continua pendente). Para rodar à mão:

```bash
curl -fsS -H "Authorization: Bearer $INTERNAL_SECRET" "https://SEU-DOMINIO/api/v1/cron/data-retention"
curl -fsS -H "Authorization: Bearer $INTERNAL_SECRET" "https://SEU-DOMINIO/api/v1/cron/storage-redaction"
```

5. `data-retention` — poda `job_queue` (90 dias), `api_audit_log` (1825 dias),
   espelho da agenda (90 dias) e nonces de OAuth (1 dia), e completa as
   anonimizações LGPD incompletas (`varrerRedacoesIncompletas`). Mesma lógica da
   rota `/api/v1/cron/data-retention`.
6. `storage-redaction` — esvazia a fila de mídia a apagar após anonimização
   (até 200 arquivos por rodada). Mesma lógica de `/api/v1/cron/storage-redaction`.

**Se o relógio estiver desligado** (`RELOGIO_LIGADO` != `1`), nada disso roda.

Definição canônica: `lib/relogio/tarefas.ts` + `lib/relogio/executar.ts` (guarda de horário em `lib/relogio/janela-diaria.ts`).
