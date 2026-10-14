"use client";
import { MeetDoCompromisso, type MeetingDetail } from "./MeetDoCompromisso";
import { SincronizacaoDoCompromisso, type SyncDetail } from "./SincronizacaoDoCompromisso";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { usePessoasDaAgenda } from "@/hooks/agenda/usePessoasDaAgenda";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { showApiError } from "@/components/feedback/ApiErrorToast";

type Detalhe = {
  meeting?: MeetingDetail | null;
  google_sync?: SyncDetail;
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  status: string;
  revision: number;
  contact_id: string | null;
  notes?: string | null;
  guest_email?: string | null;
  responsavel_id?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  conversation_id: string | null;
  outcome_source_kind: string | null;
  outcome_recorded_at: string | null;
  recovery: {
    result: string;
    enrollment_id: string | null;
    invalidated_at: string | null;
    enrollment_status: string | null;
    cancel_reason: string | null;
  } | null;
  evidence_messages: Array<{ id: string; body: string | null; sent_at: string }>;
};
const RESULTS: Record<string, string> = {
  started: "Recuperação iniciada",
  other_flow: "Não iniciada: outro acompanhamento já está ativo.",
  ambiguous: "Não iniciada: mais de um fluxo foi configurado para esta falta.",
  not_configured: "Não iniciada: configure um fluxo e habilite-o em um assistente publicado.",
  stale: "Não iniciada: o atendimento ou a resposta do cliente mudou.",
  no_contact: "Sem contato vinculado. Este compromisso não inicia uma recuperação.",
};
export function DetalheDoCompromisso({
  id,
  onClose,
  podeEditar = true,
}: {
  id: string | null;
  onClose: () => void;
  podeEditar?: boolean;
}) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const qc = useQueryClient();
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const query = useQuery({
    queryKey: ["agenda", "detalhe", id],
    enabled: !!id,
    refetchInterval: 5000,
    queryFn: async () =>
      (await apiClient.get<{ data: Detalhe }>(`/api/v1/agenda/agendamentos/${id}`)).data,
  });
  const a = query.data;
  const { data: pessoas = [] } = usePessoasDaAgenda();
  const responsavel = pessoas.find((p) => p.id === a?.responsavel_id);
  const [pauta, setPauta] = useState<string | null>(null);
  const formatoDeData =
    a &&
    new Intl.DateTimeFormat(tagDoIdioma, {
      timeZone: a.time_zone,
      dateStyle: "medium",
      timeStyle: "short",
      hourCycle: "h23",
    });
  const staleDraft = conflict || (draftRevision !== null && a?.revision !== draftRevision);
  function beginDraft() {
    if (draftRevision === null && a) setDraftRevision(a.revision);
  }
  function resetDraft() {
    setEvidence("");
    setReason("");
    setDraftRevision(null);
    setConflict(false);
  }
  function mutationFailed(error: unknown) {
    showApiError(error);
    setConflict(true);
    void query.refetch();
  }
  const mutation = useMutation({
    mutationFn: async (decision: { revision: number; patch: Record<string, unknown> }) =>
      apiClient.patch("/api/v1/agenda/agendamentos", {
        id,
        revision: decision.revision,
        ...decision.patch,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["agent-inbox"] });
      resetDraft();
      setPauta(null);
    },
    onError: mutationFailed,
  });
  const cancel = useMutation({
    mutationFn: async (decision: { revision: number; reason: string }) =>
      apiClient.delete("/api/v1/agenda/agendamentos", { id, ...decision }),
    onSuccess: () => {
      resetDraft();
      void qc.invalidateQueries({ queryKey: ["agenda"] });
    },
    onError: mutationFailed,
  });
  function decide(patch: Record<string, unknown>) {
    if (a && !staleDraft) mutation.mutate({ revision: draftRevision ?? a.revision, patch });
  }
  return (
    <Sheet
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{a?.title ?? t("Compromisso")}</SheetTitle>
        </SheetHeader>
        {a?.google_sync && <SincronizacaoDoCompromisso key={a.id} id={a.id} sync={a.google_sync} onSaved={() => void query.refetch()} />}
        {a?.meeting && <MeetDoCompromisso id={a.id} revision={a.google_sync?.revision ?? String(a.revision)} meeting={a.meeting} onSaved={() => void query.refetch()} />}
        {query.isPending ? (
          <p>{t("Carregando…")}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{t("Este compromisso está indisponível para você.")}</p>
            <Button onClick={() => void query.refetch()}>{t("Tentar novamente")}</Button>
          </div>
        ) : a && formatoDeData ? (
          <div className="mt-5 space-y-5">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p data-testid="compromisso-horario" className="text-sm font-semibold first-letter:uppercase">
                  {formatoDeData.formatRange(new Date(a.starts_at), new Date(a.ends_at))}
                </p>
                <span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium">
                  {t(
                    (
                      {
                        pending: "Aguardando confirmação",
                        confirmed: "Agendado",
                        completed: "Compareceu",
                        no_show: "Faltou",
                        cancelled: "Cancelado",
                      } as Record<string, string>
                    )[a.status] ?? a.status,
                  )}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {a.outcome_recorded_at
                  ? `${t("Presença registrada pela equipe")}: ${formatoDeData.format(new Date(a.outcome_recorded_at))}`
                  : t("O horário sozinho não confirma falta. A equipe precisa registrar o que aconteceu.")}
              </p>
            </div>

            <section data-testid="quem-participa">
              <h3 className="mb-2 text-sm font-semibold">{t("Quem participa")}</h3>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
                <li className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-text-muted">{t("Responsável")}</span>
                  <span className="font-medium">{responsavel?.nome ?? t("Equipe")}</span>
                </li>
                <li className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-text-muted">{t("Cliente")}</span>
                  {a.contact_id ? (
                    <Link href={`/app/contacts/${a.contact_id}`} className="text-right font-medium underline">
                      {a.contact_name ?? t("Ver contato")}
                      {a.contact_phone ? <span className="block text-xs font-normal text-text-muted">{a.contact_phone}</span> : null}
                    </Link>
                  ) : (
                    <span className="text-text-muted">{t("Compromisso pessoal, sem cliente vinculado.")}</span>
                  )}
                </li>
                {a.guest_email ? (
                  <li className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-text-muted">{t("Convidado")}</span>
                    <span className="font-medium">{a.guest_email}</span>
                  </li>
                ) : null}
              </ul>
            </section>

            <section data-testid="pauta-do-compromisso">
              <h3 className="mb-2 text-sm font-semibold">{t("O que será tratado")}</h3>
              {podeEditar && a.status !== "cancelled" ? (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={pauta ?? a.notes ?? ""}
                    onChange={(e) => setPauta(e.target.value)}
                    placeholder={t("Ex.: apresentar a proposta, tirar dúvidas sobre o frete, fechar o pedido")}
                    className="w-full resize-y rounded-md border border-border bg-surface p-2 text-sm outline-hidden focus:border-border-strong"
                  />
                  {pauta !== null && pauta !== (a.notes ?? "") ? (
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ revision: a.revision, patch: { notes: pauta } })}
                    >
                      {t("Salvar")}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-text-muted">{a.notes || t("Nada anotado.")}</p>
              )}
            </section>
            {a.recovery ? (
              <div className="rounded-lg border p-3" role="status">
                <p>
                  {t(
                    a.recovery.invalidated_at && a.recovery.result === "started"
                      ? "Recuperação iniciada e interrompida porque o cliente respondeu."
                      : a.recovery.enrollment_status &&
                          ["cancelled", "completed", "dead"].includes(a.recovery.enrollment_status)
                        ? "Recuperação encerrada. Revise o próximo passo."
                        : (RESULTS[a.recovery.result] ?? "Revise o próximo passo."),
                  )}
                </p>
                {a.recovery.cancel_reason ? (
                  <p className="mt-2 text-sm">{a.recovery.cancel_reason}</p>
                ) : null}
                {a.recovery.enrollment_id ? (
                  <Link
                    className="underline"
                    href={`/app/ai/followups/enrollments/${a.recovery.enrollment_id}`}
                  >
                    {t("Abrir acompanhamento")}
                  </Link>
                ) : (
                  <Link className="underline" href="/app/ai/followups">
                    {t("Revisar acompanhamentos")}
                  </Link>
                )}
              </div>
            ) : a.status === "no_show" && a.contact_id && a.outcome_recorded_at ? (
              <div role="status" className="rounded-lg border p-3">
                <p>
                  {t("Falta confirmada. O resultado da recuperação ainda não está disponível.")}
                </p>
                <Link className="underline" href="/app/ai/followups">
                  {t("Revisar acompanhamentos")}
                </Link>
              </div>
            ) : null}
            {staleDraft ? (
              <div role="alert" className="space-y-2 rounded-lg border p-3">
                <p>
                  {t(
                    "O compromisso mudou ou a alteração não foi concluída. Revise os dados antes de decidir novamente.",
                  )}
                </p>
                <Button variant="outline" onClick={resetDraft}>
                  {t("Descartar rascunho e revisar")}
                </Button>
              </div>
            ) : null}
            {podeEditar && a.status !== "cancelled" ? (
              <div className="space-y-4">
                <label className="block">
                  {t("Mensagem do cliente usada como evidência (opcional)")}
                  <select
                    className="mt-2 w-full rounded-md border bg-surface p-2"
                    aria-label={t("Mensagem de evidência")}
                    value={evidence}
                    onChange={(e) => {
                      beginDraft();
                      setEvidence(e.target.value);
                    }}
                  >
                    <option value="">{t("Confirmação da equipe, sem mensagem")}</option>
                    {a.evidence_messages.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.body?.slice(0, 140) ?? t("Mensagem sem texto")}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-text-muted">
                  {t("Ao confirmar, você valida o significado da mensagem para este compromisso.")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["completed", "Compareceu"],
                      ["no_show", "Faltou"],
                    ] as const
                  ).map(([status, label]) => (
                    <Button
                      key={status}
                      onClick={() =>
                        decide({
                          status,
                          ...(evidence ? { outcome_message_id: evidence } : {}),
                        })
                      }
                      disabled={
                        mutation.isPending ||
                        staleDraft ||
                        Date.parse(a.starts_at) > query.dataUpdatedAt ||
                        a.status === status
                      }
                    >
                      {t(label)}
                    </Button>
                  ))}
                </div>
                {["pending", "confirmed"].includes(a.status) ? (
                  <Button
                    variant="outline"
                    disabled={mutation.isPending || staleDraft}
                    onClick={() =>
                      decide({
                        confirmation_next_at: new Date(Date.now() + 60 * 60_000).toISOString(),
                      })
                    }
                  >
                    {t("Lembrar em uma hora")}
                  </Button>
                ) : null}
                <label className="block">
                  {t("Motivo do cancelamento")}
                  <input
                    className="mt-2 w-full rounded-md border bg-surface p-2"
                    value={reason}
                    onChange={(e) => {
                      beginDraft();
                      setReason(e.target.value);
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={!reason.trim() || cancel.isPending || staleDraft}
                  onClick={() => cancel.mutate({ revision: draftRevision ?? a.revision, reason })}
                >
                  {t("Cancelar agendamento")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
