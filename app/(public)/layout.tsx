import { logoEhSoSimbolo } from "@/lib/branding";
import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

/**
 * A casca das telas de acesso — login, cadastro, recuperação, MFA.
 *
 * ── Por que o LOGO mora aqui, e não em `login/page.tsx` ───────────────────────
 *
 * São seis telas no grupo `(public)`, e todas são "antes de entrar": quem instala
 * o produto para clientes mostra a marca dele exatamente aí. Um `<img>` por
 * página seriam seis cópias que divergem na primeira vez que alguém mexer numa
 * só — e a que ficaria para trás é sempre a que ninguém abre (recuperação de
 * senha, cadastro de MFA), que é justamente onde o cliente do revendedor
 * aparece sozinho e sem contexto.
 *
 * ── Por que `marcaDaSaida(null)` ──────────────────────────────────────────────
 *
 * Aqui não existe organização resolvida: `null` é a declaração disso, e a pilha
 * resultante é a mesma do layout raiz (banco acima, `.env` embaixo). Montar a
 * pilha à mão nesta tela faria a fachada anunciar uma precedência que o resto do
 * produto não usa. E `marcaDaSaida` NUNCA lança (ver o cabeçalho dela): uma cor
 * ou um logo mal gravados não podem derrubar a única tela por onde se entra para
 * corrigi-los.
 *
 * O NOME continua saindo de `branding()` dentro de cada página — não é descuido,
 * está medido em `tests/e2e/icone-da-marca.spec.ts:64-77`: aquela spec cruza duas
 * resoluções independentes (o título da aba, que lê o banco, contra o texto sob
 * o "Entrar", que lê o `.env`). Trocar o texto para este mesmo resolvedor
 * deixaria a spec verde medindo nada.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const marca = await marcaDaSaida(null);
  // A maioria destas telas roda ANTES do login (não há usuário nenhum), mas
  // duas — `/login/mfa` e, em parte, `/login/recovery` — rodam com uma sessão
  // parcial já criada (primeiro fator verificado, segundo pendente). Onde há
  // sessão, o idioma salvo no perfil vale; sem ela, `IdiomaProvider` já cai no
  // padrão pt-BR sozinho (ver o cabeçalho do provider) — nunca lança.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = (user?.user_metadata?.locale as string | undefined) ?? null;

  return (
    <IdiomaProvider locale={locale}>
      <div
        data-theme="light"
        className="grid min-h-screen grid-cols-1 bg-background text-text lg:grid-cols-2"
      >
        <div className="flex min-h-screen flex-col bg-surface text-text">
          <div className="flex items-center gap-2 px-8 pt-8 lg:px-12">
            {marca.logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  data-testid="logo-da-fachada"
                  src={marca.logoUrl}
                  alt={logoEhSoSimbolo(marca.logoUrl) ? "" : marca.nome}
                  className="h-8 w-auto max-w-[10rem] object-contain"
                />
                {logoEhSoSimbolo(marca.logoUrl) && (
                  <span className="text-lg font-semibold tracking-tight text-text">
                    {marca.nome}
                  </span>
                )}
              </>
            )}
            {!marca.logoUrl && (
              <span className="text-base font-semibold tracking-tight text-text">
                {marca.nome}
              </span>
            )}
          </div>
          <div className="flex flex-1 items-center px-8 lg:px-12">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </div>

        <aside
          aria-hidden
          className="relative hidden overflow-hidden bg-[#26292F] lg:block"
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 800 1000"
            preserveAspectRatio="xMidYMid slice"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="base-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2a2d34" />
                <stop offset="100%" stopColor="#161820" />
              </linearGradient>
              <linearGradient id="cloud-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3d424c" />
                <stop offset="100%" stopColor="#2a2d34" />
              </linearGradient>
              <linearGradient id="cloud-grad-2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#495060" />
                <stop offset="100%" stopColor="#2f333d" />
              </linearGradient>
              <linearGradient id="blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B64DE" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#3B64DE" stopOpacity="0" />
              </linearGradient>
              <filter id="edge-soft" x="-5%" y="-5%" width="110%" height="110%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="60" />
              </filter>
            </defs>

            <rect width="800" height="1000" fill="url(#base-grad)" />

            <circle cx="700" cy="150" r="220" fill="#3B64DE" filter="url(#glow)" opacity="0.28" />
            <circle cx="120" cy="850" r="180" fill="#3B64DE" filter="url(#glow)" opacity="0.22" />

            <path
              d="M -80 -50 C 150 40, 320 -20, 460 100 C 560 200, 480 320, 340 340 C 200 360, 60 320, -60 240 C -140 180, -160 60, -80 -50 Z"
              fill="url(#cloud-grad-1)"
              filter="url(#edge-soft)"
            />
            <path
              d="M 20 -30 C 180 20, 300 30, 380 100 C 380 60, 260 -10, 100 -30 Z"
              fill="url(#cloud-grad-2)"
              filter="url(#edge-soft)"
              opacity="0.7"
            />
            <path
              d="M 480 400 C 640 360, 800 460, 850 580 C 900 700, 780 760, 620 740 C 460 720, 380 620, 400 500 C 410 450, 440 410, 480 400 Z"
              fill="url(#cloud-grad-1)"
              filter="url(#edge-soft)"
              opacity="0.85"
            />
            <path
              d="M -100 720 C 100 660, 300 780, 480 720 C 660 660, 800 780, 950 720 L 950 1100 L -100 1100 Z"
              fill="#1e2028"
              filter="url(#edge-soft)"
            />

            <g opacity="0.06" stroke="#ffffff" strokeWidth="1" fill="none">
              <path d="M 0 200 C 200 180, 400 220, 800 200" />
              <path d="M 0 400 C 200 380, 400 420, 800 400" />
              <path d="M 0 600 C 200 580, 400 620, 800 600" />
              <path d="M 200 0 C 180 200, 220 400, 200 800" />
              <path d="M 500 0 C 480 200, 520 400, 500 800" />
            </g>
          </svg>

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.5) 100%)",
            }}
          />

          <div className="relative z-10 flex h-full items-center px-12 text-white">
            <div className="max-w-md space-y-3">
              <h2 className="text-3xl font-semibold leading-tight">
                Seu atendimento em um só lugar.
              </h2>
              <p className="text-sm text-white/70">
                CRM inteligente, WhatsApp nativo e IA que trabalha o funil junto
                com seu time.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </IdiomaProvider>
  );
}
