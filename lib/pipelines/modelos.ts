/**
 * Modelos de funil — as etapas com que um funil NASCE quando o dono escolhe
 * "Começar de…" na criação.
 *
 * ⚠️ MODELO É SEMENTE, NÃO VÍNCULO. As etapas são copiadas para o funil novo e a
 * partir daí são dele: renomear, recolorir ou reordenar aqui não toca nenhum funil
 * que já nasceu do modelo, e o contrário também vale. Nada sincroniza de volta —
 * duas fontes da verdade para a mesma coluna seria o anti-pattern 2.
 *
 * ⚠️ O `slug` É CHAVE TÉCNICA E NÃO MUDA AO RENOMEAR (ver `stage-editing.ts`).
 * Por isso os slugs são ASCII e estáveis; o NOME, com acento, é o que o cliente lê.
 * Integração externa (n8n, API) referencia a etapa por slug ou id, nunca pelo nome.
 *
 * ⚠️ SÓ `Venda ganha` É GANHO E SÓ `Venda perdida` É PERDA. `Pagamento realizado`
 * e `Pagamento não realizado` são etapas COMUNS: depois do pagamento ainda há
 * envio e feedback, e fechar o negócio ali o tiraria do quadro antes da entrega.
 * `uniq_crm_stages_pipeline_won/lost` permite uma de cada por funil.
 */
import { PALETA_DE_ETAPAS } from "@/lib/kanban/paleta-de-etapas";

export interface EtapaDeModelo {
  name: string;
  slug: string;
  /** `#RRGGBB` da paleta, ou `null` para a coluna nascer sem cor. */
  color: string | null;
  is_won: boolean;
  is_lost: boolean;
}

export const MODELOS_DE_FUNIL = ["vendas", "em_branco"] as const;
export type ModeloDeFunil = (typeof MODELOS_DE_FUNIL)[number];

const cor = (nome: string): string => {
  const achada = PALETA_DE_ETAPAS.find((c) => c.nome === nome);
  // Lança em teste/boot, nunca em produção silenciosa: nome de cor errado aqui é
  // erro de digitação do desenvolvedor, não dado do usuário.
  if (!achada) throw new Error(`Cor «${nome}» não existe na paleta de etapas.`);
  return achada.hex;
};

/**
 * Funil de vendas por WhatsApp com cobrança e entrega: do primeiro contato ao
 * feedback. "Feedback" é manual — o retorno vem do cliente, e o atendente move o card.
 */
export const ETAPAS_DO_FUNIL_DE_VENDAS: ReadonlyArray<EtapaDeModelo> = [
  { name: "Iniciado", slug: "iniciado", color: cor("Cinza"), is_won: false, is_lost: false },
  { name: "Orçamento", slug: "orcamento", color: cor("Azul"), is_won: false, is_lost: false },
  {
    name: "Retorno de orçamento",
    slug: "retorno_de_orcamento",
    color: cor("Índigo"),
    is_won: false,
    is_lost: false,
  },
  { name: "Envio de dados", slug: "envio_de_dados", color: cor("Roxo"), is_won: false, is_lost: false },
  {
    name: "Aguardando pagamento",
    slug: "aguardando_pagamento",
    color: cor("Âmbar"),
    is_won: false,
    is_lost: false,
  },
  {
    name: "Pagamento realizado",
    slug: "pagamento_realizado",
    color: cor("Turquesa"),
    is_won: false,
    is_lost: false,
  },
  {
    name: "Pagamento não realizado",
    slug: "pagamento_nao_realizado",
    color: cor("Laranja"),
    is_won: false,
    is_lost: false,
  },
  { name: "Envio", slug: "envio", color: cor("Ciano"), is_won: false, is_lost: false },
  { name: "Feedback (entrega + 15 dias)", slug: "feedback", color: cor("Rosa"), is_won: false, is_lost: false },
  { name: "Venda ganha", slug: "venda_ganha", color: cor("Verde"), is_won: true, is_lost: false },
  { name: "Venda perdida", slug: "venda_perdida", color: cor("Vermelho"), is_won: false, is_lost: true },
];
