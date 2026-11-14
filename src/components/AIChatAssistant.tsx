import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, Send, X, Bot, User, MessageSquare, AlertCircle,
  Mic, MicOff, Volume2, VolumeX, Check, Ban, Ear, Square,
} from "lucide-react";
import {
  falar,
  pararFala,
  escutaDisponivel,
  falaDisponivel,
  iniciarEscuta,
} from "../lib/voiceAccessibility";
import {
  interpretarInstrucao,
  executarAcao,
  executarAcaoConfirmada,
  ehConfirmacao,
  type AcaoInterpretada,
  type ContextoAcoes,
} from "../lib/voiceActions";
import { responderLocalmente } from "../lib/assistantKnowledge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Origem: fala (microfone) ou texto. */
  viaVoz?: boolean;
}

interface AIChatAssistantProps {
  /** Eventos atuais — usados pelo repertório local para falar de agenda real. */
  eventos?: Array<any>;
  /** Usuário conectado (para personalizar a saudação). */
  nomeUsuario?: string;
  /**
   * Contexto para o assistente executar ações no app.
   *
   * Sem ele o assistente continua respondendo perguntas, mas não consegue
   * trocar tema, navegar ou abrir o cadastro — o componente degrada bem.
   */
  contextoAcoes?: ContextoAcoes;
}

/**
 * Assistente Elo — chat com acessibilidade por voz.
 *
 * Três modos de uso, todos opcionais:
 * - **texto** (sempre disponível): o comportamento original;
 * - **ouvir**: o botão de alto-falante lê a resposta em voz alta;
 * - **falar**: o microfone dita a mensagem e, se for uma instrução, o
 *   assistente executa a ação no app.
 *
 * A leitura automática é desligada por padrão: falar sem o usuário pedir é
 * invasivo e atrapalha em ambiente escolar.
 */
