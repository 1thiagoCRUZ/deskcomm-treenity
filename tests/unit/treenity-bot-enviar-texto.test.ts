import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { isPublicPath } from "@/lib/auth/public-paths";

/**
 * Texto que o bot manda NA HORA (apresentação antes dos vídeos, teste de 10/10).
 * A organização sai da chave; o corpo vira a mensagem da Graph API.
 */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const estado = { chaveValida: true };
vi.mock("@/lib/treenity-bot/whatsapp", () => ({
  organizacaoPelaChave: async () => (estado.chaveValida ? { organizationId: "org-1", config: {} } : null),
}));
const enviar = vi.fn();
vi.mock("@/lib/treenity-bot/envio-oficial", () => ({
  enviarPeloCanalOficial: (...a: unknown[]) => enviar(...a),
}));

import { POST } from "@/app/api/treenity-bot/whatsapp/enviar-texto/route";

const pedir = (corpo: unknown) =>
  POST(
    new NextRequest("https://x.test/api/treenity-bot/whatsapp/enviar-texto", {
      method: "POST",
      headers: { authorization: "Bearer tbw_x", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );

beforeEach(() => {
  estado.chaveValida = true;
  enviar.mockReset().mockResolvedValue({
    ok: true, status: 200, textoDaMeta: "{}", contentType: "application/json", externalId: "wamid.1",
  });
});

describe("enviar-texto do bot", () => {
  it("é pública só no caminho exato (o n8n chama sem cookie)", () => {
    expect(isPublicPath("/api/treenity-bot/whatsapp/enviar-texto")).toBe(true);
    expect(isPublicPath("/api/treenity-bot/whatsapp/enviar-texto/x")).toBe(false);
  });

  it("sem chave válida: 401 e nada sai", async () => {
    estado.chaveValida = false;
    expect((await pedir({ id_face: "5514999990000", phone_number_id: "1215877524952439", texto: "oi" })).status).toBe(401);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("monta a mensagem de texto da Graph API, na organização da chave", async () => {
    const r = await pedir({ id_face: "5514999990000", phone_number_id: "1215877524952439", texto: "Bom dia! Aqui é o Cadu." });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: { enviado: true, message_id: "wamid.1" } });
    const args = enviar.mock.calls[0]![0] as Record<string, unknown>;
    expect(args).toMatchObject({ organizationId: "org-1", phoneNumberId: "1215877524952439", versao: "v21.0" });
    expect(args.corpo).toEqual({
      messaging_product: "whatsapp",
      to: "5514999990000",
      type: "text",
      text: { preview_url: false, body: "Bom dia! Aqui é o Cadu." },
    });
    expect(JSON.parse(args.texto as string)).toEqual(args.corpo);
  });

  it("texto vazio: 422 e nada sai", async () => {
    expect((await pedir({ id_face: "5514999990000", phone_number_id: "1", texto: "  " })).status).toBe(422);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("WhatsApp recusou: diz ao bot que NÃO foi enviado", async () => {
    enviar.mockResolvedValue({ ok: true, status: 400, textoDaMeta: "{}", contentType: "application/json", externalId: null });
    const r = await pedir({ id_face: "5514999990000", phone_number_id: "1", texto: "oi" });
    expect(r.status).toBe(400);
    expect((await r.json()).error.enviado).toBe(false);
  });
});
