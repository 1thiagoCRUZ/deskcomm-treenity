"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Clock } from "@/lib/ui/icons";
import { CampoDePrazo, minutosDoPrazo, type Prazo } from "@/components/inbox/CampoDePrazo";
import { LembrarOpcoesDialog } from "@/components/inbox/LembrarOpcoesDialog";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";
import { useLembrarOpcoes, useMensagemAgendada } from "@/hooks/inbox/useLembrar";
import { estadoDaJanela, formatarRestante } from "@/lib/channels/janela";
import {
  INTERNO_MAX_MINUTOS,
  INTERNO_MIN_MINUTOS,
  JANELA_MAX_MINUTOS,
  JANELA_MIN_MINUTOS,
  rotuloDoPrazo,
  separarPrazo,
} from "@/lib/schemas/snooze";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  /** Para a conta da janela de 24 h (`estadoDaJanela`); a tela não interpreta. */
  provider?: string | null;
  lastInboundAt?: string | null;
  /** Gestão (manager+) edita os botões da empresa. */
  podeEditarOpcoes?: boolean;
  disabled?: boolean;
}

/**
 * O "Lembrar" do Inbox, em duas partes (pedido do Rodrigo, 27/10/2026):
 *   - JANELA ABERTA: escreve a mensagem e o servidor manda ao cliente no horário
 *     (até 24 h e nunca depois do fim da janela; ver `mensagem-agendada`);
 *   - ME LEMBRAR: aviso interno do prazo que quiser (`snooze`).
 * Os botões de cada parte são da empresa (`/api/v1/settings/lembrar`); "Outro..."
 * serve para um prazo de uma vez só.
 */

function isSnoozeActive(snoozeUntil: string | null): boolean {
  return snoozeUntil != null && new Date(snoozeUntil).getTime() > Date.now();
}

/** "AAAA-MM-DD" no fuso de quem está na tela. */
function diaLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function horaCurta(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" });
}

function prazoInicial(minutos: number): Prazo {
  const { quantidade, unidade } = separarPrazo(minutos);
  return { quantidade: String(quantidade), unidade };
}

