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
 * Espelha a função `normalizar_texto` do banco do bot — a MESMA tabela de
 * acentos, e não `normalize("NFD")`: o NFD transformaria "ñ" em "n", enquanto o
 * banco transforma em espaço. A API do bot (`src/utils/normalizar.util.js`) faz
 * igual. As três TÊM que continuar iguais.
 */
const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC";
const MAPA_DE_ACENTOS = new Map([...COM_ACENTO].map((letra, i) => [letra, SEM_ACENTO[i]]));

export function normalizarGatilho(valor: string): string {
  return [...valor]
    .map((letra) => MAPA_DE_ACENTOS.get(letra) ?? letra)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * O bot só troca `[cumprimento]`. Um `{{primeiro_nome}}` — que o composer do
 * atendente preenche — chegaria ao cliente escrito assim, com as chaves.
 */
export function temVariavelDoAtendente(texto: string): boolean {
  return /\{\{.*?\}\}/.test(texto);
}

const MSG_VARIAVEL_NO_BOT =
  "O bot não preenche {{…}}. Para o bot responder sozinho, use [cumprimento] ou escreva o texto sem variáveis.";

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
  })
  // A resposta pessoal é atalho de um atendente, não fala da loja: o bot só
  // usa as compartilhadas (ver lib/treenity-bot/respostas-salvas.ts).
  .refine((d) => !d.bot_enabled || d.shared, {
    message: "Só respostas compartilhadas com a equipe podem ser usadas pelo bot.",
    path: ["bot_enabled"],
  })
  .refine((d) => !d.bot_enabled || !temVariavelDoAtendente(d.body), {
    message: MSG_VARIAVEL_NO_BOT,
    path: ["body"],
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
  )
  // Como acima, só quando o próprio PATCH traz os dois campos (a tela sempre
  // manda). Se escapar, `paraBot` grava a resposta no bot DESLIGADA.
  .refine((d) => !(d.bot_enabled === true && d.body !== undefined && temVariavelDoAtendente(d.body)), {
    message: MSG_VARIAVEL_NO_BOT,
    path: ["body"],
  });
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
