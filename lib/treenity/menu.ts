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
