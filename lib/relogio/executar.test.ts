import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  retencao: vi.fn(),
  storage: vi.fn(),
  stuck: vi.fn(),
  drain: vi.fn(),
  routing: vi.fn(),
}));

vi.mock("@/app/api/v1/cron/data-retention/route", () => ({ executarRetencaoDiaria: m.retencao }));
vi.mock("@/lib/lgpd/storage-redaction-queue", () => ({ drainStorageRedactionQueue: m.storage }));
vi.mock("@/app/api/v1/cron/recover-stuck-messages/route", () => ({ recoverStuckMessages: m.stuck }));
vi.mock("@/lib/event-log/drain", () => ({ drainEventLog: m.drain }));
vi.mock("@/lib/event-log/register-handlers", () => ({ ensureHandlersRegistered: vi.fn() }));
vi.mock("@/lib/routing/worker", () => ({ runRoutingWorker: m.routing }));
vi.mock("@/lib/channels/contato-por-telefone", () => ({ idsDoContatoEGemeos: vi.fn() }));
vi.mock("@/lib/followup/agent-followup-gate", () => ({ createSupabaseFollowupGateDb: vi.fn() }));
vi.mock("@/lib/followup/aplicar-inbound", () => ({ inboundEhDestaPergunta: vi.fn() }));
vi.mock("@/lib/followup/engine", () => ({
  aplicarRespostaInbound: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  runFollowupTick: vi.fn(async () => ({})),
}));
vi.mock("@/lib/followup/enviar-texto-fixo", () => ({ enviarTextoFixoPendente: vi.fn(async () => 0) }));
vi.mock("@/lib/followup/silence-sweep", () => ({
  createSupabaseSilenceSweepDb: vi.fn(),
  runSilenceSweep: vi.fn(async () => ({})),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.in = () => cadeia;
  cadeia.limit = () => Promise.resolve({ data: [], error: null });
  return { createAdminClient: () => ({ from: () => cadeia }) };
});

import { executarTickDoRelogio, PRAZO_DAS_DIARIAS_MS } from "@/lib/relogio/executar";
import { TAREFAS_DIARIAS_DO_RELOGIO, TAREFAS_DO_RELOGIO } from "@/lib/relogio/tarefas";

const dentro = new Date("2026-10-20T03:25:00-03:00");
const fora = new Date("2026-10-20T14:05:00-03:00");

beforeEach(() => {
  vi.clearAllMocks();
  m.drain.mockResolvedValue({ done: 0, failed: 0, dead: 0 });
  m.routing.mockResolvedValue({});
  m.stuck.mockResolvedValue({ failed: 0 });
  m.retencao.mockResolvedValue({
    jobs_apagados: 0,
    auditoria_apagada: 0,
    espelho_apagado: 0,
    nonces_apagados: 0,
    anonimizacoes_completadas: 0,
  });
  m.storage.mockResolvedValue({ attempted: 0, deleted: 0, failed: 0, skipped: 0 });
});

describe("tarefas diárias do relógio", () => {
  it("fora da janela não chama retenção nem remoção de mídia", async () => {
    const r = await executarTickDoRelogio(fora);
    expect(m.retencao).not.toHaveBeenCalled();
    expect(m.storage).not.toHaveBeenCalled();
    expect(r.tarefas.map((t) => t.id)).not.toContain("data-retention");
  });

  it("dentro da janela chama as duas e rodada vazia não marca mexeu", async () => {
    const r = await executarTickDoRelogio(dentro);
    expect(m.retencao).toHaveBeenCalledTimes(1);
    expect(m.storage).toHaveBeenCalledTimes(1);
    expect(r.tarefas.filter((t) => t.ok).map((t) => t.id)).toEqual(
      expect.arrayContaining(["data-retention", "storage-redaction"]),
    );
    expect(r.mexeu).toBe(false);
  });

  it("mexeu vira true quando a retenção apagou ou completou anonimização", async () => {
    m.retencao.mockResolvedValue({
      jobs_apagados: 0,
      auditoria_apagada: 0,
      espelho_apagado: 0,
      nonces_apagados: 0,
      anonimizacoes_completadas: 2,
    });
    expect((await executarTickDoRelogio(dentro)).mexeu).toBe(true);
  });

  it("mexeu vira true quando a mídia foi removida", async () => {
    m.storage.mockResolvedValue({ attempted: 1, deleted: 1, failed: 0, skipped: 0 });
    expect((await executarTickDoRelogio(dentro)).mexeu).toBe(true);
  });

  it("erro na retenção não impede as outras tarefas", async () => {
    m.retencao.mockRejectedValue(new Error("rpc fora do ar"));
    const r = await executarTickDoRelogio(dentro);
    const retencao = r.tarefas.find((t) => t.id === "data-retention");
    expect(retencao).toMatchObject({ ok: false, detalhe: "rpc fora do ar" });
    expect(m.storage).toHaveBeenCalledTimes(1);
    expect(r.tarefas.find((t) => t.id === "recover-stuck-messages")?.ok).toBe(true);
    expect(r.tarefas.find((t) => t.id === "storage-redaction")?.ok).toBe(true);
  });
});

describe("ordem, prazo e lista de tarefas", () => {
  it("as diárias rodam depois das de minuto", async () => {
    const r = await executarTickDoRelogio(dentro);
    const ids = r.tarefas.map((t) => t.id);
    expect(ids.indexOf("recover-stuck-messages")).toBeLessThan(ids.indexOf("data-retention"));
    expect(ids.indexOf("data-retention")).toBeLessThan(ids.indexOf("storage-redaction"));
  });

  it("passa prazo ao data-retention e pula a mídia se o prazo já venceu", async () => {
    const t0 = Date.now();
    m.drain.mockImplementation(async () => {
      vi.setSystemTime(t0 + PRAZO_DAS_DIARIAS_MS + 1000);
      return { done: 0, failed: 0, dead: 0 };
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(t0);
    try {
      await executarTickDoRelogio(dentro);
    } finally {
      vi.useRealTimers();
    }
    const prazo = m.retencao.mock.calls[0]?.[1] as number;
    expect(prazo).toBe(t0 + PRAZO_DAS_DIARIAS_MS);
    expect(m.storage).not.toHaveBeenCalled();
  });

  it("todo id passado a uma(...) está nas listas de tarefas", () => {
    const fonte = readFileSync("lib/relogio/executar.ts", "utf8");
    const usados = [...fonte.matchAll(/uma\("([a-z-]+)"/g)].map((x) => x[1]);
    const listados = [...TAREFAS_DO_RELOGIO, ...TAREFAS_DIARIAS_DO_RELOGIO].map((t) => t.id);
    expect(usados.length).toBeGreaterThan(0);
    expect([...usados].sort()).toEqual([...listados].sort());
  });
});
