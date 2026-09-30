/**
 * Como a mídia RECEBIDA pelo canal oficial é referenciada em `messages.media_url`.
 *
 * A Meta não manda o arquivo no webhook, só um id (`messages[].audio.id` etc.).
 * A ingestão grava `meta-media:<id>` em `media_url`: é o que faz o Inbox saber
 * que a mensagem tem mídia (o balão só desenha player com `media_url` ou
 * `media_storage_path`), e é o que `metaCloudAdapter.fetchInboundMedia` sabe
 * trocar pelos bytes. O prefixo separa a referência de uma URL de verdade — a
 * rota de mídia nunca a trata como link.
 */
export const META_MEDIA_PREFIX = "meta-media:";

export function referenciaDaMidiaMeta(mediaId: string): string {
  return `${META_MEDIA_PREFIX}${mediaId}`;
}
