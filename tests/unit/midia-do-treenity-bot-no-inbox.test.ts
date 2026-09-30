import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { GET } from "@/app/api/v1/messages/[id]/media/route";

const ORG = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";
const LINK = "https://blob.exemplo.net/midias/capim.mp4?sig=abc";

function comMensagem(linha: Record<string, unknown>) {
  const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: linha, error: null }) };
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => c,
  } as never);
}

async function pedir() {
  return GET(new Request(`http://x/api/v1/messages/${MSG}/media`) as never, { params: Promise.resolve({ id: MSG }) } as never);
}

beforeEach(() => {
  vi.mocked(loadAuthUser).mockResolvedValue({ id: "u1", idioma: "pt-BR" } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG } as never);
  vi.mocked(createAdminClient).mockImplementation(() => {
    throw new Error("não devia ir à Meta nem ao storage");
  });
});

describe("mídia que o Treenity Bot enviou aparece no Inbox", () => {
  it("vídeo do bot (link público) redireciona para o link, sem pedir à Meta", async () => {
    comMensagem({
      id: MSG, media_url: LINK, media_mime: null, media_storage_path: null, channel_session_id: "s1",
      direction: "outbound", metadata: { origem: "treenity_bot" },
    });
    const r = await pedir();
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(LINK);
  });

  it("link sem https não é seguido", async () => {
    comMensagem({
      id: MSG, media_url: "http://inseguro/x.mp4", media_mime: null, media_storage_path: null, channel_session_id: "s1",
      direction: "outbound", metadata: { origem: "treenity_bot" },
    });
    const r = await pedir().catch(() => null);
    expect(r?.status).not.toBe(302);
  });

  it("mídia de outra origem continua no caminho antigo (não vira redirecionamento)", async () => {
    comMensagem({
      id: MSG, media_url: LINK, media_mime: null, media_storage_path: null, channel_session_id: "s1",
      direction: "inbound", metadata: {},
    });
    const r = await pedir().catch(() => null);
    expect(r?.status).not.toBe(302);
  });
});
