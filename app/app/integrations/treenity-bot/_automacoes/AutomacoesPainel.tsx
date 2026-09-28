"use client";

/**
 * Liga/desliga as automações do Treenity Bot (tarefas de "Conferir pagamento
 * PIX", o funil de leads e as respostas salvas no bot) — decisão do cliente, guardada no banco
 * (`organizations.settings.treenity_bot`), nunca variável de ambiente: mudar
 * isso não pode depender de alguém mexer no deploy.
 *
 * `desde` de cada automação é preenchido sozinho (servidor) na hora que ela é
 * ligada pela primeira vez — aqui só mostramos, em texto, pra não sugerir que
 * dá pra "religar" e reprocessar o histórico sem querer.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { copyToClipboard } from "@/lib/clipboard";

interface ConfigDoTreenityBot {
  tarefas: { ativo: boolean; desde: string | null };
  funil: { ativo: boolean; desde: string | null; perdidoDias: number };
  respostas: { ativo: boolean };
  whatsapp: { ativo: boolean; urlN8n: string | null; temChave: boolean; chaveCriadaEm: string | null };
}

async function buscarConfig(): Promise<ConfigDoTreenityBot | null> {
  try {
    const res = await fetch("/api/treenity-bot/configuracoes", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).data as ConfigDoTreenityBot;
  } catch {
    return null;
  }
}

async function salvarConfig(
  patch: Partial<{
    tarefas: { ativo?: boolean };
    funil: { ativo?: boolean; perdido_dias?: number };
    respostas: { ativo?: boolean };
    whatsapp: { ativo?: boolean; url_n8n?: string | null };
  }>,
): Promise<ConfigDoTreenityBot | null> {
  try {
    const res = await fetch("/api/treenity-bot/configuracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    return (await res.json()).data as ConfigDoTreenityBot;
  } catch {
    return null;
  }
}

async function gerarChaveDoWhatsApp(): Promise<string | null> {
  try {
    const res = await fetch("/api/treenity-bot/configuracoes/chave-whatsapp", { method: "POST" });
    if (!res.ok) return null;
    return ((await res.json()).data as { chave: string }).chave;
  } catch {
    return null;
  }
}

export function AutomacoesPainel() {
  const t = useT();
  const tag = useTagDeIdioma();
  const [config, setConfig] = useState<ConfigDoTreenityBot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoTarefas, setSalvandoTarefas] = useState(false);
  const [salvandoFunil, setSalvandoFunil] = useState(false);
  const [salvandoRespostas, setSalvandoRespostas] = useState(false);
  const [perdidoDiasRascunho, setPerdidoDiasRascunho] = useState("7");
  const [salvandoWhatsApp, setSalvandoWhatsApp] = useState(false);
  const [urlN8nRascunho, setUrlN8nRascunho] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  // Lido depois de montar: no servidor não há `window`, e ler durante o render
  // daria HTML diferente entre servidor e navegador.
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    void buscarConfig().then((c) => {
      setOrigem(window.location.origin);
      setConfig(c);
      if (c) setPerdidoDiasRascunho(String(c.funil.perdidoDias));
      if (c) setUrlN8nRascunho(c.whatsapp.urlN8n ?? "");
      setCarregando(false);
    });
  }, []);

  const formatarDesde = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(tag, { dateStyle: "long", timeStyle: "short" }) : null;

  async function alternarTarefas(ativo: boolean) {
    setSalvandoTarefas(true);
    const novo = await salvarConfig({ tarefas: { ativo } });
    setSalvandoTarefas(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(
      ativo
        ? t("Tarefas de pagamento PIX ligadas — vendas novas a partir de agora geram tarefa.")
        : t("Tarefas de pagamento PIX desligadas."),
    );
  }

  async function alternarFunil(ativo: boolean) {
    setSalvandoFunil(true);
    const novo = await salvarConfig({ funil: { ativo } });
    setSalvandoFunil(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(
      ativo
        ? t("Funil de leads ligado — negociações novas a partir de agora entram no Kanban.")
        : t("Funil de leads desligado."),
    );
  }

  async function alternarRespostas(ativo: boolean) {
    setSalvandoRespostas(true);
    const novo = await salvarConfig({ respostas: { ativo } });
    setSalvandoRespostas(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(
      ativo
        ? t("Respostas rápidas no bot ligadas — a lista agora é a do bot, e as com gatilho já valem na próxima mensagem.")
        : t("Respostas rápidas no bot desligadas — a lista voltou a ser só da equipe."),
    );
  }

  async function salvarUrlN8n() {
    const url = urlN8nRascunho.trim();
    if (url && !url.startsWith("https://")) {
      toast.error(t("O endereço do n8n precisa começar com https://"));
      return;
    }
    setSalvandoWhatsApp(true);
    const novo = await salvarConfig({ whatsapp: { url_n8n: url || null, ...(url ? {} : { ativo: false }) } });
    setSalvandoWhatsApp(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(t("Endereço do n8n salvo."));
  }

  async function alternarWhatsApp(ativo: boolean) {
    setSalvandoWhatsApp(true);
    const novo = await salvarConfig({ whatsapp: { ativo } });
    setSalvandoWhatsApp(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(
      ativo
        ? t("Repasse ligado — as mensagens que chegarem no Inbox vão para o bot na hora.")
        : t("Repasse desligado — as mensagens entram no Inbox, mas o bot não recebe."),
    );
  }

  async function gerarChave() {
    setSalvandoWhatsApp(true);
    const chave = await gerarChaveDoWhatsApp();
    setSalvandoWhatsApp(false);
    if (!chave) return toast.error(t("Não foi possível gerar a chave."));
    setChaveNova(chave);
    const atualizado = await buscarConfig();
    if (atualizado) setConfig(atualizado);
  }

  async function copiar(texto: string) {
    if (await copyToClipboard(texto)) toast.success(t("Copiado."));
    else toast.error(t("Não foi possível copiar."));
  }

  async function salvarPerdidoDias() {
    const dias = Number(perdidoDiasRascunho);
    if (!Number.isFinite(dias) || dias < 1 || dias > 90) {
      toast.error(t("Informe um número de dias entre 1 e 90."));
      return;
    }
    setSalvandoFunil(true);
    const novo = await salvarConfig({ funil: { perdido_dias: dias } });
    setSalvandoFunil(false);
    if (!novo) return toast.error(t("Não foi possível salvar."));
    setConfig(novo);
    toast.success(t("Prazo atualizado."));
  }

  if (carregando) {
    return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  }
  if (!config) {
    return <p className="text-sm text-muted-foreground">{t("Não foi possível carregar as automações agora.")}</p>;
  }

  const enderecoDeEnvio = `${origem}/api/treenity-bot/whatsapp/`;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("WhatsApp no Inbox")}</CardTitle>
          <CardDescription>
            {t(
              "As conversas do WhatsApp passam pelo DeskComm e aparecem no Inbox, e o bot continua respondendo. Quando alguém da equipe assume a conversa, o bot fica quieto até ser reativado.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="url-n8n">{t("Endereço do webhook do WhatsApp no n8n")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Cada mensagem que chega é repassada para este endereço na hora, do jeito que a Meta mandou.")}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Input
                id="url-n8n"
                placeholder="https://…/webhook/whatsapp"
                value={urlN8nRascunho}
                onChange={(e) => setUrlN8nRascunho(e.target.value)}
                disabled={salvandoWhatsApp}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={salvandoWhatsApp || urlN8nRascunho.trim() === (config.whatsapp.urlN8n ?? "")}
                onClick={() => void salvarUrlN8n()}
              >
                {t("Salvar")}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
            <div className="space-y-1">
              <Label htmlFor="whatsapp-ativo">{t("Repassar as mensagens ao bot")}</Label>
              <p className="text-xs text-muted-foreground">
                {config.whatsapp.urlN8n
                  ? t("Ligue só depois de o webhook da Meta apontar para o DeskComm (em Conexões).")
                  : t("Salve o endereço do n8n para poder ligar.")}
              </p>
            </div>
            <Switch
              id="whatsapp-ativo"
              checked={config.whatsapp.ativo}
              disabled={salvandoWhatsApp || !config.whatsapp.urlN8n}
              onCheckedChange={(v) => void alternarWhatsApp(v)}
            />
          </div>

          <div className="space-y-2 border-t border-border pt-5">
            <Label>{t("Envio das respostas do bot")}</Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "Nos nós do n8n que enviam mensagem, troque o começo do endereço e use a chave como credencial (cabeçalho Authorization: Bearer). O resto do nó fica igual.",
              )}
            </p>
            <div className="space-y-1 rounded-md bg-muted p-3 font-mono text-xs break-all">
              <p>
                <span className="text-muted-foreground">{t("Antes:")}</span> https://graph.facebook.com/
              </p>
              <p>
                <span className="text-muted-foreground">{t("Depois:")}</span> {enderecoDeEnvio}
              </p>
            </div>
            {chaveNova ? (
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="text-xs font-medium">
                  {t("Copie a chave agora. Ela não aparece de novo.")}
                </p>
                <p className="font-mono text-xs break-all">{chaveNova}</p>
                <Button size="sm" variant="secondary" onClick={() => void copiar(`Bearer ${chaveNova}`)}>
                  {t("Copiar para o n8n")}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {config.whatsapp.temChave && config.whatsapp.chaveCriadaEm
                    ? `${t("Chave criada em")} ${formatarDesde(config.whatsapp.chaveCriadaEm)}. ${t("Gerar outra invalida a atual.")}`
                    : t("Nenhuma chave gerada ainda.")}
                </p>
                <Button size="sm" variant="secondary" disabled={salvandoWhatsApp} onClick={() => void gerarChave()}>
                  {config.whatsapp.temChave ? t("Gerar outra chave") : t("Gerar chave")}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Conferir pagamento PIX")}</CardTitle>
          <CardDescription>
            {t(
              'Quando o bot fecha uma venda por PIX, ele só envia a chave — a API não valida o pagamento. Com isto ligado, cada venda nova "Aguardando Pagamento" vira uma tarefa lembrando um admin de conferir.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="tarefas-ativo">{t("Criar tarefas automaticamente")}</Label>
            {config.tarefas.ativo && config.tarefas.desde ? (
              <p className="text-xs text-muted-foreground">
                {t("Ligado desde")} {formatarDesde(config.tarefas.desde)} — {t("vendas de antes não geram tarefa.")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t("Nenhuma tarefa é criada enquanto estiver desligado.")}</p>
            )}
          </div>
          <Switch
            id="tarefas-ativo"
            checked={config.tarefas.ativo}
            disabled={salvandoTarefas}
            onCheckedChange={(v) => void alternarTarefas(v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Funil de leads (Kanban)")}</CardTitle>
          <CardDescription>
            {t(
              'Atendimentos que chegam em "Proposta" ou já têm uma venda entram como card num funil dedicado ("Treenity Bot"), com o valor da venda e a etapa certa — sem precisar cadastrar nada na mão.',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="funil-ativo">{t("Sincronizar automaticamente")}</Label>
              {config.funil.ativo && config.funil.desde ? (
                <p className="text-xs text-muted-foreground">
                  {t("Ligado desde")} {formatarDesde(config.funil.desde)} — {t("atendimentos de antes não entram no funil.")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("Nenhum lead é criado enquanto estiver desligado.")}</p>
              )}
            </div>
            <Switch
              id="funil-ativo"
              checked={config.funil.ativo}
              disabled={salvandoFunil}
              onCheckedChange={(v) => void alternarFunil(v)}
            />
          </div>

          <div className="space-y-1.5 border-t border-border pt-5">
            <Label htmlFor="perdido-dias">{t("Dias sem resposta do cliente até o lead virar \"perdido\" sozinho")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("O bot não tem um jeito de marcar \"cliente sumiu\" — esta é a autocura: sem atividade por esse tempo, o lead se fecha como perdido automaticamente.")}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <Input
                id="perdido-dias"
                type="number"
                min={1}
                max={90}
                className="w-24"
                value={perdidoDiasRascunho}
                onChange={(e) => setPerdidoDiasRascunho(e.target.value)}
                disabled={salvandoFunil}
              />
              <span className="text-sm text-muted-foreground">{t("dias")}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={salvandoFunil || perdidoDiasRascunho === String(config.funil.perdidoDias)}
                onClick={() => void salvarPerdidoDias()}
              >
                {t("Salvar")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Respostas rápidas no bot")}</CardTitle>
          <CardDescription>
            {t(
              "Um cadastro só para a equipe e para o bot. A equipe usa a resposta pelo / do Inbox, e o bot manda o texto sozinho, na hora e sem consumir IA, quando o cliente escreve um dos gatilhos. Ligado, as respostas passam a ser guardadas no bot, e as que já existiam aqui deixam de aparecer.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="respostas-ativo">{t("Guardar as respostas rápidas no bot")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Os gatilhos são cadastrados em")}{" "}
              <Link href="/app/templates" className="underline underline-offset-2">
                {t("Respostas rápidas")}
              </Link>
              .
            </p>
          </div>
          <Switch
            id="respostas-ativo"
            checked={config.respostas.ativo}
            disabled={salvandoRespostas}
            onCheckedChange={(v) => void alternarRespostas(v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
