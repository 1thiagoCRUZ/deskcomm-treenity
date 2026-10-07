/**
 * Cliente anexado a uma mensagem do Chat da equipe.
 *
 * Pedido do Dono (reunião de 02/10), dois usos:
 *   1. ele viu algo numa conversa do Inbox e quer perguntar ao funcionário
 *      "por que você fez isso?", mostrando QUAL conversa;
 *   2. ele quer avisar "temos que ficar de olho nesse cliente", mandando o
 *      contato.
 *
 * O chat mora na API do bot e guarda só TEXTO (cifrado). Em vez de mudar o
 * formato de lá, o anexo vai como a ÚLTIMA LINHA do texto, legível por gente:
 *
 *     Por que você ofereceu desconto?
 *
 *     📎 João da Silva · /app/inbox?id=<uuid da conversa>
 *
 * O DeskComm reconhece essa linha e desenha um cartão com "Abrir conversa".
 * Qualquer outro leitor (o painel antigo do bot, um export) ainda vê o nome e
 * o caminho — nada se perde se o cartão não existir do outro lado.
 */

export interface AnexoDeCliente {
  /** Conversa do Inbox (`conversations.id`). */
  conversaId: string;
  /** Nome do cliente como aparece no Inbox. */
  nome: string;
}

const MARCA = "📎";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LINHA_DO_ANEXO = new RegExp(`^${MARCA} (.+) · /app/inbox\\?id=(${UUID})$`, "i");
const TAMANHO_DO_NOME = 80;

/** Caminho no Inbox que abre a conversa anexada. */
export function caminhoDoAnexo(anexo: AnexoDeCliente): string {
  return `/app/inbox?id=${anexo.conversaId}`;
}

/** Junta o texto digitado e o anexo no conteúdo que vai para o chat. */
export function montarMensagemComAnexo(texto: string, anexo: AnexoDeCliente | null): string {
  const corpo = texto.trim();
  if (!anexo) return corpo;
  // O separador " · " e a quebra de linha são o que a leitura procura: um nome
  // com eles dentro quebraria o cartão, então saem do nome.
  const nome =
    anexo.nome.replace(/[\r\n]+/g, " ").replaceAll(" · ", " - ").trim().slice(0, TAMANHO_DO_NOME) ||
    "Cliente";
  const linha = `${MARCA} ${nome} · ${caminhoDoAnexo(anexo)}`;
  return corpo ? `${corpo}\n\n${linha}` : linha;
}

/** Separa o texto do anexo. Mensagem sem anexo volta inteira em `texto`. */
export function separarAnexo(conteudo: string): { texto: string; anexo: AnexoDeCliente | null } {
  const linhas = conteudo.split("\n");
  const ultima = linhas[linhas.length - 1]?.trim() ?? "";
  const achou = LINHA_DO_ANEXO.exec(ultima);
  const [, nome, conversaId] = achou ?? [];
  if (!nome || !conversaId) return { texto: conteudo, anexo: null };
  return {
    texto: linhas.slice(0, -1).join("\n").trim(),
    anexo: { nome: nome.trim(), conversaId: conversaId.toLowerCase() },
  };
}
