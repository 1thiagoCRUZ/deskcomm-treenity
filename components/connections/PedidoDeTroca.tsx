"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCriarPedidoDeTroca, usePedidos } from "@/hooks/gestao/usePedidos";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { PedidoDto, StatusDePedido } from "@/lib/gestao/pedidos";

const ROTULO_DO_STATUS: Record<StatusDePedido, string> = {
  aberto: "Em andamento",
  atendido: "Atendido",
  cancelado: "Cancelado",
};

const dataCurta = (iso: string, tag: string) =>
  new Date(iso).toLocaleDateString(tag, { day: "2-digit", month: "2-digit" });

/**
 * O Dono pede a troca de número. A Meta (verificação do número, webhook) é feita pela equipe
 * Treenity; aqui ele diz QUAL número vai usar e acompanha o andamento.
 */
export function PedidoDeTroca() {
  const t = useT();
  const tag = useTagDeIdioma();
  const { data: pedidos } = usePedidos();
  const criar = useCriarPedidoDeTroca();
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [obs, setObs] = useState("");

  const emAndamento = (pedidos ?? []).find((p) => p.status === "aberto");
  const anteriores = (pedidos ?? []).filter((p) => p.status !== "aberto").slice(0, 3);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    await criar.mutateAsync({ numero_novo: numero, ...(obs.trim() ? { observacao: obs } : {}) });
    toast.success(t("Pedido enviado. A equipe Treenity vai fazer a troca e te avisar."));
    setAberto(false);
    setNumero("");
    setObs("");
  }

  return (
    <div className="flex flex-col gap-3">
      {emAndamento ? (
        <Card className="flex flex-col gap-1 p-4" data-testid="pedido-em-andamento">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{t("Troca de número em andamento")}</span>
            <Badge variant="warning">{t(ROTULO_DO_STATUS.aberto)}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Número novo:")} <span className="font-mono">{emAndamento.numero_novo}</span> ·{" "}
            {t("pedido em")} {dataCurta(emAndamento.criado_em, tag)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Enquanto a troca não termina, o número atual continua funcionando.")}
          </p>
        </Card>
      ) : (
        <div>
          <Button onClick={() => setAberto(true)} data-testid="btn-trocar-numero">
            {t("Trocar ou adicionar número")}
          </Button>
        </div>
      )}

      {anteriores.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {anteriores.map((p: PedidoDto) => (
            <li key={p.id}>
              {dataCurta(p.criado_em, tag)} · {t("troca para")} {p.numero_novo} · {t(ROTULO_DO_STATUS[p.status])}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Trocar ou adicionar número")}</DialogTitle>
            <DialogDescription>
              {t(
                "Diga qual número vai passar a atender. A equipe Treenity faz a parte técnica no WhatsApp Business e o bot volta a atender por ele.",
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="numero-novo">{t("Número novo (com DDD)")}</Label>
              <Input
                id="numero-novo"
                name="numero-novo"
                autoComplete="off"
                inputMode="tel"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="+55 14 99999-0000"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="obs-troca">{t("Observação (opcional)")}</Label>
              <Textarea
                id="obs-troca"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                maxLength={500}
                placeholder={t("Ex.: o número antigo não será mais usado")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={criar.isPending}>
                {criar.isPending ? t("Enviando…") : t("Enviar pedido")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
