"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acessoDoPapel, TipoDeAcesso } from "@/components/team/TipoDeAcesso";
import { interfaceTemDestino, type InterfaceSettings } from "@/lib/navigation/interface";
import type { Role } from "@/lib/schemas/team";
import { PAPEIS_DO_CLIENTE, papelDoVinculo } from "@/lib/treenity/papeis";

interface Criado {
  email: string;
  role: Role;
  interface: InterfaceSettings;
}

/** "Dono", "Funcionário" ou "Acesso personalizado" — nunca o termo técnico. */
function rotuloDoAcesso(role: Role, settings: InterfaceSettings): string {
  const papel = papelDoVinculo(role, settings);
  return papel === "personalizado" ? "Acesso personalizado" : PAPEIS_DO_CLIENTE[papel].rotulo;
}

export function CreateMemberForm() {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acesso, setAcesso] = useState(acessoDoPapel("funcionario"));
  const [pending, setPending] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/v1/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          role: acesso.role,
          interface_settings: acesso.settings,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("Não foi possível cadastrar agora."));
        return;
      }
      setCriado({ email: json.data.email, role: json.data.role, interface: acesso.settings });
      setFullName("");
      setEmail("");
      setPassword("");
      toast.success(t("Membro cadastrado."));
    } catch {
      toast.error(t("Não foi possível cadastrar agora."));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr,1fr]">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">{t("Nome")}</Label>
          <Input
            id="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            required
            minLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("Senha inicial")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            {t("Mínimo de 8 caracteres. Passe para a pessoa por um canal seguro.")}
          </p>
        </div>
        <TipoDeAcesso value={acesso} onChange={setAcesso} disabled={pending} />
        <Button
          type="submit"
          disabled={pending || !interfaceTemDestino(acesso.settings, acesso.role)}
        >
          {pending ? t("Cadastrando…") : t("Cadastrar membro")}
        </Button>
      </form>

      <div className="space-y-2">
        {criado ? (
          <div className="rounded-md border p-4 text-sm">
            <div className="font-medium">{criado.email}</div>
            <p className="mt-1 text-muted-foreground">
              {t("Conta criada como")} <strong>{t(rotuloDoAcesso(criado.role, criado.interface))}</strong>.{" "}
              {t("A pessoa entra em")}{" "}
              <code className="break-all">{`${window.location.origin}/login`}</code>{" "}
              {t("com este e-mail e a senha que você definiu.")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("A confirmação aparecerá aqui depois do cadastro.")}
          </p>
        )}
      </div>
    </div>
  );
}
