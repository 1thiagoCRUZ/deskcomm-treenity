import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));

import { motivoParaNaoEnviar } from "@/lib/inbox/mensagens-agendadas";

/**
 * "Janela aberta" do Lembrar: na hora marcada, só manda se ainda faz sentido.
 * Provider "meta_cloud" = canal com janela de 24 h (ver lib/channels/capabilities).
 */
const agora = new Date("2026-10-27T15:00:00Z");
const agendada = { criado_por_user_id: "u-1", created_at: "2026-10-27T12:00:00Z" };
const conversa = (m: Record<string, unknown> = {}) => ({
  status: "open",
  last_inbound_at: "2026-10-27T11:00:00Z",
  channel_sessions: { provider: "meta_cloud" },
  ...m,
});

describe("motivoParaNaoEnviar", () => {
  it("janela aberta e cliente quieto: manda", () => {
    expect(motivoParaNaoEnviar(agendada, conversa(), agora)).toBeNull();
  });
  it("cliente respondeu depois de marcar: não manda", () => {
    expect(motivoParaNaoEnviar(agendada, conversa({ last_inbound_at: "2026-10-27T13:00:00Z" }), agora)).toBe(
      "cliente_respondeu",
    );
  });
  it("janela fechou: não manda", () => {
    expect(motivoParaNaoEnviar(agendada, conversa({ last_inbound_at: "2026-10-26T10:00:00Z" }), agora)).toBe(
      "janela_fechada",
    );
  });
  it("conversa arquivada ou sumida: não manda", () => {
    expect(motivoParaNaoEnviar(agendada, conversa({ status: "archived" }), agora)).toBe("conversa_arquivada");
    expect(motivoParaNaoEnviar(agendada, null, agora)).toBe("conversa_arquivada");
  });
  it("quem marcou saiu da equipe: não manda", () => {
    expect(motivoParaNaoEnviar({ ...agendada, criado_por_user_id: null }, conversa(), agora)).toBe("sem_autor");
  });
});
