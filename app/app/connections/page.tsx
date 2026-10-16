import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ConexoesDoDono } from "@/components/connections/ConexoesDoDono";
import { ConexoesShell } from "@/components/connections/ConexoesShell";
import { ehGestaoTreenity } from "@/lib/treenity/papeis";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const gestao = ehGestaoTreenity(user);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Conexões", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {gestao
            ? traduzir(
                "Por onde seu negócio fala com o cliente: o número oficial da Meta, a saúde dele e os templates.",
                idioma,
              )
            : traduzir("Os números de WhatsApp da sua empresa e se estão funcionando.", idioma)}
        </p>
      </header>
      {gestao ? <ConexoesShell /> : <ConexoesDoDono />}
    </div>
  );
}
