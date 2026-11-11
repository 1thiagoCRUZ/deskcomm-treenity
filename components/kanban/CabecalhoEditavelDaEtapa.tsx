"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useEditarEtapa, type PatchDeEtapa } from "@/hooks/pipelines/useStages";
import { ROLE_RANK } from "@/lib/auth/types";
import type { Stage } from "@/lib/kanban/types";
import { mensagemDeErro } from "@/lib/pipelines/mensagem-de-erro";
import { PencilSimple } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { SeletorDeCor } from "./SeletorDeCor";

/**
 * A bolinha de cor e o nome da etapa, editáveis NA PRÓPRIA COLUNA do quadro.
 *
 * ⚠️ É O MESMO CAMINHO DA TELA DE CONFIGURAÇÃO — `PATCH …/stages/[stageId]` pelo
 * mesmo hook —, só que no lugar onde o dono olha para o funil. Nenhuma regra é
 * recalculada aqui: nome duplicado, cor inválida e o resto vêm do servidor, na frase
 * em português dele.
 *
 * ⚠️ SÓ `manager+` EDITA, e para os outros o cabeçalho é o de sempre (bolinha e
 * título, sem lápis). A rota exige `manager`; oferecer o controle a quem o servidor
 * recusaria seria prometer o que não se cumpre. O papel vem da organização ativa, o
 * mesmo critério de `app/app/kanban/page.tsx` — a rota continua sendo a barreira, isto
 * é só a vitrine.
 */
export function CabecalhoEditavelDaEtapa({
  stage,
  pipelineId,
}: {
  stage: Stage;
  pipelineId: string;
}) {
  const t = useT();
  const activeOrg = useActiveOrg();
  const editar = useEditarEtapa(pipelineId);
  const [renomeando, setRenomeando] = useState(false);
  const [rascunho, setRascunho] = useState(stage.name);

  const podeEditar = activeOrg != null && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  function aplicar(patch: PatchDeEtapa, aoDarCerto?: () => void) {
    editar.mutate(
      { stageId: stage.id, patch },
      {
        onSuccess: () => {
          toast.success(t("Etapa atualizada."));
          aoDarCerto?.();
        },
        // O texto do servidor, tratado como na tela de configuração (409/422 em
        // português; infraestrutura vira frase genérica).
        onError: (e) => toast.error(mensagemDeErro(e, t)),
      },
    );
  }

  function confirmarNome() {
    const nome = rascunho.trim();
    setRenomeando(false);
    if (!nome || nome === stage.name) {
      setRascunho(stage.name);
      return;
    }
    aplicar({ name: nome }, undefined);
  }

  const bolinha = (
    <span
      className={cn("block h-2 w-2 rounded-full", !stage.color && "bg-text-muted/40")}
      style={stage.color ? { backgroundColor: stage.color } : undefined}
      aria-hidden
    />
  );

  if (!podeEditar) {
    return (
      <>
        {bolinha}
        <h2 className="flex-1 truncate text-sm font-semibold text-text">{stage.name}</h2>
      </>
    );
  }

  return (
    <>
      <SeletorDeCor
        cor={stage.color}
        nomeDaEtapa={stage.name}
        desabilitado={editar.isPending}
        idDeTeste={`coluna-${stage.id}-cor`}
        className="h-6 w-6 border-transparent"
        aoEscolher={(cor) => aplicar({ color: cor })}
      />

      {renomeando ? (
        <Input
          autoFocus
          value={rascunho}
          maxLength={80}
          aria-label={`${t("Nome da etapa")} «${stage.name}»`}
          data-testid={`coluna-${stage.id}-nome-campo`}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={confirmarNome}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setRascunho(stage.name);
              setRenomeando(false);
            }
          }}
          className="h-7 min-w-0 flex-1 px-2 text-sm font-semibold"
        />
      ) : (
        <>
          <h2
            className="flex-1 cursor-text truncate text-sm font-semibold text-text"
            data-testid={`coluna-${stage.id}-nome`}
            onDoubleClick={() => {
              setRascunho(stage.name);
              setRenomeando(true);
            }}
          >
            {stage.name}
          </h2>
          <button
            type="button"
            aria-label={`${t("Renomear a etapa")} «${stage.name}»`}
            data-testid={`coluna-${stage.id}-renomear`}
            disabled={editar.isPending}
            onClick={() => {
              setRascunho(stage.name);
              setRenomeando(true);
            }}
            className={cn(
              "rounded-md p-1 text-text-muted transition-opacity hover:bg-surface-muted hover:text-text",
              "opacity-0 focus-visible:opacity-100 group-hover/etapa:opacity-100",
              "[@media(hover:none)]:opacity-100",
            )}
          >
            <PencilSimple size={14} aria-hidden />
          </button>
        </>
      )}
    </>
  );
}
