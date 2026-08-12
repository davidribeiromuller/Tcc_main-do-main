import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, X, Bot, User, MessageSquare, CornerDownLeft, AlertCircle } from "lucide-react";

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
      content: "Olá! Eu sou a **Helena**, sua Assistente Virtual inteligente. 🌟\n\nEstou aqui para ajudar você a encontrar eventos na Escola Helena Wysocki, tirar dúvidas sobre horários, requisitos, locais ou até mesmo sugerir atividades legais!\n\nComo posso ajudar você hoje?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    { text: "📅 Próximos eventos", prompt: "Quais são os próximos eventos escolares cadastrados?" },
    { text: "🆓 Eventos gratuitos", prompt: "Quais são os eventos gratuitos na escola?" },
    { text: "⚠️ Requisitos importantes", prompt: "Quais são os requisitos ou regras de participação dos eventos?" },
    { text: "💡 Me sugira algo", prompt: "Me recomende um evento legal na escola e explique o porquê." }
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
      // Map history to the required format
      const history = messages
        .filter((m) => m.id !== "welcome") // Skip welcome prompt for context length efficiency
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          history,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Falha na comunicação com o servidor.");
      }

      const data = await res.json();
      
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.reply || "Desculpe, não consegui gerar uma resposta.",
          timestamp: new Date(),
        },
      ]);
    } catch (err: any) {
      console.error("Erro no chat com IA:", err);
      setError(err.message || "Não foi possível conectar à Helena. Verifique sua conexão ou se a chave GEMINI_API_KEY está configurada.");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to render formatted text (simple Markdown parsing for bold, bullets, and linebreaks)
  const formatMessageContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, lineIdx) => {
      // Handle list items starting with - or *
      const isListItem = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      let processedLine = line;
      if (isListItem) {
        processedLine = line.trim().substring(2);
      }

      // Regex for bold text: **text**
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(processedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(processedLine.substring(lastIndex, match.index));
        }
        parts.push(<strong key={match.index} className="font-semibold text-slate-900 dark:text-white">{match[1]}</strong>);
        lastIndex = boldRegex.lastIndex;
      }

      if (lastIndex < processedLine.length) {
        parts.push(processedLine.substring(lastIndex));
      }

      const lineContent = parts.length > 0 ? parts : processedLine;

      if (isListItem) {
        return (
          <li key={lineIdx} className="ml-4 list-disc mb-1 pl-1 text-sm leading-relaxed">
            {lineContent}
          </li>
        );
      }

      return (
        <p key={lineIdx} className="mb-2 text-sm leading-relaxed min-h-[1rem]">
          {lineContent}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Sparkle Button */}
      <div className="fixed bottom-24 right-6 z-40">
        <motion.button
          id="ai-chat-floating-button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-3.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-full shadow-lg shadow-indigo-500/20 transition-all font-display font-medium text-sm tracking-tight border border-white/10"
        >
          <Sparkles size={18} className="animate-pulse" />
          <span>Falar com Helena AI</span>
        </motion.button>
      </div>

      {/* Slide-over Chat Pane */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
            {/* Backdrop layer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs pointer-events-auto cursor-pointer"
            />

            {/* Chat Box Container */}
            <motion.div
              id="ai-chat-pane-container"
              initial={{ x: "100%", opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md h-full bg-slate-50 dark:bg-brand-card-dark border-l border-brand-primary/10 flex flex-col shadow-2xl pointer-events-auto"
            >
              {/* Header */}
              <div className="p-5 border-b border-brand-primary/10 bg-white dark:bg-brand-bg-dark/50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/10">
                    <Bot size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-display font-semibold text-brand-text-light dark:text-brand-text-dark text-base">
                        Assistente Helena
                      </h4>
                      <div className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-500 rounded-full px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">Inteligência Artificial Escolar</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col bg-slate-50 dark:bg-brand-bg-dark/10">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 max-w-[85%] ${
                      msg.role === "user" ? "self-end flex-row-reverse" : "self-start"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                        msg.role === "user"
                          ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                          : "bg-indigo-600 text-white"
                      }`}
                    >
                      {msg.role === "user" ? <User size={15} /> : <Bot size={15} />}
                    </div>

                    {/* Speech Bubble */}
                    <div className="flex flex-col gap-1">
                      <div
                        className={`px-4 py-3 rounded-2xl text-sm shadow-xs ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-tr-none"
                            : "bg-white dark:bg-brand-card-dark text-slate-800 dark:text-slate-200 border border-brand-primary/10 rounded-tl-none"
                        }`}
                      >
                        {formatMessageContent(msg.content)}
                      </div>
                      <span className="text-[10px] text-slate-400 self-end px-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Loading skeleton / Typing Indicator */}
                {isLoading && (
                  <div className="flex items-start gap-2.5 max-w-[80%] self-start animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0">
                      <Bot size={15} />
                    </div>
                    <div className="bg-white dark:bg-brand-card-dark border border-brand-primary/10 px-4 py-3 rounded-2xl rounded-tl-none shadow-xs">
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs flex items-start gap-2 max-w-[90%] self-center shadow-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5 animate-bounce" />
                    <div>
                      <p className="font-semibold">Algo deu errado</p>
                      <p className="opacity-90">{error}</p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Suggestions Panel */}
              <div className="px-5 pt-3 shrink-0 bg-slate-50 dark:bg-brand-bg-dark/10">
                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider mb-2">Perguntas frequentes</p>
                <div className="flex flex-wrap gap-2 pb-3 border-b border-brand-primary/10">
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q.prompt)}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 bg-white dark:bg-brand-card-dark border border-brand-primary/15 hover:border-indigo-500 dark:hover:border-indigo-500 text-slate-700 dark:text-brand-text-dark hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {q.text}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white dark:bg-brand-bg-dark/50 shrink-0">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(inputValue);
                  }}
                  className="relative flex items-center bg-slate-100 dark:bg-brand-card-dark border border-brand-primary/15 rounded-2xl px-4 py-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Escreva sua pergunta para Helena..."
                    disabled={isLoading}
                    className="w-full text-sm bg-transparent border-none outline-none text-brand-text-light dark:text-brand-text-dark pr-12 focus:ring-0 placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <div className="absolute right-3 flex items-center gap-1">
                    <button
                      type="submit"
                      disabled={isLoading || !inputValue.trim()}
                      className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-400 transition-colors flex items-center justify-center shadow-md shadow-indigo-500/10 cursor-pointer"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </form>
                <div className="flex justify-between items-center text-[9px] text-slate-400 mt-2 px-1 font-mono uppercase">
                  <span>Helena Wysocki AI v1.0</span>
                  <span className="flex items-center gap-1">
                    <CornerDownLeft size={10} /> Enter para enviar
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
