/**
 * Chat interno do Treenity Bot — conversa staff-to-staff, embutida no deskcomm.
 *
 * Esta página em si é só o wrapper (Server Component, checa se a integração
 * está configurada e se há usuário logado); a parte viva — socket, mensagens,
 * lista de pessoas — mora em `chat-interno.tsx` (Client Component), porque
 * precisa de um socket.io persistente no navegador.
 *
 * Porta alcançável só pelo ⌘K (catálogo em lib/navigation/catalogo.ts) — o
 * link cruzado que existia na página principal virou a aba "Chat interno" lá
 * (mesmo componente, evita ter duas versões divergindo). Altura real de
 * viewport aqui pelo mesmo motivo daquela aba: `ChatInterno` é `h-full` e
 * precisa de um ancestral com altura de verdade, senão colapsa pra zero.
 */
import Link from "next/link";
import { CaretLeft, ChatsCircle } from "@/lib/ui/icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthUser } from "@/lib/auth/server";
import { isConfigured } from "@/lib/treenity-bot/config";
import ChatInterno from "./chat-interno";

export default async function TreenityBotChatPage() {
  const user = await loadAuthUser();
  const configured = isConfigured();

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2*var(--space-6))] w-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border bg-surface p-2.5">
            <ChatsCircle size={24} weight="duotone" className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Chat interno</h1>
            <p className="text-sm text-muted-foreground">Treenity Bot</p>
          </div>
        </div>
        <Link
          href="/app/integrations/treenity-bot"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <CaretLeft size={14} />
          Voltar
        </Link>
      </div>

      {!configured || !user ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Integração não configurada</CardTitle>
            <CardDescription>
              Configure <code className="rounded-md bg-muted px-1 py-0.5 text-xs">TREENITY_BOT_API_URL</code> e{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 text-xs">TREENITY_BOT_SSO_SECRET</code> em{" "}
              <code className="rounded-md bg-muted px-1 py-0.5 text-xs">.env.local</code> para ativar o chat.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="min-h-0 flex-1">
          <ChatInterno />
        </div>
      )}
    </div>
  );
}
