/**
 * POST /api/treenity-bot/whatsapp/pediu-ajuda — a API do bot avisa que o CADU
 * chamou o especialista (`POST /api/atendimentos/sinalizar` de lá). A conversa
 * do cliente vai para a Fila do Inbox, com o bot calado (ver `marcarPediuAjuda`).
 *
 * Mesma chave `tbw_` do envio (`Authorization: Bearer`). Responde 200 também
 * quando não há conversa no Inbox — atendimento do Instagram, ou cliente que
 * ainda não passou pelo DeskComm: não é erro de quem chamou, e a API do bot
 * não tem o que refazer.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { marcarPediuAjuda, organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z.object({
  id_face: z.string().trim().min(1).max(64),
  motivo: z.string().trim().min(1).max(500),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Chave ausente ou inválida." } }, { status: 401 });
  }

  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: { code: "validation_failed", message: "id_face e motivo são obrigatórios." } }, { status: 422 });
  }

  try {
    const desfecho = await marcarPediuAjuda(admin, {
      organizationId: dono.organizationId,
      idFace: corpo.data.id_face,
      motivo: corpo.data.motivo,
    });
    logger.info("[treenity-bot.whatsapp] bot chamou o especialista", {
      organization_id: dono.organizationId,
      desfecho,
    });
    return NextResponse.json({ data: { desfecho } }, { status: 200 });
  } catch (err) {
    logger.error("[treenity-bot.whatsapp] não foi possível marcar o pedido de ajuda", {
      organization_id: dono.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível marcar a conversa." } }, { status: 500 });
  }
}
