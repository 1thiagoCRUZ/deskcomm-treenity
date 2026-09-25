/**
 * Cliente do Treenity Bot — SÓ roda no servidor (usa o segredo de SSO).
 *
 * Fluxo: trocamos e-mail/nome do usuário já autenticado aqui por um
 * accessToken válido na API do bot (`POST /api/auth/sso`), sem pedir senha de
 * novo — ver `n8n/README.md` e a seção "Integração externa (SSO)" do
 * `README.md` no repo do api-treenity-bot para o desenho completo.
 *
 * Quase tudo aqui é leitura. As escritas nos dados do bot são
 * `definirPagamentoDaVenda` (admin conclui a tarefa "Conferir pagamento PIX") e
 * as respostas rápidas (`criarRespostaNoBot` e vizinhas), que moram só lá.
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
  opcoes: { painelAdmin?: boolean } = {},
): Promise<{ accessToken: string; usuario: TreenityBotUsuario } | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.apiUrl}/api/auth/sso`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SSO-Secret": config.ssoSecret },
      // `painel_admin` só vai quando quem chama JÁ confirmou, no servidor, que a
      // pessoa é admin da organização (ver `carregarPainelAdmin` e a rota-ponte
      // `/api/treenity-bot/sso`, que passa a opção só para admin). Para quem não
      // é admin o token nunca leva essa permissão.
      body: JSON.stringify({
        email: usuario.email,
        nome: usuario.nome,
        ...(opcoes.painelAdmin ? { painel_admin: true } : {}),
      }),
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

/** Como `chamarApi`, mas devolve o JSON inteiro: as listas paginadas trazem `resumo` e cursor fora de `data`. */
async function chamarApiCompleta<T>(accessToken: string, path: string): Promise<T | null> {
  const config = getConfig();
  if (!config) return null;

  try {
    const res = await fetch(`${config.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? (json as T) : null;
  } catch {
    return null;
  }
}

function montarQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== "") query.set(chave, String(valor));
  }
  const texto = query.toString();
  return texto ? `?${texto}` : "";
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

// ─── Painel admin: vendas e lista de atendimentos ───────────────────────────
// Formato exato do que o bot devolve (ver README do api-treenity-bot). Estes
// tipos são importados como `import type` pelos componentes de cliente — só
// os tipos atravessam, o código deste arquivo nunca vai para o navegador.

export interface VendaPainel {
  id_venda: string;
  data_venda: string;
  cliente: string;
  cep: string | null;
  canal: string | null;
  /** Texto livre do pedido (ex.: "2x Smartphone Galáxia X10 Pro"). */
  itens: string;
  frete: number;
  total: number;
  valor_produtos: number;
  status: string;
  transportadora: string | null;
  cliente_detalhes: {
    id: string | null;
    nome: string;
    cep_padrao: string | null;
    id_face: string | null;
    resumo: string | null;
    cliente_desde: string | null;
  };
  atendimento_detalhes: {
    id: string | null;
    canal: string | null;
    status_funil: string | null;
    iniciado_em: string | null;
    qualidade_ia: number | null;
    categoria_feedback: string | null;
  };
}

export interface ResumoVendas {
  quantidade: number;
  faturamento_total: number;
  frete_total: number;
  valor_produtos_total: number;
  ticket_medio: number;
}

export interface PaginaDeVendas {
  itens: VendaPainel[];
  resumo: ResumoVendas;
  proximoCursor: string | null;
}

export interface FiltrosDeVendas {
  status?: string;
  canal?: string;
  /** `YYYY-MM-DD`, inclusivo. */
  desde?: string;
  /** `YYYY-MM-DD`, exclusivo. */
  ate?: string;
  cursor?: string;
  limit?: number;
}

export interface AtendimentoPainel {
  id: string;
  cliente: { id: string; nome: string | null; idFace: string } | null;
  canal: string | null;
  origem: string | null;
  statusFunil: string | null;
  qualidadeIa: number | null;
  categoriaFeedback: string | null;
  precisaAtencaoHumana: boolean;
  criadoEm: string | null;
  atualizadoEm: string | null;
  totalMensagens: number;
  ultimaMensagem: { remetente: string | null; formato: string | null; conteudo: string; enviadoEm: string | null } | null;
  venda: { quantidade: number; total: number } | null;
}

export interface PaginaDeAtendimentos {
  itens: AtendimentoPainel[];
  proximoCursor: string | null;
}

export interface FiltrosDeAtendimentos {
  canal?: string;
  etapa?: string;
  comVenda?: boolean;
  /** `YYYY-MM-DD` ou ISO, inclusivo — o bot filtra pela última atividade. */
  desde?: string;
  cursor?: string;
  limit?: number;
}

async function buscarPaginaDeVendas(accessToken: string, filtros: FiltrosDeVendas): Promise<PaginaDeVendas | null> {
  const resposta = await chamarApiCompleta<{
    data: VendaPainel[];
    resumo: ResumoVendas;
    proximo_cursor: string | null;
  }>(accessToken, `/api/dashboard/vendas${montarQuery({ ...filtros })}`);
  if (!resposta) return null;
  return { itens: resposta.data, resumo: resposta.resumo, proximoCursor: resposta.proximo_cursor };
}

async function buscarPaginaDeAtendimentos(
  accessToken: string,
  filtros: FiltrosDeAtendimentos,
): Promise<PaginaDeAtendimentos | null> {
  const { comVenda, ...resto } = filtros;
  const resposta = await chamarApiCompleta<{ data: AtendimentoPainel[]; proximoCursor: string | null }>(
    accessToken,
    `/api/atendimentos${montarQuery({ ...resto, com_venda: comVenda })}`,
  );
  if (!resposta) return null;
  return { itens: resposta.data, proximoCursor: resposta.proximoCursor };
}

/**
 * Vendas e atendimentos do painel admin.
 *
 * ⚠️ SÓ chame depois de confirmar, NO SERVIDOR, que a pessoa é admin da
 * organização (`roleAtLeast(role, "admin")`). É esta confirmação que vira a
 * claim `painelAdmin` no token do bot — o bot confia em quem tem o segredo de
 * SSO, então a decisão de "quem é admin" é toda daqui.
 */
export async function carregarPainelAdmin(
  usuario: { email: string; nome: string },
  filtros: { vendas?: FiltrosDeVendas; atendimentos?: FiltrosDeAtendimentos } = {},
): Promise<{ vendas: PaginaDeVendas | null; atendimentos: PaginaDeAtendimentos | null } | null> {
  const sessao = await trocarToken(usuario, { painelAdmin: true });
  if (!sessao) return null;

  const [vendas, atendimentos] = await Promise.all([
    buscarPaginaDeVendas(sessao.accessToken, filtros.vendas ?? {}),
    buscarPaginaDeAtendimentos(sessao.accessToken, filtros.atendimentos ?? {}),
  ]);
  return { vendas, atendimentos };
}

/** Uma página de vendas (filtros/cursor vindos da tela). Mesma regra de `carregarPainelAdmin`: só após checar admin. */
export async function carregarVendasTreenityBot(
  usuario: { email: string; nome: string },
  filtros: FiltrosDeVendas,
): Promise<PaginaDeVendas | null> {
  const sessao = await trocarToken(usuario, { painelAdmin: true });
  return sessao ? buscarPaginaDeVendas(sessao.accessToken, filtros) : null;
}

/** Uma página de atendimentos. Mesma regra de `carregarPainelAdmin`: só após checar admin. */
export async function carregarAtendimentosTreenityBot(
  usuario: { email: string; nome: string },
  filtros: FiltrosDeAtendimentos,
): Promise<PaginaDeAtendimentos | null> {
  const sessao = await trocarToken(usuario, { painelAdmin: true });
  return sessao ? buscarPaginaDeAtendimentos(sessao.accessToken, filtros) : null;
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

// ─── Pagamento das vendas (server-to-server, sem usuário) ────────────────────
// Estas duas chamadas usam SÓ o segredo de SSO — sem token de usuário — porque
// quem as dispara é o sincronizador de tarefas (cron ou rota de admin), e a
// decisão de "quem pode" já foi tomada aqui, no servidor, antes de chamar.

/** Vendas ainda "Aguardando Pagamento" criadas a partir de `desde`, mais recentes primeiro. `null` = bot indisponível. */
export async function listarVendasAguardandoPagamento(
  desde: string,
  cursor?: string | null,
): Promise<{ itens: VendaPainel[]; proximoCursor: string | null } | null> {
  const config = getConfig();
  if (!config) return null;
  try {
    const res = await fetch(
      `${config.apiUrl}/api/vendas/aguardando-pagamento${montarQuery({ desde, cursor, limit: 100 })}`,
      { headers: { "X-SSO-Secret": config.ssoSecret }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    return { itens: json.data as VendaPainel[], proximoCursor: (json.proximo_cursor as string | null) ?? null };
  } catch {
    return null;
  }
}

/**
 * Marca a venda como paga (ou desfaz). Só chame depois de confirmar, no
 * servidor, que quem concluiu a tarefa é admin. Idempotente no bot. Devolve `false` se o bot não confirmou (fora do ar,
 * venda inexistente…) — quem chama decide se tenta de novo.
 */
export async function definirPagamentoDaVenda(
  idVenda: string,
  pagamento: { pago: true; confirmadoPor: string } | { pago: false },
): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  try {
    const res = await fetch(`${config.apiUrl}/api/vendas/${encodeURIComponent(idVenda)}/pagamento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SSO-Secret": config.ssoSecret },
      body: JSON.stringify(
        pagamento.pago ? { pago: true, confirmado_por: pagamento.confirmadoPor } : { pago: false },
      ),
      cache: "no-store",
    });
    if (!res.ok) return false;
    return (await res.json())?.success === true;
  } catch {
    return false;
  }
}

