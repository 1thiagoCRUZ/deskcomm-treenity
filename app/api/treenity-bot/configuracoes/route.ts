/**
 * GET/PATCH /api/treenity-bot/configuracoes — liga/desliga e ajusta as
 * automações do Treenity Bot (tarefas de PIX, funil de leads e respostas
 * salvas no bot) PARA A ORGANIZAÇÃO ATIVA. Só admin — decisão de negócio, não config de deploy
 * (ver lib/treenity-bot/configuracao.ts).
 *
 * Guardado em `organizations.settings.treenity_bot` — o PATCH faz
 * leitura-junção-escrita pra nunca apagar outras chaves de `settings`
 * (ex.: `settings.llm`) nem o lado (tarefas/funil) que esta chamada não
 * tocou.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerConfigDoTreenityBot, type ConfigDoTreenityBot } from "@/lib/treenity-bot/configuracao";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  tarefas: z
    .object({
      ativo: z.boolean().optional(),
      desde: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .optional(),
  funil: z
    .object({
      ativo: z.boolean().optional(),
      desde: z.string().datetime({ offset: true }).nullable().optional(),
      perdido_dias: z.coerce.number().int().min(1).max(90).optional(),
    })
    .optional(),
  respostas: z.object({ ativo: z.boolean().optional() }).optional(),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "treenity_bot_config" });
  if (!authz.ok) return authz.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    return fail("internal_error", traduzir("Erro ao carregar a configuração.", authz.user.idioma), 500, { requestId });
  }

  return ok(lerConfigDoTreenityBot(data?.settings), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "treenity_bot_config" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  const { data: orgAtual, error: selErr } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (selErr || !orgAtual) {
    return fail("internal_error", t("Erro ao carregar a configuração."), 500, { requestId });
  }

  const atual = lerConfigDoTreenityBot(orgAtual.settings);
  const agora = new Date().toISOString();
  const novo: ConfigDoTreenityBot = {
    tarefas: {
      ativo: parsed.data.tarefas?.ativo ?? atual.tarefas.ativo,
      desde:
        parsed.data.tarefas?.desde !== undefined
          ? parsed.data.tarefas.desde
          : // Ligou agora e nunca teve "desde": preenche sozinho, pra não varrer o histórico.
            parsed.data.tarefas?.ativo === true && !atual.tarefas.desde
            ? agora
            : atual.tarefas.desde,
    },
    funil: {
      ativo: parsed.data.funil?.ativo ?? atual.funil.ativo,
      desde:
        parsed.data.funil?.desde !== undefined
          ? parsed.data.funil.desde
          : parsed.data.funil?.ativo === true && !atual.funil.desde
            ? agora
            : atual.funil.desde,
      perdidoDias: parsed.data.funil?.perdido_dias ?? atual.funil.perdidoDias,
    },
    respostas: { ativo: parsed.data.respostas?.ativo ?? atual.respostas.ativo },
  };

  const settingsAnterior =
    orgAtual.settings && typeof orgAtual.settings === "object" && !Array.isArray(orgAtual.settings)
      ? (orgAtual.settings as Record<string, unknown>)
      : {};

  const { error: updErr } = await admin
    .from("organizations")
    .update({
      settings: {
        ...settingsAnterior,
        treenity_bot: {
          tarefas: { ativo: novo.tarefas.ativo, desde: novo.tarefas.desde },
          funil: { ativo: novo.funil.ativo, desde: novo.funil.desde, perdido_dias: novo.funil.perdidoDias },
          respostas: { ativo: novo.respostas.ativo },
        },
      },
    })
    .eq("id", authz.org.orgId);
  if (updErr) {
    return fail("internal_error", t("Erro ao salvar a configuração."), 500, { requestId });
  }

  return ok(novo, { requestId });
}
