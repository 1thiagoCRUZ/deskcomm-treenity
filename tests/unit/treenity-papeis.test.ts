import { describe, expect, it } from "vitest";

import { destinosDaInterface, interfaceTemDestino, permitidos } from "@/lib/navigation/interface";
import { createMemberSchema, inviteMemberSchema } from "@/lib/schemas/team";
import { ORDEM_DOS_PAPEIS, PAPEIS_DO_CLIENTE, papelDoVinculo } from "@/lib/treenity/papeis";

describe("papéis do produto Treenity", () => {
  it("cada papel é um papel do DeskComm + um menu que esse papel consegue abrir", () => {
    for (const papel of ORDEM_DOS_PAPEIS) {
      const def = PAPEIS_DO_CLIENTE[papel];
      // Menu com tela que o papel não pode abrir seria um link para 403.
      expect(interfaceTemDestino(def.interface, def.role)).toBe(true);
      const podeAbrir = new Set(permitidos(false, def.role).map((d) => d.href));
      for (const tela of def.interface.destinos ?? []) expect(podeAbrir.has(tela)).toBe(true);
    }
  });

  it("o funcionário vê só o dia a dia (mais as portas pessoais que o DeskComm nunca esconde)", () => {
    const def = PAPEIS_DO_CLIENTE.funcionario;
    const menu = destinosDaInterface(def.interface, false, def.role).map((d) => d.href);
    expect(menu).toEqual(
      expect.arrayContaining(["/app/inbox", "/app/templates", "/app/integrations/treenity-bot/chat", "/app/contacts", "/app/tasks"]),
    );
    // Nada de configuração, funil, conexões, IA ou relatório.
    for (const fora of ["/app/connections", "/app/kanban", "/app/ai/agents", "/app/webhooks", "/app/metrics", "/app/settings/tenant"]) {
      expect(menu).not.toContain(fora);
    }
  });

  it("o funcionário não é admin: quem autoriza é o papel, não o menu", () => {
    expect(PAPEIS_DO_CLIENTE.funcionario.role).toBe("agent");
    expect(PAPEIS_DO_CLIENTE.dono.role).toBe("admin");
  });

  it("reconhece o papel de um vínculo, e chama de personalizado o que foi mexido à mão", () => {
    expect(papelDoVinculo("admin", null)).toBe("dono");
    expect(papelDoVinculo("admin", { preset: "completa" })).toBe("dono");
    expect(papelDoVinculo("agent", PAPEIS_DO_CLIENTE.funcionario.interface)).toBe("funcionario");
    // mesma lista em outra ordem continua sendo funcionário
    expect(
      papelDoVinculo("agent", { preset: "simplificada", destinos: ["/app/tasks", "/app/inbox", "/app/integrations/treenity-bot/chat", "/app/contacts", "/app/templates"] }),
    ).toBe("funcionario");
    expect(papelDoVinculo("agent", { preset: "completa" })).toBe("personalizado");
    expect(papelDoVinculo("manager", { preset: "completa" })).toBe("personalizado");
    expect(papelDoVinculo("agent", { preset: "simplificada", destinos: ["/app/inbox"] })).toBe("personalizado");
  });

  it("convite e cadastro direto aceitam o menu do papel (o cadastro direto antes ignorava)", () => {
    const f = PAPEIS_DO_CLIENTE.funcionario;
    expect(
      inviteMemberSchema.safeParse({ invitations: [{ email: "a@b.co", role: f.role, interface_settings: f.interface }] }).success,
    ).toBe(true);
    const cadastro = createMemberSchema.safeParse({
      full_name: "Ana",
      email: "ana@loja.com",
      password: "senha-forte-1",
      role: f.role,
      interface_settings: f.interface,
    });
    expect(cadastro.success).toBe(true);
    expect(cadastro.success && cadastro.data.interface_settings).toEqual(f.interface);
  });
});
