import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A MÍDIA QUE O CLIENTE MANDA, EM QUALQUER CANAL.
 *
 * ─── O defeito, medido em produção ──────────────────────────────────────────
 *
 *   media.persist_requested    waha 423    zernio 0
 *
 * O cliente mandava foto, áudio ou PDF pelo canal intermediado; a linha entrava
 * com `type:"image"` e SEM bytes. O atendente via "imagem" sem imagem — e como
 * ele responde à mão, era o pior defeito do canal: perda de informação do
 * cliente, irreversível quando a plataforma descarta o arquivo.
 *
 * ─── Eram TRÊS elos partidos; este arquivo cobre só o ELO 3 ────────────────
 *
 * 1. O ingest guardava os anexos só no `metadata` e deixava `media_url` NULO.
 * 2. O ingest nunca emitia `media.persist_requested` — ninguém acordava o worker.
 * 3. O worker chamava `fetchWahaMedia` FIXO — mesmo acordado e com URL, ele
 *    baixaria pelo transporte errado.
 *
 * Só o elo 3 sobreviveu como caso de teste: os casos abaixo provam que o worker
 * despacha pelo adapter do canal (`fetchInboundMedia`), com escopo de tenant.
 * Os elos 1 e 2 não têm caso aqui.
 *
 * ─── Pendência conhecida (não consertada aqui) ──────────────────────────────
 *
 * Nenhum código de produção emite mais `media.persist_requested`: o emissor era
 * o WAHA/Zernio. Logo, a mídia recebida pelo canal oficial da Meta NÃO é
 * persistida no storage. Este arquivo não prova o contrário; registrar como
 * pendência até que o emissor exista.
 */

const WORKER = readFileSync("workers/media-persist-worker.ts", "utf8");
const TYPES = readFileSync("lib/channels/types.ts", "utf8");

describe("elo 3 — quem baixa é o CANAL, não uma função fixa", () => {
  it("o seam declara `fetchInboundMedia`, COM o escopo de tenant", () => {
    // O `ChannelTenantScope &` não é enfeite: sem a organização, quem baixa a
    // mídia resolve a credencial por um identificador de provider que não é
    // único, e a issue #236 mediu esse caminho terminando na conta do `.env`.
    expect(TYPES).toMatch(/fetchInboundMedia\?\(input: ChannelTenantScope & \{/);
  });

  it("o worker despacha pelo adapter", () => {
    expect(WORKER).toMatch(/await adapter\.fetchInboundMedia\(\{/);
  });

  it("e NÃO chama mais a função de um canal só", () => {
    // Era esta linha que fazia a mídia de qualquer outro canal virar linha sem
    // bytes. O guarda primário é o `lint:channels`; este caso é a rede de baixo.
    // A CHAMADA, não a menção: o comentário que explica o defeito cita o nome
    // da função, e a primeira versão deste caso ficava vermelha por causa da
    // própria documentação da correção.
    expect(WORKER, "o worker voltou a chamar o transporte fixo").not.toMatch(
      /await fetchWahaMedia\(|= fetchWahaMedia\(/,
    );
  });

  it("pede a sessão para resolver QUEM baixa", () => {
    // Sem `channel_session_id` no select, não há como pedir o adapter — e o
    // worker voltaria a depender de um canal fixo por falta de dado.
    expect(WORKER).toMatch(/channel_session_id/);
    expect(WORKER).toMatch(/CHANNEL_SESSION_REF_COLUMNS/);
  });

  it("canal que não sabe baixar é PULADO, não marcado como falho", () => {
    // É o estado normal de um canal sem mídia de entrada. Marcar `failed` faria
    // a Central acusar um defeito que não existe.
    expect(WORKER).toMatch(/status: "skipped", detail: "canal_sem_midia_de_entrada"/);
  });

  it("o worker não nomeia nenhum provider", () => {
    expect(WORKER, "o worker está decidindo por provider").not.toMatch(
      /"waha"|"zernio"|"meta_cloud"/,
    );
  });
});

describe("o tipo devolvido pelo seam é um só", () => {
  it("reusado e não redefinido em `types.ts`", () => {
    // Um segundo tipo com os mesmos campos diverge em silêncio na primeira vez
    // que um lado ganhar um campo — é a doutrina do topo de `types.ts`.
    expect(TYPES).toMatch(/\}\): Promise<FetchedMedia>;/);
  });
});
