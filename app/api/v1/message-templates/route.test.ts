/**
 * Criar resposta com as respostas no Treenity Bot.
 *
 * No bot, toda resposta é da loja, e a tela nem mostra "Compartilhar com a
 * equipe" — então ela mandava `shared: false`, e a regra do schema "o bot só
 * usa resposta compartilhada" recusava TODA resposta com gatilho como "Dados
 * inválidos". Aconteceu no primeiro teste em produção (2026-09-25).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { criarRespostaNoBot } from "@/lib/treenity-bot/client";
import { respostasNoBot } from "@/lib/treenity-bot/respostas-salvas";
import type * as RespostasSalvas from "@/lib/treenity-bot/respostas-salvas";

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/treenity-bot/client", () => ({
  criarRespostaNoBot: vi.fn(),
  listarRespostasDoBot: vi.fn(),
}));
vi.mock("@/lib/treenity-bot/respostas-salvas", async (original) => ({
  ...(await original<typeof RespostasSalvas>()),
  respostasNoBot: vi.fn(),
}));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";

function pedido(corpo: unknown) {
  return new NextRequest("http://localhost/api/v1/message-templates", {
    method: "POST",
    body: JSON.stringify(corpo),
  });
}

const FRETE = {
  title: "Frete",
  body: "[cumprimento]! O frete eu calculo pelo seu CEP.",
  shortcut: "frete",
  shared: false,
  bot_triggers: ["qual o frete"],
  bot_context: "any",
  bot_max_chars: 60,
  bot_enabled: true,
};

describe("POST /api/v1/message-templates com as respostas no bot", () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: "u1", idioma: "pt-BR" },
      org: { orgId: ORG, name: "Loja", role: "admin" },
    } as never);
    vi.mocked(respostasNoBot).mockResolvedValue(true);
    vi.mocked(criarRespostaNoBot).mockResolvedValue({
      ok: true,
      dados: {
        id: 11,
        titulo: "Frete",
        corpo: FRETE.body,
        atalho: "frete",
        gatilhos: ["qual o frete"],
        contexto: "qualquer",
        max_chars_msg: 60,
        ativo: true,
        criado_em: "2026-09-25T23:00:00Z",
        atualizado_em: "2026-09-25T23:00:00Z",
      },
    });
  });

  it("aceita resposta com gatilho mesmo com shared: false — no bot, toda resposta é da loja", async () => {
    const res = await POST(pedido(FRETE));
    expect(res.status).toBe(201);
    expect(vi.mocked(criarRespostaNoBot)).toHaveBeenCalledWith(
      expect.objectContaining({ atalho: "frete", gatilhos: ["qual o frete"], ativo: true }),
    );
    const json = await res.json();
    expect(json.data).toMatchObject({ id: "11", owner_user_id: null, bot_enabled: true });
  });

  it("agent não cria resposta da loja", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: "u2", idioma: "pt-BR" },
      org: { orgId: ORG, name: "Loja", role: "agent" },
    } as never);
    const res = await POST(pedido(FRETE));
    expect(res.status).toBe(403);
  });
});
