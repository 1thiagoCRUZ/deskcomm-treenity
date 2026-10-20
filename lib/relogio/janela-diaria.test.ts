import { describe, expect, it } from "vitest";

import { ehJanelaDiaria } from "@/lib/relogio/janela-diaria";

// São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019).
const sp = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00-03:00`);

describe("ehJanelaDiaria", () => {
  it.each([
    ["02:59", false],
    ["03:00", false],
    ["03:19", false],
    ["03:20", true],
    ["03:59", true],
    ["04:00", false],
    ["15:05", false],
  ])("%s em São Paulo -> %s", (hhmm, esperado) => {
    expect(ehJanelaDiaria(sp(hhmm))).toBe(esperado);
  });

  it("usa o horário de São Paulo, não o UTC", () => {
    expect(ehJanelaDiaria(new Date("2026-10-20T03:25:00Z"))).toBe(false); // 00:25 em SP
    expect(ehJanelaDiaria(new Date("2026-10-20T06:25:00Z"))).toBe(true); // 03:25 em SP
  });
});
