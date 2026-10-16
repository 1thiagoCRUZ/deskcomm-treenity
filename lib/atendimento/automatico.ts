/**
 * "ESTA ORG TEM ATENDIMENTO AUTOMÁTICO DE PÉ?" — uma pergunta, um lugar.
 *
 * Na Treenity o automático é o Treenity Bot (n8n) atendendo pelo Inbox; não há
 * agente próprio dentro do DeskComm. É o único pedaço de `comandoDaConversa` que
 * o banco não responde sozinho, então quem resolve é o servidor, e o resultado
 * escolhe o CONJUNTO de comandos que a aba da Fila pede (`comandosDaFila`).
 *
 * **Devolve `undefined` quando não deu para saber**, nunca `false`: dizer "esta
 * org não tem automático" por causa de um erro de leitura faria a Fila incluir
 * tudo que o robô atende. `comandosDaFila` trata `undefined` como "assume que há".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { botDoTreenityAtende } from "@/lib/treenity-bot/whatsapp";

export async function orgTemAutomatico(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<boolean | undefined> {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) return undefined;
  return botDoTreenityAtende(org?.settings ?? null);
}
