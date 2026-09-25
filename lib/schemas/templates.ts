import { z } from "zod";

/**
 * Normaliza um gatilho do jeito que o bot compara: minúsculo, sem acento, sem
 * pontuação, espaços colapsados.
 *
 * Guardar já normalizado é o que faz o casamento funcionar: quem cadastra
 * escreve "Bom dia!", o cliente escreve "bom dia", e os dois viram a mesma
 * chave. Se a normalização ficasse só do lado do bot, o banco teria variações
 * que nunca casariam e ninguém entenderia por quê.
 *
 * A mesma transformação existe em SQL no banco do bot (`normalizar_texto`) —
 * as duas TÊM que continuar iguais.
 */
export function normalizarGatilho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** any = qualquer momento; opening = só na primeira mensagem do atendimento. */
export const BOT_CONTEXTS = ["any", "opening"] as const;

const botTriggersSchema = z
  .array(z.string())
  .max(40)
  .transform((lista) => {
    const vistos = new Set<string>();
    for (const bruto of lista) {
      const limpo = normalizarGatilho(bruto);
      // Gatilho de 1 caractere casaria com quase tudo; vazio não casa com nada.
      if (limpo.length >= 2 && limpo.length <= 120) vistos.add(limpo);
    }
    return [...vistos];
  });

const botFields = {
  bot_triggers: botTriggersSchema.optional(),
  bot_context: z.enum(BOT_CONTEXTS).optional(),
  bot_max_chars: z.coerce.number().int().min(10).max(400).optional(),
  bot_enabled: z.boolean().optional(),
};

export const createTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(4096),
    shortcut: z.string().trim().min(1).max(40).optional(),
    /** true = compartilhado da org (owner null, exige manager+); false = pessoal. */
    shared: z.boolean().default(false),
    ...botFields,
  })
  .refine((d) => !d.bot_enabled || (d.bot_triggers?.length ?? 0) > 0, {
    message: "Para o bot responder sozinho, informe ao menos um gatilho.",
    path: ["bot_triggers"],
  });
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    body: z.string().trim().min(1).max(4096),
    shortcut: z.string().trim().min(1).max(40).nullable(),
    ...botFields,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." })
  // Só barra quando o próprio PATCH liga o bot e manda a lista vazia junto: um
  // PATCH que mexe apenas no título não pode ser rejeitado por causa do estado
  // atual da linha, que este schema nem enxerga. O CHECK do banco pega o resto.
  .refine(
    (d) => !(d.bot_enabled === true && d.bot_triggers !== undefined && d.bot_triggers.length === 0),
    {
      message: "Para o bot responder sozinho, informe ao menos um gatilho.",
      path: ["bot_triggers"],
    },
  );
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
