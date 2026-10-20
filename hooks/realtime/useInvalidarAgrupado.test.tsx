import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInvalidarAgrupado } from "./useInvalidarAgrupado";

describe("useInvalidarAgrupado", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uma rajada vira UMA invalidação, depois do último evento", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined);
    const { result } = renderHook(() => useInvalidarAgrupado(qc, ["conversations"], 500));
    result.current();
    vi.advanceTimersByTime(300);
    result.current();
    vi.advanceTimersByTime(300);
    expect(spy).not.toHaveBeenCalled(); // o último evento reiniciou a espera
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["conversations"] });
  });

  it("evento depois da rajada dispara de novo (nada se perde)", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined);
    const { result } = renderHook(() => useInvalidarAgrupado(qc, ["conversations"], 500));
    result.current();
    vi.advanceTimersByTime(500);
    result.current();
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("ao desmontar cancela o que estava agendado", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useInvalidarAgrupado(qc, ["conversations"], 500));
    result.current();
    unmount();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rajada que não para dispara no teto (maxWait)", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue(undefined);
    const { result } = renderHook(() => useInvalidarAgrupado(qc, ["conversations"], 500, 2000));
    // evento a cada 300 ms: o debounce puro nunca dispararia
    for (let i = 0; i < 10; i++) {
      result.current();
      vi.advanceTimersByTime(300);
    }
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
