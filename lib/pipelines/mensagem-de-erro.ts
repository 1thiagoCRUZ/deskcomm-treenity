import { ApiError } from "@/lib/api/types";

/**
 * ⚠️ NEM TODA MENSAGEM DO SERVIDOR É TEXTO DE TELA.
 *
 * As recusas de REGRA (409/422) foram escritas em português, citam o nome da
 * etapa e ensinam o que fazer — vão inteiras para o usuário, e é para isso que
 * a camada pura existe. O MESMO canal, porém, carrega frase de infraestrutura:
 * «Permissão insuficiente. Requer role >= manager» (a palavra "role" na tela do
 * dono de clínica) e, nos 500, texto cru do Postgres em inglês — exatamente o
 * que o docblock de `agent-mapping.ts` diz existir para evitar. Imprimir tudo
 * verbatim traz de volta pela porta dos fundos o que a Task 1 fechou.
 */
export function mensagemDeErro(
  e: unknown,
  t: (texto: string) => string = (texto) => texto,
): string {
  if (e instanceof ApiError) {
    if (e.status === 409 || e.status === 422) return t(e.message);
    if (e.status === 401)
      return t("Sua sessão expirou. Entre de novo para salvar suas escolhas.");
    if (e.status === 403)
      return t("Você não tem permissão para mudar a configuração deste funil.");
  }
  return t("Não deu para salvar agora. Tente de novo em instantes.");
}
