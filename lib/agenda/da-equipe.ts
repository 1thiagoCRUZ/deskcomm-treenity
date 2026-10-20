import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { lerInterface } from "@/lib/navigation/interface";
import { papelDoVinculo } from "@/lib/treenity/papeis";

/**
 * A AGENDA É DA EMPRESA, e é o Dono quem diz se a equipe a usa.
 *
 * O Dono sempre vê a Agenda (ele vê tudo). O Funcionário só passa a vê-la
 * quando a empresa liga isto: uma loja com um funcionário que nunca marca
 * horário não precisa de um item de menu vazio, e uma empresa de 40 pessoas que
 * vive da agenda precisa dele para todas.
 *
 * Mora em `organizations.settings.agenda.equipe_ativa` — por empresa, então uma
 * empresa ligar não muda o menu de nenhuma outra. Ausente significa desligado.
 */
export function agendaLigadaParaEquipe(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const agenda = (settings as Record<string, unknown>).agenda;
  if (!agenda || typeof agenda !== "object") return false;
  return (agenda as Record<string, unknown>).equipe_ativa === true;
}

/**
 * UMA regra só para "esta pessoa vê/abre a Agenda?", usada pelo menu E pela
 * página — duas regras diferentes mandariam a pessoa a um link que a devolve.
 *
 * - Gestão, Dono e Gerente: sempre.
 * - Empresa com a Agenda ligada para a equipe: sim.
 * - Desligada: só quem o Dono configurou à mão, com `/app/agenda` na lista
 *   própria de telas. Menu padrão (Funcionário, completo ou simplificado) não.
 */
export function podeAbrirAgenda(
  isPlatformAdmin: boolean,
  role: Role | null,
  interfaceBruta: unknown,
  agendaDaEquipe: boolean,
): boolean {
  if (isPlatformAdmin || (!!role && ROLE_RANK[role] >= ROLE_RANK.manager)) return true;
  if (agendaDaEquipe) return true;
  if (papelDoVinculo(role, interfaceBruta) !== "personalizado") return false;
  return !!lerInterface(interfaceBruta).settings.destinos?.includes("/app/agenda");
}
