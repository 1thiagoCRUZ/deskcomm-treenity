/**
 * PAPÉIS DO PRODUTO TREENITY — a única fonte da verdade de "quem é quem".
 *
 * ─── Os três níveis ─────────────────────────────────────────────────────────
 *
 *   Gestão Treenity  → a equipe da Treenity. Vê TODAS as empresas clientes.
 *   Dono             → o cliente que contrata (ex.: o Rodrigo). Vê tudo da empresa dele.
 *   Funcionário      → a equipe do dono. Só o atendimento do dia a dia.
 *
 * ─── Por que um arquivo, e por que por cima do DeskComm ─────────────────────
 *
 * O DeskComm já tem as peças: o PAPEL do vínculo (`viewer` < `agent` <
 * `manager` < `admin`), que AUTORIZA páginas e ações, e a INTERFACE do vínculo
 * (`lib/navigation/interface.ts`), que só escolhe o que APARECE no menu. Os
 * papéis da Treenity são uma tradução para essas duas peças — nenhuma tabela,
 * nenhuma regra de autorização nova. Isso mantém duas coisas:
 *
 *   - segurança: quem autoriza continua sendo o papel do DeskComm, já testado
 *     por RLS e pelas rotas; a interface nunca libera nada (ver o cabeçalho de
 *     `lib/navigation/interface.ts`);
 *   - manutenção: mudar o que o funcionário vê é mexer em UMA linha aqui, e as
 *     telas (convite, cadastro, lista da equipe) só leem este arquivo. As rotas
 *     de API continuam genéricas (papel + interface), como no DeskComm.
 *
 * ─── Gestão Treenity não é papel de empresa ─────────────────────────────────
 *
 * Ela é o administrador da PLATAFORMA (`platform_admins`), fora das empresas:
 * vê o painel da plataforma e entra na empresa de um cliente pelo
 * "Acompanhar organização" (suporte temporário, com registro). Por isso ela
 * não aparece em `PAPEIS_DO_CLIENTE` e não pode ser escolhida num convite.
 * Usar o papel `manager` para a Treenity a prenderia dentro de UMA empresa.
 *
 * Detalhes, e como implantar um cliente novo: `docs/treenity/usuarios-e-acessos.md`.
 */
import type { Role } from "@/lib/auth/types";
import type { NavDestinationId } from "@/lib/navigation/catalogo";
import { lerInterface, type InterfaceSettings } from "@/lib/navigation/interface";

export type PapelDoCliente = "dono" | "funcionario";

export interface DefinicaoDoPapel {
  /** Como aparece na tela. */
  rotulo: string;
  /** Uma frase para quem está escolhendo. */
  descricao: string;
  /** O papel do DeskComm que AUTORIZA. */
  role: Extract<Role, "admin" | "agent">;
  /** O menu padrão da Treenity para o papel — o "pronto" que o dono pode personalizar depois. */
  interface: InterfaceSettings;
}

/** As telas do dia a dia do funcionário, na ordem do catálogo (a mesma em que
 * o schema da interface as grava — fora dela o papel vira "personalizado"). */
const TELAS_DO_FUNCIONARIO: readonly NavDestinationId[] = [
  "/app/inbox",
  "/app/templates",
  "/app/contacts",
  "/app/tasks",
  "/app/integrations/treenity-bot/chat",
];

export const PAPEIS_DO_CLIENTE: Record<PapelDoCliente, DefinicaoDoPapel> = {
  dono: {
    rotulo: "Dono",
    descricao: "Vê e configura tudo da empresa: atendimento, funis, equipe, conexões e relatórios.",
    role: "admin",
    interface: { preset: "completa" },
  },
  funcionario: {
    rotulo: "Funcionário",
    descricao: "Atende os clientes: Inbox, respostas rápidas, chat da equipe, contatos e tarefas.",
    role: "agent",
    interface: { preset: "simplificada", destinos: [...TELAS_DO_FUNCIONARIO] },
  },
};

export const ORDEM_DOS_PAPEIS: readonly PapelDoCliente[] = ["dono", "funcionario"];

export const GESTAO_TREENITY = {
  rotulo: "Gestão Treenity",
  descricao: "Equipe da Treenity: vê todas as empresas pelo painel da plataforma.",
} as const;

/**
 * Qual papel da Treenity um vínculo existente representa. `personalizado`
 * quando o papel ou o menu foram mexidos à mão (ex.: um `manager`, ou um
 * funcionário com uma tela a mais) — a tela mostra assim em vez de mentir.
 */
export function papelDoVinculo(role: string | null | undefined, interfaceBruta: unknown): PapelDoCliente | "personalizado" {
  const { settings } = lerInterface(interfaceBruta);
  for (const papel of ORDEM_DOS_PAPEIS) {
    const def = PAPEIS_DO_CLIENTE[papel];
    if (def.role === role && mesmaInterface(settings, def.interface)) return papel;
  }
  return "personalizado";
}

function mesmaInterface(a: InterfaceSettings, b: InterfaceSettings): boolean {
  if (a.preset !== b.preset) return false;
  const da = a.destinos ?? null;
  const db = b.destinos ?? null;
  if (da === null || db === null) return da === db;
  return da.length === db.length && da.every((d) => db.includes(d));
}
