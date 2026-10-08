/**
 * Tipos e rótulos dos dados para nota e envio, sem nada de servidor — é o que
 * a TELA importa. As regras, a cifra do CPF e o banco ficam em
 * `./dados-de-nota.ts` (que usa `node:crypto` e não pode ir para o navegador).
 */

/** Os campos do comprador que a loja precisa para emitir e despachar. */
export const CAMPOS_OBRIGATORIOS = [
  "nome",
  "cpf",
  "telefone",
  "email",
  "cep",
  "endereco",
  "cidade",
  "estado",
] as const;
export type CampoObrigatorio = (typeof CAMPOS_OBRIGATORIOS)[number];

export const ROTULO_DO_CAMPO: Record<CampoObrigatorio, string> = {
  nome: "Nome",
  cpf: "CPF",
  telefone: "Telefone",
  email: "E-mail",
  cep: "CEP",
  endereco: "Endereço",
  cidade: "Cidade",
  estado: "Estado",
};

/** O que a TELA recebe: CPF só mascarado, a não ser que se peça para revelar. */
export interface DadosDeNotaParaTela {
  nome: string | null;
  cpf_mascarado: string | null;
  /** Presente só quando a rota foi chamada para revelar (e isso fica no audit). */
  cpf?: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  propriedade_nome: string | null;
  propriedade_cnpj: string | null;
  propriedade_ie: string | null;
  propriedade_cep: string | null;
  propriedade_endereco: string | null;
  transportadora_preferida: string | null;
  preenchido_por: "bot" | "equipe";
  atualizado_em: string;
  faltando: CampoObrigatorio[];
}

