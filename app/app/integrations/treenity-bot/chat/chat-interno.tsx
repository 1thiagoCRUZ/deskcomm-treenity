/**
 * Chat interno (staff-to-staff) do Treenity Bot, embutido no deskcomm.
 *
 * Diferente do resto da integração (que só lê dados prontos, calculados no
 * servidor), aqui precisa de um socket.io vivo no navegador — por isso é
 * Client Component e fala direto com a API do bot via `lib/treenity-bot/chat-client.ts`,
 * usando a rota-ponte `/api/treenity-bot/sso` pra virar um accessToken sem
 * nunca expor o segredo de SSO aqui.
 *
 * accessToken dura 15 min (ver JWT_ACCESS_SECRET no api-treenity-bot); pra
 * essa primeira versão não há renovação automática — uma conversa aberta por
 * mais tempo que isso perde a conexão do socket e precisa recarregar a
 * página. Se isso incomodar no uso real, dá pra buscar sessão nova periodicamente.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { ChatCircle, PaperPlaneTilt, Users } from "@/lib/ui/icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/hooks/i18n/useT";
import { iniciaisDe } from "@/lib/treenity-bot/formatacao";
import { cn } from "@/lib/utils";
import {
  buscarHistorico,
  buscarSessaoChat,
  conectarSocketChat,
  iniciarConversa,
  listarUsuariosBot,
  type MensagemBot,
  type SessaoChatBot,
  type UsuarioBot,
} from "@/lib/treenity-bot/chat-client";

export default function ChatInterno() {
  const t = useT();
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<SessaoChatBot | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBot[]>([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<UsuarioBot | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemBot[]>([]);
  const [texto, setTexto] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const conversaIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      const s = await buscarSessaoChat();
      if (cancelado) return;
      setSessao(s);
      setCarregando(false);
      if (!s) return;

      const lista = await listarUsuariosBot(s);
      if (cancelado) return;
      setUsuarios(lista);

      const socket = conectarSocketChat(s);
      socketRef.current = socket;
      socket.on("receive_message", (mensagem: MensagemBot) => {
        if (mensagem.conversaId !== conversaIdRef.current) return;
        setMensagens((prev) => (prev.some((m) => m.id === mensagem.id) ? prev : [...prev, mensagem]));
      });
    })();

    return () => {
      cancelado = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const selecionarUsuario = useCallback(
    async (usuario: UsuarioBot) => {
      if (!sessao) return;
      setUsuarioSelecionado(usuario);
      setMensagens([]);
      setConversaId(null);
      conversaIdRef.current = null;

      const conversa = await iniciarConversa(sessao, usuario.id);
      if (!conversa) return;

      setConversaId(conversa.id);
      conversaIdRef.current = conversa.id;
      socketRef.current?.emit("join_chat", { conversaId: conversa.id });

      const historico = await buscarHistorico(sessao, conversa.id);
      setMensagens(historico);
    },
    [sessao],
  );

  function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo || !conversaId) return;
    socketRef.current?.emit("send_message", { conversaId, conteudo });
    setTexto("");
  }

  if (carregando) {
    return <p className="p-6 text-base text-muted-foreground">{t("Carregando...")}</p>;
  }

  if (!sessao) {
    return (
      <Card className="h-full">
        <CardContent className="p-6 text-base text-muted-foreground">
          {t("Não foi possível conectar ao chat do Treenity Bot agora. Confira se a API está no ar.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid h-full grid-cols-[22rem_1fr] overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex min-h-0 flex-col border-r border-border">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4 text-base font-semibold">
          <Users size={20} />
          {t("Pessoas")}
        </div>
        <ScrollArea className="flex-1">
          {usuarios.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {t("Nenhuma outra pessoa cadastrada no bot ainda.")}
            </p>
          ) : (
            <ul className="space-y-1 p-2.5">
              {usuarios.map((usuario) => (
                <li key={usuario.id}>
                  <button
                    type="button"
                    onClick={() => selecionarUsuario(usuario)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left text-base transition-colors hover:bg-muted",
                      usuarioSelecionado?.id === usuario.id && "bg-muted",
                    )}
                  >
                    <Avatar className="h-10 w-10 text-sm">
                      <AvatarFallback className="bg-accent-soft text-accent">
                        {iniciaisDe(usuario.nome)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate font-semibold">{usuario.nome}</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {usuario.papel === "admin" ? t("Admin") : t("Equipe")}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex min-h-0 flex-col">
        {!usuarioSelecionado ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ChatCircle size={44} weight="thin" className="text-text-subtle" aria-hidden />
            <p className="text-base font-medium text-text-muted">
              {t("Escolha alguém à esquerda para conversar.")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Avatar className="h-10 w-10 text-sm">
                <AvatarFallback className="bg-accent-soft text-accent">
                  {iniciaisDe(usuarioSelecionado.nome)}
                </AvatarFallback>
              </Avatar>
              <span className="text-lg font-semibold">{usuarioSelecionado.nome}</span>
            </div>

            <ScrollArea className="flex-1 px-3 py-4">
              {mensagens.length === 0 ? (
                <p className="px-4 py-8 text-center text-base text-muted-foreground">
                  {t("Nenhuma mensagem ainda. Diga oi!")}
                </p>
              ) : (
                mensagens.map((mensagem) => {
                  const minha = mensagem.remetenteId === sessao.usuario.id;
                  return (
                    <div
                      key={mensagem.id}
                      className={cn("flex w-full px-2 py-1.5", minha ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[65%] rounded-2xl px-4 py-2.5 text-base shadow-xs",
                          minha
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{mensagem.conteudo}</p>
                        <div
                          className={cn(
                            "mt-1 text-right text-xs",
                            minha ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {new Date(mensagem.criadoEm).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </ScrollArea>

            <form onSubmit={enviarMensagem} className="flex items-center gap-3 border-t border-border p-4">
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={t("Escreva uma mensagem...")}
                autoComplete="off"
                className="h-11 text-base"
              />
              <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!texto.trim()}>
                <PaperPlaneTilt size={18} weight="fill" aria-hidden />
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