export function SnoozeButton({
  conversationId,
  snoozeUntil,
  provider = null,
  lastInboundAt = null,
  podeEditarOpcoes = false,
  disabled,
}: Props) {
  const t = useT();
  const { snooze, cancel } = useSnoozeConversation();
  const { opcoes } = useLembrarOpcoes();
  const { marcada, marcar, cancelar } = useMensagemAgendada(conversationId);
  const isActive = isSnoozeActive(snoozeUntil);
  const isPending = snooze.isPending || cancel.isPending || marcar.isPending || cancelar.isPending;

  // Janela aberta: o diálogo da mensagem (com o prazo escolhido já preenchido).
  const [mensagemAberta, setMensagemAberta] = useState(false);
  const [texto, setTexto] = useState("");
  const [prazoMsg, setPrazoMsg] = useState<Prazo>({ quantidade: "1", unidade: "hora" });
  // Me lembrar: "Outro prazo...".
  const [outroAberto, setOutroAberto] = useState(false);
  const [prazoOutro, setPrazoOutro] = useState<Prazo>({ quantidade: "3", unidade: "mes" });
  const [dia, setDia] = useState("");
  const [editando, setEditando] = useState(false);

  const agora = new Date();
  const janela = estadoDaJanela(provider, lastInboundAt, agora);
  // Até onde a mensagem pode ir: o fim da janela, e nunca mais que 24 h.
  const limiteMsgMin =
    janela.tipo === "aberta"
      ? Math.min(JANELA_MAX_MINUTOS, Math.floor(janela.restanteMs / 60_000))
      : janela.tipo === "sem_restricao"
        ? JANELA_MAX_MINUTOS
        : 0;
  const janelaFechada = janela.tipo === "fechada" || limiteMsgMin < JANELA_MIN_MINUTOS;

  const minutosMsg = minutosDoPrazo(prazoMsg);
  const msgValida =
    texto.trim().length > 0 && minutosMsg !== null && minutosMsg >= JANELA_MIN_MINUTOS && minutosMsg <= limiteMsgMin;
  const saiAs = minutosMsg !== null ? new Date(agora.getTime() + minutosMsg * 60_000) : null;

  const minutosOutro = minutosDoPrazo(prazoOutro);
  const outroValido = dia
    ? dia > diaLocal(agora)
    : minutosOutro !== null && minutosOutro >= INTERNO_MIN_MINUTOS && minutosOutro <= INTERNO_MAX_MINUTOS;

  function abrirMensagem(minutos: number) {
    setPrazoMsg(prazoInicial(minutos));
    setTexto("");
    setMensagemAberta(true);
  }

  function salvarMensagem() {
    if (!msgValida || minutosMsg === null) return;
    marcar.mutate({ minutos: minutosMsg, texto: texto.trim() }, { onSuccess: () => setMensagemAberta(false) });
  }

  function salvarOutro() {
    if (!outroValido) return;
    if (dia) {
      // 9h da manhã do dia escolhido, no fuso de quem marcou.
      const [a = 0, m = 1, d = 1] = dia.split("-").map(Number);
      snooze.mutate(
        { conversation_id: conversationId, ate: new Date(a, m - 1, d, 9, 0, 0).toISOString() },
        { onSuccess: () => setOutroAberto(false) },
      );
    } else if (minutosOutro !== null) {
      snooze.mutate({ conversation_id: conversationId, minutos: minutosOutro }, { onSuccess: () => setOutroAberto(false) });
    }
  }

  const ativoAte = isActive && snoozeUntil ? new Date(snoozeUntil) : null;
  const marcadaEm = marcada ? new Date(marcada.enviar_em) : null;
  const rotuloAtivo = marcadaEm
    ? `${t("Mensagem")} ${horaCurta(marcadaEm)}`
    : ativoAte && ativoAte.getTime() - agora.getTime() > 24 * 3_600_000
      ? `${t("Lembrete")} ${dataCurta(ativoAte)}`
      : t("Lembrete ativo");
  const algoAtivo = isActive || !!marcada;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || isPending}
            className="flex items-center gap-1"
            title={t("Mandar uma mensagem ao cliente mais tarde ou receber um aviso para voltar nele.")}
            aria-label={algoAtivo ? t("Lembrete ativo") : t("Lembrar")}
          >
            <Clock size={12} weight="regular" aria-hidden />
            {algoAtivo ? rotuloAtivo : t("Lembrar")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("Janela aberta")}
            {janela.tipo === "aberta" && !janelaFechada && (
              <span className="block">
                {t("Fecha em")} {formatarRestante(janela.restanteMs)}
              </span>
            )}
          </DropdownMenuLabel>
          {marcada && marcadaEm ? (
            <DropdownMenuItem onClick={() => cancelar.mutate()}>
              {t("Cancelar mensagem das")} {horaCurta(marcadaEm)}
            </DropdownMenuItem>
          ) : janelaFechada ? (
            <DropdownMenuItem disabled>{t("Janela fechada: só depois que o cliente escrever")}</DropdownMenuItem>
          ) : (
            <>
              {opcoes.janela.map((m) => (
                <DropdownMenuItem key={m} disabled={m > limiteMsgMin} onClick={() => abrirMensagem(m)}>
                  {rotuloDoPrazo(m, t)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => abrirMensagem(Math.min(30, limiteMsgMin))}>
                {t("Outro horário...")}
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("Me lembrar")}</DropdownMenuLabel>
          {isActive && ativoAte ? (
            <DropdownMenuItem onClick={() => cancel.mutate({ conversation_id: conversationId })}>
              {t("Cancelar lembrete de")} {dataCurta(ativoAte)} {horaCurta(ativoAte)}
            </DropdownMenuItem>
          ) : (
            <>
              {opcoes.interno.map((m) => (
                <DropdownMenuItem
                  key={m}
                  onClick={() => snooze.mutate({ conversation_id: conversationId, minutos: m })}
                >
                  {rotuloDoPrazo(m, t)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => {
                  setDia("");
                  setOutroAberto(true);
                }}
              >
                {t("Outro prazo...")}
              </DropdownMenuItem>
            </>
          )}

          {podeEditarOpcoes && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEditando(true)}>{t("Editar opções...")}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={mensagemAberta} onOpenChange={setMensagemAberta}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Mandar mensagem ao cliente")}</DialogTitle>
            <DialogDescription>
              {t("O sistema manda sozinho no horário. Se o cliente responder antes ou a janela fechar, a mensagem não vai e você recebe um aviso.")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={t("Mensagem")}
            placeholder={t("Ex.: Oi! Conseguiu ver o orçamento?")}
            value={texto}
            maxLength={4096}
            rows={4}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("Daqui a")}</span>
            <CampoDePrazo
              rotulo="Daqui a quanto tempo"
              valor={prazoMsg}
              unidades={["minuto", "hora"]}
              onChange={setPrazoMsg}
            />
            <p className="text-xs text-muted-foreground">
              {saiAs && msgValida ? `${t("Sai às")} ${horaCurta(saiAs)}. ` : ""}
              {janela.tipo === "aberta"
                ? `${t("A janela fecha às")} ${horaCurta(new Date(agora.getTime() + janela.restanteMs))}.`
                : t("No máximo 24 horas.")}
            </p>
            {minutosMsg !== null && minutosMsg > limiteMsgMin && (
              <p className="text-xs text-destructive">{t("Esse horário passa do fim da janela. Escolha um mais cedo.")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMensagemAberta(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={salvarMensagem} disabled={!msgValida || marcar.isPending}>
              {t("Marcar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={outroAberto} onOpenChange={setOutroAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Me lembrar")}</DialogTitle>
            <DialogDescription>
              {t("Na hora marcada você recebe um aviso e a conversa volta para o topo do Inbox.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("Daqui a")}</span>
            <CampoDePrazo
              rotulo="Daqui a quanto tempo"
              valor={prazoOutro}
              unidades={["hora", "dia", "semana", "mes"]}
              onChange={(p) => {
                setPrazoOutro(p);
                setDia("");
              }}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("ou no dia (às 9h)")}</span>
            <Input
              type="date"
              aria-label={t("Data do retorno")}
              value={dia}
              min={diaLocal(new Date(agora.getTime() + 86_400_000))}
              onChange={(e) => setDia(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutroAberto(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={salvarOutro} disabled={!outroValido || snooze.isPending}>
              {t("Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {podeEditarOpcoes && <LembrarOpcoesDialog open={editando} onOpenChange={setEditando} />}
    </>
  );
}
