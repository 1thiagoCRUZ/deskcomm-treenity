"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
type Vinculos = {
  contacts: Array<{ id: string; name: string }>;
  conversations: Array<{ id: string; created_at: string; status: string }>;
};
export function VinculoDaMarcacao({
  contactId,
  conversationId,
  onChange,
}: {
  contactId: string;
  conversationId: string;
  onChange: (contact: string, conversation: string) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["agenda", "vinculos", contactId, search],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Vinculos }>(
          `/api/v1/agenda/vinculos?${new URLSearchParams(contactId ? { contact_id: contactId } : { q: search })}`,
        )
      ).data,
  });
  const escolhido = query.data?.contacts.find((c) => c.id === contactId);
  const termo = search.trim();

  return (
    <div className="space-y-3">
      {contactId ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium" data-testid="cliente-escolhido">
            {escolhido?.name ?? t("Cliente escolhido")}
          </span>
          <button
            type="button"
            className="shrink-0 text-xs text-text-muted underline underline-offset-2 hover:text-text"
            onClick={() => {
              setSearch("");
              onChange("", "");
            }}
          >
            {t("Trocar cliente")}
          </button>
        </div>
      ) : (
        <div>
          <input
            className="w-full rounded-md border border-border bg-surface p-2 text-sm outline-hidden focus:border-border-strong"
            value={search}
            placeholder={t("Digite o nome ou o telefone do cliente")}
            aria-label={t("Buscar cliente")}
            onChange={(e) => setSearch(e.target.value)}
          />
          {termo ? (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-border bg-surface text-sm">
              {query.data?.contacts.length ? (
                query.data.contacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-surface-elevated"
                      onClick={() => onChange(c.id, "")}
                    >
                      {c.name}
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-text-muted">
                  {query.isFetching ? t("Buscando…") : t("Nenhum cliente encontrado.")}
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-text-muted">
              {t("Sem escolher um cliente, o compromisso fica só seu (pessoal).")}
            </p>
          )}
        </div>
      )}
      {contactId && query.data?.conversations.length ? (
        <label className="block text-xs font-medium text-text-muted">
          {t("Conversa do WhatsApp (opcional)")}
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface p-2 text-sm text-text"
            value={conversationId}
            onChange={(e) => onChange(contactId, e.target.value)}
          >
            <option value="">{t("Sem conversa vinculada")}</option>
            {query.data.conversations.map((c, i) => (
              <option key={c.id} value={c.id}>
                {t("Conversa")} {i + 1} · {new Date(c.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {query.isError ? (
        <p role="alert" className="text-xs text-error">{t("Não foi possível carregar os vínculos. Tente novamente.")}</p>
      ) : null}
    </div>
  );
}
