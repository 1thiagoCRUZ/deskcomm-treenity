/**
 * Integração com o "Treenity Bot" (api-treenity-bot) — API externa que guarda
 * os dados do bot de atendimento (WhatsApp/Facebook): vendas, atendimentos e
 * o chat interno. Vive num Supabase/servidor separado do deskcomm; a ponte é
 * só HTTP (ver `client.ts`), nunca acesso direto ao banco dele.
 *
 * Env vars `TREENITY_BOT_API_URL`/`TREENITY_BOT_SSO_SECRET` intencionalmente
 * opcionais: sem elas, `getConfig()` devolve null e a tela mostra "não
 * configurado", no mesmo padrão de `lib/nuvemshop/config.ts`.
 */

export interface TreenityBotConfig {
  apiUrl: string;
  ssoSecret: string;
}

export function getConfig(): TreenityBotConfig | null {
  const apiUrl = process.env.TREENITY_BOT_API_URL || "";
  const ssoSecret = process.env.TREENITY_BOT_SSO_SECRET || "";
  if (!apiUrl || !ssoSecret) return null;
  return { apiUrl: apiUrl.replace(/\/$/, ""), ssoSecret };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}
