/**
 * WhatsApp do Treenity Bot passando pelo DeskComm — o que faz o Inbox ver as
 * conversas que o bot atende.
 *
 * ─── O desenho ──────────────────────────────────────────────────────────────
 *
 *   Cliente ─► Meta ─► DeskComm (grava no Inbox) ─► n8n, na hora ─► CADU
 *                                                                     │
 *   Inbox ◄── DeskComm grava a resposta ◄── DeskComm envia à Meta ◄───┘
 *
 * A Meta só entrega o webhook de um número em UM lugar. Antes, esse lugar era o
 * n8n, e o Inbox ficava vazio. Agora é o DeskComm, que faz duas coisas:
 *
 * 1. **Repasse (entrada).** Depois de gravar a mensagem, reenvia ao n8n o MESMO
 *    corpo que a Meta mandou, com a mesma assinatura. O `[Webhook] | WhatsApp`
 *    do n8n não percebe diferença nenhuma — o Roteador lê o mesmo JSON.
 *    Não passa pela fila de automações (`chegou mensagem → chamar webhook`):
 *    ela esvazia a cada 5 a 15 minutos na Vercel, e o bot responde em segundos.
 *
 * 2. **Envio (saída).** O n8n passa a mandar as respostas para uma rota do
 *    DeskComm com o MESMO formato da Graph API (`/{versao}/{phone_number_id}/messages`).
 *    O DeskComm envia à Meta com a credencial do canal e grava a mensagem no
 *    Inbox. No n8n, muda só o endereço e a credencial de cada nó de envio.
 *
 * ─── O bot fica quieto quando a equipe assume ───────────────────────────────
 *
 * O repasse respeita o silêncio que o DeskComm já tem por conversa:
 * `conversations.bot_silenced_until` (gravado por Assumir e Pausar IA, e por 5
 * minutos a cada resposta da equipe) e `contacts.force_human`. Com a conversa
 * calada, a mensagem entra no Inbox e NÃO vai ao n8n. "Reativar bot" limpa os
 * dois, e o bot volta a responder.
 *
 * ─── Configuração por organização ───────────────────────────────────────────
 *
 * Vive em `organizations.settings.treenity_bot.whatsapp`, como as outras
 * automações do Treenity Bot (ver `configuracao.ts`). A chave que o n8n usa é
 * guardada só como hash; o texto dela aparece uma vez, quando é gerada.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { logger } from "@/lib/logger";

export interface ConfigDoWhatsApp {
  /** Repassar as mensagens recebidas ao n8n. */
  ativo: boolean;
  /** Endereço do `[Webhook] | WhatsApp` no n8n (POST). */
  urlN8n: string | null;
  /** sha256 (hex) da chave que o n8n usa para enviar pelo DeskComm. */
  chaveHash: string | null;
  /** ISO — quando a chave atual foi gerada. Só para a tela. */
  chaveCriadaEm: string | null;
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Lê o pedaço `whatsapp` de `settings.treenity_bot` — sempre degrada para desligado. */
export function lerConfigDoWhatsApp(treenityBotBruto: unknown): ConfigDoWhatsApp {
  const raiz =
    treenityBotBruto && typeof treenityBotBruto === "object" && !Array.isArray(treenityBotBruto)
      ? (treenityBotBruto as Record<string, unknown>).whatsapp
      : null;
  const w = raiz && typeof raiz === "object" && !Array.isArray(raiz) ? (raiz as Record<string, unknown>) : {};
  return {
    ativo: w.ativo === true,
    urlN8n: textoOuNulo(w.url_n8n),
    chaveHash: textoOuNulo(w.chave_hash),
    chaveCriadaEm: textoOuNulo(w.chave_criada_em),
  };
}

/** Formato gravado no jsonb (snake_case, como o resto de `settings`). */
export function gravarConfigDoWhatsApp(c: ConfigDoWhatsApp): Record<string, unknown> {
  return {
    ativo: c.ativo,
    url_n8n: c.urlN8n,
    chave_hash: c.chaveHash,
    chave_criada_em: c.chaveCriadaEm,
  };
}

// ─── A chave do n8n ─────────────────────────────────────────────────────────

const PREFIXO_DA_CHAVE = "tbw_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

/**
 * `tbw_<organização>_<segredo>`. A organização vai no texto para a rota achar
 * de quem é a chave sem varrer todas as organizações; quem decide se ela vale
 * é o hash guardado nessa organização.
 */
export function gerarChave(organizationId: string): { chave: string; hash: string } {
  const chave = `${PREFIXO_DA_CHAVE}${organizationId}_${randomBytes(32).toString("base64url")}`;
  return { chave, hash: hashDaChave(chave) };
}

/** Organização que a chave diz ser. `null` quando o formato não confere. */
export function organizacaoDaChave(chave: string): string | null {
  if (!chave.startsWith(PREFIXO_DA_CHAVE)) return null;
  const resto = chave.slice(PREFIXO_DA_CHAVE.length);
  const org = resto.slice(0, 36);
  if (!UUID.test(org) || resto[36] !== "_" || resto.length < 38) return null;
  return org.toLowerCase();
}

