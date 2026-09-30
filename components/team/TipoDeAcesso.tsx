"use client";
/**
 * "Tipo de acesso" — como o dono escolhe o que a pessoa convidada faz.
 *
 * As opções vêm de `lib/treenity/papeis.ts` (a única fonte dos papéis do
 * produto): escolher "Funcionário" aplica o papel e o menu padrão de
 * funcionário de uma vez. O controle técnico do DeskComm (papel + interface)
 * continua disponível em "Personalizar", para casos que fogem do padrão —
 * e é por ele que o dono vai ajustar menus no futuro.
 */
import { useT } from "@/hooks/i18n/useT";
import { InterfaceEditor } from "@/components/team/InterfaceEditor";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InterfaceSettings } from "@/lib/navigation/interface";
import { ROLES, type Role } from "@/lib/schemas/team";
import { ORDEM_DOS_PAPEIS, PAPEIS_DO_CLIENTE, papelDoVinculo } from "@/lib/treenity/papeis";
import { cn } from "@/lib/utils";

export interface Acesso {
  role: Role;
  settings: InterfaceSettings;
}

/** O acesso de um papel do produto, pronto para convite ou cadastro. */
export function acessoDoPapel(papel: keyof typeof PAPEIS_DO_CLIENTE): Acesso {
  const def = PAPEIS_DO_CLIENTE[papel];
  return { role: def.role, settings: def.interface };
}

export function TipoDeAcesso({
  value,
  onChange,
  disabled = false,
}: {
  value: Acesso;
  onChange: (value: Acesso) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const atual = papelDoVinculo(value.role, value.settings);

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-medium">{t("Tipo de acesso")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {ORDEM_DOS_PAPEIS.map((papel) => {
          const def = PAPEIS_DO_CLIENTE[papel];
          const escolhido = atual === papel;
          return (
            <button
              key={papel}
              type="button"
              aria-pressed={escolhido}
              onClick={() => onChange(acessoDoPapel(papel))}
              className={cn(
                "rounded-md border p-3 text-left transition-colors",
                escolhido ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <div className="text-sm font-medium">{t(def.rotulo)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t(def.descricao)}</div>
            </button>
          );
        })}
      </div>
      {atual === "personalizado" && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("Acesso personalizado: o papel ou o menu foram ajustados à mão.")}
        </p>
      )}

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">{t("Personalizar (avançado)")}</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="papel-tecnico">{t("Papel no sistema")}</Label>
            <Select value={value.role} onValueChange={(v) => onChange({ ...value, role: v as Role })}>
              <SelectTrigger id="papel-tecnico">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <InterfaceEditor
            value={value.settings}
            onChange={(settings) => onChange({ ...value, settings })}
            role={value.role}
            disabled={disabled}
          />
        </div>
      </details>
    </fieldset>
  );
}
