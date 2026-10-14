/**
 * Quais horas a grade da Agenda desenha.
 *
 * Antes era fixo (7h–21h) para todo mundo. A loja que atende das 10h às 16h via
 * catorze linhas vazias; a que atende à noite via o fim cortado — e nenhuma tinha
 * onde mudar. Agora a janela nasce do expediente que a equipe publicou, e cresce
 * para caber qualquer compromisso que já esteja fora dele (nunca esconde um).
 */
export type JanelaDaGrade = { primeira: number; ultima: number };

export const JANELA_PADRAO: JanelaDaGrade = { primeira: 7, ultima: 21 };

/** No mínimo seis linhas: uma janela de uma hora vira uma faixa inutilizável. */
const MINIMO_DE_HORAS = 6;

const minutosDe = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function janelaDaGrade(
  expedientes: Array<{ start: string; end: string }>,
  compromissos: Array<{ comeca: string; termina: string }> = [],
): JanelaDaGrade {
  let ini = Infinity;
  let fim = -Infinity;
  for (const w of expedientes) {
    const a = minutosDe(w.start);
    const b = minutosDe(w.end);
    if (a === null || b === null) continue;
    ini = Math.min(ini, a);
    fim = Math.max(fim, b);
  }
  if (!Number.isFinite(ini)) return JANELA_PADRAO;

  for (const c of compromissos) {
    const a = new Date(c.comeca);
    const b = new Date(c.termina);
    ini = Math.min(ini, a.getHours() * 60 + a.getMinutes());
    fim = Math.max(fim, b.getHours() * 60 + b.getMinutes() || 24 * 60);
  }

  let primeira = Math.max(0, Math.floor(ini / 60));
  let ultima = Math.min(23, Math.ceil(fim / 60) - 1);
  if (ultima - primeira + 1 < MINIMO_DE_HORAS) {
    ultima = Math.min(23, primeira + MINIMO_DE_HORAS - 1);
    primeira = Math.max(0, ultima - MINIMO_DE_HORAS + 1);
  }
  return { primeira, ultima };
}