/** Compara em tempo constante: a chave vem de fora. */
export function chaveConfere(chave: string, hashGuardado: string | null): boolean {
  if (!hashGuardado) return false;
  const a = Buffer.from(hashDaChave(chave), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tira o `Bearer ` do cabeçalho. */
export function chaveDoCabecalho(authorization: string | null): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return m?.[1] ?? null;
}

// ─── O repasse ao n8n ───────────────────────────────────────────────────────

/** Postgres devolve o silêncio permanente como o texto "infinity". */
export function conversaCalada(
  botSilencedUntil: string | null,
  forceHuman: boolean | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (forceHuman) return true;
  if (!botSilencedUntil) return false;
  if (botSilencedUntil === "infinity") return true;
  const ate = new Date(botSilencedUntil);
  return !Number.isNaN(ate.getTime()) && ate > agora;
}

export type DesfechoDoRepasse =
  | "desligado"
  | "sem_mensagem"
  | "calado"
  | "repassado"
  | "falhou";

export interface PedidoDeRepasse {
  organizationId: string;
  /** O corpo EXATO que a Meta mandou — a assinatura só confere com ele. */
  corpoBruto: string;
  /** `x-hub-signature-256` da Meta, reenviado sem mudança. */
  assinatura: string | null;
  /**
   * Uma entrada por mensagem de cliente do corpo: a conversa onde ela foi
   * gravada, ou `null` quando a gravação falhou. Reentregas da Meta
   * (`duplicate`) NÃO entram: o n8n já recebeu a primeira.
   */
  conversas: (string | null)[];
}

const TEMPO_MAXIMO_MS = 8_000;

/**
 * Reenvia o webhook ao n8n. Nunca lança: a mensagem já está gravada, e a rota
 * da Meta responde 200 de qualquer jeito (senão a Meta reentrega em loop).
 *
 * Falha para o lado do BOT: mensagem que não foi gravada no Inbox é repassada
 * mesmo assim — o cliente ser respondido vale mais que a conversa aparecer.
 */
export async function repassarAoBot(
  admin: SupabaseClient,
  pedido: PedidoDeRepasse,
): Promise<DesfechoDoRepasse> {
  try {
    return await repassar(admin, pedido);
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] repasse ao n8n falhou", {
      organization_id: pedido.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return "falhou";
  }
}

async function repassar(admin: SupabaseClient, pedido: PedidoDeRepasse): Promise<DesfechoDoRepasse> {
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", pedido.organizationId)
    .maybeSingle();
  const settings = (org?.settings ?? null) as Record<string, unknown> | null;
  const config = lerConfigDoWhatsApp(settings?.treenity_bot ?? null);
  if (!config.ativo || !config.urlN8n) return "desligado";
  if (pedido.conversas.length === 0) return "sem_mensagem";

  const gravadas = pedido.conversas.filter((c): c is string => c !== null);
  const algumaSemConversa = gravadas.length < pedido.conversas.length;
  if (!algumaSemConversa) {
    const { data: linhas, error } = await admin
      .from("conversations")
      .select("id, bot_silenced_until, contacts:contact_id(force_human)")
      .eq("organization_id", pedido.organizationId)
      .in("id", gravadas);
    // Sem conseguir ler o silêncio, repassa: o n8n ainda tem o próprio gate
    // (`precisa_atencao_humana`), e bot mudo por erro nosso é o pior desfecho.
    if (!error && linhas && linhas.length === gravadas.length) {
      const todasCaladas = linhas.every((l) => {
        const linha = l as unknown as {
          bot_silenced_until: string | null;
          contacts: { force_human: boolean | null } | null;
        };
        return conversaCalada(linha.bot_silenced_until, linha.contacts?.force_human);
      });
      if (todasCaladas) return "calado";
    }
  }

  const res = await fetch(config.urlN8n, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(pedido.assinatura ? { "x-hub-signature-256": pedido.assinatura } : {}),
      "x-deskcomm-repasse": "1",
    },
    body: pedido.corpoBruto,
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  });
  if (!res.ok) {
    logger.error("[treenity-bot.whatsapp] n8n recusou o repasse", {
      organization_id: pedido.organizationId,
      status: res.status,
    });
    return "falhou";
  }
  return "repassado";
}

// ─── O que o bot enviou, do jeito que o Inbox mostra ────────────────────────

export interface MensagemDoBot {
  type: "text" | "image" | "audio" | "video" | "document" | "template";
  body: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
}

const TIPOS_DE_MIDIA = ["image", "audio", "video", "document"] as const;

/**
 * Traduz o corpo da Graph API para uma linha de `messages`. `null` quando o
 * tipo não é algo que o Inbox saiba mostrar (reação, "digitando"...): a
 * mensagem é enviada do mesmo jeito, só não vira linha.
 */
