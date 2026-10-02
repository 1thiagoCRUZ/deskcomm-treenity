/**
 * MENU DA TREENITY — o que sai do menu lateral, por cima do registro do DeskComm.
 *
 * O grupo "Agente de IA" (Agentes, Follow-ups, Roteadores e o hub "Ver tudo em
 * IA") é a IA nativa do DeskComm; na Treenity quem atende é o Treenity Bot
 * (n8n), configurado em Canais → Treenity Bot. Mostrar as duas confunde o dono.
 *
 * Sair do menu não é sair do produto: as telas seguem no ⌘K e pela URL, e a
 * autorização continua sendo o papel do vínculo (ver `lib/treenity/papeis.ts`).
 */
import type { NavGroupId } from "@/lib/navigation/catalogo";

export const GRUPOS_FORA_DO_MENU: readonly NavGroupId[] = ["ia"];

/**
 * Grupos que ficam no menu, mas sem o link "Ver tudo em …": para o dono da
 * loja as telas do dia a dia já estão no menu, e o hub listava telas de
 * montagem (Produtos, Etapas do funil, Evolução da IA, Audit Log) que confundem.
 * Elas seguem no ⌘K.
 */
export const HUBS_FORA_DO_MENU: readonly NavGroupId[] = ["crm", "analise"];
