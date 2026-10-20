import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { MAX_LOTES, TAMANHO_DO_LOTE, type PodaDb, podarHistorico } from "@/app/api/v1/cron/data-retention/route";

function dbCheio() {
  const rpc = vi.fn(async () => ({ data: TAMANHO_DO_LOTE, error: null }));
  return { db: { rpc } as unknown as PodaDb, rpc };
}

describe("podarHistorico com prazo", () => {
  it("prazo vencido interrompe os lotes e devolve temResto", async () => {
    const { db, rpc } = dbCheio();
    const r = await podarHistorico(db, {}, Date.now() - 1);
    expect(rpc).toHaveBeenCalledTimes(4); // 1 lote por tabela
    expect(r.fila_tem_resto).toBe(true);
    expect(r.auditoria_tem_resto).toBe(true);
    expect(r.espelho_tem_resto).toBe(true);
  });

  it("sem prazo roda todos os lotes até o teto", async () => {
    const { db, rpc } = dbCheio();
    await podarHistorico(db, {});
    expect(rpc).toHaveBeenCalledTimes(4 * MAX_LOTES);
  });
});
