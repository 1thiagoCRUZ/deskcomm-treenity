"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { CheckCircle } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { encerrarAtendimentoAction } from "./_actions";

interface Props {
  atendimentoId: string;
}

export function EncerrarAtendimentoButton({ atendimentoId }: Props) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function confirmar() {
    startTransition(async () => {
      const res = await encerrarAtendimentoAction(atendimentoId);
      setOpen(false);
      if (res.ok) {
        toast.success(t("Atendimento encerrado. A IA volta a responder este cliente normalmente."));
        router.refresh();
      } else {
        toast.error(t("Não foi possível encerrar o atendimento agora."));
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <CheckCircle size={14} weight="fill" className="text-accent" aria-hidden />
        {t("Encerrar atendimento")}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Encerrar este atendimento?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A IA volta a responder normalmente na próxima mensagem deste cliente. Use depois de já ter resolvido a situação na conversa.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar} disabled={isPending}>
              {t("Encerrar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
