export type IdDeFonte =
  | "atkinson"
  | "inter"
  | "manrope"
  | "dm-sans"
  | "bricolage"
  | "fraunces";

export interface FonteDisponivel {
  readonly id: IdDeFonte;
  readonly nome: string;
  readonly variavelCss: string;
  readonly amostra: string;
}

export const FONTES_DISPONIVEIS: readonly FonteDisponivel[] = [
  { id: "atkinson", nome: "Atkinson Hyperlegible", variavelCss: "var(--font-atkinson)", amostra: "Aa" },
  { id: "inter", nome: "Inter", variavelCss: "var(--font-inter)", amostra: "Aa" },
  { id: "manrope", nome: "Manrope", variavelCss: "var(--font-manrope)", amostra: "Aa" },
  { id: "dm-sans", nome: "DM Sans", variavelCss: "var(--font-dm-sans)", amostra: "Aa" },
  { id: "bricolage", nome: "Bricolage Grotesque", variavelCss: "var(--font-bricolage)", amostra: "Aa" },
  { id: "fraunces", nome: "Fraunces", variavelCss: "var(--font-fraunces)", amostra: "Aa" },
];

export const FONTE_PADRAO: IdDeFonte = "atkinson";

export function fontePorId(id: string | null | undefined): FonteDisponivel {
  return FONTES_DISPONIVEIS.find((f) => f.id === id) ?? FONTES_DISPONIVEIS[0]!;
}
