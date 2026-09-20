"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, type Role } from "@/lib/schemas/team";

interface Criado {
  email: string;
  role: Role;
}

export function CreateMemberForm() {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [pending, setPending] = useState(false);
  const [criado, setCriado] = useState<Criado | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/v1/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, password, role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error?.message ?? t("Não foi possível cadastrar agora."));
        return;
      }
      setCriado({ email: json.data.email, role: json.data.role });
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
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger id="role">
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
        <Button type="submit" disabled={pending}>
          {pending ? t("Cadastrando…") : t("Cadastrar membro")}
        </Button>
      </form>

      <div className="space-y-2">
        {criado ? (
          <div className="rounded-md border p-4 text-sm">
            <div className="font-medium">{criado.email}</div>
            <p className="mt-1 text-muted-foreground">
              {t("Conta criada como")} <strong>{criado.role}</strong>. {t("A pessoa entra em")}{" "}
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
