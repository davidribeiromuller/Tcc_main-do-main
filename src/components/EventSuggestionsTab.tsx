import React, { useEffect, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  Check,
  X,
  MapPin,
  Calendar,
  ExternalLink,
  Info,
  Trash2,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  fetchEventSuggestions,
  approveEventSuggestion,
  rejectEventSuggestion,
  triggerAiEventScout,
  type EventSuggestion,
} from "../lib/eventSuggestionsService";
import type { User } from "../types";

interface EventSuggestionsTabProps {
  currentUser: User | null;
  canApprove: boolean;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
  onRefreshEvents?: () => void | Promise<void>;
}

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/**
 * Aba "Sugestões": a IA cadastra candidatos a eventos de forma autônoma.
 * Todos os níveis hierárquicos podem VER. Apenas o admin aprova/publica.
 */
export default function EventSuggestionsTab({
  currentUser,
  canApprove,
  onShowToast,
  onRefreshEvents,
}: EventSuggestionsTabProps) {
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [providerOptions, setProviderOptions] = useState<
    Array<{ label: string; chave: string; ondeObter: string }>
  >([]);

  const notify = (message: string, type: "error" | "warning" | "success" | "info" = "warning") => {
    if (onShowToast) onShowToast(message, type);
  };

  const load = async () => {
    setLoading(true);
    const { suggestions: lista, error } = await fetchEventSuggestions("pending");
    setSuggestions(lista);
    setErrorMessage(error ? (error.message || "Não foi possível carregar as sugestões.") : null);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRunScout = async () => {
    setRunning(true);
    try {
      const { success, inseridas, message, error, needsApiKey: noKey, availableProviders } =
        await triggerAiEventScout({ count: 5 });

      if (!success) {
        setNeedsApiKey(!!noKey);
        if (availableProviders?.length) setProviderOptions(availableProviders);
        throw new Error(error?.message || "A IA não conseguiu gerar sugestões.");
      }

      setNeedsApiKey(false);
      notify(message || `${inseridas ?? 0} nova(s) sugestão(ões) recebida(s).`, "success");
      await load();
    } catch (err: any) {
      notify(err.message || "Falha ao executar a IA.", "error");
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (s: EventSuggestion) => {
    if (!canApprove) {
      notify("Apenas o administrador chefe pode publicar sugestões.", "warning");
      return;
    }
    setProcessingId(s.id);
    try {
      const { success, error } = await approveEventSuggestion(
        s.id,
        currentUser?.nome || currentUser?.email || "admin"
      );
      if (!success) throw new Error(error?.message || "Falha ao publicar a sugestão.");
      notify(`"${s.title}" publicado no app!`, "success");
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
      if (onRefreshEvents) await onRefreshEvents();
    } catch (err: any) {
      notify(err.message || "Falha ao publicar a sugestão.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (s: EventSuggestion) => {
    if (!canApprove) {
      notify("Apenas o administrador chefe pode descartar sugestões.", "warning");
      return;
    }
    setProcessingId(s.id);
    try {
      const { success, error } = await rejectEventSuggestion(
        s.id,
        currentUser?.nome || currentUser?.email || "admin"
      );
      if (!success) throw new Error(error?.message || "Falha ao descartar a sugestão.");
      notify("Sugestão descartada.", "success");
      setSuggestions((prev) => prev.filter((item) => item.id !== s.id));
    } catch (err: any) {
      notify(err.message || "Falha ao descartar a sugestão.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (s: EventSuggestion) => {
    if (s.day === null || s.month === null || s.year === null) return "Data a confirmar";
    return `${s.day} de ${MESES[s.month] ?? "?"} de ${s.year}${s.time ? ` • ${s.time}` : ""}`;
  };

  const confidenceColor = (c: number | null) => {
    if (c === null) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    if (c >= 0.8) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
    if (c >= 0.5) return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
    return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Cabeçalho */}
      <div className="bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <Sparkles className="text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
            <p className="font-semibold">Sugestões de eventos geradas pela IA</p>
            <p className="text-[11px] opacity-90 mt-0.5">
              A IA pesquisa e propõe eventos escolares de forma autônoma. Nada é publicado sem
              aprovação: revise e clique em <strong>Publicar</strong> para criar o evento no app e no banco.
            </p>
            {!canApprove && (
              <p className="text-[11px] mt-1 font-semibold flex items-center gap-1">
                <ShieldCheck size={11} /> Você pode visualizar. A publicação é feita pelo administrador chefe.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunScout}
            disabled={running}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            <span>{running ? "Pesquisando..." : "Buscar novos eventos"}</span>
          </button>
          <button
            type="button"
            onClick={() => void load()}
            title="Recarregar"
            className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3 rounded-2xl flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {needsApiKey && (
        <div className="bg-white dark:bg-brand-card-dark border border-indigo-200 dark:border-indigo-800/40 rounded-2xl p-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles size={13} className="text-indigo-600 dark:text-indigo-400" />
            Escolha uma IA para ativar as sugestões
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            A aba já está pronta e funcionando. Falta apenas conectar uma IA: qualquer uma das
            opções abaixo serve, basta criar uma chave gratuita e salvá-la nos segredos do
            Supabase (Edge Functions → Secrets). O app detecta sozinho qual está configurada.
          </p>
          <div className="mt-2.5 space-y-1.5">
            {(providerOptions.length > 0
              ? providerOptions
              : [
                  { label: "Google Gemini", chave: "GEMINI_API_KEY", ondeObter: "https://aistudio.google.com/apikey" },
                  { label: "Claude (Anthropic)", chave: "ANTHROPIC_API_KEY", ondeObter: "https://console.anthropic.com/settings/keys" },
                  { label: "ChatGPT (OpenAI)", chave: "OPENAI_API_KEY", ondeObter: "https://platform.openai.com/api-keys" },
                  { label: "OpenRouter", chave: "OPENROUTER_API_KEY", ondeObter: "https://openrouter.ai/keys" },
                  { label: "Groq", chave: "GROQ_API_KEY", ondeObter: "https://console.groq.com/keys" },
                ]
            ).map((op) => (
              <div
                key={op.chave}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-1.5"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">{op.label}</span>
                <code className="text-[10px] text-indigo-700 dark:text-indigo-300">{op.chave}</code>
                <a
                  href={op.ondeObter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <ExternalLink size={10} /> obter chave
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-12 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-200">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">Carregando sugestões da IA...</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-200 text-slate-400">
          <Sparkles size={40} className="mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-semibold">Nenhuma sugestão pendente.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Clique em "Buscar novos eventos" para a IA procurar eventos na região.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((s) => {
            const isExpanded = expandedId === s.id;
            const isProcessing = processingId === s.id;

            return (
              <div
                key={s.id}
                className="bg-white dark:bg-brand-card-dark rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
                      Sugestão da IA
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${confidenceColor(s.aiConfidence)}`}
                      title="Confiança estimada pela IA"
                    >
                      {s.aiConfidence !== null ? `${Math.round(s.aiConfidence * 100)}% confiança` : "Sem score"}
                    </span>
                  </div>

                  <h4 className="text-sm font-serif font-bold text-slate-900 dark:text-white leading-snug">
                    {s.title}
                  </h4>

                  <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400 shrink-0" />
                    <span>{formatDate(s)}</span>
                  </p>

                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin size={12} className="text-slate-400 shrink-0" />
                    <span className="truncate">
                      {s.location || s.address || s.city || "Local a confirmar"}
                    </span>
                  </p>

                  {s.city && (
                    <span className="inline-block mt-2 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {s.city}
                      {s.category ? ` • ${s.category}` : ""}
                    </span>
                  )}

                  {s.description && (
                    <p className={`text-[11px] text-slate-600 dark:text-slate-400 mt-2 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                      {s.description}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="mt-2 space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                      {s.aiReasoning && (
                        <p>
                          <strong className="text-slate-600 dark:text-slate-300">Justificativa da IA:</strong>{" "}
                          {s.aiReasoning}
                        </p>
                      )}
                      {s.sourceName && (
                        <p>
                          <strong className="text-slate-600 dark:text-slate-300">Fonte:</strong> {s.sourceName}
                        </p>
                      )}
                      {s.sourceUrl && (
                        <a
                          href={s.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                        >
                          <ExternalLink size={10} /> {s.sourceUrl}
                        </a>
                      )}
                      {s.requirements && (
                        <p>
                          <strong className="text-slate-600 dark:text-slate-300">Público/requisitos:</strong>{" "}
                          {s.requirements}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    className="mt-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {isExpanded ? "Ver menos" : "Ver detalhes e fonte"}
                  </button>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                  {canApprove ? (
                    <>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleReject(s)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      >
                        <X size={12} />
                        <span>Descartar</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleApprove(s)}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        <span>Publicar</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Trash2 size={11} />
                      Aguardando aprovação do administrador
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
