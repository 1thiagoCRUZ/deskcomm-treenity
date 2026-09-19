/**
 * Pequenos formatadores compartilhados pelas 3 telas do Treenity Bot.
 * Nada aqui chama a API — são funções puras sobre os dados já carregados.
 */

/** "Marina Ferreira Souza" → "MF". Mesma regra usada em components/agenda/paleta.ts,
 * duplicada aqui de propósito: são features sem relação nenhuma entre si. */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** Latência entre duas mensagens, já arredondada pra leitura ("3s", "2 min"). */
export function formatarLatencia(deMs: number, ateMs: number): string {
  const diffMs = Math.max(0, ateMs - deMs);
  const segundos = Math.round(diffMs / 1000);
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.round(segundos / 60);
  return `${minutos} min`;
}

export interface PontosSparkline {
  /** Path do preenchimento sob a linha (fechado no eixo inferior). */
  area: string;
  /** Pontos da polyline, prontos para o atributo `points`. */
  linha: string;
  ultimoX: number;
  ultimoY: number;
}

/** Converte uma série de valores reais num sparkline SVG (100x28, sem lib de gráfico). */
export function pontosSparkline(valores: number[], largura = 100, altura = 28): PontosSparkline | null {
  if (valores.length === 0) return null;
  if (valores.length === 1) {
    const y = altura / 2;
    return {
      area: `M0,${altura} L0,${y} L${largura},${y} L${largura},${altura} Z`,
      linha: `0,${y} ${largura},${y}`,
      ultimoX: largura,
      ultimoY: y,
    };
  }
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const amplitude = max - min || 1;
  const passo = largura / (valores.length - 1);
  const pontos = valores.map((v, i) => {
    const x = Math.round(i * passo * 100) / 100;
    const y = Math.round((altura - ((v - min) / amplitude) * altura) * 100) / 100;
    return { x, y };
  });
  const linha = pontos.map((p) => `${p.x},${p.y}`).join(" ");
  const ultimo = pontos[pontos.length - 1]!;
  const area = `M0,${altura} ${pontos.map((p) => `L${p.x},${p.y}`).join(" ")} L${largura},${altura} Z`;
  return { area, linha, ultimoX: ultimo.x, ultimoY: ultimo.y };
}

/** % de variação entre a 1ª e a 2ª metade da série. `null` quando não dá pra calcular. */
export function deltaPercentual(valores: number[]): number | null {
  if (valores.length < 2) return null;
  const meio = Math.floor(valores.length / 2);
  const primeira = valores.slice(0, meio).reduce((a, b) => a + b, 0);
  const segunda = valores.slice(meio).reduce((a, b) => a + b, 0);
  if (primeira === 0) return null;
  return ((segunda - primeira) / primeira) * 100;
}
