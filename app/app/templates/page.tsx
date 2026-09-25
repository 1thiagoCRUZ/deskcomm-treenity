import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { respostasNoBot } from "@/lib/treenity-bot/respostas-salvas";
import { TemplatesClient } from "./_components/TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/inbox");
  const canShare = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // Organização com as respostas no Treenity Bot (Integrações › Treenity Bot):
  // a lista vem da tabela do bot e o formulário mostra os gatilhos.
  const botDisponivel = await respostasNoBot(createAdminClient(), activeOrg.orgId);
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`), sem reler o `locale` cru.
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        {/* "Respostas rápidas", não "Templates": estes são scripts do atendente,
            consumidos pelo composer do inbox. O nome "Templates" pertence aos da
            Meta (HSM), em Canais, onde é o termo técnico correto. Duas telas com
            o mesmo nome e propósitos opostos confundiam. A URL não muda. */}
        <h1 className="text-2xl font-semibold tracking-tight">{t("Respostas rápidas")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {botDisponivel
            ? t(
                "O que a sua loja fala. A equipe usa digitando / na conversa, e o bot usa sozinho quando a resposta tem gatilhos.",
              )
            : t("Scripts salvos para responder mais rápido; pessoais ou compartilhados com a equipe.")}
        </p>
      </header>
      <TemplatesClient canShare={canShare} currentUserId={user.id} botDisponivel={botDisponivel} />
    </div>
  );
}
