"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { definirAgendaDaEquipe } from "@/app/actions/settings/definirAgendaDaEquipe";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/**
 * O Dono decide se a equipe usa a Agenda. Desligada, o Funcionário não vê a
 * Agenda no menu; ligada, vê. O Dono vê sempre.
 */
export function AgendaDaEquipe({ ligadaInicial }: { ligadaInicial: boolean }) {
  const t = useT();
  const router = useRouter();
  const [ligada, setLigada] = useState(ligadaInicial);
  const [pendente, iniciar] = useTransition();

  function mudar(valor: boolean) {
    const anterior = ligada;
    setLigada(valor);
    iniciar(async () => {
      const r = await definirAgendaDaEquipe(valor);
      if (!r.ok) {
        setLigada(anterior);
        toast.error(t(r.erro));
        return;
      }
      toast.success(valor ? t("A equipe agora vê a Agenda.") : t("A Agenda saiu do menu da equipe."));
      router.refresh();
    });
  }

  return (
    <section className="flex items-start justify-between gap-4 rounded-xl border p-4" data-testid="agenda-da-equipe">
      <div className="space-y-1">
        <h2 className="font-semibold">{t("Minha equipe usa a Agenda")}</h2>
        <p className="text-sm text-text-muted">
          {t("Ligado: os funcionários veem a Agenda no menu. Desligado: só você e os gerentes veem. Cada empresa tem a sua agenda, separada das outras.")}
        </p>
      </div>
      <Switch
        checked={ligada}
        disabled={pendente}
        onCheckedChange={mudar}
        aria-label={t("Minha equipe usa a Agenda")}
      />
    </section>
  );
}
