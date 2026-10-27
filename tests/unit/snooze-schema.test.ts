import { describe, expect, it } from "vitest";

import { ehRetorno, snoozeSchema } from "@/lib/schemas/snooze";

describe("snoozeSchema", () => {
  it("aceita duration_hours 1, 3 e 24", () => {
    expect(snoozeSchema.safeParse({ duration_hours: 1 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ duration_hours: 3 }).success).toBe(true);
    expect(snoozeSchema.safeParse({ duration_hours: 24 }).success).toBe(true);
  });
  it("rejeita valores fora do enum fechado", () => {
    expect(snoozeSchema.safeParse({ duration_hours: 0 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ duration_hours: 5 }).success).toBe(false);
    expect(snoozeSchema.safeParse({ duration_hours: -1 }).success).toBe(false);
  });
  it("rejeita string em vez de number", () => {
    expect(snoozeSchema.safeParse({ duration_hours: "1" }).success).toBe(false);
  });
  it("aceita os retornos de 7, 15 e 30 dias e a data escolhida", () => {
    for (const h of [168, 360, 720]) expect(snoozeSchema.safeParse({ duration_hours: h }).success).toBe(true);
    expect(snoozeSchema.safeParse({ ate: "2026-11-27T12:00:00.000Z" }).success).toBe(true);
    expect(snoozeSchema.safeParse({ ate: "amanhã" }).success).toBe(false);
    expect(snoozeSchema.safeParse({ duration_hours: 3, ate: "2026-11-27T12:00:00.000Z" }).success).toBe(false);
  });
  it("retorno é o prazo de 48 h ou mais", () => {
    expect(ehRetorno("2026-10-27T10:00:00Z", "2026-10-28T10:00:00Z")).toBe(false);
    expect(ehRetorno("2026-10-27T10:00:00Z", "2026-11-26T10:00:00Z")).toBe(true);
    expect(ehRetorno(null, "2026-11-26T10:00:00Z")).toBe(false);
  });
});
