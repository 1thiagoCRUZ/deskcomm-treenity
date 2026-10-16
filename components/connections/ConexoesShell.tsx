"use client";
import { useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";

import { CanalOficialClient } from "./CanalOficialClient";
import { PedidosParaAGestao } from "./PedidosParaAGestao";
import { TemplatesClient } from "./TemplatesClient";

/**
 * Conexões, visão da Gestão Treenity: o canal oficial da Meta (credencial,
 * webhook, saúde) e os templates dele. É o único transporte do produto.
 *
 * A sub-aba vive na URL (`?sub=`) para que as rotas antigas
 * (`/app/settings/canal-oficial`, `/app/settings/templates`) apontem para a aba
 * certa e um link colado no chat abra onde deveria.
 *
 * "Templates da Meta", e não "Templates": a barra lateral já tem um item com esse
 * nome que significa OUTRA coisa — respostas rápidas salvas pelo atendente.
 */
export function ConexoesShell() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const sub = params.get("sub") === "templates" ? "templates" : "conexao";

  const irPara = (proxima: string): void => {
    // `scroll: false`: trocar de aba não é navegar para outra página.
    router.replace(proxima === "conexao" ? "/app/connections" : `/app/connections?sub=${proxima}`, {
      scroll: false,
    });
  };

  return (
    <div className="flex flex-col gap-4">
    <PedidosParaAGestao />
    <Tabs value={sub} onValueChange={irPara} className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="conexao">{t("Conexão")}</TabsTrigger>
        <TabsTrigger value="templates">{t("Templates da Meta")}</TabsTrigger>
      </TabsList>
      <TabsContent value="conexao" className="mt-0">
        <CanalOficialClient />
      </TabsContent>
      <TabsContent value="templates" className="mt-0">
        <TemplatesClient />
      </TabsContent>
    </Tabs>
    </div>
  );
}
