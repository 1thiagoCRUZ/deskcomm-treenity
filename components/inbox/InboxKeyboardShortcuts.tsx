"use client";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  /** Currently visible conversation ids in the list (for j/k nav). */
  visibleIds: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocusReply: () => void;
  onClaim: () => void;
  onClose: () => void;
  /** Org com Treenity Bot: fechar exige dizer como terminou (botão Fechar da conversa). undefined = não é Treenity. */
  fecharExigeDesfecho?: boolean;
  onToggleHelp: () => void;
  enabled?: boolean;
}

export function InboxKeyboardShortcuts({
  visibleIds,
  selectedId,
  onSelect,
  onFocusReply,
  onClaim,
  onClose,
  fecharExigeDesfecho = false,
  onToggleHelp,
  enabled = true,
}: Props) {
  const t = useT();
  function step(delta: number) {
    if (visibleIds.length === 0) return;
    const idx = selectedId ? visibleIds.indexOf(selectedId) : -1;
    let next = idx + delta;
    if (idx < 0) next = delta > 0 ? 0 : visibleIds.length - 1;
    if (next < 0) next = 0;
    if (next >= visibleIds.length) next = visibleIds.length - 1;
    const id = visibleIds[next];
    if (id) onSelect(id);
  }

  useHotkeys("j", () => step(1), { enabled, preventDefault: true }, [
    visibleIds,
    selectedId,
  ]);
  useHotkeys("k", () => step(-1), { enabled, preventDefault: true }, [
    visibleIds,
    selectedId,
  ]);
  useHotkeys("r", () => onFocusReply(), { enabled, preventDefault: true });
  useHotkeys("a", () => onClaim(), { enabled, preventDefault: true });
  useHotkeys(
    "e",
    () => {
      // Antes do confirm: com o Treenity Bot o atalho não fecha às escuras.
      if (fecharExigeDesfecho) {
        toast.info(t("Para fechar e dizer como terminou, use o botão Fechar da conversa."));
        return;
      }
      if (confirm(t("Fechar conversa?"))) onClose();
    },
    { enabled, preventDefault: true },
  );
  useHotkeys("shift+/", () => onToggleHelp(), { enabled, preventDefault: true });

  return null;
}
