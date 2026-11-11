/**
 * A paleta de cores das etapas do funil — fonte única para a tela e para os modelos.
 *
 * ⚠️ O BANCO ACEITA QUALQUER `#RRGGBB` (CHECK `crm_stages_color_format`); a paleta é
 * só o que a TELA oferece. São cores de saturação média, legíveis como bolinha e
 * como faixa tanto no tema claro quanto no escuro — quem quiser outra usa o campo
 * "outra cor". Um hex fora daqui é válido e não é "corrigido" para a paleta.
 *
 * Sem dependência de React: `lib/pipelines/modelos.ts` (servidor) importa daqui.
 */

export interface CorDaPaleta {
  hex: string;
  /** Nome falado, para `aria-label` e tooltip — cor sozinha não é informação acessível. */
  nome: string;
}

export const PALETA_DE_ETAPAS: ReadonlyArray<CorDaPaleta> = [
  { hex: "#94a3b8", nome: "Cinza" },
  { hex: "#ef4444", nome: "Vermelho" },
  { hex: "#f97316", nome: "Laranja" },
  { hex: "#f59e0b", nome: "Âmbar" },
  { hex: "#eab308", nome: "Amarelo" },
  { hex: "#22c55e", nome: "Verde" },
  { hex: "#14b8a6", nome: "Turquesa" },
  { hex: "#06b6d4", nome: "Ciano" },
  { hex: "#3b82f6", nome: "Azul" },
  { hex: "#6366f1", nome: "Índigo" },
  { hex: "#a855f7", nome: "Roxo" },
  { hex: "#ec4899", nome: "Rosa" },
];

/** O mesmo formato do CHECK `crm_stages_color_format`. */
export const FORMATO_DE_COR = /^#[0-9a-fA-F]{6}$/;

/**
 * Cor legível sobre o fundo `hex` — `#000000` ou `#ffffff`.
 *
 * Luminância relativa (WCAG), não "brilho médio": amarelo e verde parecem claros
 * mas a média RGB os engana. Devolve `null` para hex inválido.
 */
export function corDoTextoSobre(hex: string): "#000000" | "#ffffff" | null {
  if (!FORMATO_DE_COR.test(hex)) return null;
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
  // Ponto de virada onde preto e branco têm o mesmo contraste (~0.179).
  return luminancia > 0.179 ? "#000000" : "#ffffff";
}
