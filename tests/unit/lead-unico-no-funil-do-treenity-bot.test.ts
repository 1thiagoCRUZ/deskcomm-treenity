import { describe, expect, it } from "vitest";

import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";

const ORG = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

/**
 * Banco falso mínimo: responde o contato e o `settings` da organização, e
 * registra se alguém tentou criar card (`crm_leads.insert`) ou procurar o
 * funil padrão (`crm_pipelines`).
 */
function bancoCom(settings: unknown) {
  const tocou: string[] = [];
  const db = {
    tocou,
    from(tabela: string) {
      tocou.push(tabela);
      const linha =
        tabela === "contacts"
          ? { is_blocked: false, display_name: "Ana", name: "Ana", phone_number: "+5514999998888" }
          : tabela === "organizations"
            ? { settings }
            : null;
      const c = {
        select: () => c,
        eq: () => c,
        limit: () => c,
        order: () => c,
        is: () => c,
        maybeSingle: async () => ({ data: linha, error: null }),
        insert: () => {
          tocou.push(`${tabela}.insert`);
          return c;
        },
      };
      return c;
    },
  };
  return db;
}

const dados = { organizationId: ORG, contactId: "ct1", conversationId: "cv1", nomeDoContato: "Ana" };

describe("um cliente, um card: o funil do Treenity Bot manda", () => {
  it("com o Treenity Bot no Inbox, a primeira mensagem NÃO abre card no funil padrão", async () => {
    const db = bancoCom({ treenity_bot: { whatsapp: { ativo: true } } });
    const r = await garantirLeadDaConversa(db as never, dados);
    expect(r).toEqual({ criado: false, motivo: "funil_do_treenity_bot" });
    expect(db.tocou).not.toContain("crm_pipelines");
    expect(db.tocou).not.toContain("crm_leads.insert");
  });

  it("sem o Treenity Bot, segue o caminho de sempre (procura o funil padrão)", async () => {
    const db = bancoCom({});
    await garantirLeadDaConversa(db as never, dados);
    expect(db.tocou).toContain("crm_pipelines");
  });
});

import { contatoDoAtendimento } from "@/lib/treenity-bot/funil-de-leads";

function adminComContato(existe: boolean) {
  const linhas = existe ? [{ id: "ct9", phone_number: "+5514998553204", created_at: "2026-01-01", is_merged_into: null }] : [];
  const c = {
    select: () => c,
    eq: () => c,
    in: () => c,
    is: () => c,
    order: () => c,
    limit: async () => ({ data: linhas, error: null }),
    then: (r: (v: unknown) => void) => r({ data: linhas, error: null }),
  };
  return { from: () => c } as never;
}

const atendimento = (canal: string | null, idFace: string) =>
  ({ id: "a1", canal, cliente: { id: "c1", nome: "Mateus", idFace } }) as never;

describe("o card do funil do Treenity Bot aparece na conversa do Inbox", () => {
  it("atendimento de WhatsApp é ligado ao contato pelo número", async () => {
    expect(await contatoDoAtendimento(adminComContato(true), ORG, atendimento("WhatsApp", "5514998553204"))).toBe("ct9");
  });

  it("Instagram não tem telefone: o card nasce sem vínculo, como antes", async () => {
    expect(await contatoDoAtendimento(adminComContato(true), ORG, atendimento("Instagram", "17841400000"))).toBeNull();
  });

  it("cliente que nunca passou pelo Inbox: sem vínculo, sem erro", async () => {
    expect(await contatoDoAtendimento(adminComContato(false), ORG, atendimento("whatsapp", "5514998553204"))).toBeNull();
  });
});
