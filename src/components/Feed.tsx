import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, MapPin, Calendar, CircleDollarSign, PlusCircle, X, GraduationCap, Globe2,
  CalendarPlus, Trash2, Clock, User, Sparkles, ArrowRight,
} from "lucide-react";
import { Event } from "../types";
import { resolveEventCity, classifyEventAsSchool } from "../lib/eventClassification";
import AIChatAssistant from "./AIChatAssistant";
import EventLocationModal from "./EventLocationModal";
import PersonalEventModal from "./PersonalEventModal";
import {
  listarEventosPessoais,
  criarEventoPessoal,
  removerEventoPessoal,
  ordenarEventosPessoais,
  eventoPessoalPassou,
  type PersonalEvent,
  type NovoEventoPessoal,
} from "../lib/personalEventsService.ts";

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
  onOpenMap?: (eventId?: number) => void;
  onUserCoordsChange?: (coords: { lat: number; lng: number }) => void;
  isLoading?: boolean;
  onReload?: () => void;
  /** Avisa o App que um compromisso pessoal foi criado (para o painel). */
  onEventoPessoalCriado?: () => void;
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
  setSearchTerm,
  onOpenMap,
  onUserCoordsChange,
  isLoading,
  onReload,
  onEventoPessoalCriado,
}: FeedProps) {
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState("");
  /** Filtros da aba de eventos: localidade e tipo (escolar / aberto ao público). */
  type CityFilter = "todas" | "Araucária" | "Curitiba";
  type TypeFilter = "todos" | "escolar" | "publico";
  const [cityFilter, setCityFilter] = useState<CityFilter>("todas");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const inputRef = useRef<HTMLInputElement>(null);

  /** Agenda pessoal do usuário conectado. */
  const [eventosPessoais, setEventosPessoais] = useState<PersonalEvent[]>([]);
  const [modalPessoalAberto, setModalPessoalAberto] = useState(false);
  const [mostrarPessoais, setMostrarPessoais] = useState(true);

  /**
   * Carrega os compromissos pessoais de quem está conectado.
   *
   * Não entram em `events` de propósito: são agenda particular e não devem
   * aparecer no mural público, no mapa nem no calendário da escola.
   */
  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      if (!currentUser?.id) {
        setEventosPessoais([]);
        return;
      }
      const lista = await listarEventosPessoais(currentUser.id);
      if (!cancelado) setEventosPessoais(ordenarEventosPessoais(lista));
    };

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [currentUser?.id]);

  /** Salva um compromisso novo. Devolve mensagem de erro, ou null se deu certo. */
  const salvarEventoPessoal = async (
    dados: Omit<NovoEventoPessoal, "ownerId" | "ownerName" | "ownerEmail">
  ): Promise<string | null> => {
    if (!currentUser?.id) {
      return "Entre na sua conta para salvar compromissos na sua agenda.";
    }

    const { evento, erro } = await criarEventoPessoal({
      ...dados,
      ownerId: currentUser.id,
      ownerName: currentUser.nome || currentUser.email || "Usuário",
      ownerEmail: currentUser.email || null,
    });

    if (erro || !evento) return erro || "Não foi possível salvar o compromisso.";

    setEventosPessoais((prev) => ordenarEventosPessoais([evento, ...prev]));
    onEventoPessoalCriado?.();
    return null;
  };

  const apagarEventoPessoal = async (id: number) => {
    await removerEventoPessoal(id, currentUser?.id);
    setEventosPessoais((prev) => prev.filter((e) => e.id !== id));
    onEventoPessoalCriado?.();
  };

  // State for location permission modal on entering event from feed
  const [selectedEventForLocation, setSelectedEventForLocation] = useState<Event | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

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

  const handleCardClick = (event: Event) => {
    // Check if user already has saved location coordinates
    setSelectedEventForLocation(event);
    setShowLocationModal(true);
  };

  const handleAuthorizeLocation = (event: Event, coords?: { lat: number; lng: number }) => {
    if (coords && onUserCoordsChange) {
      onUserCoordsChange(coords);
    }
    setShowLocationModal(false);
    setSelectedEventForLocation(null);
    onSelectEvent(event);
  };

  const handleSkipLocation = (event: Event) => {
    setShowLocationModal(false);
    setSelectedEventForLocation(null);
    onSelectEvent(event);
  };

  /** Cidade efetiva do evento (campo explícito ou inferida do local). */
  const getEventCity = (event: Event) => resolveEventCity({
    city: event.city,
    location: event.location,
    title: event.title,
  });

  /** Escolar vs. aberto ao público, respeitando classificação já gravada. */
  const getEventIsSchool = (event: Event) => classifyEventAsSchool({
    isSchool: event.isSchool,
    category: event.category,
    title: event.title,
    description: event.description,
    schoolName: event.schoolName,
    location: event.location,
  });

  const filteredEvents = events.filter((event) => {
    const term = normalizeString(currentSearchTerm);
    const matchesSearch =
      normalizeString(event.title).includes(term) ||
      normalizeString(event.location).includes(term);
    if (!matchesSearch) return false;

    if (cityFilter !== "todas" && getEventCity(event) !== cityFilter) return false;

    if (typeFilter === "escolar" && !getEventIsSchool(event)) return false;
    if (typeFilter === "publico" && getEventIsSchool(event)) return false;

    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark"
    >
      {/*
        Cabeçalho do Feed.
        ---------------------------------------------------------------
        No celular, o MobileHeader (do App) já mostra "eloEscola / Mural &
        Eventos" e o avatar — e este bloco repetia "Eventos" + avatar do
        perfil logo abaixo, formando duas barras empilhadas.

        Agora existe UMA barra só:
        - mobile: título compacto + lupa + "+" de compromisso pessoal.
          Nada de avatar aqui (ele já está no MobileHeader).
        - desktop: versão completa com título e as mesmas ações.
      */}
      <div className="border-b border-brand-primary/10 bg-brand-bg-light/90 dark:bg-brand-bg-dark/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-display font-semibold tracking-tight text-slate-900 dark:text-white truncate">
              Eventos
            </h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider truncate">
              {currentUser?.nome ? `Olá, ${currentUser.nome.split(" ")[0]}` : "Araucária · Curitiba"}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Lupa: sempre no canto superior, ao lado das ações */}
            <button
              type="button"
              onClick={toggleSearchOpen}
              aria-label={isSearchOpen ? "Fechar busca" : "Pesquisar eventos"}
              aria-expanded={isSearchOpen}
              title={isSearchOpen ? "Fechar busca" : "Pesquisar eventos"}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm ${
                isSearchOpen
                  ? "bg-brand-accent text-white"
                  : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-brand-text-dark border border-brand-primary/15"
              }`}
            >
              {isSearchOpen ? <X size={18} /> : <Search size={18} />}
            </button>

            {/* Adicionar compromisso pessoal */}
            <button
              type="button"
              onClick={() => setModalPessoalAberto(true)}
              aria-label="Adicionar compromisso pessoal"
              title="Adicionar compromisso pessoal"
              className="h-10 px-3 sm:px-3.5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <CalendarPlus size={17} />
              <span className="hidden xs:inline sm:inline">Compromisso</span>
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
            <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-3">
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

      {/* Filtros: localidade e tipo de evento */}
      {/* Filtros: no celular ficam em duas linhas com respiro, em vez de
          espremidos numa faixa só. */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 sm:flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por localidade">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-0.5">Cidade</span>
            {([
              { id: "todas" as const, label: "Todas" },
              { id: "Araucária" as const, label: "Araucária" },
              { id: "Curitiba" as const, label: "Curitiba" },
            ]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCityFilter(opt.id)}
                aria-pressed={cityFilter === opt.id}
                className={`px-3 py-2 sm:py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer active:scale-95 border ${
                  cityFilter === opt.id
                    ? "bg-brand-accent text-white border-brand-accent shadow-sm"
                    : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 border-brand-primary/20 dark:border-white/10 hover:border-brand-accent/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-5 w-px bg-brand-primary/15 dark:bg-white/10" />

          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrar por tipo de evento">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-0.5">Tipo</span>
            {([
              { id: "todos" as const, label: "Todos", icon: null },
              { id: "escolar" as const, label: "Escolar", icon: GraduationCap },
              { id: "publico" as const, label: "Aberto ao público", icon: Globe2 },
            ]).map((opt) => {
              const Icone = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  aria-pressed={typeFilter === opt.id}
                  className={`px-3 py-2 sm:py-1.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer active:scale-95 border flex items-center gap-1.5 ${
                    typeFilter === opt.id
                      ? "bg-brand-accent text-white border-brand-accent shadow-sm"
                      : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 border-brand-primary/20 dark:border-white/10 hover:border-brand-accent/40"
                  }`}
                >
                  {Icone && <Icone size={12} />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {(cityFilter !== "todas" || typeFilter !== "todos") && (
          <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {filteredEvents.length} {filteredEvents.length === 1 ? "evento" : "eventos"}
              {cityFilter !== "todas" ? ` em ${cityFilter}` : ""}
              {typeFilter === "escolar" ? " • escolares" : typeFilter === "publico" ? " • abertos ao público" : ""}
            </span>
            <button
              type="button"
              onClick={() => { setCityFilter("todas"); setTypeFilter("todos"); }}
              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 font-semibold transition-colors cursor-pointer"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/*
        Minha agenda — compromissos pessoais do usuário.
        Fica ANTES dos eventos da escola, porque é o que ele mesmo marcou e
        costuma ser mais urgente. Só aparece para quem está conectado e tem
        algum compromisso.
      */}
      {currentUser?.id && eventosPessoais.length > 0 && (
        <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-5">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <button
              type="button"
              onClick={() => setMostrarPessoais((v) => !v)}
              aria-expanded={mostrarPessoais}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <Sparkles size={13} className="text-emerald-700 dark:text-emerald-400" />
              Minha agenda
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 normal-case tracking-normal">
                {eventosPessoais.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setModalPessoalAberto(true)}
              className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1"
            >
              <PlusCircle size={12} /> Adicionar
            </button>
          </div>

          {mostrarPessoais && (
            <ul className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
              {eventosPessoais.map((pessoal) => {
                const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
                const passou = eventoPessoalPassou(pessoal);

                return (
                  <li
                    key={pessoal.id}
                    className={`snap-start shrink-0 w-[230px] rounded-2xl border p-3 ${
                      passou
                        ? "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 opacity-60"
                        : "bg-white dark:bg-brand-card-dark border-emerald-200 dark:border-emerald-900/50 shadow-xs"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          {pessoal.day} {MESES_CURTOS[pessoal.month]} · {pessoal.year}
                          {pessoal.time ? ` · ${pessoal.time}` : ""}
                        </p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 line-clamp-2">
                          {pessoal.title}
                        </p>
                        {pessoal.location && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin size={9} className="shrink-0" />
                            {pessoal.location}
                          </p>
                        )}
                        {passou && (
                          <p className="text-[9px] font-semibold text-slate-400 mt-1">já passou</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void apagarEventoPessoal(pessoal.id)}
                        aria-label={`Remover ${pessoal.title}`}
                        title="Remover da agenda"
                        className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Events List */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-5 pb-24 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {isLoading && filteredEvents.length === 0 ? (
          // Skeleton loading state
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="relative rounded-3xl overflow-hidden bg-white dark:bg-brand-card-dark shadow-sm border border-brand-primary/15 animate-pulse"
            >
              <div className="w-full h-44 bg-slate-200 dark:bg-slate-700/50" />
              <div className="p-4 flex flex-col gap-3">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-md w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-md w-1/2" />
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded w-16" />
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded w-12" />
                </div>
              </div>
            </div>
          ))
        ) : filteredEvents.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
            <Calendar size={48} className="stroke-1 mb-3 text-slate-300" />
            <p className="text-sm font-medium">Nenhum evento encontrado</p>
            <p className="text-xs text-slate-500 mt-1">Experimente outro termo de busca ou sincronize os dados escolares</p>
            {onReload && (
              <button
                onClick={onReload}
                className="mt-4 px-4 py-2 bg-brand-primary text-slate-800 font-semibold text-xs rounded-xl shadow hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                Atualizar eventos do banco
              </button>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              layoutId={`card-container-${event.id}`}
              onClick={() => handleCardClick(event)}
              className="relative rounded-3xl overflow-hidden bg-white dark:bg-brand-card-dark shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer group border border-brand-primary/15"
            >
              {/* Image banner with Gradient Overlay */}
              <div className="relative w-full h-40 sm:h-44 overflow-hidden">
                <img
                  src={event.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600"}
                  alt={event.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                
                {/* Title Overlay in Banner */}
                <h3 className="absolute bottom-3 left-3.5 right-3.5 text-white font-display font-semibold text-base sm:text-lg leading-tight drop-shadow-md line-clamp-2">
                  {event.title}
                </h3>

                {/* Badges: localidade + tipo escolar */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                  {getEventCity(event) && (
                    <span className="bg-white/95 dark:bg-black/70 backdrop-blur-sm text-slate-800 dark:text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                      <MapPin size={10} className="text-red-500" />
                      {getEventCity(event)}
                    </span>
                  )}
                  <span
                    className={`backdrop-blur-sm text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm ${
                      getEventIsSchool(event)
                        ? "bg-brand-accent/95 text-white"
                        : "bg-white/95 dark:bg-black/70 text-slate-800 dark:text-white"
                    }`}
                  >
                    {getEventIsSchool(event) ? <GraduationCap size={10} /> : <Globe2 size={10} />}
                    {getEventIsSchool(event) ? "Escolar" : "Público"}
                  </span>
                </div>

                {/* Price indicator badge */}
                {event.isPaid && (
                  <span className="absolute top-3 right-3 bg-yellow-400 text-slate-900 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow">
                    <CircleDollarSign size={12} />
                    {event.price || "Pago"}
                  </span>
                )}
              </div>

              {/* Feed Meta Info */}
              <div className="p-3.5 sm:p-4 flex flex-col gap-2 bg-white dark:bg-brand-card-dark">
                <div 
                  onClick={(e) => {
                    if (onOpenMap) {
                      e.stopPropagation();
                      onOpenMap(event.id);
                    }
                  }}
                  className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 hover:text-brand-accent transition-colors"
                  title="Ver localização no mapa"
                >
                  <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="line-clamp-1 underline-offset-2 hover:underline">{event.location}</span>
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

      {/* Location Permission Modal when entering an event from the Feed (Tela Inicial) */}
      <EventLocationModal
        isOpen={showLocationModal}
        event={selectedEventForLocation}
        onClose={() => {
          setShowLocationModal(false);
          setSelectedEventForLocation(null);
        }}
        onAuthorize={handleAuthorizeLocation}
        onSkip={handleSkipLocation}
      />

      {/* Formulário de compromisso pessoal (bottom sheet no celular) */}
      <PersonalEventModal
        isOpen={modalPessoalAberto}
        onClose={() => setModalPessoalAberto(false)}
        onSalvar={salvarEventoPessoal}
        nomeUsuario={currentUser?.nome}
      />

      <AIChatAssistant />
    </motion.div>
  );
}
