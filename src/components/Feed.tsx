import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, MapPin, Calendar, CircleDollarSign, PlusCircle, X } from "lucide-react";
import { Event } from "../types";
import AIChatAssistant from "./AIChatAssistant";

interface FeedProps {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  onNavigate: (screen: string) => void;
  isAdmin: boolean;
  currentUser?: any;
  searchOpen?: boolean;
  setSearchOpen?: (open: boolean) => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
}

const normalizeString = (str: string) => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

export default function Feed({
  events,
  onSelectEvent,
  onNavigate,
  isAdmin,
  currentUser,
  searchOpen,
  setSearchOpen,
  searchTerm,
  setSearchTerm
}: FeedProps) {
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearchOpen = searchOpen !== undefined ? searchOpen : localSearchOpen;
  const currentSearchTerm = searchTerm !== undefined ? searchTerm : localSearchTerm;

  const toggleSearchOpen = () => {
    const nextState = !isSearchOpen;
    if (setSearchOpen) {
      setSearchOpen(nextState);
    } else {
      setLocalSearchOpen(nextState);
    }
    if (!nextState) {
      if (setSearchTerm) setSearchTerm("");
      else setLocalSearchTerm("");
    }
  };

  const changeSearchTerm = (val: string) => {
    if (setSearchTerm) {
      setSearchTerm(val);
    } else {
      setLocalSearchTerm(val);
    }
  };

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const filteredEvents = events.filter((event) => {
    const term = normalizeString(currentSearchTerm);
    return (
      normalizeString(event.title).includes(term) ||
      normalizeString(event.location).includes(term)
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10 bg-brand-bg-light/80 dark:bg-brand-bg-dark/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto w-full flex justify-between items-center p-6">
          <div>
            <h1 className="text-2xl font-display font-medium tracking-tight">Eventos</h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              Escola estadual Helena Wysocki
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSearchOpen}
              className={`p-2.5 rounded-full hover:scale-105 active:scale-95 transition-all shadow-sm ${
                isSearchOpen
                  ? "bg-brand-accent text-white"
                  : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-brand-text-dark"
              }`}
              title="Pesquisar eventos"
            >
              <Search size={18} />
            </button>
            
            <button
              onClick={() => onNavigate("calendar")}
              className="p-2.5 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary hover:scale-105 active:scale-95 transition-all"
              title="Adicionar evento"
            >
              <PlusCircle size={18} />
            </button>
 
            {/* Profile link for mobile settings */}
            <button
              onClick={() => onNavigate("settings")}
              className="md:hidden flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-brand-card-dark border border-brand-primary/15 hover:scale-105 active:scale-95 transition-all shadow-sm overflow-hidden"
              title="Configurações"
            >
              {currentUser?.foto_perfil ? (
                <img
                  src={currentUser.foto_perfil}
                  alt={currentUser.nome || "Perfil"}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 uppercase">
                  {(currentUser?.nome || currentUser?.email || "U").substring(0, 2)}
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
 
      {/* Search Input block */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-50 dark:bg-brand-card-dark/30 border-b border-brand-primary/10 overflow-hidden"
          >
            <div className="max-w-6xl mx-auto w-full px-6 py-3">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-4 text-slate-400 dark:text-slate-500" size={18} />
                <input
                  ref={inputRef}
                  type="text"
                  value={currentSearchTerm}
                  onChange={(e) => changeSearchTerm(e.target.value)}
                  placeholder="Pesquisar por título ou local..."
                  className="w-full h-11 pl-11 pr-11 text-sm bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/50 text-brand-text-light dark:text-brand-text-dark"
                />
                {currentSearchTerm && (
                  <button
                    onClick={() => changeSearchTerm("")}
                    className="absolute right-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                    title="Limpar pesquisa"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Events List */}
      <div className="max-w-6xl mx-auto w-full p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredEvents.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <Calendar size={48} className="stroke-1 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Nenhum evento encontrado</p>
            <p className="text-xs text-slate-500 mt-1">Experimente outro termo de busca ou remova os filtros</p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              layoutId={`card-container-${event.id}`}
              onClick={() => onSelectEvent(event)}
              className="relative rounded-3xl overflow-hidden bg-white dark:bg-brand-card-dark shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer group border border-brand-primary/15"
            >
              {/* Image banner with Gradient Overlay */}
              <div className="relative w-full h-44 overflow-hidden">
                <img
                  src={event.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"}
                  alt={event.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                
                {/* Title Overlay in Banner */}
                <h3 className="absolute bottom-4 left-4 right-4 text-white font-display font-semibold text-lg leading-tight drop-shadow-md">
                  {event.title}
                </h3>

                {/* Price indicator badge */}
                {event.isPaid && (
                  <span className="absolute top-4 right-4 bg-yellow-400 text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow">
                    <CircleDollarSign size={12} />
                    {event.price || "Pago"}
                  </span>
                )}
              </div>

              {/* Feed Meta Info */}
              <div className="p-4 flex flex-col gap-2 bg-white dark:bg-brand-card-dark">
                <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin size={14} className="text-brand-accent dark:text-brand-primary shrink-0 mt-0.5" />
                  <span className="line-clamp-1">{event.location}</span>
                </div>
                
                <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {event.day}/{event.month + 1}/{event.year}
                  </span>
                  <span>{event.time}</span>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
      <AIChatAssistant />
    </motion.div>
  );
}