export function mensagemDoCorpo(corpo: Record<string, unknown>): MensagemDoBot | null {
  const tipo = typeof corpo.type === "string" ? corpo.type : "text";
  if (tipo === "text") {
    const text = corpo.text as { body?: unknown } | undefined;
    const body = typeof text?.body === "string" ? text.body : "";
    return { type: "text", body, mediaUrl: null, mediaMime: null };
  }
  if ((TIPOS_DE_MIDIA as readonly string[]).includes(tipo)) {
    const m = corpo[tipo] as { link?: unknown; caption?: unknown } | undefined;
    return {
      type: tipo as MensagemDoBot["type"],
      body: typeof m?.caption === "string" && m.caption.length > 0 ? m.caption : null,
      mediaUrl: typeof m?.link === "string" ? m.link : null,
      mediaMime: null,
    };
  }
  if (tipo === "template") {
    const t = corpo.template as { name?: unknown } | undefined;
    return {
      type: "template",
      body: typeof t?.name === "string" ? `[modelo: ${t.name}]` : "[modelo]",
      mediaUrl: null,
      mediaMime: null,
    };
  }
  return null;
}

/** Prévia curta da lista de conversas — mesmo espírito da ingestão. */
export function previaDaMensagem(m: MensagemDoBot): string {
  if (m.type === "text") return (m.body ?? "").slice(0, 120);
  if (m.type === "audio") return "🎵 Áudio";
  if (m.type === "image") return "📷 Imagem";
  if (m.type === "video") return "🎬 Vídeo";
  if (m.type === "document") return "📎 Documento";
  return m.body ?? "[modelo]";
}

// ─── Quem chama de fora (n8n, API do bot) ───────────────────────────────────

/**
 * Organização dona da chave do cabeçalho `Authorization`, ou `null` quando a
 * chave falta, tem outro formato ou não confere com o hash guardado. É a única
 * porta das rotas que o n8n e a API do bot chamam sem sessão.
 */
export async function organizacaoPelaChave(
  admin: SupabaseClient,
  authorization: string | null,
): Promise<{ organizationId: string; config: ConfigDoWhatsApp } | null> {
  const chave = chaveDoCabecalho(authorization);
  const organizationId = chave ? organizacaoDaChave(chave) : null;
  if (!chave || !organizationId) return null;
  const { data: org } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  const settings = (org?.settings ?? null) as Record<string, unknown> | null;
  const config = lerConfigDoWhatsApp(settings?.treenity_bot ?? null);
  return chaveConfere(chave, config.chaveHash) ? { organizationId, config } : null;
}

/**
 * O CADU atende pelo Inbox desta organização? Conta como "atendimento
 * automático" para a tela: sem isto, uma organização que usa só o bot (nenhum
 * agente próprio do DeskComm) veria as conversas do bot como "ninguém
 * atendendo", e a Fila juntaria conversas que o bot está respondendo.
 */
export function botDoTreenityAtende(settings: unknown): boolean {
  const s = settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : null;
  return lerConfigDoWhatsApp(s?.treenity_bot ?? null).ativo;
}

// ─── O bot chamou o especialista ────────────────────────────────────────────

export type DesfechoDoPedidoDeAjuda = "marcada" | "sem_contato" | "sem_conversa";

/** Quanto do motivo do bot cabe no campo (ele aparece na tela). */
const TAMANHO_DO_MOTIVO = 300;

/**
 * Leva ao Inbox o "chamar especialista" do bot: a conversa do cliente fica com
 * o automático calado (`bot_silenced_until = infinity`, o mesmo literal de
 * Assumir) e sem dono — é o estado "aguardando", que é a Fila. Quem assumir ou
 * clicar em "Reativar bot" decide dali em diante.
 *
 * O `id_face` é o número como a Meta o manda (sem `+`, às vezes sem o nono
 * dígito); a busca do contato já cobre as duas grafias.
 */
export async function marcarPediuAjuda(
  admin: SupabaseClient,
  pedido: { organizationId: string; idFace: string; motivo: string },
): Promise<DesfechoDoPedidoDeAjuda> {
  const contato = await encontrarContatoPorTelefone(admin, pedido.organizationId, pedido.idFace);
  if (!contato) return "sem_contato";

  const { data: conversa, error } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", pedido.organizationId)
    .eq("contact_id", contato.id)
    .eq("is_group", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`conversa: ${error.message}`);
  if (!conversa) return "sem_conversa";

  const { error: erroUpdate } = await admin
    .from("conversations")
    .update({
      bot_silenced_until: "infinity",
      last_handoff_at: new Date().toISOString(),
      last_handoff_reason: `O bot chamou o especialista: ${pedido.motivo}`.slice(0, TAMANHO_DO_MOTIVO),
    })
    .eq("organization_id", pedido.organizationId)
    .eq("id", (conversa as { id: string }).id);
  if (erroUpdate) throw new Error(`marcar: ${erroUpdate.message}`);
  return "marcada";
}
