import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth/signOut";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { emailDeSuporte } from "@/lib/branding/saida";

export const metadata = {
  title: "Conta sem empresa",
};

/**
 * Para onde vai quem tem login mas não pertence a nenhuma empresa.
 *
 * Antes essa pessoa caía no Perfil com o menu vazio e nenhuma explicação — e
 * parecia que o sistema tinha quebrado. Na prática é um convite que não foi
 * aceito, ou um acesso que a empresa removeu. Fica fora da árvore de
 * `app/app/layout.tsx` (que depende de uma empresa ativa), como
 * `account-suspended`.
 */
export default async function ContaSemEmpresaPage() {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  // Quem tem empresa (ou é Gestão) não tem o que fazer aqui.
  if (user.is_platform_admin || (await resolveActiveOrg(user))) redirect("/app");

  const idioma = user.idioma;
  const suporte = emailDeSuporte();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">{traduzir("Sua conta ainda não está em nenhuma empresa", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Você entrou como",
            idioma,
          )}{" "}
          <strong>{user.email}</strong>
          {traduzir(
            ", mas esse acesso não está ligado a nenhuma empresa. Peça a quem administra o sistema na sua empresa para enviar um novo convite, ou confira se você entrou com o e-mail certo.",
            idioma,
          )}
        </p>
        {suporte ? (
          <p className="text-sm text-muted-foreground">
            {traduzir("Precisa de ajuda? Escreva para", idioma)}{" "}
            <a href={`mailto:${suporte}`} className="underline underline-offset-4 hover:text-foreground">
              {suporte}
            </a>
            .
          </p>
        ) : null}
        <form action={signOut} className="pt-2">
          <Button type="submit" variant="outline">
            {traduzir("Sair e entrar com outra conta", idioma)}
          </Button>
        </form>
      </Card>
    </main>
  );
}
