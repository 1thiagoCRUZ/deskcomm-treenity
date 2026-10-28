"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

type SnoozeArgs =
  | { conversation_id: string; minutos: number }
  | { conversation_id: string; ate: string };

interface CancelArgs {
  conversation_id: string;
}

export function useSnoozeConversation() {
  const qc = useQueryClient();

  const invalidate = (conversationId: string) => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
  };

  const snooze = useMutation({
    mutationFn: async (args: SnoozeArgs) =>
      apiClient.post<{ data: { snooze_until: string } }>(
        `/api/v1/conversations/${args.conversation_id}/snooze`,
        "ate" in args ? { ate: args.ate } : { minutos: args.minutos },
      ),
    onError: showApiError,
    onSuccess: (_data, args) => invalidate(args.conversation_id),
  });

  const cancel = useMutation({
    mutationFn: async (args: CancelArgs) =>
      apiClient.delete<void>(`/api/v1/conversations/${args.conversation_id}/snooze`),
    onError: showApiError,
    onSuccess: (_data, args) => invalidate(args.conversation_id),
  });

  return { snooze, cancel };
}
