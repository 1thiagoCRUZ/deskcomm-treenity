import { beforeAll, describe, expect, it } from "vitest";

import { GOV_CONV_UNASSIGNED, seedGov, sql } from "./gov-helpers";

/**
 * ENCERRAR A CONVERSA ENCERRA O PEDIDO DE ESPECIALISTA (0242).
 *
 * O aviso "O bot chamou o especialista" é calculado do `last_handoff_reason`. Sem
 * limpar ao encerrar, o cliente que voltava a escrever reabria a conversa e o aviso
 * da venda anterior reaparecia como se fosse novo.
 */
const PEDIDO = "O bot chamou o especialista: PAGAMENTO - boleto";
const razao = () =>
  sql(`select coalesce(last_handoff_reason, 'NULO') from public.conversations where id = '${GOV_CONV_UNASSIGNED}';`).trim();

beforeAll(() => seedGov());

describe("fechar limpa o pedido de especialista", () => {
  it("o pedido vai embora quando a conversa é encerrada", () => {
    sql(`update public.conversations set status = 'open', last_handoff_reason = '${PEDIDO}' where id = '${GOV_CONV_UNASSIGNED}';`);
    expect(razao()).toContain("O bot chamou o especialista");
    sql(`update public.conversations set status = 'closed' where id = '${GOV_CONV_UNASSIGNED}';`);
    expect(razao()).toBe("NULO");
  });

  it("um pedido NOVO feito depois de reabrir continua valendo", () => {
    sql(`update public.conversations set status = 'open' where id = '${GOV_CONV_UNASSIGNED}';`);
    sql(`update public.conversations set last_handoff_reason = '${PEDIDO}' where id = '${GOV_CONV_UNASSIGNED}';`);
    expect(razao()).toContain("O bot chamou o especialista");
  });

  it("outro motivo de passagem (não o do bot) não é apagado", () => {
    sql(`update public.conversations set status = 'open', last_handoff_reason = 'Pausado manualmente' where id = '${GOV_CONV_UNASSIGNED}';`);
    sql(`update public.conversations set status = 'closed' where id = '${GOV_CONV_UNASSIGNED}';`);
    expect(razao()).toBe("Pausado manualmente");
  });
});
