import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Clock,
  X,
  CalendarDays,
  Calendar as CalendarIcon,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Filter,
  Bell,
  Image as ImageIcon,
  Upload,
  Trash2
} from "lucide-react";
import { Event } from "../types";
import EventNotificationModal, { NotificationSchedule } from "./EventNotificationModal";

interface CalendarViewProps {
  events: Event[];
  onAddEvent: (eventData: any) => Promise<void>;
  onSelectEvent: (event: Event) => void;
  userRole?: string;
  currentUser?: any;
  onNavigate?: (screen: string) => void;
}

const MONTHS_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const WEEKDAYS_NAMES = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"
];

export default function CalendarView({
  events,
  onAddEvent,
  onSelectEvent,
  currentUser,
  onNavigate,
}: CalendarViewProps) {
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth(); // 0-11
  const todayYear = today.getFullYear();

  const [currentMonth, setCurrentMonth] = useState<number>(todayMonth);
  const [currentYear, setCurrentYear] = useState<number>(todayYear);
  const [selectedDay, setSelectedDay] = useState<number>(todayDay);
  const [filterType, setFilterType] = useState<"all" | "free" | "paid">("all");

  // Notification Modal State
  const [notificationEvent, setNotificationEvent] = useState<Event | null>(null);
  const [showNotificationModal, setShowNotificationModal] = useState<boolean>(false);
  const [notificationSuccessMsg, setNotificationSuccessMsg] = useState<string | null>(null);

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [evtTitle, setEvtTitle] = useState("");
  const [evtLocation, setEvtLocation] = useState("");
  const [evtDay, setEvtDay] = useState(todayDay.toString());
  const [evtMonth, setEvtMonth] = useState(todayMonth);
  const [evtYear, setEvtYear] = useState(todayYear);
  const [evtTime, setEvtTime] = useState("14:00");
  const [evtIsPaid, setEvtIsPaid] = useState(false);
  const [evtPrice, setEvtPrice] = useState("");
  const [evtRequirements, setEvtRequirements] = useState("");
  const [evtImage, setEvtImage] = useState("");
  const [formError, setFormError] = useState("");

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const rawFirstDay = new Date(currentYear, currentMonth, 1).getDay();
  // Adjust Monday as first day of week (0 = Monday, 6 = Sunday)
  const firstDayOffset = rawFirstDay === 0 ? 6 : rawFirstDay - 1;

  const handleJumpToToday = () => {
    setCurrentMonth(todayMonth);
    setCurrentYear(todayYear);
    setSelectedDay(todayDay);
  };

  const previousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const checkIsToday = (d: number, m: number, y: number) => {
    return d === todayDay && m === todayMonth && y === todayYear;
  };

  // Intercept click on event from Calendar tab to request notifications permission every time
  const handleEventClick = (event: Event) => {
    setNotificationEvent(event);
    setShowNotificationModal(true);
  };

  const handleConfirmNotification = (event: Event, schedule: NotificationSchedule) => {
    try {
      localStorage.setItem(
        `event_notifications_${event.id}`,
        JSON.stringify({
          eventId: event.id,
          eventTitle: event.title,
          schedule,
          savedAt: new Date().toISOString(),
        })
      );
    } catch (e) {
      console.warn("Error saving notification schedule to localStorage:", e);
    }

    setShowNotificationModal(false);
    setNotificationEvent(null);
    onSelectEvent(event);
  };

  const handleSkipNotification = (event: Event) => {
    setShowNotificationModal(false);
    setNotificationEvent(null);
    onSelectEvent(event);
  };

  // Filtered events
  const filteredEvents = events.filter((e) => {
    if (filterType === "free") return !e.isPaid;
    if (filterType === "paid") return e.isPaid;
    return true;
  });

  const monthEvents = filteredEvents.filter(
    (e) => e.month === currentMonth && e.year === currentYear
  );

  const dayEvents = filteredEvents.filter(
    (e) => e.day === selectedDay && e.month === currentMonth && e.year === currentYear
  );

  const selectedDateObject = new Date(currentYear, currentMonth, selectedDay);
  const selectedWeekdayName = WEEKDAYS_NAMES[selectedDateObject.getDay()];
  const isSelectedDateToday = checkIsToday(selectedDay, currentMonth, currentYear);

  const openAddEventForSelectedDay = () => {
    setEvtDay(selectedDay.toString());
    setEvtMonth(currentMonth);
    setEvtYear(currentYear);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!evtTitle.trim()) {
      setFormError("Por favor, preencha o título do evento escolar.");
      return;
    }
    if (!evtLocation.trim()) {
      setFormError("Por favor, preencha o local do evento.");
      return;
    }
    const dayNum = parseInt(evtDay);
    if (!dayNum || dayNum < 1 || dayNum > 31) {
      setFormError("Por favor, informe um dia do mês válido (entre 1 e 31).");
      return;
    }
    if (evtIsPaid && !evtPrice.trim()) {
      setFormError("Por favor, especifique o valor/preço da inscrição do evento.");
      return;
    }

    try {
      await onAddEvent({
        title: evtTitle.trim(),
        location: evtLocation.trim(),
        day: dayNum,
        month: evtMonth,
        year: evtYear,
        time: evtTime.trim() || "14:00",
        isPaid: evtIsPaid,
        price: evtIsPaid ? evtPrice.trim() : "",
        requirements: evtRequirements.trim(),
        image: evtImage.trim() || undefined,
      });

      // Reset Form
      setEvtTitle("");
      setEvtLocation("");
      setEvtDay(todayDay.toString());
      setEvtTime("14:00");
      setEvtIsPaid(false);
      setEvtPrice("");
      setEvtRequirements("");
      setEvtImage("");
      setFormError("");

      setCurrentMonth(evtMonth);
      setCurrentYear(evtYear);
      setSelectedDay(dayNum);
      setFormOpen(false);
    } catch {
      setFormError("Não foi possível cadastrar o evento. Verifique suas permissões.");
    }
  };

  const yearsRange = [];
  for (let y = 2020; y <= 2035; y++) {
    yearsRange.push(y);
  }

  // Calendar cells matrix
  const cells = [];
  const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthDaysCount = new Date(prevMonthYear, prevMonthIndex + 1, 0).getDate();

  for (let i = 0; i < firstDayOffset; i++) {
    const d = prevMonthDaysCount - firstDayOffset + i + 1;
    cells.push({
      day: d,
      month: prevMonthIndex,
      year: prevMonthYear,
      isCurrentMonth: false,
    });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      month: currentMonth,
      year: currentYear,
      isCurrentMonth: true,
    });
  }

  const nextMonthIndex = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  const totalCells = Math.ceil(cells.length / 7) * 7;
  const remainingCells = totalCells - cells.length;

  for (let i = 1; i <= remainingCells; i++) {
    cells.push({
      day: i,
      month: nextMonthIndex,
      year: nextMonthYear,
      isCurrentMonth: false,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark"
    >
      {/* Top Header */}
      <div className="border-b border-brand-primary/10 bg-white/70 dark:bg-brand-card-dark/60 backdrop-blur-md sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto w-full flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-brand-primary/15 text-brand-primary dark:text-emerald-400 flex items-center justify-center">
              <CalendarIcon size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-slate-800 dark:text-slate-100">
                  Calendário de Eventos
                </h1>
                <span className="text-[11px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full font-mono font-bold border border-emerald-500/20">
                  {monthEvents.length} no mês
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedWeekdayName}, {selectedDay} de {MONTHS_NAMES[currentMonth]} de {currentYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleJumpToToday}
              className="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-semibold text-slate-700 dark:text-white transition-all cursor-pointer shadow-xs active:scale-95"
              title="Ir para a data de hoje"
            >
              <Sparkles size={14} className="text-brand-primary" />
              <span>Ir para Hoje</span>
            </button>

            <button
              onClick={openAddEventForSelectedDay}
              className="h-9 px-3.5 rounded-xl bg-brand-primary text-white flex items-center gap-1.5 font-semibold text-xs hover:bg-opacity-90 active:scale-95 shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>Novo Evento</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-6">
        
        {/* HIGHLIGHTED MONTH EVENTS STRIP */}
        {monthEvents.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-500/10 via-brand-primary/10 to-teal-500/10 dark:from-emerald-950/30 dark:via-brand-card-dark dark:to-teal-950/30 rounded-3xl p-4 border border-emerald-500/20 shadow-xs">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  Eventos Cadastrados em {MONTHS_NAMES[currentMonth]} ({monthEvents.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Clique no evento para programar lembretes e ver detalhes
              </span>
            </div>

            {/* Horizontal Scrollable Event Badges */}
            <div className="flex gap-3 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
              {monthEvents.map((event) => {
                const isSelectedEvent = selectedDay === event.day;
                return (
                  <button
                    key={`strip-${event.id}`}
                    onClick={() => {
                      setSelectedDay(event.day);
                      handleEventClick(event);
                    }}
                    className={`shrink-0 flex items-center gap-3 p-2.5 pr-4 rounded-2xl border transition-all text-start cursor-pointer shadow-xs ${
                      isSelectedEvent
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-md scale-102"
                        : "bg-white dark:bg-brand-card-dark border-emerald-500/20 hover:border-emerald-500/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30"
                    }`}
                  >
                    {/* Date Block */}
                    <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold shrink-0 ${
                      isSelectedEvent
                        ? "bg-white/20 text-white"
                        : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    }`}>
                      <span className="text-xs font-extrabold leading-none">{event.day}</span>
                      <span className="text-[8px] uppercase tracking-wider opacity-80 leading-none mt-0.5">
                        {MONTHS_NAMES[event.month].slice(0, 3)}
                      </span>
                    </div>

                    <div className="min-w-0 max-w-[170px]">
                      <p className={`text-xs font-bold truncate leading-snug ${
                        isSelectedEvent ? "text-white" : "text-slate-800 dark:text-slate-100"
                      }`}>
                        {event.title}
                      </p>
                      <div className={`flex items-center gap-2 text-[10px] mt-0.5 truncate ${
                        isSelectedEvent ? "text-emerald-100" : "text-slate-400"
                      }`}>
                        <span className="flex items-center gap-0.5 truncate">
                          <Clock size={10} />
                          {event.time}
                        </span>
                        <span>•</span>
                        <span className="font-semibold truncate">
                          {event.isPaid ? "Pago" : "Gratuito"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Filter size={13} />
            Filtrar:
          </span>
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              filterType === "all"
                ? "bg-brand-primary text-white shadow-xs"
                : "bg-slate-100 dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Todos os Eventos ({events.length})
          </button>
          <button
            onClick={() => setFilterType("free")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              filterType === "free"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Apenas Gratuitos
          </button>
          <button
            onClick={() => setFilterType("paid")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
              filterType === "paid"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            Com Taxa / Pago
          </button>
        </div>

        {/* Grid and Events Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* CALENDAR MATRIX COLUMN */}
          <div className="md:col-span-7 xl:col-span-8 bg-white dark:bg-brand-card-dark rounded-3xl p-5 sm:p-6 border border-brand-primary/10 shadow-sm">
            {/* Header Month / Year Navigation */}
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={previousMonth}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer active:scale-95"
                  title="Mês anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  onClick={handleJumpToToday}
                  className="px-2.5 py-1.5 rounded-xl bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary/20 transition-colors"
                >
                  Hoje
                </button>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-display font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {MONTHS_NAMES.map((monthName, idx) => (
                    <option key={monthName} value={idx} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                      {monthName}
                    </option>
                  ))}
                </select>

                <select
                  value={currentYear}
                  onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  {yearsRange.map((y) => (
                    <option key={y} value={y} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white">
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={nextMonth}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer active:scale-95"
                title="Próximo mês"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Weekdays Labels */}
            <div className="grid grid-cols-7 gap-2 text-center mb-3">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((dayName) => (
                <span
                  key={dayName}
                  className="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-1"
                >
                  {dayName}
                </span>
              ))}
            </div>

            {/* Days Matrix Cells */}
            <div className="grid grid-cols-7 gap-2 sm:gap-2.5">
              {cells.map((cell, idx) => {
                const isSelected =
                  selectedDay === cell.day &&
                  cell.month === currentMonth &&
                  cell.year === currentYear;
                const isTodayCell = checkIsToday(cell.day, cell.month, cell.year);
                
                // Get all events for this cell
                const cellEvents = filteredEvents.filter(
                  (e) => e.day === cell.day && e.month === cell.month && e.year === cell.year
                );
                const hasEvents = cellEvents.length > 0;
                const hasPaidEvent = cellEvents.some((e) => e.isPaid);
                const hasFreeEvent = cellEvents.some((e) => !e.isPaid);

                return (
                  <button
                    key={`${cell.year}-${cell.month}-${cell.day}-${idx}`}
                    onClick={() => {
                      setSelectedDay(cell.day);
                      setCurrentMonth(cell.month);
                      setCurrentYear(cell.year);
                    }}
                    className={`
                      aspect-square rounded-2xl text-xs flex flex-col justify-between items-center relative transition-all cursor-pointer p-1.5 sm:p-2 group
                      ${
                        cell.isCurrentMonth
                          ? "text-slate-800 dark:text-slate-100"
                          : "text-slate-400/40 dark:text-slate-600"
                      }
                      ${
                        isSelected
                          ? "bg-brand-primary text-white shadow-lg ring-2 ring-brand-primary/50 font-bold scale-105 z-10"
                          : hasEvents
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/50 shadow-xs font-bold"
                          : isTodayCell
                          ? "ring-2 ring-brand-primary font-bold bg-brand-primary/10 text-brand-primary"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800"
                      }
                    `}
                  >
                    {/* Top Row */}
                    <div className="w-full flex items-center justify-between">
                      {isTodayCell ? (
                        <span
                          className={`text-[8px] font-mono leading-none uppercase tracking-tighter font-extrabold px-1 py-0.5 rounded-sm ${
                            isSelected
                              ? "bg-white/25 text-white"
                              : "bg-brand-primary text-white"
                          }`}
                        >
                          Hoje
                        </span>
                      ) : (
                        <span />
                      )}

                      {/* Event Counter Badge on the Day Cell */}
                      {hasEvents && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold leading-none shadow-xs ${
                            isSelected
                              ? "bg-white text-emerald-800"
                              : "bg-emerald-600 text-white"
                          }`}
                        >
                          {cellEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Day Number */}
                    <span className={`text-sm sm:text-base font-display font-extrabold leading-none ${
                      hasEvents && !isSelected ? "text-emerald-700 dark:text-emerald-300" : ""
                    }`}>
                      {cell.day}
                    </span>

                    {/* Bottom Row: Multi-Colored Indicator Dots */}
                    <div className="flex items-center gap-1 h-2">
                      {hasEvents && (
                        <>
                          {hasFreeEvent && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? "bg-white" : "bg-emerald-500"
                              }`}
                              title="Evento Gratuito"
                            />
                          )}
                          {hasPaidEvent && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSelected ? "bg-amber-300" : "bg-amber-500"
                              }`}
                              title="Evento Pago"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-xs" />
                  <span>Evento Gratuito</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block shadow-xs" />
                  <span>Evento com Taxa</span>
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="w-3 h-3 rounded-md ring-2 ring-brand-primary inline-block" />
                  <span>Dia Atual (Hoje)</span>
                </span>
              </div>

              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {monthEvents.length} evento(s) neste mês
              </span>
            </div>
          </div>

          {/* SELECTED DAY EVENTS COLUMN */}
          <div className="md:col-span-5 xl:col-span-4 flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <CalendarDays size={18} className="text-emerald-600" />
                  <span>
                    {selectedDay} de {MONTHS_NAMES[currentMonth]}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {selectedWeekdayName} {isSelectedDateToday && "• Hoje"}
                </p>
              </div>

              <button
                onClick={openAddEventForSelectedDay}
                className="px-3 py-1.5 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                title="Adicionar evento para este dia"
              >
                <Plus size={14} />
                <span>Adicionar</span>
              </button>
            </div>

            {dayEvents.length === 0 ? (
              <div className="bg-white dark:bg-brand-card-dark rounded-3xl py-10 px-5 text-center border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center gap-3 shadow-xs">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center">
                  <CalendarIcon size={24} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Nenhum evento neste dia
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                    Não há eventos cadastrados para o dia {selectedDay} de {MONTHS_NAMES[currentMonth].toLowerCase()}.
                  </p>
                </div>
                <button
                  onClick={openAddEventForSelectedDay}
                  className="mt-1 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-opacity-90 active:scale-95 shadow-sm transition-all cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Cadastrar Evento Hoje</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  {dayEvents.length} evento(s) confirmado(s):
                </span>

                {dayEvents.map((event) => (
                  <motion.div
                    key={event.id}
                    onClick={() => handleEventClick(event)}
                    whileHover={{ scale: 1.01, y: -2 }}
                    className="bg-white dark:bg-brand-card-dark border-2 border-emerald-500/20 hover:border-emerald-500 rounded-3xl p-4 flex flex-col gap-3 cursor-pointer shadow-sm hover:shadow-md transition-all group"
                  >
                    {/* Header Row */}
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex flex-col items-center justify-center shrink-0 shadow-sm font-display">
                        <span className="text-xs font-bold uppercase leading-none">
                          {MONTHS_NAMES[event.month].slice(0, 3)}
                        </span>
                        <span className="text-lg font-extrabold leading-none mt-0.5">
                          {event.day}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              event.isPaid
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            }`}
                          >
                            {event.isPaid ? `Taxa: ${event.price || "R$ 0,00"}` : "Gratuito"}
                          </span>
                        </div>

                        <h4 className="font-display font-bold text-sm text-slate-900 dark:text-white leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {event.title}
                        </h4>
                      </div>
                    </div>

                    {/* Details Row */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-emerald-600 shrink-0" />
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {event.time}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 truncate">
                        <MapPin size={13} className="text-red-500 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-1 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 group-hover:underline">
                        <Bell size={13} />
                        <span>Ver e Programar Notificações</span>
                      </span>
                      <ArrowRight size={14} className="text-emerald-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Add Event (Sem URL da imagem) */}
      <AnimatePresence>
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <CalendarIcon size={16} />
                  </div>
                  <h3 className="font-display font-bold text-base text-slate-800 dark:text-white">
                    Novo Evento Escolar
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-center justify-between">
                  <span>{formError}</span>
                  <button type="button" onClick={() => setFormError("")} className="font-bold text-sm ml-2">✕</button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Título do Evento*
                  </label>
                  <input
                    type="text"
                    required
                    value={evtTitle}
                    onChange={(e) => setEvtTitle(e.target.value)}
                    placeholder="Ex: Feira de Ciências e Tecnologia"
                    className="w-full h-11 px-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Local / Endereço Completo*
                  </label>
                  <input
                    type="text"
                    required
                    value={evtLocation}
                    onChange={(e) => setEvtLocation(e.target.value)}
                    placeholder="Ex: Auditório Principal, Bloco B"
                    className="w-full h-11 px-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Dia*</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={31}
                      value={evtDay}
                      onChange={(e) => setEvtDay(e.target.value)}
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mês*</label>
                    <select
                      value={evtMonth}
                      onChange={(e) => setEvtMonth(parseInt(e.target.value))}
                      className="w-full h-11 px-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                    >
                      {MONTHS_NAMES.map((m, i) => (
                        <option key={m} value={i}>
                          {m.slice(0, 3)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Horário*</label>
                    <input
                      type="time"
                      required
                      value={evtTime}
                      onChange={(e) => setEvtTime(e.target.value)}
                      className="w-full h-11 px-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-semibold"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="chk-evt-paid"
                    checked={evtIsPaid}
                    onChange={(e) => setEvtIsPaid(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                  <label htmlFor="chk-evt-paid" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                    Evento com taxa de inscrição (Pago)
                  </label>
                </div>

                {evtIsPaid && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Valor / Taxa (Ex: R$ 15,00)
                    </label>
                    <input
                      type="text"
                      value={evtPrice}
                      onChange={(e) => setEvtPrice(e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Requisitos / Orientações (Separados por vírgula)
                  </label>
                  <input
                    type="text"
                    value={evtRequirements}
                    onChange={(e) => setEvtRequirements(e.target.value)}
                    placeholder="Ex: Levar documento com foto, Uniforme escolar"
                    className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                {/* Imagem do Evento */}
                <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-emerald-600" />
                      <span>Imagem de Capa do Evento</span>
                    </label>
                    {evtImage && (
                      <button
                        type="button"
                        onClick={() => setEvtImage("")}
                        className="text-[10px] text-red-500 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={11} />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>

                  {evtImage ? (
                    <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 shadow-xs bg-slate-100">
                      <img
                        src={evtImage}
                        alt="Prévia do Evento"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <label className="flex-1 h-10 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                          <Upload size={14} className="text-emerald-600" />
                          <span>Enviar do Computador</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  if (typeof reader.result === "string") {
                                    setEvtImage(reader.result);
                                  }
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={evtImage}
                          onChange={(e) => setEvtImage(e.target.value)}
                          placeholder="Ou cole a URL da imagem (https://...)"
                          className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>

                      {/* Sugestões de temas escolares rápidos */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] text-slate-400">Sugestões:</span>
                        {[
                          { label: "Ciências", url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=800" },
                          { label: "Esportes", url: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800" },
                          { label: "Cultura", url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800" },
                          { label: "Palestra", url: "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800" }
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setEvtImage(preset.url)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 transition-colors cursor-pointer"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-98 transition-all cursor-pointer"
                  >
                    <CheckCircle size={16} />
                    <span>Salvar Evento</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="px-4 h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 font-semibold rounded-xl active:scale-98 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Pedido de Permissão de Notificações ao clicar no evento pelo Calendário */}
      <EventNotificationModal
        isOpen={showNotificationModal}
        event={notificationEvent}
        onClose={() => {
          setShowNotificationModal(false);
          setNotificationEvent(null);
        }}
        onConfirm={handleConfirmNotification}
        onSkip={handleSkipNotification}
      />
    </motion.div>
  );
}
