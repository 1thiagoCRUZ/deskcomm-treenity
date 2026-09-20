import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isPublicPath, PUBLIC_PATHS } from "@/lib/auth/public-paths";
import { letraDoIcone } from "@/lib/branding/icone";

const RAIZ = process.cwd();

describe("letra do ícone da aba", () => {
  it("usa a primeira letra do nome, em caixa alta", () => {
    expect(letraDoIcone("Vendas Turbo")).toBe("V");
    expect(letraDoIcone("  acme crm  ")).toBe("A");
  });

  it("aceita acento — restringir ao ASCII devolveria a segunda letra", () => {
    // "Ótimo CRM" com `[A-Za-z]` renderizaria "T". Em português isso não é
    // borda: é uma fatia grande dos nomes possíveis.
    expect(letraDoIcone("Ótimo CRM")).toBe("Ó");
    expect(letraDoIcone("Ácaro")).toBe("Á");
  });

  it("pula o emoji e pega a primeira letra de verdade", () => {
    // `resolveBranding().initial` devolveria "🚀" — certo na sidebar, onde o
    // browser tem fonte de emoji; errado no ícone, que o satori desenha com a
    // única fonte embutida e renderizaria como tofu (▯).
    expect(letraDoIcone("🚀 Foguete")).toBe("F");
    expect(letraDoIcone("★ Estrela")).toBe("E");
  });

  it("devolve null quando não há letra nenhuma — e NÃO a inicial do produto", () => {
    // Cair em "D" aqui poria a NOSSA letra na aba do revendedor, que é
    // exatamente o vazamento de marca que o épico fecha. Sem letra, o ícone é
    // só o ladrilho da cor dele.
    expect(letraDoIcone("🚀")).toBeNull();
    expect(letraDoIcone("   ")).toBeNull();
    expect(letraDoIcone("···")).toBeNull();
  });

  it("dígito conta como letra — marca que começa com número tem ícone", () => {
    expect(letraDoIcone("360 Vendas")).toBe("3");
  });
});

describe("o ícone carrega para quem NÃO entrou", () => {
  it("/icon é caminho público", () => {
    // Sem esta entrada o `<head>` do /login pede /icon, o proxy responde 307
    // para /login?next=%2Ficon, e a aba fica sem marca justamente na primeira
    // tela que um comprador vê. O matcher do proxy só dispensa caminho COM
    // extensão — medido: /icon.png devolvia 404 (passou direto) e /icon, 307.
    expect(isPublicPath("/icon")).toBe(true);
  });

  it("/manifest.webmanifest é caminho público", () => {
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
  });

  it("a entrada é ancorada — não abre /icon-secreto nem /admin/icon", () => {
    // Regex de caminho público sem âncora é como allowlist vira buraco.
    expect(isPublicPath("/iconografia")).toBe(false);
    expect(isPublicPath("/admin/icon")).toBe(false);
    expect(isPublicPath("/icon/../app")).toBe(false);
  });

  it("a rota existe no disco com o nome que a regex espera", () => {
    // Guarda de vacuidade: a asserção acima passaria com a regex presente e o
    // arquivo ausente — allowlist para uma rota que não existe é config morta,
    // e o favicon continuaria em 404 com o teste verde.
    expect(fs.existsSync(path.join(RAIZ, "app/icon.tsx"))).toBe(true);
    // Na RAIZ de `app/`, nunca dentro de route group: `getMetadataRouteSuffix`
    // acrescenta um hash djb2 de 6 caracteres quando algum segmento pai é
    // group ou parallel route, e `app/(public)/icon.tsx` seria servido em
    // `/icon-<hash>` — a regex acima erraria em silêncio.
    expect(PUBLIC_PATHS.some((re) => re.source === String.raw`^\/icon$`)).toBe(true);
  });

  it("o ícone é a marca embutida deste fork (PNG), não mais desenhada da cor da instalação", () => {
    // Este fork tem UMA marca (TreenityCRM), então o ícone é fixo. O original
    // gerava cor + inicial em runtime porque a imagem dele serve vários
    // revendedores; aqui isso não se aplica. O PNG mora em base64 em
    // `marca-icone.ts` porque `public/` não vai no pacote da função serverless.
    const icone = fs.readFileSync(path.join(RAIZ, "app/icon.tsx"), "utf8");
    expect(icone).toMatch(/ICONE_DA_MARCA_PNG_BASE64/);
    const marca = fs.readFileSync(path.join(RAIZ, "lib/branding/marca-icone.ts"), "utf8");
    // Assinatura de PNG (89 50 4E 47 0D 0A 1A 0A) em base64: pega arquivo trocado por lixo.
    expect(marca).toMatch(/"iVBORw0KGgo/);
  });

  it("o layout declara o ícone — é o que mata o pedido a /favicon.ico", () => {
    // O 404 de /favicon.ico não é barato: em produção ele devolve a
    // `app/not-found.tsx` inteira (19.435 bytes) para um pedido de ícone.
    const layout = fs.readFileSync(path.join(RAIZ, "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/icons:\s*\{\s*icon:\s*"\/icon"\s*\}/);
  });
});
