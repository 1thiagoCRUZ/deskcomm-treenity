/**
 * Cliente do Treenity Bot — SÓ roda no servidor (usa o segredo de SSO).
 *
 * Fluxo: trocamos e-mail/nome do usuário já autenticado aqui por um
 * accessToken válido na API do bot (`POST /api/auth/sso`), sem pedir senha de
 * novo — ver `n8n/README.md` e a seção "Integração externa (SSO)" do
 * `README.md` no repo do api-treenity-bot para o desenho completo.
 *
 * Tudo aqui é leitura. Nenhuma mutação nos dados do bot acontece pelo
 * deskcomm nesta primeira fatia.
 */

import { getConfig } from "./config";

export interface TreenityBotUsuario {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "funcionario";
}

/**
 * Exportada (além de usada internamente aqui) porque a rota de chat interno
 * (`app/api/treenity-bot/sso/route.ts`) também precisa trocar a identidade do
 * usuário logado por um accessToken, sem duplicar essa chamada.
 */
export async function trocarToken(
  usuario: { email: string; nome: string },
): Promise<{ accessToken: string; usuario: TreenityBotUsuario } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.apiUrl}/api/auth/sso`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SSO-Secret": config.ssoSecret },
      body: JSON.stringify({ email: usuario.email, nome: usuario.nome }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    return { accessToken: json.data.accessToken as string, usuario: json.data.usuario as TreenityBotUsuario };
  } catch {
    // API do bot fora do ar/inalcançável — degrada para "sem dado", nunca 500 na tela.
    return null;
  }
}

async function chamarApi<T>(accessToken: string, path: string): Promise<T | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json.data as T) : null;
  } catch {
    return null;
  }
}

export interface DashboardMetrica {
  data_referencia: string;
  total_clientes: number;
  total_atendimentos: number;
  faturamento_total: number;
  atualizado_em: string;
}

export interface AtendimentoSinalizado {
  id: string;
  clienteId: string;
  clienteNome: string;
  idFace: string;
  canal: string | null;
  motivoAtencao: string | null;
  atencaoSinalizadaEm: string | null;
}

export interface TreenityBotDados {
  usuario: TreenityBotUsuario;
  metricas: DashboardMetrica[];
  sinalizados: AtendimentoSinalizado[];
}

/**
 * Ponto de entrada único da página: faz o SSO e busca tudo que a tela precisa
 * numa passada. `null` = integração não configurada ou API do bot inalcançável
 * (a página decide o que mostrar em cada caso, não este módulo).
 */
export async function carregarDadosTreenityBot(usuario: {
  email: string;
  nome: string;
}): Promise<TreenityBotDados | null> {
  const config = getConfig();
  if (!config) return null;

  const sessao = await trocarToken(usuario);
  if (!sessao) return null;

  const [metricas, sinalizados] = await Promise.all([
    chamarApi<DashboardMetrica[]>(sessao.accessToken, "/api/dashboard"),
    chamarApi<AtendimentoSinalizado[]>(sessao.accessToken, "/api/atendimentos/sinalizados"),
  ]);

  return {
    usuario: sessao.usuario,
    metricas: metricas ?? [],
    sinalizados: sinalizados ?? [],
  };
}

export interface AtendimentoDetalhe {
  id: string;
  clienteId: string;
  clienteNome: string;
  idFace: string;
  canal: string | null;
  statusFunil: string | null;
  precisaAtencaoHumana: boolean;
  motivoAtencao: string | null;
  atencaoSinalizadaEm: string | null;
}

export interface MensagemAtendimento {
  id: string;
  atendimentoId: string;
  remetente: "cliente" | "ia" | string;
  conteudo: string;
  enviadoEm: string;
  formato: string | null;
}

export interface ConversaTreenityBot {
  atendimento: AtendimentoDetalhe;
  mensagens: MensagemAtendimento[];
}

/**
 * Transcrição de UM atendimento — é o destino do clique em cada linha de
 * "precisando de atenção" na tela principal.
 */
export async function carregarConversaTreenityBot(
  usuario: { email: string; nome: string },
  atendimentoId: string,
): Promise<ConversaTreenityBot | null> {
  const sessao = await trocarToken(usuario);
  if (!sessao) return null;

  return chamarApi<ConversaTreenityBot>(
    sessao.accessToken,
    `/api/atendimentos/${encodeURIComponent(atendimentoId)}/mensagens`,
  );
}
