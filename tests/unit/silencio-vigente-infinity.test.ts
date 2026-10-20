/**
 * A REGRA CANÔNICA DO SILÊNCIO TRATA `'infinity'` E DATA ILEGÍVEL COMO SILÊNCIO.
 *
 * Este arquivo testa a função pura `silencioVigente` (lib/inbox/comando-da-conversa.ts),
 * que é a regra viva. Nasceu de um defeito em que o worker legado (hoje removido)
 * não calava com `'infinity'`.
 *
 * ─── O defeito, medido em produção (VPS, 2026-08-30) ──────────────────────
 *
 * Às 14:10 a própria IA escalou uma conversa para atendimento humano
 * (`last_handoff_reason='low_sentiment'`), gravando o silêncio permanente que o
 * produto usa para isso: `conversations.bot_silenced_until = 'infinity'`.
 * A partir dali o motor novo se recusou a responder, corretamente — o log diz
 * `turno pulado — lead em handoff humano (bot silenciado)`.
 *
 * O worker legado (já removido) continuou respondendo por cima da escalação. A guarda dele era:
 *
 *     if (c.bot_silenced_until && new Date(c.bot_silenced_until).getTime() > Date.now())
 *
 * e `new Date('infinity')` é `Invalid Date`, cujo `getTime()` é `NaN`. **Toda**
 * comparação com `NaN` é falsa, então a guarda nunca disparava: uma proteção que
 * parecia existir e não existia. O cliente que a IA julgou insatisfeito seguiu
 * conversando com a máquina, e ninguém do outro lado soube.
 *
 * ─── Por que o conserto é DELEGAR, e não corrigir a expressão ─────────────
 *
 * A regra certa já existia em `lib/inbox/comando-da-conversa.ts`, é a que move a
 * TELA, e trata `'infinity'` de propósito — inclusive falhando FECHADO em data
 * ilegível. Havia duas regras para a mesma pergunta em dois arquivos, e elas
 * discordavam: a tela dizia "automático parado" enquanto o worker respondia.
 *
 * Reescrever a expressão no worker consertaria a instância e deixaria a classe
 * de pé — a terceira cópia nasceria divergente igual. Por isso a regra ficou
 * numa função só, `silencioVigente`, e este arquivo vigia o comportamento dela:
 * `'infinity'` e data ilegível calam; prazo vencido não cala.
 */

import { describe, expect, it } from "vitest";
import { silencioVigente } from "@/lib/inbox/comando-da-conversa";

describe("silêncio vigente: 'infinity' e data ilegível calam; prazo vencido não", () => {
  it("a aritmética que produziu o defeito — o porquê, para ninguém 'simplificar' de volta", () => {
    // Sem esta asserção, o conserto parece paranoia e a próxima pessoa reverte.
    expect(Number.isNaN(new Date("infinity").getTime())).toBe(true);
    expect(new Date("infinity").getTime() > Date.now()).toBe(false);
  });

  it("a regra canônica trata 'infinity' como silêncio vigente e durável", () => {
    const r = silencioVigente("infinity", new Date());
    expect(r.vigente).toBe(true);
    expect(r.duravel).toBe(true);
  });

  it("data ilegível também cala — falha fechada na ação", () => {
    expect(silencioVigente("banana", new Date()).vigente).toBe(true);
  });

  it("mas silêncio COM prazo já vencido não cala — senão a guarda vira permanente", () => {
    // O controle. Sem ele, um conserto que devolvesse `vigente: true` sempre
    // passaria nos casos acima e emudeceria o automático para todo mundo.
    const agora = new Date("2026-08-30T21:00:00Z");
    expect(silencioVigente("2026-08-30T20:00:00Z", agora).vigente).toBe(false);
    expect(silencioVigente("2026-08-30T22:00:00Z", agora).vigente).toBe(true);
    expect(silencioVigente(null, agora).vigente).toBe(false);
  });
});
