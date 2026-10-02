# Usuários e acessos no Treenity CRM

> Documento da Treenity. Explica **quem é quem**, **onde isso está no código** e
> **como implantar um cliente novo**. Quem mudar papéis ou menus atualiza este
> arquivo junto.

## Os três níveis

| Nível | Quem é | O que vê | Como existe no sistema |
|---|---|---|---|
| **Gestão Treenity** | a equipe da Treenity | **todas** as empresas: painel da plataforma, uso, auditoria, incidentes, Inbox de todas | administrador da **plataforma** (`platform_admins`) — fora das empresas |
| **Dono** | o cliente que contrata (ex.: Rodrigo, Loja Top Ultra) | tudo da **própria** empresa | papel `admin` da empresa + menu completo |
| **Funcionário** | a equipe do dono | só o dia a dia: Inbox, Respostas rápidas, Contatos, Tarefas | papel `agent` da empresa + menu reduzido |

Cada **cliente é uma empresa** (organização) no sistema. Os dados de uma nunca
aparecem na outra — isso é garantido pelo banco (RLS), não pela tela.

## Duas peças, duas funções

O DeskComm, base do Treenity CRM, separa duas coisas, e os papéis da Treenity
usam as duas:

1. **Papel do vínculo** (`viewer` < `agent` < `manager` < `admin`) — **autoriza**.
   Decide quais páginas abrem e quais ações a API aceita.
2. **Menu (interface) do vínculo** — **só organiza**. Decide o que aparece no
   menu da pessoa naquela empresa. Esconder uma tela do menu **não** tira a
   permissão; por isso o papel do funcionário é `agent`, e não `admin` com menu
   pequeno.

## Onde isso está no código

| O quê | Arquivo |
|---|---|
| **Definição dos papéis** (Dono, Funcionário) — a única fonte | `lib/treenity/papeis.ts` |
| Escolha do "Tipo de acesso" no convite e no cadastro | `components/team/TipoDeAcesso.tsx` |
| Troca de tipo de acesso na lista da Equipe | `hooks/team/useChangePapel.ts`, `app/app/team/_components/TeamMembersClient.tsx` |
| Como o menu é calculado (DeskComm) | `lib/navigation/interface.ts`, `lib/navigation/catalogo.ts` |
| Testes dos papéis | `tests/unit/treenity-papeis.test.ts` |

As rotas de API (`/api/v1/team/...`) continuam **genéricas** (papel + menu),
como no DeskComm. As regras da Treenity ficam só em `lib/treenity/`, para não se
misturarem com o DeskComm quando ele for atualizado.

### Mudar o que um papel vê

Edite `PAPEIS_DO_CLIENTE` em `lib/treenity/papeis.ts`. O teste
`treenity-papeis.test.ts` reprova se o menu de um papel tiver tela que o papel
não pode abrir. Quem **já** tem o papel não muda sozinho: o menu fica gravado no
vínculo de cada pessoa. Para aplicar o novo padrão a alguém, escolha o tipo de
acesso de novo na lista da Equipe.

### Criar um papel novo (ex.: Gerente)

Acrescente uma entrada em `PAPEIS_DO_CLIENTE` e em `ORDEM_DOS_PAPEIS`. As telas de
convite, cadastro e Equipe passam a oferecê-lo sem outra mudança.

## Gestão Treenity

É o **administrador da plataforma**, e não um papel dentro das empresas:

- vê o **Modo Plataforma** (menu da organização → "Gerenciar organizações");
- entra na empresa de um cliente pelo **"Acompanhar organização"** (suporte
  temporário: até 1 hora, só leitura ou com escrita, tudo registrado) — sem
  virar membro da equipe dele;
- **não** use o papel `manager` para a Treenity: ele vale para uma empresa só.

Uma conta **por pessoa** (a auditoria mostra quem fez o quê). A tela de
administradores da plataforma hoje só lista; para cadastrar, a pessoa cria a
conta normalmente e depois alguém roda no **Supabase do DeskComm**:

```sql
insert into platform_admins (user_id, granted_by, scope, mfa_required, reason)
select novo.id, quem.id, 'full', false, 'Gestão Treenity'
from auth.users novo, auth.users quem
where novo.email = 'EMAIL_DA_PESSOA_NOVA'
  and quem.email = 'EMAIL_DE_QUEM_JA_E_ADMIN';
```

Ao entrar, a conta da Gestão Treenity que não é membro de nenhuma empresa vai
direto para o painel da plataforma (`/admin`).

## Convite com o cadastro público fechado

O Supabase do DeskComm fica com "Allow new users to sign up" **desligado**, para
ninguém abrir empresa pela tela pública. O convite continua funcionando: quem
abre o link e clica em "Ainda não tenho conta" tem a conta criada por dentro
(já confirmada) e segue para "Aceitar convite". Sem convite, o cadastro segue
fechado.

O envio do convite por e-mail depende do Resend; sem ele, a tela da Equipe
mostra o link para copiar e mandar à pessoa (WhatsApp, por exemplo).

## Implantar um cliente novo (checklist)

1. **Gestão Treenity → Gerenciar organizações → Nova organização**: nome, e-mail
   do dono. O convite do dono sai como `admin` (Dono).
2. O dono aceita o convite e entra.
3. **Conexões → API Oficial (Meta)**: conectar o número do cliente.
4. **Treenity Bot → Automações**: endereço do n8n, gerar a chave, ligar
   respostas rápidas no bot, tarefas de pagamento e funil.
5. No n8n: credenciais com a chave do cliente.
6. **Equipe → Convidar**: o dono convida os funcionários com "Tipo de acesso:
   Funcionário".
7. Trocar a URL do webhook na Meta para o DeskComm e ligar o repasse.

## Decisões em aberto

- **Funcionário vê todas as conversas ou só as dele?** Hoje vê todas (padrão do
  DeskComm).
- **Empresa do Rodrigo:** a "Treenity - Teste" já tem o número real e as
  conversas dele; a ideia é renomeá-la para "Loja Top Ultra" e convidá-lo como
  Dono quando ele começar a usar. Depois disso, a conta `treenity@gmail.com` sai
  da equipe dele e a Treenity entra só pelo "Acompanhar organização".
- **Personalização pelo dono:** cada papel tem o menu padrão da Treenity (o
  "pronto"); a tela para o dono personalizar o próprio painel vem depois.
