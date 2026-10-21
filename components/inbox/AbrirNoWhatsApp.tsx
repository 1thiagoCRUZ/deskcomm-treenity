"use client";
import { useEffect, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { estadoDaJanela } from "@/lib/channels/janela";
import { WhatsappLogo } from "@/lib/ui/icons";
import {
  avisoWhatsAppJaVisto,
  linkWhatsApp,
  marcarAvisoWhatsAppVisto,
} from "@/lib/inbox/link-whatsapp";

/**
 * Leva a equipe ao WhatsApp do cliente (fora do painel). Destaque (primário)
 * quando a janela de 24h fechou; discreto (ghost) quando ainda está aberta.
 * A mensagem sai do aparelho de quem clica e não fica registrada no sistema —
 * por isso o aviso, uma vez por sessão, ANTES de abrir.
 */
export function AbrirNoWhatsApp({
  telefone,
  provider,
  lastInboundAt,
}: {
  telefone: string | null | undefined;
  provider: string | null | undefined;
  lastInboundAt: string | null;
}) {
  const t = useT();
  // Mesmo relógio de 30s do selo da janela, para o destaque acompanhar.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const janelaFechada = estadoDaJanela(provider, lastInboundAt, agora).tipo === "fechada";
  const temCanal = !!provider;
  const [aviso, setAviso] = useState(false);
  const url = temCanal ? linkWhatsApp(telefone) : null;
  if (!url) return null;

  const abrir = () => window.open(url, "_blank", "noopener,noreferrer");

  return (
    <>
      <Button
        size="sm"
        variant={janelaFechada ? "default" : "ghost"}
        data-testid="abrir-no-whatsapp"
        title={t("Abrir no WhatsApp")}
        aria-label={t("Abrir no WhatsApp")}
        onClick={() => (avisoWhatsAppJaVisto() ? abrir() : setAviso(true))}
        className="flex items-center gap-1"
      >
        <WhatsappLogo size={14} aria-hidden />
        {janelaFechada && t("Abrir no WhatsApp")}
      </Button>
      <AlertDialog open={aviso} onOpenChange={setAviso}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Abrir no WhatsApp")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Isto abre o seu WhatsApp. A mensagem sai do número do seu aparelho, não do número da empresa, e não fica registrada no sistema.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                marcarAvisoWhatsAppVisto();
                abrir();
              }}
            >
              {t("Continuar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
