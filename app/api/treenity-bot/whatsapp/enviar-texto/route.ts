/**
 * POST /api/treenity-bot/whatsapp/enviar-texto — o bot (n8n) manda um texto ao
 * cliente NA HORA, no meio do raciocínio.
 *
 * Existe porque o agente só entrega UM texto, no fim, depois das ferramentas.
 * Quando ele manda vídeos (enviar_midia), os vídeos saíam ANTES de qualquer
 * palavra: o cliente que chegou dizendo "estou com rabo de burro" recebia dois
 * vídeos sem cumprimento nem apresentação (teste de 10/10). Com esta rota, a
 * ordem fica: apresentação → vídeos → pergunta.
 *
 * Corpo simples, para a ferramenta do n8n ser chave-valor:
 *   { id_face, phone_number_id, texto }
 * O DeskComm monta a mensagem da Graph API, envia pelo canal oficial da
 * organização da chave `tbw_` e grava no Inbox — o mesmo caminho das respostas
 * do bot (`lib/treenity-bot/envio-oficial.ts`). Erro volta em português simples,
 * porque quem lê é o modelo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPeloCanalOficial } from "@/lib/treenity-bot/envio-oficial";
import { organizacaoPelaChave } from "@/lib/treenity-bot/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A mesma versão da Graph API que os nós de envio do n8n usam. */
const VERSAO_DA_GRAPH = "v21.0";

const corpoSchema = z.object({
  id_face: z.string().trim().regex(/^\d{8,15}$/),
  phone_number_id: z.string().trim().regex(/^\d+$/),
  texto: z.string().trim().min(1).max(4000),
});

function erro(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, enviado: false } }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = createAdminClient();
  const dono = await organizacaoPelaChave(admin, req.headers.get("authorization"));
  if (!dono) return erro(401, "unauthorized", "Chave ausente ou inválida.");

  const lido = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return erro(422, "validation_failed", "Faltou id_face, phone_number_id ou texto. Nada foi enviado.");
  }
  const { id_face, phone_number_id, texto } = lido.data;

  const corpo = {
    messaging_product: "whatsapp",
    to: id_face,
    type: "text",
    text: { preview_url: false, body: texto },
  };
  const r = await enviarPeloCanalOficial({
    admin,
    organizationId: dono.organizationId,
    versao: VERSAO_DA_GRAPH,
    phoneNumberId: phone_number_id,
    texto: JSON.stringify(corpo),
    corpo,
  });
  if (!r.ok) return erro(r.status, r.code, `Não foi enviado: ${r.message}`);
  if (r.status >= 400) return erro(r.status, "meta_recusou", "Não foi enviado: o WhatsApp recusou a mensagem.");
  return NextResponse.json({ data: { enviado: true, message_id: r.externalId } });
}
