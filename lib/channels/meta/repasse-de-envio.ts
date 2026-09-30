/**
 * Repassa à API oficial um envio que chegou pronto, no formato dela — o
 * `POST /{versao}/{phone_number_id}/messages` que o n8n do Treenity Bot monta.
 * Quem chama é `app/api/treenity-bot/whatsapp/.../messages`, que autentica o
 * n8n e resolve a credencial da organização; aqui só mora o transporte.
 */
import { ENDERECO_DA_API_OFICIAL } from "./endereco-oficial";

export async function repassarEnvioOficial(input: {
  versao: string;
  phoneNumberId: string;
  token: string;
  /** O corpo exato que o n8n mandou. */
  corpo: string;
}): Promise<Response> {
  return fetch(`${ENDERECO_DA_API_OFICIAL}${input.versao}/${input.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: input.corpo,
    signal: AbortSignal.timeout(20_000),
  });
}
