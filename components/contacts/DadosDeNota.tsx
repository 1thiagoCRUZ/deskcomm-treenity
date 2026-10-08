"use client";

/**
 * "Dados para nota e envio" na tela do contato — o que a loja pede ao cliente
 * no fechamento (pedido do Dono, 02/10). O bot preenche no fechamento; a
 * equipe vê, revela o CPF quando vai emitir a nota (fica no audit) e corrige.
 * Regras e cifra do CPF em `lib/contacts/dados-de-nota.ts`.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, PencilSimple } from "@/lib/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";
import { ROTULO_DO_CAMPO, type DadosDeNotaParaTela } from "@/lib/contacts/dados-de-nota-tipos";

type Campo = {
  chave: keyof DadosDeNotaParaTela | "cpf";
  rotulo: string;
  formatar?: (v: string) => string;
};

const cep = (v: string) => (v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v);
const cnpj = (v: string) =>
  v.length === 14 ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : v;
const cpf = (v: string) =>
  v.length === 11 ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : v;

const DO_CLIENTE: Campo[] = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "cep", rotulo: "CEP", formatar: cep },
  { chave: "endereco", rotulo: "Endereço" },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "estado", rotulo: "Estado" },
  { chave: "transportadora_preferida", rotulo: "Transportadora preferida" },
];

const DA_PROPRIEDADE: Campo[] = [
  { chave: "propriedade_nome", rotulo: "Nome / Razão social" },
  { chave: "propriedade_cnpj", rotulo: "CNPJ", formatar: cnpj },
  { chave: "propriedade_ie", rotulo: "IE" },
  { chave: "propriedade_cep", rotulo: "CEP", formatar: cep },
  { chave: "propriedade_endereco", rotulo: "Endereço" },
];

const chaveDaConsulta = (contactId: string) => ["contato", contactId, "dados-de-nota"];

export function DadosDeNota({ contactId }: { contactId: string }) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [cpfRevelado, setCpfRevelado] = useState<string | null>(null);
  // Ver o CPF inteiro é só do Dono (decisão de 08/10); a rota recusa os demais.
  const { activeOrg } = useAuth();
  const podeVerCpf = activeOrg?.role === "admin";

  const q = useQuery({
    queryKey: chaveDaConsulta(contactId),
    queryFn: async () =>
      (await apiClient.get<{ data: DadosDeNotaParaTela | null }>(`/api/v1/contacts/${contactId}/dados-de-nota`)).data,
  });

  async function revelarCpf() {
    try {
      const r = await apiClient.get<{ data: DadosDeNotaParaTela | null }>(
        `/api/v1/contacts/${contactId}/dados-de-nota?revelar=cpf`,
      );
      setCpfRevelado(r.data?.cpf ?? null);
    } catch {
      toast.error(t("Não foi possível mostrar o CPF."));
    }
  }

  const dados = q.data ?? null;

  function valor(campo: Campo): string {
    if (!dados) return "—";
    if (campo.chave === "cpf") return cpfRevelado ? cpf(cpfRevelado) : (dados.cpf_mascarado ?? "—");
    const v = dados[campo.chave as keyof DadosDeNotaParaTela];
    if (typeof v !== "string" || v === "") return "—";
    return campo.formatar ? campo.formatar(v) : v;
  }

  const temPropriedade = dados && DA_PROPRIEDADE.some((c) => dados[c.chave as keyof DadosDeNotaParaTela]);

  return (
    <Card className="mt-4 p-4" data-testid="dados-de-nota">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t("Dados para nota e envio")}</h3>
          <p className="text-xs text-muted-foreground">
            {!dados
              ? t("O bot pede no fechamento da venda. A equipe também pode preencher.")
              : dados.preenchido_por === "bot"
                ? t("Preenchido pelo bot no fechamento da venda.")
                : t("Preenchido pela equipe.")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditando(true)} disabled={q.isLoading}>
          <PencilSimple size={14} aria-hidden />
          {dados ? t("Editar") : t("Preencher")}
        </Button>
      </div>

      {q.isError ? (
        <p className="text-sm text-error-fg">{t("Erro ao carregar os dados para nota.")}</p>
      ) : (
        <>
          {dados && dados.faltando.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">{t("Falta:")}</span>
              {dados.faltando.map((c) => (
                <Badge key={c} variant="warning">
                  {t(ROTULO_DO_CAMPO[c])}
                </Badge>
              ))}
            </div>
          ) : null}
          <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            {DO_CLIENTE.map((campo) => (
              <div key={campo.chave}>
                <dt className="text-xs uppercase text-muted-foreground">{t(campo.rotulo)}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <span>{valor(campo)}</span>
                  {campo.chave === "cpf" && podeVerCpf && dados?.cpf_mascarado && !cpfRevelado ? (
                    <button
                      type="button"
                      onClick={() => void revelarCpf()}
                      className="inline-flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline"
                      data-testid="mostrar-cpf"
                    >
                      <Eye size={12} aria-hidden />
                      {t("Mostrar")}
                    </button>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
          {temPropriedade ? (
            <>
              <h4 className="mt-5 mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t("Propriedade (vai na nota)")}
              </h4>
              <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                {DA_PROPRIEDADE.map((campo) => (
                  <div key={campo.chave}>
                    <dt className="text-xs uppercase text-muted-foreground">{t(campo.rotulo)}</dt>
                    <dd className="mt-1">{valor(campo)}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </>
      )}

      {editando ? (
        <EditarDadosDeNota
          contactId={contactId}
          dados={dados}
          onFechar={() => {
            setEditando(false);
            setCpfRevelado(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function EditarDadosDeNota({
  contactId,
  dados,
  onFechar,
}: {
  contactId: string;
  dados: DadosDeNotaParaTela | null;
  onFechar: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const inicial = Object.fromEntries(
    [...DO_CLIENTE, ...DA_PROPRIEDADE]
      .filter((c) => c.chave !== "cpf")
      .map((c) => [c.chave, (dados?.[c.chave as keyof DadosDeNotaParaTela] as string | null) ?? ""]),
  ) as Record<string, string>;
  const [form, setForm] = useState<Record<string, string>>({ ...inicial, cpf: "" });

  const salvar = useMutation({
    mutationFn: async () => {
      // Só o que mudou. CPF em branco = manter o atual (ele não volta para o
      // formulário inteiro, para não circular na tela sem necessidade).
      const corpo: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (k === "cpf") {
          if (v.trim()) corpo.cpf = v;
        } else if (v !== inicial[k]) {
          corpo[k] = v;
        }
      }
      return apiClient.put(`/api/v1/contacts/${contactId}/dados-de-nota`, corpo);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chaveDaConsulta(contactId) });
      toast.success(t("Dados para nota salvos."));
      onFechar();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("Não foi possível salvar.")),
  });

  const campo = (c: Campo) => (
    <div key={c.chave} className="space-y-1">
      <Label htmlFor={`dn-${c.chave}`}>{t(c.rotulo)}</Label>
      <Input
        id={`dn-${c.chave}`}
        value={form[c.chave] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [c.chave]: e.target.value }))}
        placeholder={c.chave === "cpf" && dados?.cpf_mascarado ? t("Deixe em branco para manter") : undefined}
        maxLength={c.chave === "estado" ? 2 : undefined}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Dados para nota e envio")}</DialogTitle>
          <DialogDescription>{t("O CPF fica guardado cifrado e só aparece inteiro quando alguém pede para mostrar.")}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{DO_CLIENTE.map(campo)}</div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t("Propriedade (opcional, vai na nota)")}
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{DA_PROPRIEDADE.map(campo)}</div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
