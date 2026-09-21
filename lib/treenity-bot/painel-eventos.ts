/**
 * Barramento de tempo real do painel admin do Treenity Bot — SÓ navegador.
 *
 * Existe UM socket por aba, aberto por `TreenityBotAlertProvider` (montado no
 * layout). Ele repassa aqui os avisos `painel_evento` do bot, e os painéis
 * (vendas, atendimentos, transcrição) assinam sem abrir socket próprio.
 *
 * "Ao vivo" só vale depois que o bot confirmou (`painel_pronto`) que este
 * socket está na sala do painel. Sem essa confirmação — usuário que não é
 * admin, ou bot ainda sem o recurso — os painéis mantêm o polling de reserva.
 */

export type EventoDoPainel =
  | { tipo: "mensagem" | "atendimento" | "venda"; op?: string; id?: string; atendimentoId?: string }
  /** O `LISTEN` do bot ou o socket desta aba caiu e voltou: avisos se perderam, buscar tudo de novo. */
  | { tipo: "reconectado" };

const NOME_DO_EVENTO = "treenity-painel";

export function emitirEventoDoPainel(evento: EventoDoPainel): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EventoDoPainel>(NOME_DO_EVENTO, { detail: evento }));
}

/** Devolve a função que cancela a assinatura. */
export function ouvirEventosDoPainel(ouvinte: (evento: EventoDoPainel) => void): () => void {
  const aoReceber = (e: Event) => ouvinte((e as CustomEvent<EventoDoPainel>).detail);
  window.addEventListener(NOME_DO_EVENTO, aoReceber);
  return () => window.removeEventListener(NOME_DO_EVENTO, aoReceber);
}

// Estado "ao vivo" no formato que `useSyncExternalStore` pede: assinar + ler.
let aoVivo = false;
const ouvintesDoEstado = new Set<() => void>();

export function definirPainelAoVivo(valor: boolean): void {
  if (aoVivo === valor) return;
  aoVivo = valor;
  ouvintesDoEstado.forEach((ouvinte) => ouvinte());
}

export function assinarEstadoDoPainel(ouvinte: () => void): () => void {
  ouvintesDoEstado.add(ouvinte);
  return () => {
    ouvintesDoEstado.delete(ouvinte);
  };
}

export function painelEstaAoVivo(): boolean {
  return aoVivo;
}
