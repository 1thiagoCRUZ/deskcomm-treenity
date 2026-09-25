/**
 * Espelho das respostas salvas (`message_templates`) no Treenity Bot.
 *
 * A mesma resposta serve a dois usos: o atendente cola pelo `/` do composer, e
 * o bot manda sozinho quando a mensagem do cliente contém um gatilho. O
 * cadastro vive aqui; o bot lê a tabela DELE (`respostas_rapidas`, no Supabase
 * do bot), a cada mensagem que chega. Por isso, a cada salvamento, o servidor
 * manda a resposta para a API do bot — e o bot usa já na mensagem seguinte.
 *
 * Quem vai para o bot: só resposta COMPARTILHADA (a pessoal é atalho de um
 * atendente, não fala da loja), com gatilho, de organização com o espelho
 * ligado (`settings.treenity_bot.respostas`). Qualquer outra que já esteja lá
 * é tirada.
 *
 * O resultado fica na própria resposta (migration 0235): `bot_synced_at` =
 * está no bot, `bot_sync_error` = o último envio falhou. Salvar de novo
 * reenvia; o envio é idempotente do lado do bot.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { temVariavelDoAtendente } from "@/lib/schemas/templates";
import { espelharRespostaNoBot, removerRespostaDoBot, type RespostaParaOBot } from "./client";
import { isConfigured } from "./config";
import { lerConfigDoTreenityBot } from "./configuracao";

/** As colunas de `message_templates` que o espelho precisa ler. */
export const COLUNAS_DO_ESPELHO =
  "id, owner_user_id, title, body, bot_triggers, bot_context, bot_max_chars, bot_enabled, bot_synced_at, bot_sync_error";

export interface RespostaSalva {
  id: string;
  owner_user_id: string | null;
  title: string;
  body: string;
  bot_triggers: string[];
  bot_context: "any" | "opening";
  bot_max_chars: number;
  bot_enabled: boolean;
  bot_synced_at: string | null;
  bot_sync_error: string | null;
}

export type AcaoNoBot =
  | { tipo: "espelhar"; resposta: RespostaParaOBot }
  | { tipo: "remover" }
  | { tipo: "nada" };

/** Decide o que fazer no bot com esta resposta. Pura — é onde mora a regra. */
export function acaoNoBot(resposta: RespostaSalva, espelhoLigado: boolean): AcaoNoBot {
  const vaiParaOBot = espelhoLigado && resposta.owner_user_id === null && resposta.bot_triggers.length > 0;
  if (vaiParaOBot) {
    return {
      tipo: "espelhar",
      resposta: {
        titulo: resposta.title,
        corpo: resposta.body,
        gatilhos: resposta.bot_triggers,
        contexto: resposta.bot_context === "opening" ? "abertura" : "qualquer",
        max_chars_msg: resposta.bot_max_chars,
        // Nunca liga no bot um texto que sairia com `{{…}}` cru para o cliente.
        ativo: resposta.bot_enabled && !temVariavelDoAtendente(resposta.body),
      },
    };
  }
  // Só chama a API do bot se a resposta pode estar lá: salvar um atalho pessoal
  // não pode depender (nem esperar) de outro servidor.
  const podeEstarNoBot = resposta.bot_synced_at !== null || resposta.bot_sync_error !== null;
  return podeEstarNoBot ? { tipo: "remover" } : { tipo: "nada" };
}

export type ResultadoDoEspelho = "espelhada" | "removida" | "nada" | "falhou";

const ERRO_SEM_RESPOSTA = "O bot não confirmou o recebimento. Salve de novo para reenviar.";

/** A organização ligou "O bot usa as respostas salvas" (e a integração existe)? */
export async function espelhoLigado(admin: SupabaseClient, orgId: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  return lerConfigDoTreenityBot(data?.settings).respostas.ativo;
}

async function aplicar(
  admin: SupabaseClient,
  orgId: string,
  resposta: RespostaSalva,
  ligado: boolean,
): Promise<ResultadoDoEspelho> {
  const acao = acaoNoBot(resposta, ligado);
  if (acao.tipo === "nada") return "nada";

  const confirmou =
    acao.tipo === "espelhar"
      ? await espelharRespostaNoBot(resposta.id, acao.resposta)
      : await removerRespostaDoBot(resposta.id);

  const estado = confirmou
    ? { bot_synced_at: acao.tipo === "espelhar" ? new Date().toISOString() : null, bot_sync_error: null }
    : { bot_sync_error: ERRO_SEM_RESPOSTA };
  await admin.from("message_templates").update(estado).eq("id", resposta.id).eq("organization_id", orgId);

  if (!confirmou) return "falhou";
  return acao.tipo === "espelhar" ? "espelhada" : "removida";
}

/**
 * Leva ao bot o estado atual de uma resposta, depois de ela ser salva aqui.
 * `admin` é o client de serviço: `orgId` TEM que vir da sessão, nunca do corpo.
 */
export async function espelharResposta(
  admin: SupabaseClient,
  orgId: string,
  resposta: RespostaSalva,
): Promise<ResultadoDoEspelho> {
  if (!isConfigured()) return "nada";
  return aplicar(admin, orgId, resposta, await espelhoLigado(admin, orgId));
}

/**
 * Antes de apagar uma resposta aqui, tira ela do bot. Na ordem inversa, uma
 * falha de rede deixaria no bot uma resposta que ninguém mais vê nem consegue
 * apagar. Devolve `false` se ela está no bot e não saiu — quem chama NÃO apaga.
 */
export async function tirarRespostaDoBot(resposta: RespostaSalva): Promise<boolean> {
  if (!isConfigured()) return true;
  if (resposta.bot_synced_at === null && resposta.bot_sync_error === null) return true;
  return removerRespostaDoBot(resposta.id);
}

/**
 * Reenvia todas as respostas compartilhadas da organização — ao ligar ou
 * desligar o espelho. Em série de propósito: são poucas, e a API do bot roda
 * num servidor pequeno.
 */
export async function espelharTodas(
  admin: SupabaseClient,
  orgId: string,
): Promise<{ enviadas: number; falharam: number }> {
  if (!isConfigured()) return { enviadas: 0, falharam: 0 };
  const ligado = await espelhoLigado(admin, orgId);
  const { data } = await admin
    .from("message_templates")
    .select(COLUNAS_DO_ESPELHO)
    .eq("organization_id", orgId)
    .is("owner_user_id", null);

  let enviadas = 0;
  let falharam = 0;
  for (const resposta of (data ?? []) as RespostaSalva[]) {
    const resultado = await aplicar(admin, orgId, resposta, ligado);
    if (resultado === "falhou") falharam++;
    else if (resultado !== "nada") enviadas++;
  }
  return { enviadas, falharam };
}
