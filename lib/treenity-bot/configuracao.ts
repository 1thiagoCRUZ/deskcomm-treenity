/**
 * Configuração por organização das automações do Treenity Bot (tarefas de
 * PIX e funil de leads) — vive em `organizations.settings.treenity_bot`, o
 * mesmo lugar (jsonb livre por org) onde o resto do produto guarda ajuste
 * fino por tenant (ex.: `settings.llm`, `settings.ai_dispatch_mode`).
 *
 * ⚠️ NUNCA variável de ambiente: são decisões de negócio que o CLIENTE muda
 * sozinho pela tela (ligar/desligar, desde quando, quantos dias sem resposta
 * até "perdido") — não configuração de deploy. Mexer nisso não pode depender
 * de alguém entrar no painel da Vercel.
 *
 * `desde` de cada automação é preenchido sozinho com "agora" na hora que ela
 * é ligada pela primeira vez (nunca escolhido às cegas) — evita que ligar o
 * recurso varra o histórico inteiro de uma vez. Depois disso, o campo fica
 * editável: é dado, não segredo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConfigDeTarefas {
  ativo: boolean;
  /** ISO — null enquanto nunca foi ligado. */
  desde: string | null;
}

export interface ConfigDeFunil {
  ativo: boolean;
  desde: string | null;
  perdidoDias: number;
}

/**
 * Respostas rápidas guardadas no Treenity Bot. Ligado, a tela de Respostas
 * rápidas e o `/` do Inbox leem e gravam na tabela que o bot lê, e
 * `message_templates` deixa de ser usada por esta organização. Por organização
 * porque a API do bot é uma só para a instalação inteira: sem este interruptor,
 * todas as organizações veriam e editariam as respostas do mesmo bot.
 */
export interface ConfigDeRespostas {
  ativo: boolean;
}

export interface ConfigDoTreenityBot {
  tarefas: ConfigDeTarefas;
  funil: ConfigDeFunil;
  respostas: ConfigDeRespostas;
}

const PERDIDO_DIAS_PADRAO = 7;

function numeroPositivo(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : padrao;
}
function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Lê e normaliza a config bruta (jsonb) — nunca confia no formato, sempre degrada pro padrão desligado. */
export function lerConfigDoTreenityBot(settingsBruto: unknown): ConfigDoTreenityBot {
  const raiz =
    settingsBruto && typeof settingsBruto === "object" && !Array.isArray(settingsBruto)
      ? (settingsBruto as Record<string, unknown>).treenity_bot
      : null;
  const bruto = raiz && typeof raiz === "object" && !Array.isArray(raiz) ? (raiz as Record<string, unknown>) : {};
  const tarefas = (bruto.tarefas ?? {}) as Record<string, unknown>;
  const funil = (bruto.funil ?? {}) as Record<string, unknown>;
  const respostas = (bruto.respostas ?? {}) as Record<string, unknown>;

  return {
    tarefas: { ativo: tarefas.ativo === true, desde: textoOuNulo(tarefas.desde) },
    funil: {
      ativo: funil.ativo === true,
      desde: textoOuNulo(funil.desde),
      perdidoDias: numeroPositivo(funil.perdido_dias, PERDIDO_DIAS_PADRAO),
    },
    respostas: { ativo: respostas.ativo === true },
  };
}

interface OrgComSettings {
  id: string;
  settings: unknown;
}

async function organizacoesAtivas(admin: SupabaseClient): Promise<OrgComSettings[]> {
  // Poucas dezenas de organizações no máximo (produto self-host) — trazer
  // todas e filtrar em memória é mais simples e mais robusto do que um filtro
  // de caminho jsonb aninhado no PostgREST, e não pesa em nada nessa escala.
  const { data } = await admin.from("organizations").select("id, settings").eq("status", "active");
  return (data ?? []) as OrgComSettings[];
}

export interface OrgComTarefasAtivas {
  orgId: string;
  desde: string;
}

/** Organizações com "tarefas de PIX" ligada e já com `desde` preenchido (auto, na ativação). */
export async function orgsComTarefasAtivas(admin: SupabaseClient): Promise<OrgComTarefasAtivas[]> {
  const orgs = await organizacoesAtivas(admin);
  const resultado: OrgComTarefasAtivas[] = [];
  for (const org of orgs) {
    const config = lerConfigDoTreenityBot(org.settings);
    if (config.tarefas.ativo && config.tarefas.desde) resultado.push({ orgId: org.id, desde: config.tarefas.desde });
  }
  return resultado;
}

export interface OrgComFunilAtivo {
  orgId: string;
  desde: string;
  perdidoDias: number;
}

/** Organizações com "funil de leads" ligado e já com `desde` preenchido. */
export async function orgsComFunilAtivo(admin: SupabaseClient): Promise<OrgComFunilAtivo[]> {
  const orgs = await organizacoesAtivas(admin);
  const resultado: OrgComFunilAtivo[] = [];
  for (const org of orgs) {
    const config = lerConfigDoTreenityBot(org.settings);
    if (config.funil.ativo && config.funil.desde) {
      resultado.push({ orgId: org.id, desde: config.funil.desde, perdidoDias: config.funil.perdidoDias });
    }
  }
  return resultado;
}
