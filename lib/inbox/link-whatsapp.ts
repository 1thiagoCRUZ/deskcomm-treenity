/**
 * Link "Abrir no WhatsApp" (wa.me) a partir do telefone do contato.
 *
 * Só dígitos, com DDI, entre 10 e 15 (E.164 plausível; não começa com 0).
 * Telefone ausente ou inválido devolve null — e a tela não mostra o botão.
 * Função pura: não toca em rede nem em banco.
 */
export function linkWhatsApp(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (digitos.startsWith("0")) return null;
  return `https://wa.me/${digitos}`;
}

const CHAVE_AVISO = "inbox:aviso-abrir-whatsapp";

/** O aviso já foi aceito nesta sessão do navegador? Nunca lança. */
export function avisoWhatsAppJaVisto(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE_AVISO) === "1";
  } catch {
    return false;
  }
}

export function marcarAvisoWhatsAppVisto(): void {
  try {
    window.sessionStorage.setItem(CHAVE_AVISO, "1");
  } catch {
    /* sessionStorage indisponível: o aviso volta a aparecer, sem prejuízo */
  }
}
