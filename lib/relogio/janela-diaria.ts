/**
 * Guarda de horário das tarefas DIÁRIAS do relógio.
 *
 * O tick bate a cada ~5 min (e o GitHub atrasa o schedule de 5 a 15 min), então
 * "uma vez por dia" vira "na janela das 03h20–03h59 de America/Sao_Paulo". As
 * tarefas diárias são idempotentes e em lotes: rodar 2 a 4 vezes na janela é
 * inofensivo (rodada vazia não audita e custa só leituras). A janela começa em
 * 03h20 (06h20 UTC) e não na hora cheia, porque o GitHub atrasa ou descarta
 * schedules sobretudo no começo da hora.
 */
export const FUSO_DO_RELOGIO = "America/Sao_Paulo";
export const HORA_DA_JANELA_DIARIA = 3;
export const MINUTO_INICIAL_DA_JANELA_DIARIA = 20;
export const MINUTO_FINAL_DA_JANELA_DIARIA = 59;

const formatador = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO_DO_RELOGIO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Hora e minuto locais de São Paulo em `agora`. */
export function horaLocalDoRelogio(agora: Date): { hora: number; minuto: number } {
  const partes = formatador.formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value);
  return { hora, minuto };
}

/** `true` só entre 03:20 e 03:59 (inclusive) no horário de São Paulo. */
export function ehJanelaDiaria(agora: Date): boolean {
  const { hora, minuto } = horaLocalDoRelogio(agora);
  return (
    hora === HORA_DA_JANELA_DIARIA &&
    minuto >= MINUTO_INICIAL_DA_JANELA_DIARIA &&
    minuto <= MINUTO_FINAL_DA_JANELA_DIARIA
  );
}
