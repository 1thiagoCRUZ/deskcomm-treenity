import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Rota do bot para os dados de nota e envio: a organização sai da chave, o
 * contato do telefone, e a resposta ao bot nunca traz o CPF.
 */

vi.mock("@/lib/env", () => ({ env: { CPF_ENCRYPTION_KEY: "chave-de-teste" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
const agendados: Array<() => Promise<void>> = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => agendados.push(fn),
}));
const mascarar = vi.fn(async () => ({ inbox: 1 }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const estado = {
  chaveValida: true,
  contato: { id: "ct-1", phone_number: "+5514999990000" } as { id: string; phone_number: string } | null,
  gravado: null as Record<string, unknown> | null,
};

vi.mock("@/lib/treenity-bot/whatsapp", () => ({
  organizacaoPelaChave: async () => (estado.chaveValida ? { organizationId: "org-1", config: {} } : null),
}));
vi.mock("@/lib/channels/contato-por-telefone", () => ({
  encontrarContatoPorTelefone: async () => estado.contato,
}));
vi.mock("@/lib/contacts/dados-de-nota", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/contacts/dados-de-nota")>();
  return {
    ...real,
    lerDadosDeNota: async () => null,
    mascararCpfNasConversas: (...args: unknown[]) => mascarar(...(args as [])),
    gravarDadosDeNota: async (_db: unknown, org: string, contato: string, entrada: Record<string, unknown>) => {
      estado.gravado = { org, contato, entrada };
      return {
        id: "l1", organization_id: org, contact_id: contato,
        nome: "João", cpf_cifrado: "x.y.z", cpf_final: "25", telefone: null, email: null,
        cep: "17500000", endereco: null, cidade: "Marília", estado: "SP",
        propriedade_nome: null, propriedade_cnpj: null, propriedade_ie: null,
        propriedade_cep: null, propriedade_endereco: null, transportadora_preferida: null, preenchido_por: "bot", updated_at: "",
      };
    },
  };
});

import { GET, POST } from "@/app/api/treenity-bot/whatsapp/dados-do-cliente/route";

const URL_BASE = "https://x.test/api/treenity-bot/whatsapp/dados-do-cliente";
const post = (corpo: unknown) =>
  new NextRequest(URL_BASE, {
    method: "POST",
    headers: { authorization: "Bearer tbw_x", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

beforeEach(() => {
  estado.chaveValida = true;
  estado.contato = { id: "ct-1", phone_number: "+5514999990000" };
  estado.gravado = null;
  agendados.length = 0;
  mascarar.mockClear();
});

describe("dados do cliente pelo bot", () => {
  it("sem chave válida: 401", async () => {
    estado.chaveValida = false;
    const r = await GET(new NextRequest(`${URL_BASE}?id_face=5514999990000`));
    expect(r.status).toBe(401);
  });

  it("telefone que não está no Inbox: 404", async () => {
    estado.contato = null;
    const r = await GET(new NextRequest(`${URL_BASE}?id_face=5514999990000`, { headers: { authorization: "Bearer tbw_x" } }));
    expect(r.status).toBe(404);
  });

  it("cliente sem dados: diz que não tem e o que pedir", async () => {
    const r = await GET(new NextRequest(`${URL_BASE}?id_face=5514999990000`, { headers: { authorization: "Bearer tbw_x" } }));
    const corpo = await r.json();
    expect(corpo.data.tem_dados).toBe(false);
    expect(corpo.data.faltando).toContain("CPF");
  });

  it("grava na organização da CHAVE e no contato do id_face; telefone é campo da nota", async () => {
    const r = await POST(post({ id_face: "5514999990000", nome: "João", cpf: "529.982.247-25", telefone: "(14) 3333-4444", cidade: "Marília", estado: "sp", organization_id: "outra" }));
    expect(r.status).toBe(200);
    expect(estado.gravado).toMatchObject({ org: "org-1", contato: "ct-1" });
    const entrada = (estado.gravado as { entrada: Record<string, unknown> }).entrada;
    expect(entrada).toMatchObject({ nome: "João", cpf: "52998224725", cidade: "Marília", estado: "SP" });
    expect(entrada.telefone).toBe("1433334444"); // o telefone PARA A NOTA
    expect(entrada).not.toHaveProperty("id_face");
    expect(entrada).not.toHaveProperty("organization_id");
    const corpo = await r.json();
    expect(JSON.stringify(corpo)).not.toContain("52998224725");
  });

  it("CPF inválido: 422 com mensagem que o bot repassa", async () => {
    const r = await POST(post({ id_face: "5514999990000", cpf: "111.111.111-11" }));
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.error.message).toContain("CPF inválido");
    expect(estado.gravado).toBeNull();
  });

  it("campo em branco vindo do bot não apaga o que já está guardado", async () => {
    const r = await POST(post({ id_face: "5514999990000", cidade: "Garça", cpf: "", email: "  ", nome: null }));
    expect(r.status).toBe(200);
    const entrada = (estado.gravado as { entrada: Record<string, unknown> }).entrada;
    expect(entrada).toEqual({ cidade: "Garça" });
  });

  it("com CPF: mascara nas conversas na hora e agenda mais passadas depois da resposta", async () => {
    vi.useFakeTimers();
    try {
      await POST(post({ id_face: "5514999990000", cpf: "529.982.247-25" }));
      expect(mascarar).toHaveBeenCalledTimes(1);
      expect(mascarar).toHaveBeenCalledWith({}, "org-1", "ct-1", "52998224725");
      expect(agendados).toHaveLength(1);
      const rodando = agendados[0]!();
      await vi.runAllTimersAsync();
      await rodando;
      expect(mascarar).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem CPF: não mexe nas conversas", async () => {
    await POST(post({ id_face: "5514999990000", cidade: "Garça" }));
    expect(mascarar).not.toHaveBeenCalled();
    expect(agendados).toHaveLength(0);
  });
});
