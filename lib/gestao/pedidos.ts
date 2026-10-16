/**
 * Pedidos do cliente à Gestão Treenity.
 *
 * O Dono não mexe na Meta (credencial, webhook, verificação do número): isso é da Gestão.
 * Para trocar de número ele PEDE, e o pedido fica registrado e visível para a equipe da
 * Treenity — em vez de depender de uma mensagem solta num chat. Tabela: `pedidos_a_gestao`.
 */
import { z } from "zod";

export const TIPOS_DE_PEDIDO = ["trocar_numero"] as const;
export type TipoDePedido = (typeof TIPOS_DE_PEDIDO)[number];

export const STATUS_DE_PEDIDO = ["aberto", "atendido", "cancelado"] as const;
export type StatusDePedido = (typeof STATUS_DE_PEDIDO)[number];

/** Só dígitos, +, espaço, parênteses e hífen: é um telefone, não texto livre. */
const TELEFONE = /^[+(\d][\d\s()\-]{7,24}$/;

export const criarPedidoSchema = z.object({
  tipo: z.enum(TIPOS_DE_PEDIDO),
  numero_novo: z.string().trim().regex(TELEFONE, "Informe o número com DDD, por exemplo +55 14 99999-0000."),
  observacao: z.string().trim().max(500).optional(),
});
export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>;

export const resolverPedidoSchema = z.object({
  status: z.enum(["atendido", "cancelado"]),
});

export interface PedidoDto {
  id: string;
  organization_id: string;
  tipo: TipoDePedido;
  status: StatusDePedido;
  numero_novo: string | null;
  observacao: string | null;
  criado_em: string;
  resolvido_em: string | null;
}

interface LinhaDePedido {
  id: string;
  organization_id: string;
  tipo: string;
  status: string;
  detalhe: Record<string, unknown> | null;
  criado_em: string;
  resolvido_em: string | null;
}

export const COLUNAS_DE_PEDIDO = "id, organization_id, tipo, status, detalhe, criado_em, resolvido_em";

const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** A linha do banco como o cliente a recebe: `detalhe` (jsonb) vira campos tipados. */
export function pedidoParaDto(l: LinhaDePedido): PedidoDto {
  return {
    id: l.id,
    organization_id: l.organization_id,
    tipo: l.tipo as TipoDePedido,
    status: l.status as StatusDePedido,
    numero_novo: texto(l.detalhe?.numero_novo),
    observacao: texto(l.detalhe?.observacao),
    criado_em: l.criado_em,
    resolvido_em: l.resolvido_em,
  };
}
