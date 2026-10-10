/**
 * POST /api/treenity-bot/whatsapp/{versao}/{phone_number_id}/messages — o n8n
 * envia as respostas do bot por aqui, e elas aparecem no Inbox.
 *
 * O caminho e o corpo são OS MESMOS da API oficial do WhatsApp
 * (`{versao}/{phone_number_id}/messages`, ver `lib/channels/meta/repasse-de-envio.ts`),
 * e a resposta volta sem mudança (status e JSON da Meta). Assim, no n8n, cada nó de
 * envio muda só o começo do endereço e a credencial — o corpo, os
 * `messages[0].id` que os nós seguintes leem e o tratamento de erro ficam iguais.
 *
 * Autenticação: `Authorization: Bearer tbw_<organização>_<segredo>`, gerada na
 * tela do Treenity Bot (ver `lib/treenity-bot/whatsapp.ts`). O número tem de
 * ser de um canal oficial DESSA organização — a credencial da Meta vem da
 * sessão dela, nunca do `.env`.
 *
 * Gravar no Inbox acontece DEPOIS da resposta (`after`): o bot não espera o
 * banco, e uma falha ao gravar não desfaz um envio que já saiu.
 */
import { type NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPeloCanalOficial } from "@/lib/treenity-bot/envio-oficial";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ versao: string; phoneNumberId: string }>;
}

/** Erro no formato da Graph API, para o n8n tratar igual a um erro da Meta. */
function erro(status: number, message: string, code: string): NextResponse {
  return NextResponse.json({ error: { message, type: "DeskCommError", code } }, { status });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const { versao, phoneNumberId } = await ctx.params;
  if (!/^v\d+\.\d+$/.test(versao) || !/^\d+$/.test(phoneNumberId)) {
    return erro(404, "Endereço inválido.", "not_found");
  }

  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) return erro(401, "Chave ausente ou inválida.", "unauthorized");
  const { organizationId } = dono;

  const texto = await req.text();
  let corpo: Record<string, unknown>;
  try {
    const lido = JSON.parse(texto) as unknown;
    if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("não é objeto");
    corpo = lido as Record<string, unknown>;
  } catch {
    return erro(400, "Corpo precisa ser um JSON.", "invalid_json");
  }

  const r = await enviarPeloCanalOficial({ admin, organizationId, versao, phoneNumberId, texto, corpo });
  if (!r.ok) return erro(r.status, r.message, r.code);
  return new NextResponse(r.textoDaMeta, { status: r.status, headers: { "content-type": r.contentType } });
}
