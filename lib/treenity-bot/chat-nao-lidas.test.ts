import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { atualizarChatNaoLidas, useChatNaoLidas, __definirChatNaoLidasParaTeste } from "./chat-nao-lidas";
import type { SessaoChatBot } from "./chat-client";

const sessao: SessaoChatBot = {
  accessToken: "tok",
  apiUrl: "https://bot.exemplo",
  usuario: { id: "u-1", nome: "Dono", email: "d@x", papel: "admin" },
};

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => __definirChatNaoLidasParaTeste(0));
});

describe("contador de mensagens não lidas do Chat da equipe", () => {
  it("pergunta à API do bot com o token e publica o total", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { total: 4 } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChatNaoLidas());
    expect(result.current).toBe(0);

    await act(() => atualizarChatNaoLidas(sessao));

    expect(result.current).toBe(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bot.exemplo/api/chat/nao-lidas");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("falha da API mantém o número anterior em vez de zerar", async () => {
    act(() => __definirChatNaoLidasParaTeste(2));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("erro", { status: 500 })));
    const { result } = renderHook(() => useChatNaoLidas());

    await act(() => atualizarChatNaoLidas(sessao));

    expect(result.current).toBe(2);
  });
});
