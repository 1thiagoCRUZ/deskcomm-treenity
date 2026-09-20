import { redirect } from "next/navigation";
import Link from "next/link";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { CreateMemberForm } from "./_components/CreateMemberForm";

export const dynamic = "force-dynamic";

export default async function TeamNewPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Cadastrar membro")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Cria a conta já com senha e coloca a pessoa na equipe. Ela entra direto, sem e-mail nem link.")}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Prefere mandar um link?")}{" "}
          <Link href="/app/team/invite" className="underline hover:text-foreground">
            {t("Convidar membros")}
          </Link>
        </p>
      </header>
      <CreateMemberForm />
    </div>
  );
}
