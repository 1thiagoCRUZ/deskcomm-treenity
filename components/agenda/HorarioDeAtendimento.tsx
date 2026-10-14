"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { useUser } from "@/hooks/auth/AuthProvider";
import { useAttendants, useUpdateAvailability } from "@/hooks/team/useAttendants";
import { Plus, Trash } from "@/lib/ui/icons";
import { FUSOS_OFERECIDOS, FUSO_PADRAO } from "@/lib/tempo/fusos";
import type { ScheduleWindow } from "@/lib/schemas/routing";

/**
 * Onde a pessoa diz em que dias e horas atende.
 *
 * Existia só dentro de Equipe → atendente, em formato de lista de "janelas"
 * (dia + início + fim), que ninguém procura ao abrir a Agenda. A grade e os
 * horários que o CADU oferece saem DESTE cadastro, então ele precisa estar a um
 * clique da própria Agenda — e falar a língua de quem usa: dias da semana,
 * ligar/desligar, das X às Y.
 */

const DIAS = [
  { dow: 1, nome: "Segunda-feira" },
  { dow: 2, nome: "Terça-feira" },
  { dow: 3, nome: "Quarta-feira" },
  { dow: 4, nome: "Quinta-feira" },
  { dow: 5, nome: "Sexta-feira" },
  { dow: 6, nome: "Sábado" },
  { dow: 0, nome: "Domingo" },
] as const;

const PADRAO = { start: "08:00", end: "18:00" };

type PorDia = Record<number, Array<{ start: string; end: string }>>;

function agrupar(windows: ScheduleWindow[]): PorDia {
  const por: PorDia = {};
  for (const w of windows) (por[w.dow] ??= []).push({ start: w.start, end: w.end });
  return por;
}

function achatar(por: PorDia): ScheduleWindow[] {
  return DIAS.flatMap(({ dow }) => (por[dow] ?? []).map((i) => ({ dow, ...i })));
}

const PREDEFINICOES: Array<{ rotulo: string; dias: number[]; start: string; end: string }> = [
  { rotulo: "Segunda a sexta, 8h às 18h", dias: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" },
  { rotulo: "Segunda a sábado, 8h às 18h", dias: [1, 2, 3, 4, 5, 6], start: "08:00", end: "18:00" },
  { rotulo: "Todos os dias, 9h às 21h", dias: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "21:00" },
];

export function HorarioDeAtendimento({
  aberto,
  onFechar,
}: {
  aberto: boolean;
  onFechar: () => void;
}) {
  const t = useT();
  const eu = useUser();
  const { data } = useAttendants();
  const salvar = useUpdateAvailability();
  const qc = useQueryClient();
  const equipe = data?.data ?? [];
  const [quemId, setQuemId] = React.useState<string>(eu.id);
  const pessoa = equipe.find((a) => a.user_id === quemId);

  const [fuso, setFuso] = React.useState(FUSO_PADRAO);
  const [dias, setDias] = React.useState<PorDia>({});
  // Recarrega o rascunho ao trocar de pessoa ou quando o cadastro chega.
  React.useEffect(() => {
    const sch = pessoa?.schedule;
    setFuso(sch?.timezone || FUSO_PADRAO);
    setDias(agrupar(sch?.windows ?? []));
  }, [pessoa?.user_id, pessoa?.updated_at, pessoa?.schedule]);

  const mudar = (dow: number, fn: (l: Array<{ start: string; end: string }>) => Array<{ start: string; end: string }>) =>
    setDias((d) => ({ ...d, [dow]: fn(d[dow] ?? []) }));

  const invalido = Object.values(dias).some((l) => l.some((i) => !i.start || !i.end || i.start >= i.end));
  const nenhum = achatar(dias).length === 0;

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="horario-de-atendimento">
        <SheetHeader>
          <SheetTitle>{t("Horário de atendimento")}</SheetTitle>
          <SheetDescription>
            {t("Defina em quais dias e horas a pessoa atende. É a partir daqui que a Agenda mostra horários livres e que o CADU oferece horários aos clientes.")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {equipe.length > 1 && (
            <label className="block text-xs font-medium text-text-muted">
              {t("Horário de")}
              <select
                value={quemId}
                onChange={(e) => setQuemId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text"
              >
                {equipe.map((a) => (
                  <option key={a.user_id} value={a.user_id}>
                    {a.name ?? a.email ?? a.user_id}
                    {a.user_id === eu.id ? ` (${t("você")})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-text-muted">{t("Atalhos")}</p>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINICOES.map((p) => (
                <button
                  key={p.rotulo}
                  type="button"
                  onClick={() =>
                    setDias(Object.fromEntries(p.dias.map((d) => [d, [{ start: p.start, end: p.end }]])))
                  }
                  className="rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
                >
                  {t(p.rotulo)}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {DIAS.map(({ dow, nome }) => {
              const lista = dias[dow] ?? [];
              const ligado = lista.length > 0;
              return (
                <li key={dow} className="flex items-start gap-3 px-3 py-2.5">
                  <Switch
                    checked={ligado}
                    aria-label={t(nome)}
                    onCheckedChange={(on) => mudar(dow, () => (on ? [{ ...PADRAO }] : []))}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t(nome)}</p>
                    {!ligado ? (
                      <p className="text-xs text-text-muted">{t("Não atende")}</p>
                    ) : (
                      <div className="mt-1 space-y-1.5">
                        {lista.map((i, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={i.start}
                              aria-label={t("Início")}
                              onChange={(e) =>
                                mudar(dow, (l) => l.map((x, j) => (j === idx ? { ...x, start: e.target.value } : x)))
                              }
                              className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                            />
                            <span className="text-xs text-text-muted">{t("até")}</span>
                            <input
                              type="time"
                              value={i.end}
                              aria-label={t("Fim")}
                              onChange={(e) =>
                                mudar(dow, (l) => l.map((x, j) => (j === idx ? { ...x, end: e.target.value } : x)))
                              }
                              className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                            />
                            {lista.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t("Remover intervalo")}
                                onClick={() => mudar(dow, (l) => l.filter((_, j) => j !== idx))}
                              >
                                <Trash size={16} />
                              </Button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => mudar(dow, (l) => [...l, { start: "14:00", end: "18:00" }])}
                          className="flex items-center gap-1 text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
                        >
                          <Plus size={12} /> {t("Adicionar intervalo (ex.: depois do almoço)")}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <label className="block text-xs font-medium text-text-muted">
            {t("Fuso horário")}
            <select
              value={fuso}
              onChange={(e) => setFuso(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text"
            >
              {FUSOS_OFERECIDOS.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.rotulo} — {f.codigo}
                </option>
              ))}
            </select>
          </label>

          {nenhum && (
            <p role="status" className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-muted">
              {t("Sem nenhum dia ligado, ninguém consegue marcar horário com esta pessoa.")}
            </p>
          )}
          {invalido && (
            <p role="alert" className="text-xs text-error">
              {t("Em algum dia o horário de início está depois do fim. Corrija para salvar.")}
            </p>
          )}

          <div className="flex justify-end gap-2 pb-4">
            <Button variant="ghost" onClick={onFechar}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={invalido || salvar.isPending || !pessoa}
              data-testid="salvar-horario"
              onClick={() =>
                salvar.mutate(
                  { userId: quemId, patch: { schedule: { timezone: fuso, windows: achatar(dias) } } },
                  {
                    onSuccess: () => {
                      // A grade e os horários livres saem deste cadastro.
                      void qc.invalidateQueries({ queryKey: ["agenda"] });
                      onFechar();
                    },
                  },
                )
              }
            >
              {t("Salvar horário")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
