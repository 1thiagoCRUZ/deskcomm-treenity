"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  template?: MessageTemplate | null;
}

interface CamposDoBot {
  bot_triggers: string[];
  bot_context: "any" | "opening";
  bot_max_chars: number;
  bot_enabled: boolean;
}

interface CreateInput extends CamposDoBot {
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
}

interface UpdateInput extends CamposDoBot {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

const MAX_CHARS_PADRAO = 60;

/**
 * Editor de gatilhos. Cada frase vira uma etiqueta ao apertar Enter ou vírgula.
 *
 * Um campo de texto solto separado por vírgula parece mais simples e não é: o
 * gatilho "quanto custa, mais ou menos" tem vírgula dentro, e o cliente só
 * descobriria o problema quando o bot parasse de responder.
 */
function EditorDeGatilhos({
  gatilhos,
  onChange,
}: {
  gatilhos: string[];
  onChange: (proximos: string[]) => void;
}) {
  const t = useT();
  const [rascunho, setRascunho] = React.useState("");

  const adicionar = (bruto: string) => {
    const limpo = bruto.trim();
    if (limpo.length < 2) return;
    // A normalização de verdade acontece no servidor (schema). Aqui só evita a
    // duplicata óbvia, para a etiqueta não aparecer duas vezes na tela.
    if (!gatilhos.some((g) => g.toLowerCase() === limpo.toLowerCase())) {
      onChange([...gatilhos, limpo]);
    }
    setRascunho("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-2">
        {gatilhos.map((gatilho) => (
          <Badge key={gatilho} variant="neutral" className="gap-1 pr-1">
            {gatilho}
            <button
              type="button"
              aria-label={t("Remover gatilho")}
              className="rounded-sm px-1 leading-none hover:bg-muted"
              onClick={() => onChange(gatilhos.filter((g) => g !== gatilho))}
            >
              ×
            </button>
          </Badge>
        ))}
        <input
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              // Enter dentro do formulário enviaria o form: aqui ele só fecha a
              // etiqueta.
              e.preventDefault();
              adicionar(rascunho);
            } else if (e.key === "Backspace" && !rascunho && gatilhos.length) {
              onChange(gatilhos.slice(0, -1));
            }
          }}
          onBlur={() => adicionar(rascunho)}
          placeholder={t("digite e aperte Enter")}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          aria-label={t("Gatilhos")}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("O acento e as maiúsculas não importam na comparação.")}
      </p>
    </div>
  );
}

export function TemplateFormDialog({ open, onOpenChange, canShare, template }: Props) {
  const t = useT();
  const isEdit = !!template;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [shortcut, setShortcut] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [botEnabled, setBotEnabled] = React.useState(false);
  const [gatilhos, setGatilhos] = React.useState<string[]>([]);
  const [botContext, setBotContext] = React.useState<"any" | "opening">("any");
  const [maxChars, setMaxChars] = React.useState(String(MAX_CHARS_PADRAO));

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: CreateInput) =>
      apiClient.post<{ data: MessageTemplate }>("/api/v1/message-templates", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: UpdateInput) =>
      apiClient.patch<{ data: MessageTemplate }>(`/api/v1/message-templates/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) return;
    setTitle(template?.title ?? "");
    setBody(template?.body ?? "");
    setShortcut(template?.shortcut ?? "");
    setShared(template ? template.owner_user_id === null : false);
    setBotEnabled(template?.bot_enabled ?? false);
    setGatilhos(template?.bot_triggers ?? []);
    setBotContext(template?.bot_context ?? "any");
    setMaxChars(String(template?.bot_max_chars ?? MAX_CHARS_PADRAO));
  }, [open, template]);

  const camposDoBot = (): CamposDoBot => ({
    bot_triggers: gatilhos,
    bot_context: botContext,
    bot_max_chars: Number(maxChars) || MAX_CHARS_PADRAO,
    // Ligado sem gatilho é uma resposta automática que nunca dispara — o
    // servidor recusa, então nem mandamos: o botão já fica desabilitado.
    bot_enabled: botEnabled && gatilhos.length > 0,
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: template.id,
          title,
          body,
          shortcut: shortcut.trim() || null,
          ...camposDoBot(),
        });
        toast.success(t("Template atualizado."));
      } else {
        await create.mutateAsync({
          title,
          body,
          shortcut: shortcut.trim() || undefined,
          shared: canShare ? shared : false,
          ...camposDoBot(),
        });
        toast.success(t("Template criado."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar template") : t("Novo template")}</DialogTitle>
          <DialogDescription>
            {t("Scripts salvos para responder mais rápido no atendimento.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t("Título")}</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Saudação inicial")}
              minLength={1}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">{t("Mensagem")}</Label>
            <Textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("Oi {{primeiro_nome}}, tudo bem?")}
              minLength={1}
              maxLength={4096}
              required
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              {t("Use")} {"{{primeiro_nome}}"} {t("e")} {"{{nome}}"} {t("para personalizar.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-shortcut">{t("Atalho (opcional)")}</Label>
            <Input
              id="tpl-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="oi"
              maxLength={40}
            />
          </div>
          {canShare && (
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-shared"
                checked={shared}
                onCheckedChange={setShared}
                disabled={isEdit}
              />
              <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
            </div>
          )}

          {/* O bot é um bloco à parte, e não mais um campo solto: quem só quer
              o atalho de digitação fecha aqui e nunca precisa entender o resto. */}
          <div className="space-y-4 rounded-md border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Switch
                id="tpl-bot"
                checked={botEnabled}
                onCheckedChange={setBotEnabled}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="tpl-bot">{t("O bot responde sozinho")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Quando o cliente escrever algo da lista, esta mensagem sai na hora, sem consumir IA.",
                  )}
                </p>
              </div>
            </div>

            {botEnabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("Gatilhos")}</Label>
                  <EditorDeGatilhos gatilhos={gatilhos} onChange={setGatilhos} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tpl-bot-context">{t("Quando pode disparar")}</Label>
                    <Select
                      value={botContext}
                      onValueChange={(v) => setBotContext(v as "any" | "opening")}
                    >
                      <SelectTrigger id="tpl-bot-context">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">{t("Em qualquer momento")}</SelectItem>
                        <SelectItem value="opening">{t("Só na primeira mensagem")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tpl-bot-max">{t("Tamanho máximo da mensagem")}</Label>
                    <Input
                      id="tpl-bot-max"
                      type="number"
                      min={10}
                      max={400}
                      value={maxChars}
                      onChange={(e) => setMaxChars(e.target.value)}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t(
                    "Evite gatilhos abertos: um gatilho como preço faria o bot responder sempre um texto fixo e parar de calcular o valor de verdade.",
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={pending || (botEnabled && gatilhos.length === 0)}>
              {isEdit ? t("Salvar") : t("Criar template")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
