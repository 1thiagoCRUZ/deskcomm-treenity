/**
 * POST /api/treenity-bot/whatsapp/venda-nova — a API do bot avisa que o CADU
 * gravou uma venda. Vira um aviso na Central (o sino), para quem entra de
 * manhã saber o que aconteceu de noite sem depender de ter o sistema aberto.
 *
 * Mesma chave `tbw_` do envio. Responde 200 também sem conversa no Inbox: o
 * aviso entra sem link, e a API do bot não tem o que refazer.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { encontrarContatoPorTelefoneComNome } from "@/lib/channels/contato-por-telefone";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirAvisoDeVenda } from "@/lib/treenity-bot/avisos-da-central";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z.object({
  id_face: z.string().trim().min(1).max(64),
  id_venda: z.string().trim().min(1).max(64),
  cliente: z.string().trim().max(200).nullish(),
  total: z.number().min(0).max(10_000_000),
  itens: z.string().trim().max(2000).nullish(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Chave ausente ou inválida." } }, { status: 401 });
  }
  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!corpo.success) {
    return NextResponse.json({ error: { code: "validation_failed", message: "Dados da venda inválidos." } }, { status: 422 });
  }

  const contato = await encontrarContatoPorTelefoneComNome(admin, dono.organizationId, corpo.data.id_face);
  let conversationId: string | null = null;
  if (contato) {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("organization_id", dono.organizationId)
      .eq("contact_id", contato.id)
      .eq("is_group", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    conversationId = (data as { id: string } | null)?.id ?? null;
  }

  await abrirAvisoDeVenda(admin, {
    organizationId: dono.organizationId,
    conversationId,
    cliente: corpo.data.cliente ?? contato?.name ?? null,
    total: corpo.data.total,
    itens: corpo.data.itens ?? null,
    idVenda: corpo.data.id_venda,
  });
  logger.info("[treenity-bot.whatsapp] venda nova avisada", { organization_id: dono.organizationId });
  return NextResponse.json({ data: { desfecho: "avisada" } }, { status: 200 });
}
