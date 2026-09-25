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

interface ConfigDoTreenityBot {
  tarefas: { ativo: boolean; desde: string | null };
  funil: { ativo: boolean; desde: string | null; perdidoDias: number };
  respostas: { ativo: boolean };
  /** Só vem quando o PATCH ligou/desligou as respostas: o resultado do reenvio. */
  espelho?: { enviadas: number; falharam: number };
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

export function AutomacoesPainel() {
  const t = useT();
  const tag = useTagDeIdioma();
  const [config, setConfig] = useState<ConfigDoTreenityBot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoTarefas, setSalvandoTarefas] = useState(false);
  const [salvandoFunil, setSalvandoFunil] = useState(false);
  const [salvandoRespostas, setSalvandoRespostas] = useState(false);
  const [perdidoDiasRascunho, setPerdidoDiasRascunho] = useState("7");

  useEffect(() => {
    void buscarConfig().then((c) => {
      setConfig(c);
      if (c) setPerdidoDiasRascunho(String(c.funil.perdidoDias));
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
    if (novo.espelho && novo.espelho.falharam > 0) {
      toast.warning(
        `${t("Salvo, mas algumas respostas não chegaram ao bot")}: ${novo.espelho.falharam}. ${t("Salve cada uma de novo em Respostas rápidas para reenviar.")}`,
      );
      return;
    }
    toast.success(
      ativo
        ? t("Respostas no bot ligadas — as que têm gatilho já valem na próxima mensagem.")
        : t("Respostas no bot desligadas — o bot parou de usar as respostas salvas."),
    );
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

  return (
    <div className="max-w-2xl space-y-6">
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
          <CardTitle>{t("Respostas salvas no bot")}</CardTitle>
          <CardDescription>
            {t(
              "Uma resposta compartilhada com gatilhos passa a ser enviada pelo bot sozinho, na hora e sem consumir IA, quando o cliente escreve uma das frases. As mesmas respostas continuam no / do Inbox para a equipe.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="respostas-ativo">{t("O bot usa as respostas salvas")}</Label>
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
