import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { homeDaInterface } from "@/lib/navigation/interface";
export default async function AppHome() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // Gestão Treenity sem empresa (o caso normal: ela entra nos clientes pelo
  // "Acompanhar organização") começa no painel da plataforma, e não num Inbox
  // sem organização.
  if (!org && user.is_platform_admin && !user.support) redirect("/admin");
  redirect(
    homeDaInterface(
      org?.interface_settings,
      user.is_platform_admin && !user.support,
      org?.role ?? null,
    ),
  );
}
