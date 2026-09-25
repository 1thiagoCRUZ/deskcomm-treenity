"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, PencilSimple, Trash, MagnifyingGlass } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { TemplateFormDialog } from "./TemplateFormDialog";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  canShare: boolean;
  currentUserId: string;
  /** A organização ligou "O bot usa as respostas salvas": mostra gatilhos e estado do bot. */
  botDisponivel?: boolean;
}

type Filtro = "todas" | "bot" | "atendente";

type Estado = "bot" | "nao_chegou" | "pausada" | "atendente";

/**
 * Estado de uma resposta do ponto de vista do bot. "Não chegou" vem antes de
 * tudo: é o único que pede ação de alguém (salvar de novo reenvia).
 */
function estadoDa(template: MessageTemplate): Estado {
  const gatilhos = template.bot_triggers ?? [];
  if (template.owner_user_id !== null || gatilhos.length === 0) return "atendente";
  if (template.bot_sync_error) return "nao_chegou";
  return template.bot_enabled ? "bot" : "pausada";
}

const ROTULO_DO_ESTADO: Record<Estado, string> = {
  bot: "O bot responde",
  nao_chegou: "Não chegou ao bot",
  pausada: "Pausada",
  atendente: "Só atendente",
};

const VARIANTE_DO_ESTADO: Record<Estado, "success" | "warning" | "neutral"> = {
  bot: "success",
  nao_chegou: "warning",
  pausada: "neutral",
  atendente: "neutral",
};

/** Quantas etiquetas de gatilho cabem na linha antes do "+N". */
const GATILHOS_VISIVEIS = 3;

export function TemplatesClient({ canShare, currentUserId, botDisponivel = false }: Props) {
  const t = useT();
  const { data: templates, isLoading } = useMessageTemplates();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/message-templates/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MessageTemplate | null>(null);
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todas");

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (template: MessageTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  const todos = templates ?? [];
  const doBot = todos.filter((tpl) => estadoDa(tpl) !== "atendente");
  const termo = busca.trim().toLowerCase();
  const visiveis = todos
    .filter((tpl) => {
      if (!botDisponivel || filtro === "todas") return true;
      return filtro === "bot" ? estadoDa(tpl) !== "atendente" : estadoDa(tpl) === "atendente";
    })
    .filter((tpl) => {
      if (!termo) return true;
      return [tpl.title, tpl.body, tpl.shortcut ?? "", ...(tpl.bot_triggers ?? [])].some((campo) =>
        campo.toLowerCase().includes(termo),
      );
    });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const filtros: { valor: Filtro; rotulo: string; total: number }[] = [
    { valor: "todas", rotulo: t("Todas"), total: todos.length },
    { valor: "bot", rotulo: t("O bot responde"), total: doBot.length },
    { valor: "atendente", rotulo: t("Só atendente"), total: todos.length - doBot.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={botDisponivel ? t("Buscar por título, gatilho ou texto") : t("Buscar por título ou texto")}
            aria-label={t("Buscar resposta")}
            className="pl-9"
          />
        </div>
        <Button type="button" onClick={openNew} className="w-full sm:w-auto">
          <Plus /> {t("Nova resposta")}
        </Button>
      </div>

      {botDisponivel && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filtrar respostas")}>
          {filtros.map((f) => (
            <Button
              key={f.valor}
              type="button"
              size="sm"
              variant={filtro === f.valor ? "secondary" : "ghost"}
              aria-pressed={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
            >
              {f.rotulo} · {f.total}
            </Button>
          ))}
        </div>
      )}

      {!todos.length ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma resposta salva ainda.")}</p>
      ) : !visiveis.length ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma resposta encontrada.")}</p>
      ) : (
        // Rolagem só dentro da tabela: no celular a página nunca rola de lado.
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3">{t("Resposta")}</th>
                <th scope="col" className="px-3 py-3">{t("Atalho")}</th>
                {botDisponivel && <th scope="col" className="px-3 py-3">{t("Gatilhos do bot")}</th>}
                {botDisponivel && <th scope="col" className="px-3 py-3">{t("Quando")}</th>}
                <th scope="col" className="px-3 py-3 text-right">{t("Usos")}</th>
                {botDisponivel && <th scope="col" className="px-3 py-3 text-right">{t("Estado")}</th>}
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t("Ações")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((template) => {
                // Só quem pode editar/apagar pela RLS vê as ações: o dono do
                // pessoal, ou manager+ no compartilhado (owner null). Sem isto, um
                // agent veria botões que o backend rejeita (404/nada apagado).
                const canModify =
                  template.owner_user_id === currentUserId ||
                  (template.owner_user_id === null && canShare);
                const estado = estadoDa(template);
                const gatilhos = template.bot_triggers ?? [];
                return (
                  <tr key={template.id} className="border-b align-top last:border-b-0">
                    <td className="max-w-xs px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{template.title}</span>
                        <Badge variant={template.owner_user_id ? "neutral" : "default"}>
                          {t(template.owner_user_id ? "Pessoal" : "Compartilhado")}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">{template.body}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {template.shortcut ? `/${template.shortcut}` : "—"}
                    </td>
                    {botDisponivel && (
                      <td className="max-w-[260px] px-3 py-3">
                        {estado === "atendente" ? (
                          <span className="italic text-muted-foreground">{t("só o atendente usa")}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {gatilhos.slice(0, GATILHOS_VISIVEIS).map((g) => (
                              <Badge key={g} variant="default">
                                {g}
                              </Badge>
                            ))}
                            {gatilhos.length > GATILHOS_VISIVEIS && (
                              <span className="text-xs text-muted-foreground">
                                +{gatilhos.length - GATILHOS_VISIVEIS}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                    {botDisponivel && (
                      <td className="px-3 py-3 text-muted-foreground">
                        {estado === "atendente"
                          ? "—"
                          : template.bot_context === "opening"
                            ? t("Só na 1ª mensagem")
                            : t("Qualquer momento")}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right tabular-nums">{template.usage_count ?? 0}</td>
                    {botDisponivel && (
                      <td className="px-3 py-3 text-right">
                        <Badge
                          variant={VARIANTE_DO_ESTADO[estado]}
                          title={estado === "nao_chegou" ? t("Salve de novo para reenviar ao bot.") : undefined}
                        >
                          {t(ROTULO_DO_ESTADO[estado])}
                        </Badge>
                      </td>
                    )}
                    <td className="px-4 py-2">
                      {canModify && (
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("Editar resposta")}
                            onClick={() => openEdit(template)}
                          >
                            <PencilSimple />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("Excluir resposta")}
                              >
                                <Trash />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("Excluir esta resposta?")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {estado === "atendente"
                                    ? t("Essa ação não pode ser desfeita.")
                                    : t("O bot também para de usar esta resposta. Essa ação não pode ser desfeita.")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    del.mutate(template.id, {
                                      onSuccess: () => toast.success(t("Resposta excluída.")),
                                    })
                                  }
                                >
                                  {t("Excluir")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {botDisponivel && (
        <p className="text-xs text-muted-foreground">
          {t(
            "Uma resposta sem gatilhos é só um atalho de digitação para a equipe. Com gatilhos, o bot passa a responder sozinho, sem consumir IA.",
          )}
        </p>
      )}

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        canShare={canShare}
        botDisponivel={botDisponivel}
        template={editing}
      />
    </div>
  );
}
