import { motion } from "motion/react";
import { ArrowLeft, MapPin, Calendar, Clock, CircleDollarSign, CheckSquare, Globe, Trash2 } from "lucide-react";
import { Event, User } from "../types";

interface EventDetailProps {
  event: Event;
  currentUser: User | null;
  onNavigateBack: () => void;
  onDeleteEvent: (id: number) => Promise<void>;
  isDeleting: boolean;
}

export default function EventDetail({
  event,
  currentUser,
  onNavigateBack,
  onDeleteEvent,
  isDeleting,
}: EventDetailProps) {
  
  const handleEnroll = () => {
    if (event.website) {
      window.open(event.website, "_blank", "noopener,noreferrer");
    } else {
      alert(`Parabéns! Sua vaga para o evento "${event.title}" foi reservada com sucesso! Um comprovante foi encaminhado para seu email escolar.`);
    }
  };

  const parseRequirements = (reqStr: string | null | undefined): string[] => {
    if (!reqStr) return ["Nenhum requisito ou comprovante obrigatório declarado."];
    return reqStr.split(",").map((s) => s.trim()).filter(Boolean);
  };

  const canDelete = currentUser?.isAdmin || (currentUser && event.creatorId === currentUser.id);

  const monthsList = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark"
    >
      {/* Visual Banner */}
      <div className="relative w-full h-56 overflow-hidden">
        <img
          src={event.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"}
          alt={event.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />
        
        {/* Floating Back Trigger */}
        <button
          onClick={onNavigateBack}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/70 active:scale-95 transition-all cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>

        {canDelete && (
          <button
            onClick={() => {
              if (confirm(`Tem certeza de que deseja deletar permanentemente o evento pedagógico "${event.title}"?`)) {
                onDeleteEvent(event.id);
              }
            }}
            disabled={isDeleting}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-red-600/90 text-white flex items-center justify-center backdrop-blur-md hover:bg-red-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            title="Deletar este evento da agenda"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>

      {/* Main Informational Description */}
      <div className="max-w-4xl mx-auto w-full p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-display font-bold leading-tight uppercase text-brand-accent dark:text-brand-primary">
            {event.title}
          </h2>
          <p className="text-[10px] text-slate-400 font-mono tracking-wide uppercase mt-1">
            Reunião Escolar Oficial
          </p>
        </div>

        {/* Informational Cards */}
        <div className="bg-white dark:bg-brand-card-dark rounded-3xl p-4 flex flex-col gap-3 border border-brand-primary/10 shadow-xs">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Localização</span>
              {event.location}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Data oficial</span>
              {event.day} de {monthsList[event.month]} de {event.year}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock size={18} className="text-brand-accent shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Horário</span>
              {event.time}
            </div>
          </div>

          {event.isPaid && (
            <div className="flex items-start gap-3">
              <CircleDollarSign size={18} className="text-yellow-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-400 block uppercase tracking-wide text-[9px] mb-0.5">Taxa de Adesão</span>
                {event.price || "Pago"}
              </div>
            </div>
          )}
        </div>

        {/* Requirements checklists */}
        <div>
          <h3 className="font-display font-semibold text-sm tracking-tight text-slate-500 mb-3 flex items-center gap-2">
            <CheckSquare size={16} className="text-brand-accent" />
            Requisitos e Instruções:
          </h3>
          <ul className="flex flex-col gap-2">
            {parseRequirements(event.requirements).map((req, idx) => (
              <li
                key={idx}
                className="text-xs bg-brand-primary/10 dark:bg-brand-card-dark/30 rounded-xl px-3 py-2 border border-brand-primary/10 flex items-center gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-brand-accent" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Confirm subscription */}
        <button
          onClick={handleEnroll}
          className="w-full h-13 mt-4 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
        >
          <Globe size={18} />
          {event.website ? "Inscrever-se no Website Externo" : "Inscrever-se Agora"}
        </button>
      </div>
    </motion.div>
  );
}
