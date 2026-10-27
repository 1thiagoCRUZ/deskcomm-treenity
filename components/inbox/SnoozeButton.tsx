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
import { Clock } from "@/lib/ui/icons";
import { useSnoozeConversation } from "@/hooks/inbox/useSnoozeConversation";
import { MAX_DIAS_DATA } from "@/lib/schemas/snooze";

interface Props {
  conversationId: string;
  snoozeUntil: string | null;
  disabled?: boolean;
}

// Curto: avisa só se o cliente não responder.
const DURATIONS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: "Em 1 hora" },
  { hours: 3, label: "Em 3 horas" },
  { hours: 24, label: "Em 24 horas" },
];

// Retorno (pedido do Rodrigo, 27/10/2026): avisa sempre, mesmo depois da venda.
const RETORNOS: Array<{ hours: number; label: string }> = [
  { hours: 168, label: "Em 7 dias" },
  { hours: 360, label: "Em 15 dias" },
  { hours: 720, label: "Em 1 mês" },
];

function isSnoozeActive(snoozeUntil: string | null): boolean {
  return snoozeUntil != null && new Date(snoozeUntil).getTime() > Date.now();
}

/** "AAAA-MM-DD" no fuso de quem está na tela. */
function diaLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function somarDias(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

export function SnoozeButton({ conversationId, snoozeUntil, disabled }: Props) {
  const t = useT();
  const { snooze, cancel } = useSnoozeConversation();
  const isActive = isSnoozeActive(snoozeUntil);
  const isPending = snooze.isPending || cancel.isPending;
  const [escolhendo, setEscolhendo] = useState(false);
  const [dia, setDia] = useState("");

  // A data escolhida começa em 2 dias (antes disso servem os prazos curtos).
  const minimo = diaLocal(somarDias(2));
  const maximo = diaLocal(somarDias(MAX_DIAS_DATA - 1));

  function salvarData() {
    if (!dia) return;
    // 9h da manhã do dia escolhido, no fuso de quem marcou.
    const [a = 0, m = 1, d = 1] = dia.split("-").map(Number);
    const ate = new Date(a, m - 1, d, 9, 0, 0);
    snooze.mutate(
      { conversation_id: conversationId, ate: ate.toISOString() },
      { onSuccess: () => setEscolhendo(false) },
    );
  }

  const ativoAte = isActive && snoozeUntil ? new Date(snoozeUntil) : null;
  const rotuloAtivo =
    ativoAte && ativoAte.getTime() - Date.now() > 24 * 3_600_000
      ? `${t("Lembrete")} ${ativoAte.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })}`
      : t("Lembrete ativo");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || isPending}
            className="flex items-center gap-1"
            title={t("Se o cliente não responder até lá, você recebe um aviso para voltar nele.")}
            aria-label={isActive ? t("Lembrete ativo") : t("Lembrar")}
          >
            <Clock size={12} weight="regular" aria-hidden />
            {isActive ? rotuloAtivo : t("Lembrar")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isActive ? (
            <DropdownMenuItem
              onClick={() => cancel.mutate({ conversation_id: conversationId })}
            >
              {t("Cancelar lembrete")}
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("Se ele não responder")}
              </DropdownMenuLabel>
              {DURATIONS.map((d) => (
                <DropdownMenuItem
                  key={d.hours}
                  onClick={() =>
                    snooze.mutate({ conversation_id: conversationId, duration_hours: d.hours })
                  }
                >
                  {t(d.label)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("Voltar no cliente (avisa sempre)")}
              </DropdownMenuLabel>
              {RETORNOS.map((d) => (
                <DropdownMenuItem
                  key={d.hours}
                  onClick={() =>
                    snooze.mutate({ conversation_id: conversationId, duration_hours: d.hours })
                  }
                >
                  {t(d.label)}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => {
                  setDia("");
                  setEscolhendo(true);
                }}
              >
                {t("Escolher data...")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={escolhendo} onOpenChange={setEscolhendo}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Voltar no cliente")}</DialogTitle>
            <DialogDescription>
              {t("No dia escolhido, às 9h, você recebe um aviso e a conversa volta para o topo do Inbox.")}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="date"
            aria-label={t("Data do retorno")}
            value={dia}
            min={minimo}
            max={maximo}
            onChange={(e) => setDia(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscolhendo(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={salvarData} disabled={!dia || dia < minimo || dia > maximo || snooze.isPending}>
              {t("Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
