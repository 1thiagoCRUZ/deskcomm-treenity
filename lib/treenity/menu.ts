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

/**
 * Telas que o Dono usa de vez em quando, não todo dia: saem do menu lateral e
 * ficam em Configurações (`emConfiguracoes` no catálogo). Conexões é o número e
 * o pedido de troca; Respostas rápidas é um cadastro que o bot também lê. O
 * aviso de número caído não depende do item no menu: o banner do layout
 * (`ConexaoCaidaBanner`) aparece em qualquer tela.
 *
 * Só vale para quem vê o menu padrão. Quem tem lista própria de telas (o
 * Funcionário, ou um menu personalizado) escolheu o que quer ver, e a escolha
 * dele vence.
 */
const SO_EM_CONFIGURACOES: readonly string[] = ["/app/connections", "/app/templates"];

/** Só faz sentido quando há mais de uma pessoa na empresa. */
const SO_COM_EQUIPE: readonly string[] = ["/app/integrations/treenity-bot/chat"];

export interface ContextoDoMenu {
  /** A empresa tem mais de um membro? `undefined` = não sei, então mostra. */
  temEquipe?: boolean;
  /** A Gestão está dentro da empresa (suporte): ela usa Conexões toda hora, então o menu fica completo. */
  suporte?: boolean;
}

export function foraDoMenuLateral(
  href: string,
  settings: { destinos?: readonly string[] } | undefined,
  contexto: ContextoDoMenu,
): boolean {
  if (SO_COM_EQUIPE.includes(href) && contexto.temEquipe === false) return true;
  return !contexto.suporte && !settings?.destinos && SO_EM_CONFIGURACOES.includes(href);
}
