/**
 * Endereço base da API oficial do WhatsApp — o único lugar fora do adapter que
 * o conhece. A tela do Treenity Bot mostra "antes → depois" para quem troca os
 * nós de envio do n8n, e a rota de envio do bot repassa para cá. Os dois
 * pedem o endereço aqui em vez de escrevê-lo (doutrina de restrição de canal:
 * só `lib/channels/` nomeia o provider).
 */
export const ENDERECO_DA_API_OFICIAL = "https://graph.facebook.com/";
