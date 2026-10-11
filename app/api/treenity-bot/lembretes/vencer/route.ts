/**
 * POST /api/treenity-bot/lembretes/vencer — vence os lembretes ("Lembrar" do
 * Inbox) da empresa da chave `tbw_`. O n8n chama a cada 5 minutos (fluxo
 * `[Cron] | Vencer Lembretes`).
 *
 * Existe porque na Vercel (plano Hobby) não há cron de 5 minutos: sem esta
 * rota o lembrete nunca vencia. A regra é a do cron da instalação
 * (`lib/inbox/vencer-lembretes.ts`), só que presa à organização da chave —
 * uma chave nunca mexe em conversa de outra empresa.
 */
import { NextResponse, type NextRequest } from "next/server";

import { vencerLembretes } from "@/lib/inbox/vencer-lembretes";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Chave ausente ou inválida." } }, { status: 401 });
  }
  try {
    const r = await vencerLembretes(admin, { organizationId: dono.organizationId });
    return NextResponse.json({ data: r });
  } catch (err) {
    logger.error("[treenity-bot.lembretes] não foi possível vencer os lembretes", {
      organization_id: dono.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return NextResponse.json({ error: { code: "internal_error", message: "Falhou." } }, { status: 500 });
  }
}
