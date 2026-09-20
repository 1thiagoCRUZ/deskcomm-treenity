import { ImageResponse } from "next/og";

import { ICONE_DA_MARCA_PNG_BASE64 } from "@/lib/branding/marca-icone";

/**
 * O ícone da aba: a marca deste fork (TreenityCRM).
 *
 * O deskcomm original desenha este ícone em runtime, com a cor e a inicial da
 * marca da instalação — porque a imagem dele é UMA SÓ para todos os revendedores
 * e um arquivo fixo entregaria a marca de quem buildou a todos. Este fork tem UMA
 * marca, então o ícone é fixo: o PNG quadrado embutido em `marca-icone.ts`.
 *
 * Continua sendo a rota `/icon` (e não um `icon.png` estático) de propósito:
 * `app/layout.tsx`, `app/manifest.ts`, `lib/notifications/emit.ts` e a allowlist
 * de `lib/auth/public-paths.ts` já apontam para `/icon`.
 *
 * Fica embutido em base64, e não lido de `public/`, porque isto roda como função
 * serverless, onde `public/` não está no pacote da função.
 */
export const dynamic = "force-static";

/** 64 e não 32: a aba pede 16-32 CSS px, e em tela retina isso são 32-64 reais. */
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${ICONE_DA_MARCA_PNG_BASE64}`}
          width={size.width}
          height={size.height}
          alt=""
        />
      </div>
    ),
    { ...size },
  );
}
