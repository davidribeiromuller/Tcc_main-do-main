import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, X, Bot, User, MessageSquare, AlertCircle, School } from "lucide-react";
import { ARAUCARIA_SCHOOLS } from "../lib/schoolsData";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Olá! Eu sou o **Assistente Elo**, o assistente virtual do **eloEscola**. 🌟\n\nEstou aqui para tirar dúvidas sobre as escolas de Araucária, agenda de eventos em Araucária e Curitiba, datas letivas, localização e modalidades escolares.\n\nComo posso ajudar você hoje?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    { text: "🏫 6 Escolas de Araucária", prompt: "Quais são as 6 escolas de Araucária cadastradas no portal e seus cursos?" },
    { text: "📅 Próximos eventos", prompt: "Quais são os próximos eventos escolares e culturais cadastrados?" },
    { text: "🆓 Eventos gratuitos", prompt: "Quais são os eventos com entrada gratuita na região?" },
    { text: "🏙️ Eventos em Araucária", prompt: "Quais eventos vão acontecer em Araucária?" },
    { text: "🏛️ Eventos em Curitiba", prompt: "Quais eventos acontecem em Curitiba?" },
  ];

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    setError(null);
    const userMsgId = Date.now().toString();
    const newUserMessage: Message = {
      id: userMsgId,
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      let res: Response | null = null;
      try {
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: textToSend,
            history,
          }),
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.reply || "Desculpe, não consegui obter uma resposta.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      // Offline / Static fallback response
      let localReply = "Olá! Como **Assistente Elo**, estou operando em modo de contingência local do **eloEscola**.\n\nO portal conecta as 6 escolas estaduais de Araucária (Szymanski, Helena Wysocki, Maria da Graça, Campo Guajuvira, Marilze Brand e Cecília Meireles) e os eventos escolares de Araucária e Curitiba.";
      
      const lower = textToSend.toLowerCase();
      if (lower.includes("escola") || lower.includes("colegio") || lower.includes("szymanski") || lower.includes("wysocki")) {
        localReply = "🏫 **Escolas de Araucária conectadas ao eloEscola**:\n" +
          ARAUCARIA_SCHOOLS.map((s, i) => `${i + 1}. **${s.name}** (${s.neighborhood}) • Tel: ${s.phone}`).join("\n\n") +
          "\n\nVocê pode clicar na aba **Escolas** no menu para conhecer a página completa de cada uma!";
      } else if (lower.includes("evento") || lower.includes("agenda") || lower.includes("feira") || lower.includes("festival")) {
        localReply = "📅 **Agenda Escolar & Cultural**:\nO portal conta com eventos imperdíveis como a **Feira de Ciências e Tecnologia de Araucária**, o **Festival Estudantil de Arte e Música**, a **Semana Literária de Curitiba** e a **Mostra Paranaense de Robótica**. Confira a lista completa na aba **Mural & Eventos**!";
      } else if (lower.includes("gratis") || lower.includes("gratuito")) {
        localReply = "🆓 **Eventos Gratuitos**:\nA maioria dos eventos listados, como feiras científicas, mostras culturais no Teatro da Praça e encontros nas escolas, são totalmente gratuitos e abertos às famílias e estudantes!";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: localReply,
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error("Erro no chat com IA:", err);
      setError(err.message || "Não foi possível conectar ao Assistente Elo.");
    } finally {
      setIsLoading(false);
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
          <strong key={`bold-${lineIdx}-${match.index}`} className="font-bold text-gray-950 dark:text-white">
            {match[1]}
          </strong>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < processedLine.length) {
        parts.push(processedLine.substring(lastIndex));
      }

      if (isListItem) {
        return (
          <li key={lineIdx} className="ml-4 list-disc my-0.5 text-xs">
            {parts}
          </li>
        );
      }

      return (
        <p key={lineIdx} className={`text-xs leading-relaxed ${lineIdx > 0 ? "mt-1.5" : ""}`}>
          {parts.length > 0 ? parts : "\u00A0"}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-20 md:bottom-8 right-6 z-40 bg-emerald-800 hover:bg-emerald-900 text-white p-3.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 group cursor-pointer border border-emerald-600/40"
            aria-label="Abrir Assistente Elo"
          >
            <Sparkles size={20} className="animate-pulse" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out text-xs font-semibold">
              Assistente Elo
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-50 w-[calc(100vw-32px)] sm:w-[400px] h-[520px] max-h-[80vh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-emerald-200 dark:border-emerald-900 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-emerald-800 text-white p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-serif font-bold flex items-center gap-1.5">
                    Assistente Elo
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  </h3>
                  <p className="text-[10px] text-emerald-100">Guia de Escolas & Eventos • eloEscola</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/70 dark:bg-slate-950/40">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2.5 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 mt-0.5 border border-emerald-200">
                      <Bot size={15} />
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs shadow-xs ${
                      message.role === "user"
                        ? "bg-emerald-800 text-white rounded-br-none"
                        : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-emerald-100 dark:border-slate-700 rounded-bl-none"
                    }`}
                  >
                    {formatMessageContent(message.content)}
                  </div>

                  {message.role === "user" && (
                    <div className="w-7 h-7 rounded-full bg-emerald-800 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                      <User size={14} />
                    </div>
                  )}
                </div>
              ))}

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

              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
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

            {/* Input Box */}
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-emerald-100 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(inputValue);
                  }
                }}
                placeholder="Pergunte sobre escolas ou eventos..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 dark:text-white"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                className="bg-emerald-800 hover:bg-emerald-900 text-white p-2.5 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                aria-label="Enviar mensagem"
              >
                <Send size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
