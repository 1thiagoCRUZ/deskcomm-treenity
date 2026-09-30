"use client";
/**
 * O "Fechar" da conversa quando o Treenity Bot atende pelo Inbox: em vez de
 * só fechar, pergunta como terminou. Um clique fecha a conversa, encerra o
 * atendimento no bot (com a venda, se teve) e leva o card do funil para ganho
 * ou perdido.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { useFecharComoTerminou } from "@/hooks/inbox/useFecharComoTerminou";

/** "1.234,56", "1234.56" ou "150" → número em reais; null se não for um valor. */
export function lerValorEmReais(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!limpo) return null;
  // Com vírgula, ela é o decimal e os pontos são milhar (jeito brasileiro).
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const valor = Number(normalizado);
  return valor > 0 ? valor : null;
}

export function FecharComoTerminou({ conversationId }: { conversationId: string }) {
  const t = useT();
  const fechar = useFecharComoTerminou();
  const [aberto, setAberto] = useState(false);
  const [teveVenda, setTeveVenda] = useState<boolean | null>(null);
  const [valorTexto, setValorTexto] = useState("");

  const valor = lerValorEmReais(valorTexto);

  function reiniciar(proximo: boolean) {
    setAberto(proximo);
    if (!proximo) {
      setTeveVenda(null);
      setValorTexto("");
    }
  }

  function confirmar() {
    if (teveVenda === null) return;
    if (teveVenda && valor === null) return;
    fechar.mutate(
      teveVenda
        ? { conversation_id: conversationId, desfecho: "venda", valor: valor as number }
        : { conversation_id: conversationId, desfecho: "sem_venda" },
      {
        onSuccess: () => {
          toast.success(teveVenda ? t("Venda registrada e conversa fechada.") : t("Conversa fechada sem venda."));
          reiniciar(false);
        },
      },
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => reiniciar(true)}>
        {t("Fechar")}
      </Button>
      <Dialog open={aberto} onOpenChange={reiniciar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Como terminou?")}</DialogTitle>
            <DialogDescription>
              {t("A conversa fecha, o atendimento é encerrado no bot e o card do funil acompanha. Se o cliente escrever de novo, o CADU atende.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button variant={teveVenda === true ? "default" : "outline"} onClick={() => setTeveVenda(true)}>
              {t("Teve venda")}
            </Button>
            <Button variant={teveVenda === false ? "default" : "outline"} onClick={() => setTeveVenda(false)}>
              {t("Sem venda")}
            </Button>
          </div>

          {teveVenda && (
            <div className="space-y-1.5">
              <Label htmlFor="valor-da-venda">{t("Valor total da venda (R$)")}</Label>
              <Input
                id="valor-da-venda"
                inputMode="decimal"
                placeholder="1.250,00"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                autoFocus
              />
              {valorTexto && valor === null && (
                <p className="text-xs text-destructive">{t("Digite só o valor, por exemplo 1.250,00.")}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => reiniciar(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={fechar.isPending || teveVenda === null || (teveVenda && valor === null)}
              onClick={confirmar}
            >
              {fechar.isPending ? t("Fechando…") : t("Fechar conversa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
