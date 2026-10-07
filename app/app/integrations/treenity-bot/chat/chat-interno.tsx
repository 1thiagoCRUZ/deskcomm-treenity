/**
 * Chat interno (staff-to-staff) do Treenity Bot, embutido no deskcomm.
 *
 * Diferente do resto da integração (que só lê dados prontos, calculados no
 * servidor), aqui precisa de um socket.io vivo no navegador — por isso é
 * Client Component e fala direto com a API do bot via `lib/treenity-bot/chat-client.ts`,
 * usando a rota-ponte `/api/treenity-bot/sso` pra virar um accessToken sem
 * nunca expor o segredo de SSO aqui.
 *
 * O histórico mora no banco do bot (criptografado) e a API o devolve inteiro a
 * cada abertura de conversa — recarregar a página não perde nada. Esta tela
 * cuida de o usuário ENXERGAR isso: reabre a última conversa depois do reload,
 * abre na mensagem mais recente (como o WhatsApp Web) e avisa quando algo
 * falha em vez de mostrar "nenhuma mensagem".
 *
 * accessToken dura 15 min (JWT_ACCESS_SECRET do api-treenity-bot): a sessão é
 * renovada a cada 10 min e o socket reentra na sala da conversa sempre que
 * reconecta (as salas do socket.io morrem junto com a conexão).
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
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
  marcarConversaLidaBot,
  buscarHistorico,
  buscarSessaoChat,
  conectarSocketChat,
  iniciarConversa,
  listarConversasBot,
  listarUsuariosBot,
  type ConversaResumo,
  type MensagemBot,
  type SessaoChatBot,
  type UsuarioBot,
} from "@/lib/treenity-bot/chat-client";
import { atualizarChatNaoLidas } from "@/lib/treenity-bot/chat-nao-lidas";
import {
  montarMensagemComAnexo,
  separarAnexo,
  type AnexoDeCliente,
} from "@/lib/treenity-bot/anexo-de-cliente";
import { AnexarCliente } from "@/components/treenity-bot/AnexarCliente";
import { CartaoDoCliente } from "@/components/treenity-bot/CartaoDoCliente";

const CHAVE_ULTIMA_CONVERSA = "treenity-bot:chat:ultima-conversa";
const RENOVAR_SESSAO_MS = 10 * 60 * 1000;
const ATUALIZAR_CONVERSAS_MS = 30 * 1000;
const ATUALIZAR_CONVERSA_ABERTA_MS = 5 * 1000;
const MARGEM_DO_FIM_PX = 80;

export default function ChatInterno() {
  const t = useT();
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<SessaoChatBot | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBot[]>([]);
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<UsuarioBot | null>(null);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemBot[]>([]);
  const [texto, setTexto] = useState("");
  // Cliente anexado à próxima mensagem. Chega pronto quando se vem do Inbox
  // ("Falar com a equipe" → ?anexo=<conversa>&nome=<cliente>) ou pelo clipe.
  const [anexo, setAnexo] = useState<AnexoDeCliente | null>(null);
  const [conectado, setConectado] = useState(false);
  const [entrou, setEntrou] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAoAbrir, setErroAoAbrir] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const sessaoRef = useRef<SessaoChatBot | null>(null);
  const conversaIdRef = useRef<string | null>(null);
  const tRef = useRef(t);
  const listaRef = useRef<HTMLDivElement>(null);
  const noFimRef = useRef(true);
  const forcarFimRef = useRef(false);
  const restauradoRef = useRef(false);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Veio do Inbox com um cliente para mostrar: anexa e tira da URL, para que
  // recarregar a página não anexe de novo depois de enviado.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversaId = params.get("anexo");
    if (!conversaId || !/^[0-9a-f-]{36}$/i.test(conversaId)) return;
    setAnexo({ conversaId, nome: params.get("nome")?.trim() || tRef.current("Cliente") });
    params.delete("anexo");
    params.delete("nome");
    const resto = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
  }, []);

  const renovarSessao = useCallback(async () => {
    const nova = await buscarSessaoChat();
    if (!nova) return null;
    sessaoRef.current = nova;
    setSessao(nova);
    if (socketRef.current) socketRef.current.auth = { token: nova.accessToken };
    return nova;
  }, []);

  const recarregarConversas = useCallback(async () => {
    const s = sessaoRef.current;
    if (!s) return;
    const lista = await listarConversasBot(s);
    if (lista) setConversas(lista);
  }, []);

  // Você está vendo a conversa: zera o contador dela na lista na hora e avisa a
  // API, que é quem guarda até onde você leu; depois o selo do menu se atualiza.
  // Só com a aba visível — mensagem que chega com a aba escondida continua nova.
  const marcarLida = useCallback(async (id: string) => {
    const s = sessaoRef.current;
    if (!s || document.visibilityState !== "visible") return;
    setConversas((prev) => prev.map((c) => (c.id === id ? { ...c, naoLidas: 0 } : c)));
    await marcarConversaLidaBot(s, id);
    void atualizarChatNaoLidas(s);
  }, []);
  const marcarLidaRef = useRef(marcarLida);
  useEffect(() => {
    marcarLidaRef.current = marcarLida;
  }, [marcarLida]);

  // Voltou para a aba com uma conversa aberta: o que chegou enquanto estava
  // escondida agora foi visto.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && conversaIdRef.current) {
        void marcarLidaRef.current(conversaIdRef.current);
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, []);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let timerConversas: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const s = await buscarSessaoChat();
      if (cancelado) return;
      sessaoRef.current = s;
      setSessao(s);
      setCarregando(false);
      if (!s) return;

      const [lista, resumos] = await Promise.all([listarUsuariosBot(s), listarConversasBot(s)]);
      if (cancelado) return;
      setUsuarios(lista);
      if (resumos) setConversas(resumos);

      const socket = conectarSocketChat(s);
      socketRef.current = socket;

      socket.on("connect", () => {
        setConectado(true);
        // As salas do socket.io somem quando a conexão cai: reentra na conversa aberta.
        if (conversaIdRef.current) socket.emit("join_chat", { conversaId: conversaIdRef.current });
      });
      socket.on("disconnect", () => {
        setConectado(false);
        setEntrou(false);
      });
      socket.on("connect_error", async (err: Error) => {
        setConectado(false);
        if (/token/i.test(err.message) && (await renovarSessao()) && !cancelado) socket.connect();
      });
      socket.on("chat_joined", () => setEntrou(true));
      socket.on("chat_error", (dados: { error?: string }) => {
        toast.error(dados?.error ?? tRef.current("Falha no chat."));
      });
      socket.on("receive_message", (mensagem: MensagemBot) => {
        if (mensagem.conversaId !== conversaIdRef.current) return;
        setMensagens((prev) =>
          prev.some((m) => m.id === mensagem.id) ? prev : [...prev, mensagem],
        );
        if (mensagem.remetenteId !== s.usuario.id) void marcarLidaRef.current(mensagem.conversaId);
        void recarregarConversas(); // a prévia e a ordem da lista seguem a última mensagem
      });
      // Mensagem nova em OUTRA conversa: a lista ganha o contador sem esperar o polling.
      socket.on("chat_nova_mensagem", (aviso: { conversaId: string }) => {
        if (aviso.conversaId !== conversaIdRef.current) void recarregarConversas();
      });

      timer = setInterval(() => void renovarSessao(), RENOVAR_SESSAO_MS);
      // O socket só entrega a conversa aberta; as outras entram na lista por esta atualização.
      timerConversas = setInterval(() => void recarregarConversas(), ATUALIZAR_CONVERSAS_MS);
    })();

    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      if (timerConversas) clearInterval(timerConversas);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [renovarSessao, recarregarConversas]);

  // Quem já tem conversa vem primeiro, pela última atividade; os demais, em ordem de nome.
  const { comConversa, semConversa } = useMemo(() => {
    const resumoPorUsuario = new Map(conversas.map((c) => [c.outroUsuario.id, c]));
    const com = usuarios
      .filter((u) => resumoPorUsuario.get(u.id)?.ultimaMensagem)
      .sort((a, b) =>
        (resumoPorUsuario.get(b.id)?.ultimaMensagem?.criadoEm ?? "").localeCompare(
          resumoPorUsuario.get(a.id)?.ultimaMensagem?.criadoEm ?? "",
        ),
      );
    const sem = usuarios.filter((u) => !resumoPorUsuario.get(u.id)?.ultimaMensagem);
    return {
      comConversa: com.map((u) => ({ usuario: u, resumo: resumoPorUsuario.get(u.id)! })),
      semConversa: sem,
    };
  }, [usuarios, conversas]);

  // Duas pessoas com o mesmo nome (ex: dois "Dono") são indistinguíveis na lista, e
  // mandar a mensagem pra pessoa errada é o resultado. O sufixo é o começo do id:
  // estável e igual para todo mundo. A correção de verdade é renomear o perfil.
  const nomesRepetidos = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const u of usuarios) {
      const chave = u.nome.trim().toLowerCase();
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
    }
    return new Set([...contagem].filter(([, n]) => n > 1).map(([chave]) => chave));
  }, [usuarios]);

  function rotuloDe(usuario: UsuarioBot) {
    return nomesRepetidos.has(usuario.nome.trim().toLowerCase())
      ? `${usuario.nome} · ${usuario.id.slice(0, 4)}`
      : usuario.nome;
  }

  const selecionarUsuario = useCallback(async (usuario: UsuarioBot) => {
    const s = sessaoRef.current;
    if (!s) return;

    setUsuarioSelecionado(usuario);
    setMensagens([]);
    setConversaId(null);
    setEntrou(false);
    setErroAoAbrir(false);
    setAbrindo(true);
    conversaIdRef.current = null;
    try {
      localStorage.setItem(`${CHAVE_ULTIMA_CONVERSA}:${s.usuario.id}`, usuario.id);
    } catch {
      /* armazenamento indisponível: só não reabre sozinho depois do reload */
    }

    const conversa = await iniciarConversa(s, usuario.id);
    if (!conversa) {
      setAbrindo(false);
      setErroAoAbrir(true);
      return;
    }
    setConversaId(conversa.id);
    conversaIdRef.current = conversa.id;
    socketRef.current?.emit("join_chat", { conversaId: conversa.id });
    void marcarLidaRef.current(conversa.id);

    const historico = await buscarHistorico(s, conversa.id);
    if (conversaIdRef.current !== conversa.id) return; // trocou de conversa no meio do caminho
    setAbrindo(false);
    if (!historico) {
      setErroAoAbrir(true);
      return;
    }
    forcarFimRef.current = true;
    setMensagens(historico);
  }, []);

  // Reabre a última conversa depois de recarregar a página.
  useEffect(() => {
    if (restauradoRef.current || !sessao || usuarios.length === 0) return;
    restauradoRef.current = true;
    try {
      const salvo = localStorage.getItem(`${CHAVE_ULTIMA_CONVERSA}:${sessao.usuario.id}`);
      const alvo = usuarios.find((u) => u.id === salvo);
      if (alvo) void selecionarUsuario(alvo);
    } catch {
      /* sem armazenamento: o usuário escolhe a pessoa de novo */
    }
  }, [sessao, usuarios, selecionarUsuario]);

  // Abre na mensagem mais recente; depois só acompanha se a pessoa já estava lá embaixo.
  useEffect(() => {
    const el = listaRef.current;
    if (!el) return;
    if (forcarFimRef.current || noFimRef.current) el.scrollTop = el.scrollHeight;
    forcarFimRef.current = false;
  }, [mensagens]);

  // Rede de segurança: com uma conversa aberta, busca o histórico a cada poucos
  // segundos e acrescenta o que ainda não está na tela. O socket entrega ao vivo,
  // mas se a conexão cair, a sala se perder ou algo no caminho bloquear o
  // websocket, a mensagem de quem escreve pra você ainda chega por aqui.
  useEffect(() => {
    if (!conversaId) return;
    const id = conversaId;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const s = sessaoRef.current;
      if (!s) return;
      const historico = await buscarHistorico(s, id);
      if (!historico || conversaIdRef.current !== id) return;
      setMensagens((prev) => {
        const conhecidas = new Set(prev.map((m) => m.id));
        const novas = historico.filter((m) => !conhecidas.has(m.id));
        if (novas.length === 0) return prev;
        if (novas.some((m) => m.remetenteId !== s.usuario.id)) void marcarLidaRef.current(id);
        return [...prev, ...novas].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      });
    }, ATUALIZAR_CONVERSA_ABERTA_MS);
    return () => clearInterval(timer);
  }, [conversaId]);

  function aoRolar() {
    const el = listaRef.current;
    if (!el) return;
    noFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < MARGEM_DO_FIM_PX;
  }

  async function tentarDeNovo() {
    if (!usuarioSelecionado) return;
    await renovarSessao();
    void selecionarUsuario(usuarioSelecionado);
  }

  function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    if ((!texto.trim() && !anexo) || !conversaId || !conectado || !entrou) return;
    const conteudo = montarMensagemComAnexo(texto, anexo);
    forcarFimRef.current = true;
    socketRef.current?.emit("send_message", { conversaId, conteudo });
    setTexto("");
    setAnexo(null);
  }

  if (carregando) {
    return <p className="p-6 text-base text-muted-foreground">{t("Carregando...")}</p>;
  }

  if (!sessao) {
    return (
      <Card className="h-full">
        <CardContent className="p-6 text-base text-muted-foreground">
          {t(
            "Não foi possível conectar ao chat do Treenity Bot agora. Confira se a API está no ar.",
          )}
        </CardContent>
      </Card>
    );
  }

  const podeEnviar = conectado && entrou;

  function horaDaLista(iso: string) {
    const data = new Date(iso);
    if (isToday(data)) return format(data, "HH:mm");
    if (isYesterday(data)) return t("Ontem");
    return format(data, "dd/MM/yyyy");
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
            <>
              {comConversa.length > 0 ? (
                <section>
                  <h3 className="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t("Conversas")}
                  </h3>
                  <ul className="space-y-1 p-2.5 pt-1">
                    {comConversa.map(({ usuario, resumo }) => {
                      const ultima = resumo.ultimaMensagem;
                      const minha = ultima?.remetenteId === sessao.usuario.id;
                      const naoLidas =
                        usuarioSelecionado?.id === usuario.id ? 0 : (resumo.naoLidas ?? 0);
                      return (
                        <li key={usuario.id}>
                          <button
                            type="button"
                            onClick={() => selecionarUsuario(usuario)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left text-base transition-colors hover:bg-muted",
                              usuarioSelecionado?.id === usuario.id && "bg-muted",
                            )}
                          >
                            <Avatar className="h-10 w-10 shrink-0 text-sm">
                              <AvatarFallback className="bg-accent-soft text-accent">
                                {iniciaisDe(usuario.nome)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate font-semibold">{rotuloDe(usuario)}</span>
                                {ultima ? (
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {horaDaLista(ultima.criadoEm)}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p
                                  className={cn(
                                    "truncate text-sm",
                                    naoLidas > 0
                                      ? "font-medium text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {minha ? `${t("Você:")} ` : ""}
                                  {ultima?.conteudo != null
                                    ? previaSemCaminho(ultima.conteudo)
                                    : t("Mensagem indisponível")}
                                </p>
                                {naoLidas > 0 ? (
                                  <span
                                    data-testid="chat-nao-lidas-conversa"
                                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-foreground tabular-nums"
                                    aria-label={`${naoLidas} ${t("mensagens novas")}`}
                                  >
                                    {naoLidas > 99 ? "99+" : naoLidas}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {semConversa.length > 0 ? (
                <section>
                  <h3 className="px-5 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {comConversa.length > 0 ? t("Outras pessoas") : t("Pessoas")}
                  </h3>
                  <ul className="space-y-1 p-2.5 pt-1">
                    {semConversa.map((usuario) => (
                      <li key={usuario.id}>
                        <button
                          type="button"
                          onClick={() => selecionarUsuario(usuario)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left text-base transition-colors hover:bg-muted",
                            usuarioSelecionado?.id === usuario.id && "bg-muted",
                          )}
                        >
                          <Avatar className="h-10 w-10 shrink-0 text-sm">
                            <AvatarFallback className="bg-accent-soft text-accent">
                              {iniciaisDe(usuario.nome)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {rotuloDe(usuario)}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {usuario.papel === "admin" ? t("Admin") : t("Equipe")}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
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
            {anexo ? (
              <div className="w-full max-w-sm text-left">
                <p className="mb-2 text-sm text-muted-foreground">{t("Vai junto na mensagem:")}</p>
                <CartaoDoCliente anexo={anexo} onRemover={() => setAnexo(null)} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Avatar className="h-10 w-10 text-sm">
                <AvatarFallback className="bg-accent-soft text-accent">
                  {iniciaisDe(usuarioSelecionado.nome)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="block truncate text-lg font-semibold">
                  {rotuloDe(usuarioSelecionado)}
                </span>
                {!conectado ? (
                  <span className="block text-xs text-warning-fg">{t("Reconectando…")}</span>
                ) : null}
              </div>
            </div>

            <div
              ref={listaRef}
              onScroll={aoRolar}
              className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
            >
              {erroAoAbrir ? (
                <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                  <p className="text-base text-muted-foreground">
                    {t(
                      "Não foi possível carregar esta conversa agora. Suas mensagens continuam salvas.",
                    )}
                  </p>
                  <Button variant="secondary" size="sm" onClick={() => void tentarDeNovo()}>
                    {t("Tentar de novo")}
                  </Button>
                </div>
              ) : abrindo ? (
                <p className="px-4 py-8 text-center text-base text-muted-foreground">
                  {t("Carregando conversa…")}
                </p>
              ) : mensagens.length === 0 ? (
                <p className="px-4 py-8 text-center text-base text-muted-foreground">
                  {t("Nenhuma mensagem ainda. Diga oi!")}
                </p>
              ) : (
                mensagens.map((mensagem) => {
                  const minha = mensagem.remetenteId === sessao.usuario.id;
                  const partes = separarAnexo(mensagem.conteudo);
                  return (
                    <div
                      key={mensagem.id}
                      className={cn(
                        "flex w-full px-2 py-1.5",
                        minha ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[65%] rounded-2xl px-4 py-2.5 text-base shadow-xs",
                          minha
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm bg-muted text-foreground",
                        )}
                      >
                        {partes.texto ? (
                          <p className="leading-relaxed break-words whitespace-pre-wrap">
                            {partes.texto}
                          </p>
                        ) : null}
                        {partes.anexo ? (
                          <div className={cn(partes.texto && "mt-2")}>
                            <CartaoDoCliente anexo={partes.anexo} minha={minha} />
                          </div>
                        ) : null}
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
            </div>

            <form onSubmit={enviarMensagem} className="border-t border-border p-4">
              {anexo ? (
                <div className="mb-3">
                  <CartaoDoCliente anexo={anexo} onRemover={() => setAnexo(null)} />
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <AnexarCliente onEscolher={setAnexo} disabled={!podeEnviar} />
                <Input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={podeEnviar ? t("Escreva uma mensagem...") : t("Conectando…")}
                  autoComplete="off"
                  className="h-11 text-base"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  disabled={(!texto.trim() && !anexo) || !podeEnviar}
                >
                  <PaperPlaneTilt size={18} weight="fill" aria-hidden />
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Prévia da lista sem o caminho do anexo: "📎 João · /app/inbox?id=…" vira
 * "📎 João". A prévia vem cortada em 140 caracteres pela API, então a linha do
 * anexo pode chegar pela metade — por isso um corte no separador, e não o
 * `separarAnexo` (que exige a linha inteira).
 */
function previaSemCaminho(conteudo: string): string {
  const i = conteudo.indexOf(" · /app/inbox");
  return i === -1 ? conteudo : conteudo.slice(0, i);
}