/**
 * A API do bot roda no Render gratuito, que "dorme" sem uso e leva dezenas de
 * segundos para acordar. Sem teto, abrir ou salvar uma resposta rápida ficaria
 * pendurado esse tempo todo; com ele, falha rápido e a tela avisa.
 */
const TEMPO_MAXIMO_DAS_RESPOSTAS_MS = 20_000;

/** Uma linha de `respostas_rapidas`, no formato da API do bot. */
export interface RespostaDoBot {
  id: number;
  titulo: string;
  corpo: string;
  /** O que a equipe digita depois da barra no Inbox. Sem a barra. */
  atalho: string | null;
  gatilhos: string[];
  contexto: "abertura" | "qualquer";
  max_chars_msg: number;
  /** O bot responde sozinho quando a mensagem do cliente contém um gatilho. */
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** Os campos que o deskcomm grava. Numa edição, campo ausente não muda. */
export interface CamposDaRespostaNoBot {
  titulo: string;
  corpo: string;
  atalho: string | null;
  gatilhos: string[];
  contexto: "abertura" | "qualquer";
  max_chars_msg: number;
  ativo: boolean;
}

export type ResultadoNoBot<T> =
  | { ok: true; dados: T }
  /** `status` é o HTTP da API do bot; 0 = não respondeu (fora do ar, tempo esgotado). */
  | { ok: false; status: number; erro: string | null };

/**
 * Uma chamada às rotas `/api/respostas-rapidas` do bot. É a tabela que o n8n
 * lê: o deskcomm não guarda cópia nenhuma, então tudo o que a tela mostra ou
 * grava passa por aqui.
 */
async function chamarRespostas<T>(
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  caminho: string,
  corpo?: unknown,
): Promise<ResultadoNoBot<T>> {
  const config = getConfig();
  if (!config) return { ok: false, status: 0, erro: null };
  try {
    const res = await fetch(`${config.apiUrl}/api/respostas-rapidas${caminho}`, {
      method: metodo,
      headers: {
        "X-SSO-Secret": config.ssoSecret,
        ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_MAXIMO_DAS_RESPOSTAS_MS),
    });
    if (res.status === 204) return { ok: true, dados: undefined as T };
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.success !== true) {
      return { ok: false, status: res.status, erro: typeof json?.error === "string" ? json.error : null };
    }
    return { ok: true, dados: json.data as T };
  } catch {
    return { ok: false, status: 0, erro: null };
  }
}

export function listarRespostasDoBot(): Promise<ResultadoNoBot<RespostaDoBot[]>> {
  return chamarRespostas("GET", "");
}

export function criarRespostaNoBot(campos: CamposDaRespostaNoBot): Promise<ResultadoNoBot<RespostaDoBot>> {
  return chamarRespostas("POST", "", campos);
}

export function atualizarRespostaNoBot(
  id: number,
  campos: Partial<CamposDaRespostaNoBot>,
): Promise<ResultadoNoBot<RespostaDoBot>> {
  return chamarRespostas("PATCH", `/${id}`, campos);
}

export function apagarRespostaDoBot(id: number): Promise<ResultadoNoBot<void>> {
  return chamarRespostas("DELETE", `/${id}`);
}
