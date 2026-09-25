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
import { Warning } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { temVariavelDoAtendente } from "@/lib/schemas/templates";
import type { MessageTemplate } from "@/hooks/inbox/useMessageTemplates";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canShare: boolean;
  /** A organização ligou "O bot usa as respostas salvas". */
  botDisponivel?: boolean;
  template?: MessageTemplate | null;
}

interface CamposDoBot {
  bot_triggers: string[];
  bot_context: "any" | "opening";
  bot_max_chars: number;
  bot_enabled: boolean;
}

interface CreateInput extends Partial<CamposDoBot> {
  title: string;
  body: string;
  shortcut?: string;
  shared?: boolean;
}

interface UpdateInput extends Partial<CamposDoBot> {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
}

const MAX_CHARS_PADRAO = 60;

/** O único marcador que o bot sabe trocar sozinho. */
const MARCADOR_CUMPRIMENTO = "[cumprimento]";

/**
 * O mesmo cumprimento que o bot põe no lugar de [cumprimento] (horário de
 * Brasília: antes do meio-dia, antes das 18h, depois).
 */
function cumprimentoDeAgora(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

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
          <Badge key={gatilho} variant="default" className="gap-1 pr-1">
            {gatilho}
            <button
              type="button"
              aria-label={`${t("Remover gatilho")} ${gatilho}`}
              className="rounded-sm px-1 leading-none hover:bg-muted"
              onClick={() => onChange(gatilhos.filter((g) => g !== gatilho))}
            >
              ×
            </button>
          </Badge>
        ))}
        <input
          id="tpl-gatilhos"
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
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("O acento e as maiúsculas não importam na comparação.")}
      </p>
    </div>
  );
}

/** Como o cliente vai ver: a primeira frase-gatilho e a resposta que o bot manda. */
function PreviaDoCliente({ gatilho, corpo }: { gatilho: string | null; corpo: string }) {
  const t = useT();
  const texto = corpo.split(MARCADOR_CUMPRIMENTO).join(cumprimentoDeAgora());
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("Como o cliente vai ver")}
      </p>
      <div className="space-y-3 rounded-md border bg-muted/30 p-4">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent-soft px-3 py-2 text-sm">
            {gatilho ?? t("(frase do cliente)")}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-background px-3 py-2 text-sm">
            {texto || t("(a mensagem aparece aqui)")}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("A resposta sai na hora, sem usar IA, se a mensagem do cliente contiver um gatilho e couber no tamanho máximo.")}
      </p>
    </div>
  );
}

