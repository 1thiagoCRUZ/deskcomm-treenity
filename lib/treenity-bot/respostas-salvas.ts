/**
 * Respostas rápidas guardadas no Treenity Bot — um cadastro só, dois usos.
 *
 * A mesma resposta serve à equipe, que cola o texto pelo `/` do composer, e ao
 * bot, que manda o texto sozinho quando a mensagem do cliente contém um
 * gatilho. Com a integração ligada na organização
 * (`settings.treenity_bot.respostas`), a resposta mora SÓ na tabela do bot
 * (`respostas_rapidas`, no Supabase dele): as rotas de `message-templates`
 * leem e gravam lá pela API do bot, e o n8n lê a mesma linha a cada mensagem.
 * O deskcomm não guarda cópia, então não existe "salvou aqui e não chegou lá".
 *
 * Com a integração desligada, tudo continua como o deskcomm original:
 * `message_templates`, com respostas pessoais e compartilhadas.
 *
 * Este arquivo é só a tradução entre os dois formatos. O formato da tela
 * (`MessageTemplate`) não muda, para o composer, a lista e o formulário
 * funcionarem igual nos dois modos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { temVariavelDoAtendente } from "@/lib/schemas/templates";
import type { CamposDaRespostaNoBot, RespostaDoBot } from "./client";
import { isConfigured } from "./config";
import { lerConfigDoTreenityBot } from "./configuracao";

/** A organização guarda as respostas rápidas no Treenity Bot (e a integração existe)? */
export async function respostasNoBot(admin: SupabaseClient, orgId: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  return lerConfigDoTreenityBot(data?.settings).respostas.ativo;
}

/**
 * Uma linha do bot no formato que a tela já conhece. Toda resposta do bot é da
 * loja (`owner_user_id: null`): o bot fala pela loja, não por um atendente.
 */
export function paraTemplate(linha: RespostaDoBot, orgId: string) {
  return {
    id: String(linha.id),
    organization_id: orgId,
    owner_user_id: null,
    title: linha.titulo,
    body: linha.corpo,
    shortcut: linha.atalho,
    bot_triggers: linha.gatilhos,
    bot_context: linha.contexto === "abertura" ? ("opening" as const) : ("any" as const),
    bot_max_chars: linha.max_chars_msg,
    bot_enabled: linha.ativo,
    usage_count: 0,
    last_used_at: null,
    created_by_user_id: null,
    created_at: linha.criado_em,
    updated_at: linha.atualizado_em,
  };
}

/** Os campos do formulário que o bot guarda. `shared` não entra: no bot, toda resposta é da loja. */
export interface CamposDoFormulario {
  title?: string;
  body?: string;
  shortcut?: string | null;
  bot_triggers?: string[];
  bot_context?: "any" | "opening";
  bot_max_chars?: number;
  bot_enabled?: boolean;
}

/**
 * Do formulário para a API do bot. Campo ausente fica ausente, para uma edição
 * nunca zerar o que não foi mandado.
 */
export function paraBot(campos: CamposDoFormulario): Partial<CamposDaRespostaNoBot> {
  const saida: Partial<CamposDaRespostaNoBot> = {};
  if (campos.title !== undefined) saida.titulo = campos.title;
  if (campos.body !== undefined) saida.corpo = campos.body;
  if (campos.shortcut !== undefined) saida.atalho = campos.shortcut;
  if (campos.bot_triggers !== undefined) saida.gatilhos = campos.bot_triggers;
  if (campos.bot_context !== undefined) saida.contexto = campos.bot_context === "opening" ? "abertura" : "qualquer";
  if (campos.bot_max_chars !== undefined) saida.max_chars_msg = campos.bot_max_chars;
  if (campos.bot_enabled !== undefined) {
    // Nunca liga no bot um texto que sairia com `{{…}}` cru para o cliente, nem
    // uma resposta sem gatilho (o bot recusa: ela nunca dispararia).
    const variavel = campos.body !== undefined && temVariavelDoAtendente(campos.body);
    const semGatilho = campos.bot_triggers !== undefined && campos.bot_triggers.length === 0;
    saida.ativo = campos.bot_enabled && !variavel && !semGatilho;
  }
  return saida;
}

/** Para criar, o bot precisa da resposta inteira: o que o formulário não mandou vai no padrão. */
export function paraBotNovo(campos: CamposDoFormulario & { title: string; body: string }): CamposDaRespostaNoBot {
  return {
    titulo: campos.title,
    corpo: campos.body,
    atalho: campos.shortcut ?? null,
    gatilhos: campos.bot_triggers ?? [],
    contexto: "qualquer",
    max_chars_msg: 60,
    ativo: false,
    ...paraBot(campos),
  };
}

/**
 * Por que o bot recusou, em termos da tela. A recusa por validação (422) traz a
 * frase da API do bot, que já é escrita para o dono ler; o resto vira "o bot
 * não respondeu agora".
 */
export function erroDoBot(resultado: { status: number; erro: string | null }): {
  code: string;
  status: number;
  mensagem: string;
} {
  if (resultado.status === 404) {
    return { code: "not_found", status: 404, mensagem: "Resposta não encontrada." };
  }
  if ((resultado.status === 400 || resultado.status === 422) && resultado.erro) {
    return { code: "validation_failed", status: 422, mensagem: resultado.erro };
  }
  return {
    code: "upstream_unavailable",
    status: 502,
    mensagem: "O Treenity Bot não respondeu agora. Tente de novo em instantes.",
  };
}

/** O id do bot é numérico; qualquer outra coisa na URL não existe lá. */
export function idDoBot(id: string): number | null {
  return /^[1-9][0-9]*$/.test(id) ? Number(id) : null;
}
