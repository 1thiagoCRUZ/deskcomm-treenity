"use server";

/**
 * O DONO LIGA (OU DESLIGA) A AGENDA PARA A EQUIPE.
 *
 * Liga: o Funcionário passa a ver a Agenda no menu. Desliga: some do menu dele e
 * a URL deixa de abrir. O Dono sempre vê.
 *
 * ⚠️ SERVICE ROLE COM `organization_id` DE FONTE CONFIÁVEL: a única policy de
 * escrita em `organizations` é de admin de plataforma, então pelo client de
 * sessão o UPDATE de um Dono casaria zero linhas e diria "salvo". O id vem de
 * `resolveActiveOrg`, nunca do corpo — o que também impede mexer em outra empresa.
 */
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { supportWriteError } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoDaAgendaDaEquipe = { ok: true } | { ok: false; erro: string };

export async function definirAgendaDaEquipe(ligada: boolean): Promise<ResultadoDaAgendaDaEquipe> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (supportWriteError(user.support)) return { ok: false, erro: "Acompanhamento somente leitura ou encerrado." };
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Nenhuma empresa ativa." };
  if (org.role !== "admin") return { ok: false, erro: "Só o Dono da empresa pode mudar isso." };

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (erroLeitura) return { ok: false, erro: "Não consegui ler a configuração agora." };

  // `settings` é jsonb compartilhado: ler, mesclar e gravar preserva o que não é daqui.
  const settings = (atual?.settings ?? {}) as Record<string, unknown>;
  const agenda = (settings.agenda ?? {}) as Record<string, unknown>;
  const novo = { ...settings, agenda: { ...agenda, equipe_ativa: ligada } };

  const { error } = await admin.from("organizations").update({ settings: novo }).eq("id", org.orgId);
  if (error) return { ok: false, erro: "Não consegui salvar essa mudança agora." };

  await audit({
    action: ligada ? "agenda.equipe_ligada" : "agenda.equipe_desligada",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "organization",
    resourceId: org.orgId,
  });

  // O menu mora no layout (servidor): sem invalidar, só mudaria no recarregamento completo.
  revalidatePath("/app", "layout");
  return { ok: true };
}