export default function AIChatAssistant({
  contextoAcoes,
  eventos,
  nomeUsuario,
}: AIChatAssistantProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Olá! Eu sou o **Assistente Elo**, o assistente virtual do **eloEscola**. 🌟\n\n" +
        "Estou aqui para tirar dúvidas sobre as escolas de Araucária, agenda de eventos em Araucária e Curitiba, datas letivas, localização e modalidades escolares.\n\n" +
        "Também posso **ajudar você a usar o app**: diga *\"leia a tela\"*, *\"ativar modo escuro\"* ou *\"crie um evento chamado Feira de Ciências em 20 de novembro\"*. Use o microfone para falar em vez de digitar.\n\n" +
        "Como posso ajudar você hoje?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Leitura automática das respostas em voz alta. */
  const [autoFalar, setAutoFalar] = useState(false);
  /** Mensagem que está sendo lida agora (para o botão virar "parar"). */
  const [lendoId, setLendoId] = useState<string | null>(null);
  /** Microfone ativo. */
  const [ouvindo, setOuvindo] = useState(false);
  /** Texto parcial reconhecido enquanto o usuário fala. */
  const [parcial, setParcial] = useState("");
  /** Ação aguardando confirmação do usuário. */
  const [acaoPendente, setAcaoPendente] = useState<AcaoInterpretada | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pararEscutaRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const podeEscutar = escutaDisponivel();
  const podeFalar = falaDisponivel();

  const quickQuestions = [
    { text: "🏫 6 Escolas de Araucária", prompt: "Quais são as 6 escolas de Araucária cadastradas no portal e seus cursos?" },
    { text: "📅 Próximos eventos", prompt: "Quais são os próximos eventos escolares e culturais cadastrados?" },
    { text: "🆓 Eventos gratuitos", prompt: "Quais são os eventos com entrada gratuita na região?" },
    { text: "💡 O que você pode fazer?", prompt: "O que você pode fazer por mim?" },
  ];

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, parcial]);

  // Para a leitura ao fechar o chat: voz continuando com a janela fechada
  // parece bug e incomoda.
  useEffect(() => {
    if (!isOpen) {
      pararFala();
      setLendoId(null);
      pararEscutaRef.current?.();
    }
  }, [isOpen]);

  // Libera o microfone ao desmontar.
  useEffect(() => {
    return () => {
      pararEscutaRef.current?.();
      pararFala();
    };
  }, []);

  /** Adiciona uma mensagem do assistente e, se pedido, fala em voz alta. */
  const responder = useCallback(
    (conteudo: string, falarAgora = false) => {
      const id = (Date.now() + 1).toString();
      setMessages((prev) => [
        ...prev,
        { id, role: "assistant", content: conteudo, timestamp: new Date() },
      ]);

      if (falarAgora && podeFalar) {
        setLendoId(id);
        falar(conteudo, { onFim: () => setLendoId((atual) => (atual === id ? null : atual)) });
      }
    },
    [podeFalar]
  );

  /** Lê (ou para de ler) uma mensagem específica. */
  const alternarLeitura = (message: Message) => {
    if (lendoId === message.id) {
      pararFala();
      setLendoId(null);
      return;
    }
    setLendoId(message.id);
    const ok = falar(message.content, {
      onFim: () => setLendoId((atual) => (atual === message.id ? null : atual)),
    });
    if (!ok) {
      setLendoId(null);
      setError("Este navegador não consegue falar em voz alta.");
    }
  };

  /**
   * Resposta quando não há servidor de IA.
   *
   * No GitHub Pages o `/api/ai/chat` não existe, então este é o caminho
   * normal — e não mais um plano B pobre. O repertório em
   * `assistantKnowledge.ts` cobre escolas, telefones, endereços, modalidades,
   * cadastro, presença, autorização, acessibilidade, permissões e agenda.
   */
  const respostaLocal = (texto: string): string =>
    responderLocalmente(texto, {
      eventos: eventos ?? [],
      nomeUsuario,
    });

  /**
   * Tenta executar a mensagem como uma AÇÃO no app.
   *
   * Roda ANTES da IA porque uma instrução como "ativar modo escuro" não deve
   * gastar uma chamada de rede nem receber uma resposta genérica: ela tem uma
   * ação concreta e é isso que o usuário quer.
   *
   * @returns `true` se tratou a mensagem (não deve ir para a IA).
   */
  const tentarAcao = (texto: string): boolean => {
    if (!contextoAcoes) return false;

    // Confirmação/recusa de uma ação pendente.
    if (acaoPendente) {
      const confirmou = ehConfirmacao(texto);
      const recusou = /\b(nao|cancela|cancelar|deixa|deixe)\b/i.test(texto);

      if (confirmou) {
        const resultado = executarAcaoConfirmada(acaoPendente, contextoAcoes);
        setAcaoPendente(null);
        responder(resultado.mensagem, autoFalar);
        return true;
      }
      if (recusou) {
        setAcaoPendente(null);
        responder("Tudo bem, cancelei. Nada foi alterado.", autoFalar);
        return true;
      }
      // Nem sim nem não: mantém a pendência e pede clareza.
      responder("Só confirmando: posso seguir com essa ação? Responda **sim** ou **não**.", autoFalar);
      return true;
    }

    const acao = interpretarInstrucao(texto);

    if (acao.tipo === "nenhuma") return false;

    if (acao.requerConfirmacao) {
      // Não executa: guarda e pergunta. Publicar sem revisão violaria a regra
      // de aprovação humana do projeto.
      setAcaoPendente(acao);
      responder(acao.descricao, autoFalar);
      return true;
    }

    const resultado = executarAcao(acao, contextoAcoes);
    responder(resultado.mensagem, autoFalar);
    return true;
  };

  const handleSend = async (textToSend: string, viaVoz = false) => {
    if (!textToSend.trim() || isLoading) return;

    setError(null);
    const userMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: textToSend, timestamp: new Date(), viaVoz },
    ]);
    setInputValue("");
    setParcial("");

    // 1) Instrução de ação? Resolve sem chamar a IA.
    if (tentarAcao(textToSend)) return;

    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      let res: Response | null = null;
      try {
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: textToSend, history }),
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json();
        responder(data.reply || "Desculpe, não consegui obter uma resposta.", autoFalar);
        return;
      }

      responder(respostaLocal(textToSend), autoFalar);
    } catch (err: any) {
      console.error("Erro no chat com IA:", err);
      setError(err.message || "Não foi possível conectar ao Assistente Elo.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Liga/desliga o microfone. A permissão é pedida pelo navegador aqui. */
  const alternarMicrofone = () => {
    if (ouvindo) {
      pararEscutaRef.current?.();
      pararEscutaRef.current = null;
      setOuvindo(false);
      setParcial("");
      return;
    }

    setError(null);
    // Para a leitura antes de ouvir: o microfone captaria a própria voz do
    // assistente e reconheceria a resposta como comando.
    pararFala();
    setLendoId(null);

    const parar = iniciarEscuta({
      onParcial: (texto) => setParcial(texto),
      onFinal: (texto) => {
        setParcial("");
        setOuvindo(false);
        pararEscutaRef.current = null;
        void handleSend(texto, true);
      },
      onErro: (mensagem) => {
        setError(mensagem);
        setOuvindo(false);
        setParcial("");
      },
      onFim: () => {
        setOuvindo(false);
        pararEscutaRef.current = null;
      },
    });

    if (parar) {
      pararEscutaRef.current = parar;
      setOuvindo(true);
    }
  };

  // Helper function to render formatted Markdown text
  const formatMessageContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      const isListItem = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      let processedLine = line;
      if (isListItem) {
        processedLine = line.trim().substring(2);
      }

      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(processedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(processedLine.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={`bold-${lineIdx}-${match.index}`} className="font-bold">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < processedLine.length) {
        parts.push(processedLine.substring(lastIndex));
      }

      return (
        <div key={lineIdx} className={line.trim() === "" ? "h-2" : isListItem ? "flex gap-1.5 ml-0.5" : ""}>
          {isListItem && <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">•</span>}
          <span className={isListItem ? "flex-1" : ""}>{parts.length > 0 ? parts : processedLine}</span>
        </div>
      );
    });
  };

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Abrir Assistente Elo"
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white shadow-lg flex items-center justify-center transition-all cursor-pointer"
      >
        <MessageSquare size={20} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-96 max-h-[75vh] sm:max-h-[560px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-emerald-100 dark:border-slate-700 flex flex-col overflow-hidden"
          >
            {/* Cabeçalho */}
            <div className="p-3 bg-emerald-800 dark:bg-emerald-900 text-white flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold">Assistente Elo</h3>
                <p className="text-[10px] text-emerald-100">
                  {ouvindo ? "Ouvindo você..." : "Pergunte, dite ou peça para eu ler a tela"}
                </p>
              </div>

              {/* Ler tudo em voz alta */}
              {podeFalar && (
                <button
                  onClick={() => {
                    if (autoFalar) {
                      pararFala();
                      setLendoId(null);
                    }
                    setAutoFalar((v) => !v);
                  }}
                  aria-label={autoFalar ? "Desativar leitura automática" : "Ativar leitura automática em voz alta"}
                  title={autoFalar ? "Leitura automática ativada" : "Ler respostas em voz alta"}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    autoFalar ? "bg-white/25" : "hover:bg-white/15"
                  }`}
                >
                  {autoFalar ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                aria-label="Fechar assistente"
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-slate-950 min-h-0">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2.5 items-start ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  {message.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 border border-emerald-200 dark:border-emerald-800 mt-0.5">
                      <Bot size={15} />
                    </div>
                  )}

                  <div className="flex flex-col gap-1 max-w-[82%]">
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                        message.role === "user"
                          ? "bg-emerald-800 text-white rounded-br-none"
                          : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-emerald-100 dark:border-slate-700 rounded-bl-none"
                      }`}
                    >
                      {formatMessageContent(message.content)}
                      {message.viaVoz && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[9px] text-emerald-200">
                          <Mic size={9} /> ditado por voz
                        </span>
                      )}
                    </div>

                    {/* Ouvir esta mensagem */}
                    {message.role === "assistant" && podeFalar && (
                      <button
                        onClick={() => alternarLeitura(message)}
                        aria-label={lendoId === message.id ? "Parar leitura" : "Ouvir esta mensagem"}
                        className="self-start inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        {lendoId === message.id ? (
                          <><Square size={9} /> Parar</>
                        ) : (
                          <><Volume2 size={9} /> Ouvir</>
                        )}
                      </button>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                      <User size={14} />
                    </div>
                  )}
                </div>
              ))}

              {/* Texto parcial do microfone */}
              {ouvindo && (
                <div className="flex gap-2.5 items-start">
                  <div className="w-7 h-7 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center flex-shrink-0 border border-red-200 animate-pulse">
                    <Mic size={14} />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-2xl rounded-bl-none px-3.5 py-2.5 shadow-xs">
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      {parcial || "Pode falar…"}
                    </p>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex gap-2.5 items-start">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                    <Bot size={15} />
                  </div>
                  <div className="bg-white dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 rounded-2xl rounded-bl-none px-4 py-3 shadow-xs flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.3s]"></div>
                  </div>
                </div>
              )}

              {/* Ação pendente de confirmação */}
              {acaoPendente && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl">
                  <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-2">
                    Aguardando sua confirmação
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSend("sim")}
                      className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      <Check size={12} /> Sim, pode
                    </button>
                    <button
                      onClick={() => handleSend("não")}
                      className="flex-1 inline-flex items-center justify-center gap-1 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
                    >
                      <Ban size={12} /> Cancelar
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Atalhos */}
            <div className="p-2 bg-white dark:bg-slate-900 border-t border-emerald-100 dark:border-slate-800 flex gap-1.5 overflow-x-auto no-scrollbar">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q.prompt)}
                  disabled={isLoading}
                  className="text-[11px] whitespace-nowrap bg-emerald-50 dark:bg-slate-800 hover:bg-emerald-100 text-emerald-900 dark:text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  {q.text}
                </button>
              ))}
            </div>

            {/* Campo de entrada */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-emerald-100 dark:border-slate-800 flex items-center gap-2">
              {/* Microfone: só aparece se o navegador suportar */}
              {podeEscutar && (
                <button
                  onClick={alternarMicrofone}
                  disabled={isLoading}
                  aria-label={ouvindo ? "Parar de ouvir" : "Falar pelo microfone"}
                  aria-pressed={ouvindo}
                  title={ouvindo ? "Parar de ouvir" : "Falar pelo microfone"}
                  className={`p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 ${
                    ouvindo
                      ? "bg-red-600 hover:bg-red-700 text-white animate-pulse"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {ouvindo ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}
              {!podeEscutar && (
                <span
                  title="Este navegador não reconhece voz. Use Chrome, Edge ou Safari."
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                >
                  <MicOff size={15} />
                </span>
              )}

              <input
                ref={inputRef}
                type="text"
                value={ouvindo ? parcial : inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(inputValue);
                  }
                }}
                placeholder={ouvindo ? "Ouvindo…" : "Pergunte, ou peça uma ação..."}
                aria-label="Mensagem para o Assistente Elo"
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:text-white"
                disabled={isLoading || ouvindo}
                readOnly={ouvindo}
              />
              <button
                onClick={() => handleSend(inputValue)}
                disabled={!inputValue.trim() || isLoading || ouvindo}
                aria-label="Enviar mensagem"
                className="bg-emerald-800 hover:bg-emerald-900 text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              >
                <Send size={15} />
              </button>
            </div>

            {/* Aviso de acessibilidade */}
            <div className="px-3 pb-2 bg-white dark:bg-slate-900">
              <p className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <Ear size={9} />
                {podeEscutar && podeFalar
                  ? "Voz e leitura em voz alta disponíveis. O microfone só liga quando você toca nele."
                  : !podeEscutar
                  ? "Este navegador não reconhece voz — você pode digitar normalmente."
                  : "Você pode digitar normalmente."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
