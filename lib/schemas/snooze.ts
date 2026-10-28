import { z } from "zod";

/**
 * O "Lembrar" do Inbox tem duas partes (pedido do Rodrigo, 27/10/2026):
 *
 *   - JANELA ABERTA: a pessoa escreve uma mensagem e o servidor manda ao cliente
 *     no horário marcado. Só dentro da janela de 24 h (texto livre é grátis aí;
 *     fora dela só modelo pago), então o prazo vai até 24 h — e a rota ainda
 *     corta no fim da janela desta conversa.
 *   - ME LEMBRAR: aviso interno, sem custo, do prazo que a pessoa quiser
 *     (3 semanas, 2 meses, 3 meses...). Avisa sempre, mesmo com a conversa
 *     fechada (ver `vencer-lembretes.ts`).
 *
 * Os botões de cada parte são editáveis pela empresa (`organizations.settings.lembrar`,
 * rota `/api/v1/settings/lembrar`). Prazo guardado em MINUTOS; "mês" é 30 dias.
 */
export const MINUTOS = { minuto: 1, hora: 60, dia: 1440, semana: 10_080, mes: 43_200 } as const;
export type Unidade = keyof typeof MINUTOS;

/** Janela aberta: de 5 minutos a 24 horas. */
export const JANELA_MIN_MINUTOS = 5;
export const JANELA_MAX_MINUTOS = 24 * 60;
/** Me lembrar: de 5 minutos a 5 anos. */
export const INTERNO_MIN_MINUTOS = 5;
export const INTERNO_MAX_MINUTOS = 5 * 365 * 1440;
/** Botões por parte: mais que isso o menu passa da tela. */
export const MAX_OPCOES = 8;

export const OPCOES_PADRAO = {
  janela: [60, 180, 720],
  interno: [7 * 1440, 15 * 1440, MINUTOS.mes, 2 * MINUTOS.mes, 3 * MINUTOS.mes],
};

const listaDe = (min: number, max: number) =>
  z
    .array(z.number().int().min(min).max(max))
    .max(MAX_OPCOES)
    // Sem repetidos e em ordem: o menu mostra do mais perto para o mais longe.
    .transform((l) => [...new Set(l)].sort((a, b) => a - b));

export const lembrarOpcoesSchema = z
  .object({
    janela: listaDe(JANELA_MIN_MINUTOS, JANELA_MAX_MINUTOS),
    interno: listaDe(INTERNO_MIN_MINUTOS, INTERNO_MAX_MINUTOS),
  })
  .strict();
export type LembrarOpcoes = z.infer<typeof lembrarOpcoesSchema>;

/** O que está salvo na empresa, ou o padrão se nunca foi editado (ou se está estragado). */
export function opcoesDoLembrar(settings: unknown): LembrarOpcoes {
  const salvo = (settings as { lembrar?: unknown } | null)?.lembrar;
  const lido = lembrarOpcoesSchema.safeParse(salvo);
  return lido.success ? lido.data : { janela: [...OPCOES_PADRAO.janela], interno: [...OPCOES_PADRAO.interno] };
}

/** Me lembrar: um prazo (`minutos`) ou um dia escolhido no calendário (`ate`). */
export const snoozeSchema = z.union([
  z.object({ minutos: z.number().int().min(INTERNO_MIN_MINUTOS).max(INTERNO_MAX_MINUTOS) }).strict(),
  z.object({ ate: z.string().datetime({ offset: true }) }).strict(),
]);
export type SnoozeInput = z.infer<typeof snoozeSchema>;

/** Janela aberta: a mensagem e daqui a quanto ela sai. */
export const mensagemAgendadaSchema = z
  .object({
    minutos: z.number().int().min(JANELA_MIN_MINUTOS).max(JANELA_MAX_MINUTOS),
    texto: z.string().trim().min(1).max(4096),
  })
  .strict();
export type MensagemAgendadaInput = z.infer<typeof mensagemAgendadaSchema>;

/** A maior unidade que divide o prazo inteiro: 43200 -> 1 mês, 10080 -> 1 semana, 90 -> 90 minutos. */
export function separarPrazo(minutos: number): { quantidade: number; unidade: Unidade } {
  for (const unidade of ["mes", "semana", "dia", "hora"] as const) {
    if (minutos % MINUTOS[unidade] === 0) return { quantidade: minutos / MINUTOS[unidade], unidade };
  }
  return { quantidade: minutos, unidade: "minuto" };
}

const NOME_DA_UNIDADE: Record<Unidade, [string, string]> = {
  minuto: ["minuto", "minutos"],
  hora: ["hora", "horas"],
  dia: ["dia", "dias"],
  semana: ["semana", "semanas"],
  mes: ["mês", "meses"],
};

/** "minuto"/"minutos", "mês"/"meses"... (o texto em português, para passar pelo `t`). */
export function nomeDaUnidade(unidade: Unidade, quantidade: number): string {
  return NOME_DA_UNIDADE[unidade][quantidade === 1 ? 0 : 1];
}

/** "Em 3 semanas", com `t` traduzindo cada palavra. */
export function rotuloDoPrazo(minutos: number, t: (s: string) => string = (s) => s): string {
  const { quantidade, unidade } = separarPrazo(minutos);
  return `${t("Em")} ${quantidade} ${t(nomeDaUnidade(unidade, quantidade))}`;
}
