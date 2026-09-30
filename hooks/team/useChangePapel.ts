"use client";
/**
 * Troca o papel do produto (Dono / Funcionário) de alguém da equipe.
 *
 * Um papel do produto é papel do DeskComm + menu padrão (ver
 * `lib/treenity/papeis.ts`), então a troca são as duas rotas que já existem,
 * nesta ordem: primeiro o papel (que autoriza), depois o menu. Se o menu
 * falhar, a pessoa fica com o papel novo e o menu antigo — a lista mostra
 * "Personalizado" e a troca pode ser repetida; nunca sobra permissão a mais
 * porque o menu não autoriza nada.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { PAPEIS_DO_CLIENTE, type PapelDoCliente } from "@/lib/treenity/papeis";

export function useChangePapel() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: async (args: { userId: string; papel: PapelDoCliente }) => {
      const def = PAPEIS_DO_CLIENTE[args.papel];
      await apiClient.patch(`/api/v1/team/${args.userId}`, { role: def.role });
      await apiClient.patch(`/api/v1/team/${args.userId}/interface`, { interface_settings: def.interface });
    },
    onSuccess: () => toast.success(t("Tipo de acesso atualizado.")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["team", "members"] }),
    onError: (err) => showApiError(err),
  });
}
