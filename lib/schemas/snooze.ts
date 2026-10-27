import { z } from "zod";

/**
 * Prazos do "Lembrar". Até 24 h é o lembrete curto: avisa SÓ se o cliente não
 * responder. 7 dias, 15 dias, 1 mês e a data escolhida são RETORNO (pedido do
 * Rodrigo, 27/10/2026): avisam sempre, mesmo com a conversa fechada, porque o
 * caso é "voltar no cliente depois da venda". A diferença é tirada do próprio
 * prazo (ver `ehRetorno`), sem coluna nova no banco.
 */
export const PRAZOS_CURTOS = [1, 3, 24] as const;
export const PRAZOS_RETORNO = [168, 360, 720] as const;
/** A partir daqui o lembrete é retorno. A data escolhida começa em 2 dias. */
export const RETORNO_A_PARTIR_HORAS = 48;
/** A data escolhida vai até 1 ano. */
export const MAX_DIAS_DATA = 366;

const prazo = z.union([
  ...[...PRAZOS_CURTOS, ...PRAZOS_RETORNO].map((h) => z.literal(h)),
] as unknown as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]);

export const snoozeSchema = z.union([
  z.object({ duration_hours: prazo }).strict(),
  z.object({ ate: z.string().datetime({ offset: true }) }).strict(),
]);
export type SnoozeInput = z.infer<typeof snoozeSchema>;

export function ehRetorno(snoozedAt: string | null, snoozeUntil: string | null): boolean {
  if (!snoozedAt || !snoozeUntil) return false;
  const horas = (new Date(snoozeUntil).getTime() - new Date(snoozedAt).getTime()) / 3_600_000;
  return horas >= RETORNO_A_PARTIR_HORAS;
}
