/**
 * Interpola variáveis de template com dados do contato da conversa (Onda 5).
 * Suporta {{nome}}, {{primeiro_nome}} e {{cumprimento}}. Variável sem valor ou
 * desconhecida mantém o literal `{{x}}` — nunca gera texto quebrado que iria
 * pro cliente.
 *
 * `[cumprimento]` (com colchetes) também vale: é a grafia das respostas rápidas
 * do Treenity Bot, que o n8n troca pela saudação do horário antes de enviar
 * (nó "Preparar Resposta Rapida"). Como o `/` do Inbox lê a MESMA lista, sem
 * isto o cliente receberia "[cumprimento], tudo certo?" literalmente.
 */
export interface TemplateContact {
  name?: string | null;
}

/** Fuso das saudações — o mesmo que o bot usa (`America/Sao_Paulo`). */
const FUSO_DA_SAUDACAO = "America/Sao_Paulo";

/**
 * "Bom dia" até 11h59, "Boa tarde" até 17h59, "Boa noite" depois — a regra
 * exata do n8n, no horário de São Paulo e não no do navegador de quem atende.
 */
export function cumprimentoDoHorario(agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO_DA_SAUDACAO, hour: "numeric", hourCycle: "h23" }).format(agora),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function interpolateTemplate(body: string, contact: TemplateContact, agora: Date = new Date()): string {
  const full = (contact.name ?? "").trim();
  const first = full.split(/\s+/)[0] ?? "";
  return body
    .replace(/\[\s*cumprimento\s*\]/gi, () => cumprimentoDoHorario(agora))
    .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (literal, rawKey: string) => {
      const key = rawKey.toLowerCase();
      if (key === "nome") return full !== "" ? full : literal;
      if (key === "primeiro_nome") return first !== "" ? first : literal;
      if (key === "cumprimento") return cumprimentoDoHorario(agora);
      return literal; // desconhecida: mantém
    });
}
