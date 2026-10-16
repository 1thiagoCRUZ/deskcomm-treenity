import { redirect } from "next/navigation";

import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * O onboarding tem um passo só: as boas-vindas (nome, fuso e aceite dos termos).
 * Quem já concluiu vai para o Inbox; quem não, para as boas-vindas.
 */
export default async function OnboardingIndex() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // Sem organização não há o que mostrar — a saída é a tela que CRIA a que falta.
  if (!activeOrg) redirect("/get-started");

  const { onboardedAt } = await loadOnboardingState(activeOrg.orgId);
  redirect(onboardedAt ? "/app/inbox" : "/onboarding/welcome");
}
