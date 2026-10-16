import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { branding } from "@/lib/branding";
import { traduzir } from "@/lib/i18n/dicionario";
import { WelcomeForm } from "./_form";

export const dynamic = "force-dynamic";

/** O nome que o cadastro inicial deixa quando ninguém informou o do negócio. */
const NOME_PLACEHOLDER = "Minha Empresa";

export default async function WelcomePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          {traduzir("Boas-vindas ao", idioma)} {branding().name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {traduzir("Confirme os dados da sua empresa para começar.", idioma)}
        </p>
      </header>

      {/* Nome placeholder não vira valor inicial: a pessoa teria de apagá-lo antes de escrever o dela. */}
      <WelcomeForm defaultOrgName={activeOrg.name.trim() === NOME_PLACEHOLDER ? "" : activeOrg.name} />
    </div>
  );
}