export function TemplateFormDialog({ open, onOpenChange, canShare, botDisponivel = false, template }: Props) {
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
  const corpoRef = React.useRef<HTMLTextAreaElement>(null);

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

  // O bot só usa resposta compartilhada: a pessoal é atalho de um atendente.
  // Criar compartilhada exige manager+ (canShare); editar mantém o que já é.
  const compartilhada = isEdit ? template.owner_user_id === null : canShare && shared;
  const mostraBot = botDisponivel && compartilhada && (isEdit ? canShare : true);
  const variavelNoBot = mostraBot && botEnabled && temVariavelDoAtendente(body);

  /**
   * Os campos do bot só vão quando o bloco aparece. Sem ele, um PATCH não pode
   * mexer nos gatilhos que a pessoa nem está vendo.
   */
  const camposDoBot = (): Partial<CamposDoBot> =>
    mostraBot
      ? {
          bot_triggers: gatilhos,
          bot_context: botContext,
          bot_max_chars: Number(maxChars) || MAX_CHARS_PADRAO,
          // Ligado sem gatilho é uma resposta automática que nunca dispara — o
          // servidor recusa, então nem mandamos: o botão já fica desabilitado.
          bot_enabled: botEnabled && gatilhos.length > 0,
        }
      : {};

  const inserirCumprimento = () => {
    const campo = corpoRef.current;
    const inicio = campo?.selectionStart ?? body.length;
    const fim = campo?.selectionEnd ?? body.length;
    setBody(body.slice(0, inicio) + MARCADOR_CUMPRIMENTO + body.slice(fim));
    requestAnimationFrame(() => {
      campo?.focus();
      const cursor = inicio + MARCADOR_CUMPRIMENTO.length;
      campo?.setSelectionRange(cursor, cursor);
    });
  };

  const avisarResultado = (salva: MessageTemplate | undefined, mensagemDeSucesso: string) => {
    if (salva?.bot_sync_error) {
      toast.warning(t("Salvo, mas não chegou ao bot. Salve de novo em instantes para reenviar."));
    } else if (mostraBot && botEnabled && gatilhos.length > 0) {
      toast.success(t("Salvo. O bot já usa esta resposta na próxima mensagem."));
    } else {
      toast.success(mensagemDeSucesso);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        const res = await update.mutateAsync({
          id: template.id,
          title,
          body,
          shortcut: shortcut.trim() || null,
          ...camposDoBot(),
        });
        avisarResultado(res?.data, t("Resposta atualizada."));
      } else {
        const res = await create.mutateAsync({
          title,
          body,
          shortcut: shortcut.trim() || undefined,
          shared: canShare ? shared : false,
          ...camposDoBot(),
        });
        avisarResultado(res?.data, t("Resposta criada."));
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  const blocoDoBotAberto = mostraBot && botEnabled;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={blocoDoBotAberto ? "max-h-[90vh] overflow-y-auto sm:max-w-4xl" : "max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("Editar resposta") : t("Nova resposta")}</DialogTitle>
          <DialogDescription>
            {botDisponivel
              ? t("A mesma resposta serve à equipe, pelo / do Inbox, e ao bot, quando tem gatilhos.")
              : t("Scripts salvos para responder mais rápido no atendimento.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className={blocoDoBotAberto ? "grid gap-6 md:grid-cols-5" : "space-y-4"}>
            <div className={blocoDoBotAberto ? "space-y-4 md:col-span-3" : "space-y-4"}>
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
                <p className="text-xs text-muted-foreground">{t("Só a sua equipe vê. O cliente nunca lê o título.")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-body">{t("Mensagem")}</Label>
                <Textarea
                  id="tpl-body"
                  ref={corpoRef}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={blocoDoBotAberto ? t("[cumprimento], tudo certo? Como posso ajudar?") : t("Oi {{primeiro_nome}}, tudo bem?")}
                  minLength={1}
                  maxLength={4096}
                  required
                  rows={5}
                  aria-invalid={variavelNoBot || undefined}
                  aria-describedby="tpl-body-dica"
                />
                {blocoDoBotAberto ? (
                  <div id="tpl-body-dica" className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t("Inserir:")}</span>
                      <Button type="button" variant="outline" size="sm" className="font-mono text-xs" onClick={inserirCumprimento}>
                        {MARCADOR_CUMPRIMENTO}
                      </Button>
                      <span className="text-xs text-muted-foreground">{t("vira Bom dia, Boa tarde ou Boa noite pelo horário.")}</span>
                    </div>
                    {variavelNoBot && (
                      <p className="text-xs text-error-fg">
                        {t("O bot não preenche {{…}}. Troque por [cumprimento] ou escreva o texto sem variáveis.")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p id="tpl-body-dica" className="text-xs text-muted-foreground">
                    {t("Use")} {"{{primeiro_nome}}"} {t("e")} {"{{nome}}"} {t("para personalizar.")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-shortcut">{t("Atalho do atendente (opcional)")}</Label>
                <div className="flex items-center rounded-md border bg-background pl-3 focus-within:ring-2 focus-within:ring-ring">
                  <span className="font-mono text-sm text-muted-foreground" aria-hidden="true">
                    /
                  </span>
                  <Input
                    id="tpl-shortcut"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value.replace(/^\//, ""))}
                    placeholder="oi"
                    maxLength={40}
                    className="border-0 pl-1 font-mono shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("O que a equipe digita no Inbox para colar este texto.")}</p>
              </div>
              {canShare && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="tpl-shared"
                    checked={isEdit ? compartilhada : shared}
                    onCheckedChange={setShared}
                    disabled={isEdit}
                  />
                  <Label htmlFor="tpl-shared">{t("Compartilhar com a equipe")}</Label>
                </div>
              )}
              {botDisponivel && canShare && !compartilhada && !isEdit && (
                <p className="text-xs text-muted-foreground">
                  {t("Para o bot poder usar esta resposta, compartilhe com a equipe.")}
                </p>
              )}

              {/* O bot é um bloco à parte, e não mais um campo solto: quem só quer
                  o atalho de digitação fecha aqui e nunca precisa entender o resto. */}
              {mostraBot && (
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
                        <Label htmlFor="tpl-gatilhos">{t("Gatilhos")}</Label>
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
                            aria-describedby="tpl-bot-max-dica"
                          />
                          <p id="tpl-bot-max-dica" className="text-xs text-muted-foreground">
                            {t("Mensagem do cliente maior que isso vai para a IA.")}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 rounded-md border border-warning-fg/40 bg-warning-bg p-3 text-warning-fg">
                        <Warning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{t("Cuidado com gatilhos abertos")}</p>
                          <p className="text-xs">
                            {t(
                              "Evite gatilhos abertos: um gatilho como preço faria o bot responder sempre um texto fixo e parar de calcular o valor de verdade.",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {blocoDoBotAberto && (
              <div className="md:col-span-2">
                <PreviaDoCliente gatilho={gatilhos[0] ?? null} corpo={body} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              type="submit"
              disabled={pending || (blocoDoBotAberto && gatilhos.length === 0) || variavelNoBot}
            >
              {pending ? t("Salvando…") : isEdit ? t("Salvar") : t("Criar resposta")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
