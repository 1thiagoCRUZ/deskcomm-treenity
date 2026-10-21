import { describe, expect, it } from "vitest";
import { linkWhatsApp } from "./link-whatsapp";

describe("linkWhatsApp", () => {
  it("normaliza para dígitos", () => {
    expect(linkWhatsApp("+55 (11) 91234-5678")).toBe("https://wa.me/5511912345678");
  });
  it("aceita 10 e 15 dígitos", () => {
    expect(linkWhatsApp("1234567890")).toBe("https://wa.me/1234567890");
    expect(linkWhatsApp("+123456789012345")).toBe("https://wa.me/123456789012345");
  });
  it("recusa curto, longo, vazio e começando em 0", () => {
    expect(linkWhatsApp("123456789")).toBeNull();
    expect(linkWhatsApp("1234567890123456")).toBeNull();
    expect(linkWhatsApp("")).toBeNull();
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp(undefined)).toBeNull();
    expect(linkWhatsApp("abc")).toBeNull();
    expect(linkWhatsApp("011912345678")).toBeNull();
  });
});

import { avisoWhatsAppJaVisto, marcarAvisoWhatsAppVisto } from "./link-whatsapp";
import { vi } from "vitest";

describe("aviso por sessão", () => {
  it("marca e lê; falha do storage não quebra", () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
    });
    expect(avisoWhatsAppJaVisto()).toBe(false);
    marcarAvisoWhatsAppVisto();
    expect(avisoWhatsAppJaVisto()).toBe(true);
    const boom = () => { throw new Error("x"); };
    vi.stubGlobal("window", { sessionStorage: { getItem: boom, setItem: boom } });
    expect(avisoWhatsAppJaVisto()).toBe(false);
    expect(() => marcarAvisoWhatsAppVisto()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
