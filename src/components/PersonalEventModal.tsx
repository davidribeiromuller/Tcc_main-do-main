import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, CalendarDays, Clock, MapPin, StickyNote, Bell, AlertCircle, Loader2 } from "lucide-react";
import type { NovoEventoPessoal } from "../lib/personalEventsService.ts";

interface PersonalEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Salva o compromisso. Deve devolver erro em string para exibir aqui. */
  onSalvar: (dados: Omit<NovoEventoPessoal, "ownerId" | "ownerName" | "ownerEmail">) => Promise<string | null>;
  /** Nome do dono, para o cabeçalho. */
  nomeUsuario?: string;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const CATEGORIAS = ["Pessoal", "Estudo", "Prova", "Trabalho", "Família", "Saúde", "Outro"];

/**
 * Formulário de compromisso pessoal.
 *
 * ## Por que não reutilizei o formulário do AdminPanel
 *
 * Aquele é para eventos **da escola**: exige categoria do catálogo, endereço
 * geocodificado, imagem, e passa pelo fluxo de aprovação. Um compromisso
 * pessoal é outra coisa — tem que ser rápido (3 campos obrigatórios), caber na
 * tela do celular e não pedir nada que o usuário não tenha à mão.
 *
 * ## Mobile
 *
 * Bottom sheet no celular (sobe do rodapé, ocupa a largura toda) e diálogo
 * centralizado no desktop. Campos com 16px de fonte para o iOS não dar zoom, e
 * o botão de salvar fica ao alcance do polegar.
 */
export default function PersonalEventModal({
  isOpen,
  onClose,
  onSalvar,
  nomeUsuario,
}: PersonalEventModalProps) {
  const hoje = new Date();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [dia, setDia] = useState(hoje.getDate());
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [hora, setHora] = useState("08:00");
  const [categoria, setCategoria] = useState("Pessoal");
  const [lembrete, setLembrete] = useState(false);
  const [notas, setNotas] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const limpar = () => {
    setTitulo("");
    setDescricao("");
    setLocal("");
    setDia(hoje.getDate());
    setMes(hoje.getMonth());
    setAno(hoje.getFullYear());
    setHora("08:00");
    setCategoria("Pessoal");
    setLembrete(false);
    setNotas("");
    setErro(null);
  };

  const handleSalvar = async () => {
    setErro(null);

    if (!titulo.trim()) {
      setErro("Dê um nome ao compromisso.");
      return;
    }

    setSalvando(true);
    try {
      const mensagem = await onSalvar({
        title: titulo,
        description: descricao,
        location: local,
        day: Number(dia),
        month: Number(mes),
        year: Number(ano),
        time: hora,
        category: categoria,
        reminder: lembrete,
        notes: notas,
      });

      if (mensagem) {
        setErro(mensagem);
        return;
      }

      limpar();
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  const campo =
    "w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-black/25 border border-slate-200 dark:border-white/10 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "tween", duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-evento-pessoal"
            className="relative w-full sm:max-w-lg bg-white dark:bg-brand-card-dark rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 max-h-[92dvh] flex flex-col"
          >
            {/* Alça do bottom sheet (só no mobile, indica que é arrastável/fechável) */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-2 sm:pt-5 pb-3 border-b border-slate-100 dark:border-white/10 shrink-0">
              <div className="min-w-0">
                <h2
                  id="titulo-evento-pessoal"
                  className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
                >
                  <CalendarDays size={18} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                  Novo compromisso
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  Vai para a sua agenda pessoal{nomeUsuario ? `, ${nomeUsuario.split(" ")[0]}` : ""}.
                  Não aparece no mural público.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo rolável */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              <div>
                <label htmlFor="pe-titulo" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  O que é? <span className="text-red-500">*</span>
                </label>
                <input
                  id="pe-titulo"
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex.: Prova de matemática"
                  autoComplete="off"
                  className={campo}
                />
              </div>

              {/* Data e hora: no mobile ficam lado a lado com largura mínima
                  confortável; em telas muito estreitas, empilham. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pe-dia" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Dia
                  </label>
                  <input
                    id="pe-dia"
                    type="number"
                    min={1}
                    max={31}
                    value={dia}
                    onChange={(e) => setDia(Number(e.target.value))}
                    className={campo}
                  />
                </div>
                <div>
                  <label htmlFor="pe-ano" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Ano
                  </label>
                  <input
                    id="pe-ano"
                    type="number"
                    min={hoje.getFullYear()}
                    max={hoje.getFullYear() + 5}
                    value={ano}
                    onChange={(e) => setAno(Number(e.target.value))}
                    className={campo}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pe-mes" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Mês
                  </label>
                  <select
                    id="pe-mes"
                    value={mes}
                    onChange={(e) => setMes(Number(e.target.value))}
                    className={campo}
                  >
                    {MESES.map((nome, indice) => (
                      <option key={nome} value={indice}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pe-hora" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Horário
                  </label>
                  <input
                    id="pe-hora"
                    type="time"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className={campo}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pe-local" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin size={12} className="text-slate-400" /> Onde (opcional)
                </label>
                <input
                  id="pe-local"
                  type="text"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  placeholder="Ex.: Sala 12, em casa, no clube"
                  className={campo}
                />
              </div>

              <div>
                <label htmlFor="pe-categoria" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tipo
                </label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo do compromisso">
                  {CATEGORIAS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoria(cat)}
                      aria-pressed={categoria === cat}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer active:scale-95 ${
                        categoria === cat
                          ? "bg-emerald-700 text-white border-emerald-700"
                          : "bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="pe-descricao" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Detalhes (opcional)
                </label>
                <textarea
                  id="pe-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  placeholder="O que levar, com quem falar..."
                  className={`${campo} resize-none`}
                />
              </div>

              <div>
                <label htmlFor="pe-notas" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <StickyNote size={12} className="text-slate-400" /> Anotações (opcional)
                </label>
                <textarea
                  id="pe-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Lembretes para você mesmo"
                  className={`${campo} resize-none`}
                />
              </div>

              <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lembrete}
                  onChange={(e) => setLembrete(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700 cursor-pointer"
                />
                <span className="text-xs font-medium text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Bell size={12} /> Marcar como lembrete importante
                </span>
              </label>

              {erro && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{erro}</span>
                </div>
              )}
            </div>

            {/* Rodapé fixo: o botão de salvar não pode sair da tela ao rolar */}
            <div className="px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-white/10 flex items-center gap-2 shrink-0 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:pb-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSalvar()}
                disabled={salvando || !titulo.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
              >
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Clock size={15} />}
                {salvando ? "Salvando..." : "Salvar na minha agenda"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
