"use client";

/**
 * "Anexar cliente" no Chat da equipe: busca uma conversa do Inbox pelo nome ou
 * telefone do cliente e devolve o anexo (ver `lib/treenity-bot/anexo-de-cliente.ts`).
 *
 * A busca é a MESMA do Inbox (`GET /api/v1/conversations?search=`), então quem
 * anexa só encontra o que já pode ver no Inbox — nenhuma porta nova de leitura.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MagnifyingGlass, Paperclip } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { rotuloDoContato, type ContatoNomeavel } from "@/lib/contacts/rotulo-do-contato";
import type { AnexoDeCliente } from "@/lib/treenity-bot/anexo-de-cliente";

interface ConversaEncontrada {
  id: string;
  last_message_preview: string | null;
  contacts: ContatoNomeavel | null;
}

const ESPERA_DA_DIGITACAO_MS = 300;

export function AnexarCliente({
  onEscolher,
  disabled,
}: {
  onEscolher: (anexo: AnexoDeCliente) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setTermo(busca.trim()), ESPERA_DA_DIGITACAO_MS);
    return () => clearTimeout(id);
  }, [busca]);

  const resultado = useQuery({
    queryKey: ["chat-da-equipe", "anexar-cliente", termo],
    enabled: aberto,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "8" });
      if (termo) params.set("search", termo);
      const r = await apiClient.get<{ data: ConversaEncontrada[] }>(
        `/api/v1/conversations?${params.toString()}`,
      );
      return r.data;
    },
    staleTime: 30_000,
  });

  function escolher(c: ConversaEncontrada) {
    onEscolher({ conversaId: c.id, nome: rotuloDoContato(c.contacts, t) });
    setAberto(false);
    setBusca("");
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        disabled={disabled}
        onClick={() => setAberto(true)}
        title={t("Anexar cliente")}
        aria-label={t("Anexar cliente")}
      >
        <Paperclip size={20} aria-hidden />
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Anexar cliente")}</DialogTitle>
            <DialogDescription>
              {t("Quem receber vê um cartão com o cliente e abre a conversa dele no Inbox.")}
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Nome ou telefone do cliente")}
              className="pl-9"
            />
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto" data-testid="anexar-cliente-resultados">
            {resultado.isLoading ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">{t("Carregando...")}</li>
            ) : (resultado.data ?? []).length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">{t("Nenhum cliente encontrado.")}</li>
            ) : (
              (resultado.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => escolher(c)}
                    className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="block truncate text-sm font-medium">{rotuloDoContato(c.contacts, t)}</span>
                    {c.last_message_preview ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.last_message_preview}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
