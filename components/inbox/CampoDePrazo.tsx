"use client";
import { useT } from "@/hooks/i18n/useT";
import { Input } from "@/components/ui/input";
import { MINUTOS, nomeDaUnidade, type Unidade } from "@/lib/schemas/snooze";

export interface Prazo {
  quantidade: string;
  unidade: Unidade;
}

/** Minutos do prazo digitado, ou `null` se não é um número inteiro positivo. */
export function minutosDoPrazo(p: Prazo): number | null {
  const n = Number(p.quantidade);
  if (!Number.isInteger(n) || n < 1) return null;
  return n * MINUTOS[p.unidade];
}

/** "Daqui a [ 3 ] [ semanas v ]": número + unidade, usado no "Outro..." e no editor de opções. */
export function CampoDePrazo({
  valor,
  unidades,
  onChange,
  rotulo,
}: {
  valor: Prazo;
  unidades: readonly Unidade[];
  onChange: (p: Prazo) => void;
  rotulo: string;
}) {
  const t = useT();
  const n = Number(valor.quantidade) || 2;
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        inputMode="numeric"
        aria-label={t(rotulo)}
        className="h-9 w-20"
        value={valor.quantidade}
        onChange={(e) => onChange({ ...valor, quantidade: e.target.value })}
      />
      <select
        aria-label={t("Unidade")}
        value={valor.unidade}
        onChange={(e) => onChange({ ...valor, unidade: e.target.value as Unidade })}
        className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-text"
      >
        {unidades.map((u) => (
          <option key={u} value={u}>
            {t(nomeDaUnidade(u, n))}
          </option>
        ))}
      </select>
    </div>
  );
}
