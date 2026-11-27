import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, MapPin, Calendar, PlusCircle, X, GraduationCap, Globe2,
  CalendarPlus, Trash2, Clock, User, Sparkles, ArrowRight, ArrowLeft,
} from "lucide-react";
import { Event } from "../types";
import { resolveEventCity, classifyEventAsSchool } from "../lib/eventClassification";
import AIChatAssistant from "./AIChatAssistant";
import EventCardMural from "./EventCardMural.tsx";
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

/**
 * Grupo de filtros com rótulo.
 *
 * O rótulo fica em maiúsculas pequenas, alinhado com os chips — antes ele
 * ficava numa linha própria no celular, gastando altura à toa.
 */
function FiltroGrupo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={`Filtrar por ${rotulo.toLowerCase()}`}>
      <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mr-0.5">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

/** Chip de filtro. Alvo de toque confortável (32px) e estado bem marcado. */
function ChipFiltro({
  ativo,
  onClick,
  label,
  icone,
}: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  icone?: React.ReactNode;
  /** Aceito explicitamente para o TypeScript não reclamar do `key` do map. */
  key?: React.Key;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer active:scale-95 ${
        ativo
          ? "bg-emerald-800 text-white border-emerald-800 dark:bg-emerald-700 dark:border-emerald-700"
          : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-emerald-400/60"
      }`}
    >
      {icone}
      {label}
    </button>
  );
}

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
      className="flex flex-col w-full pb-bottom-nav touch-scroll text-brand-text-light dark:text-brand-text-dark"
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
      <div className="sticky top-0 z-30 bg-brand-bg-light/95 dark:bg-brand-bg-dark/95 backdrop-blur-md border-b border-brand-primary/10">
        {/* Barra principal: título + ações */}
        <div className="w-[88%] max-w-[1600px] mx-auto flex items-start justify-between gap-2 px-0.5 sm:px-1 pt-3.5 pb-2.5 sm:pt-4 sm:pb-3">
          <div className="min-w-0 flex-1 flex items-start gap-2">
            {/*
              Seta de voltar ao dashboard. Só no celular: no desktop o
              `DesktopNavbar` já está sempre visível com a navegação. No mobile
              a barra superior não tem link de volta, e sem esta seta o usuário
              ficava preso na aba de eventos (o único caminho era o botão
              "voltar" do navegador).
            */}
            <button
              type="button"
              onClick={() => onNavigate("feed")}
              aria-label="Voltar ao dashboard"
              className="sm:hidden mt-0.5 p-2 -ml-1 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 active:scale-95 transition cursor-pointer shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
            <h1 className="text-[1.35rem] sm:text-[1.7rem] font-display font-semibold tracking-tight text-slate-900 dark:text-white leading-tight">
              Eventos
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-[0.14em] mt-1 truncate">
              {filteredEvents.length === 0
                ? "Araucária · Curitiba"
                : `${filteredEvents.length} ${filteredEvents.length === 1 ? "evento" : "eventos"}${
                    cityFilter !== "todas" ? ` · ${cityFilter}` : ""
                  }`}
            </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleSearchOpen}
              aria-label={isSearchOpen ? "Fechar busca" : "Pesquisar eventos"}
              aria-expanded={isSearchOpen}
              title={isSearchOpen ? "Fechar busca" : "Pesquisar eventos"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors active:scale-95 cursor-pointer ${
                isSearchOpen
                  ? "bg-brand-accent text-white"
                  : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-white border border-brand-primary/20 dark:border-white/10"
              }`}
            >
              {isSearchOpen ? <X size={17} /> : <Search size={17} />}
            </button>

            <button
              type="button"
              onClick={() => setModalPessoalAberto(true)}
              aria-label="Adicionar compromisso pessoal"
              title="Adicionar compromisso pessoal"
              className="h-10 w-10 sm:w-auto sm:px-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center justify-center sm:justify-start gap-1.5 transition-colors active:scale-95 cursor-pointer shrink-0"
            >
              <CalendarPlus size={16} />
              <span className="hidden sm:inline">Compromisso</span>
            </button>
          </div>
        </div>

        {/* Filtros: faixa própria, com rolagem horizontal no celular em vez de
            quebrar em várias linhas e empurrar o conteúdo para baixo. */}
        <div className="w-[88%] max-w-[1600px] mx-auto px-0.5 sm:px-1 pb-2.5">
          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar scroll-x-snap -mx-4 px-4 sm:-mx-1 sm:px-1 py-0.5">
            <FiltroGrupo rotulo="Cidade">
              {([
                { id: "todas" as const, label: "Todas" },
                { id: "Araucária" as const, label: "Araucária" },
                { id: "Curitiba" as const, label: "Curitiba" },
              ]).map((opt) => (
                <ChipFiltro
                  key={opt.id}
                  ativo={cityFilter === opt.id}
                  onClick={() => setCityFilter(opt.id)}
                  label={opt.label}
                />
              ))}
            </FiltroGrupo>

            <span className="w-px h-5 bg-brand-primary/20 dark:bg-white/10 shrink-0" aria-hidden="true" />

            <FiltroGrupo rotulo="Tipo">
              {([
                { id: "todos" as const, label: "Todos", icone: null },
                { id: "escolar" as const, label: "Escolar", icone: GraduationCap },
                { id: "publico" as const, label: "Aberto", icone: Globe2 },
              ]).map((opt) => {
                const Icone = opt.icone;
                return (
                  <ChipFiltro
                    key={opt.id}
                    ativo={typeFilter === opt.id}
                    onClick={() => setTypeFilter(opt.id)}
                    label={opt.label}
                    icone={Icone ? <Icone size={12} /> : undefined}
                  />
                );
              })}
            </FiltroGrupo>

            {(cityFilter !== "todas" || typeFilter !== "todos") && (
              <button
                type="button"
                onClick={() => {
                  setCityFilter("todas");
                  setTypeFilter("todos");
                }}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-white dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={11} /> Limpar
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Campo de busca: aparece logo abaixo da barra, ocupando a largura toda */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white/60 dark:bg-white/[0.03] border-b border-brand-primary/10"
          >
            <div className="w-[88%] max-w-[1600px] mx-auto px-0.5 sm:px-1 py-3">
              <div className="relative flex items-center w-full max-w-xl">
                <Search className="absolute left-3.5 text-slate-400 dark:text-slate-500" size={16} />
                <input
                  ref={inputRef}
                  type="search"
                  value={currentSearchTerm}
                  onChange={(e) => changeSearchTerm(e.target.value)}
                  placeholder="Pesquisar por título ou local..."
                  aria-label="Pesquisar eventos"
                  className="w-full h-11 pl-10 pr-10 text-sm bg-white dark:bg-brand-card-dark border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                {currentSearchTerm && (
                  <button
                    type="button"
                    onClick={() => changeSearchTerm("")}
                    className="absolute right-2.5 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    title="Limpar pesquisa"
                    aria-label="Limpar pesquisa"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Minha agenda — compromissos pessoais do usuário.
        Fica acima do mural porque é o que ele mesmo marcou e costuma ser mais
        urgente. Só aparece para quem está conectado e tem algum compromisso.
      */}
      {currentUser?.id && eventosPessoais.length > 0 && (
        <section className="w-[88%] max-w-[1600px] mx-auto px-0.5 sm:px-1 pt-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMostrarPessoais((v) => !v)}
              aria-expanded={mostrarPessoais}
              className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <Sparkles size={12} className="text-emerald-700 dark:text-emerald-400" />
              Minha agenda
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 tracking-normal">
                {eventosPessoais.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setModalPessoalAberto(true)}
              className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1"
            >
              <PlusCircle size={11} /> Adicionar
            </button>
          </div>

          {mostrarPessoais && (
            <ul className="flex gap-3 overflow-x-auto no-scrollbar scroll-x-snap pb-1.5 -mx-4 px-4 sm:-mx-1 sm:px-1">
              {eventosPessoais.map((pessoal) => {
                const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
                const passou = eventoPessoalPassou(pessoal);

                return (
                  <li
                    key={pessoal.id}
                    className={`snap-start shrink-0 w-[230px] rounded-xl border p-3 ${
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

      {/*
        Grade do mural (rodada 31) — dimensionamento da referência.
        ----------------------------------------------------------------
        - Contêiner: **88% da largura** com teto de **1600 px**. Em 1850 px de
          tela a área útil fica ~1600 px — ocupa a tela sem ficar colado nas
          bordas (ajuste de 2026-11-24: o card de ~330 px ficou grande demais).
        - **5 cards** a partir de 1440 px (`mural:`), 4 no desktop
          intermediário, 2 no tablet e 1 no celular. Com 1600 px úteis e 4 gaps
          de 20 px, cada card fica com ~304 px — proporção mais harmoniosa.

          O breakpoint é nomeado (`--breakpoint-mural: 90rem` em index.css) e
          não um breakpoint arbitrário solto: o valor avulso saía numa media query
          FORA da escada sm/md/lg/xl e, conforme a ordem no CSS final, a regra
          de 4 colunas vencia a de 5 — o mural nunca chegava a 5 por linha.
        - `items-stretch`: todos os cards da linha com a mesma altura.
      */}
      <div className="w-[88%] max-w-[1600px] mx-auto pt-4 pb-bottom-nav grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mural:grid-cols-5 gap-4 sm:gap-5 items-stretch">
        {isLoading && filteredEvents.length === 0 ? (
          // Skeleton loading state
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="relative rounded-3xl overflow-hidden bg-white dark:bg-brand-card-dark shadow-sm border border-brand-primary/15 animate-pulse"
            >
              <div className="w-full h-40 sm:h-44 bg-slate-200 dark:bg-slate-700/50" />
              <div className="p-3.5 sm:p-4 flex flex-col gap-3">
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
          <div className="col-span-full flex flex-col items-center justify-center py-14 px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3.5">
              <Calendar size={26} className="stroke-[1.5] text-slate-400 dark:text-slate-500" />
            </div>

            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {events.length === 0 ? "Nenhum evento na agenda ainda" : "Nada com esses filtros"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
              {events.length === 0
                ? "Assim que a escola publicar novos eventos, eles aparecem aqui. Você também pode criar um compromisso pessoal na sua agenda."
                : "Tente remover um filtro ou buscar por outro termo."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {(cityFilter !== "todas" || typeFilter !== "todos") && (
                <button
                  type="button"
                  onClick={() => {
                    setCityFilter("todas");
                    setTypeFilter("todos");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition-colors active:scale-95 cursor-pointer"
                >
                  Limpar filtros
                </button>
              )}
              {currentSearchTerm && (
                <button
                  type="button"
                  onClick={() => changeSearchTerm("")}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-brand-card-dark border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors active:scale-95 cursor-pointer"
                >
                  Limpar busca
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalPessoalAberto(true)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-brand-card-dark border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
              >
                <CalendarPlus size={13} /> Criar compromisso
              </button>
              {onReload && (
                <button
                  type="button"
                  onClick={onReload}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Atualizar
                </button>
              )}
            </div>
          </div>
        ) : (
          filteredEvents.map((event) => (
            /*
              Rodada 27: o mural do aluno usa o MESMO card do painel
              (`EventCardMural`) — card escuro no modo escuro, claro no modo
              claro. Antes eram dois desenhos diferentes que divergiam.
            */
            <EventCardMural
              key={event.id}
              event={event}
              onOpen={() => handleCardClick(event)}
              onAbrirMapa={onOpenMap ? () => onOpenMap(event.id) : undefined}
              rotuloVer="Ver evento"
              layoutFaixa="duplo"
            />
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
