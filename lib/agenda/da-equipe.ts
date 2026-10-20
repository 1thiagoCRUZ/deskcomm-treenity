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
