import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Plus, MapPin, Clock, X, CalendarDays, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { Event } from "../types";

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

export default function CalendarView({ events, onAddEvent, onSelectEvent, currentUser, onNavigate }: CalendarViewProps) {
  // Inicialização dinâmica com base na data de hoje
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth(); // 0-11
  const todayYear = today.getFullYear();

  const [currentMonth, setCurrentMonth] = useState<number>(todayMonth);
  const [currentYear, setCurrentYear] = useState<number>(todayYear);
  const [selectedDay, setSelectedDay] = useState<number>(todayDay);

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
  const [evtWebsite, setEvtWebsite] = useState("");
  const [evtImage, setEvtImage] = useState("");
  const [formError, setFormError] = useState("");

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const rawFirstDay = new Date(currentYear, currentMonth, 1).getDay();
  // Ajusta o primeiro dia para iniciar na Segunda-feira (0 = Segunda, 6 = Domingo)
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

  const dayEvents = events.filter(
    (e) => e.day === selectedDay && e.month === currentMonth && e.year === currentYear
  );

  const monthEventsCount = events.filter(
    (e) => e.month === currentMonth && e.year === currentYear
  ).length;

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
        website: evtWebsite.trim(),
        image: evtImage.trim(),
      });

      // Reset Form
      setEvtTitle("");
      setEvtLocation("");
      setEvtDay(todayDay.toString());
      setEvtTime("14:00");
      setEvtIsPaid(false);
      setEvtPrice("");
      setEvtRequirements("");
      setEvtWebsite("");
      setEvtImage("");
      setFormError("");
      
      // Muda a visualização do calendário para a data inserida
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

  // Gerar células do calendário
  const cells = [];
  
  // Células do mês anterior (padding)
  const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthDaysCount = new Date(prevMonthYear, prevMonthIndex + 1, 0).getDate();
  
  for (let i = 0; i < firstDayOffset; i++) {
    const d = prevMonthDaysCount - firstDayOffset + i + 1;
    cells.push({
      day: d,
      month: prevMonthIndex,
      year: prevMonthYear,
      isCurrentMonth: false
    });
  }

  // Células do mês atual
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({
      day: i,
      month: currentMonth,
      year: currentYear,
      isCurrentMonth: true
    });
  }

  // Células do próximo mês (padding)
  const nextMonthIndex = currentMonth === 11 ? 0 : currentMonth + 1;
  const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
  const totalCells = Math.ceil(cells.length / 7) * 7;
  const remainingCells = totalCells - cells.length;
  
  for (let i = 1; i <= remainingCells; i++) {
    cells.push({
      day: i,
      month: nextMonthIndex,
      year: nextMonthYear,
      isCurrentMonth: false
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark"
    >
      {/* Cabeçalho */}
      <div className="border-b border-brand-primary/10 bg-white/50 dark:bg-brand-card-dark/30 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto w-full flex justify-between items-center p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-brand-primary/10 text-brand-primary">
              <CalendarIcon size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-bold tracking-tight">Calendário Escolar</h1>
                <span className="text-[10px] bg-brand-primary/15 text-brand-primary px-2 py-0.5 rounded-full font-mono font-semibold">
                  Hoje: {todayDay}/{todayMonth + 1}/{todayYear}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedWeekdayName}, {selectedDay} de {MONTHS_NAMES[currentMonth]} de {currentYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleJumpToToday}
              className="hidden sm:flex items-center gap-1.5 px-3 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-xs font-semibold text-slate-700 dark:text-white transition-all cursor-pointer"
              title="Ir para a data de hoje"
            >
              <Sparkles size={14} className="text-brand-primary" />
              <span>Ir para Hoje</span>
            </button>

            <button
              onClick={openAddEventForSelectedDay}
              className="h-10 px-4 rounded-xl bg-brand-primary text-white flex items-center gap-2 font-medium text-xs hover:scale-105 active:scale-95 shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Novo Evento</span>
            </button>

            {/* Profile link for mobile settings */}
            {onNavigate && (
              <button
                onClick={() => onNavigate("settings")}
                className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-brand-card-dark border border-brand-primary/15 hover:scale-105 active:scale-95 transition-all shadow-sm overflow-hidden"
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
            )}
          </div>
        </div>
      </div>

      {/* Main Calendar Body */}
      <div className="max-w-6xl mx-auto w-full p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-7 xl:col-span-8 bg-brand-secondary/40 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 shadow-sm">
          {/* Calendar Header Selectors */}
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={previousMonth}
                className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-brand-text-dark transition-all cursor-pointer"
                title="Mês anterior"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                onClick={handleJumpToToday}
                className="sm:hidden px-2.5 py-1 rounded-lg bg-brand-primary/10 text-brand-primary text-[11px] font-bold"
              >
                Hoje
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={currentMonth}
                onChange={(e) => setCurrentMonth(parseInt(e.target.value))}
                className="bg-white dark:bg-black/20 border border-brand-primary/15 rounded-xl px-3 py-1.5 text-xs font-display font-semibold text-brand-accent dark:text-brand-primary focus:outline-none cursor-pointer"
              >
                {MONTHS_NAMES.map((monthName, idx) => (
                  <option key={monthName} value={idx} className="bg-white dark:bg-brand-card-dark text-slate-800 dark:text-white">
                    {monthName}
                  </option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={(e) => setCurrentYear(parseInt(e.target.value))}
                className="bg-white dark:bg-black/20 border border-brand-primary/15 rounded-xl px-2.5 py-1.5 text-xs font-mono font-medium text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                {yearsRange.map((y) => (
                  <option key={y} value={y} className="bg-white dark:bg-brand-card-dark text-slate-800 dark:text-white">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={nextMonth}
              className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-slate-600 dark:text-brand-text-dark transition-all cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Grid Layout Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((dayName) => (
              <span key={dayName} className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest py-1">
                {dayName}
              </span>
            ))}
          </div>

          {/* Days Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell, idx) => {
              const isSelected = selectedDay === cell.day && cell.month === currentMonth && cell.year === currentYear;
              const isTodayCell = checkIsToday(cell.day, cell.month, cell.year);
              const hasEvents = events.some(
                (e) => e.day === cell.day && e.month === cell.month && e.year === cell.year
              );

              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}-${idx}`}
                  onClick={() => {
                    setSelectedDay(cell.day);
                    setCurrentMonth(cell.month);
                    setCurrentYear(cell.year);
                  }}
                  className={`
                    aspect-square rounded-2xl text-xs flex flex-col justify-center items-center relative transition-all cursor-pointer p-1
                    ${cell.isCurrentMonth ? "text-brand-text-light dark:text-brand-text-dark font-medium" : "text-slate-400 opacity-30"}
                    ${isSelected ? "bg-brand-primary text-white shadow-md font-bold scale-102" : "hover:bg-brand-primary/15"}
                    ${isTodayCell && !isSelected ? "ring-2 ring-brand-primary font-bold bg-brand-primary/10 text-brand-primary" : ""}
                  `}
                >
                  <span className="text-xs leading-none">{cell.day}</span>
                  
                  {isTodayCell && (
                    <span className={`text-[8px] font-mono leading-none mt-0.5 uppercase tracking-tighter ${isSelected ? "text-emerald-100" : "text-brand-primary font-bold"}`}>
                      Hoje
                    </span>
                  )}

                  {hasEvents && (
                    <span className={`w-1.5 h-1.5 rounded-full absolute bottom-1.5 ${isSelected ? "bg-white" : "bg-emerald-500 animate-pulse"}`}></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Month Stats Footer */}
          <div className="mt-4 pt-3 border-t border-brand-primary/10 flex justify-between items-center text-[11px] text-slate-400">
            <span>{monthEventsCount} evento(s) em {MONTHS_NAMES[currentMonth]} de {currentYear}</span>
            <button onClick={handleJumpToToday} className="text-brand-primary font-semibold hover:underline">
              Ir para Hoje
            </button>
          </div>
        </div>

        {/* Selected Day Events List */}
        <div className="md:col-span-5 xl:col-span-4 flex flex-col gap-4 w-full">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-display font-semibold text-sm tracking-tight text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <CalendarDays size={16} className="text-brand-primary" />
                <span>{selectedWeekdayName}, {selectedDay} de {MONTHS_NAMES[currentMonth].toLowerCase()}</span>
              </h3>
              {isSelectedDateToday && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-6">
                  • Dia de hoje
                </span>
              )}
            </div>

            <button
              onClick={openAddEventForSelectedDay}
              className="p-2 rounded-xl bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary transition-all cursor-pointer"
              title="Adicionar evento para este dia"
            >
              <Plus size={16} />
            </button>
          </div>

          {dayEvents.length === 0 ? (
            <div className="bg-slate-50 dark:bg-brand-card-dark/30 rounded-2xl py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center gap-2">
              <CalendarIcon size={28} className="text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-400 font-medium">Nenhum evento agendado para este dia.</p>
              <button
                onClick={openAddEventForSelectedDay}
                className="mt-2 text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                <Plus size={14} />
                Agendar um evento
              </button>
            </div>
          ) : (
            dayEvents.map((event) => (
              <motion.div
                key={event.id}
                onClick={() => onSelectEvent(event)}
                whileHover={{ x: 4 }}
                className="bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl p-4 flex gap-4 items-center cursor-pointer hover:shadow-sm transition-all"
              >
                <div className="bg-brand-accent dark:bg-brand-primary text-white p-3 rounded-2xl shadow-xs shrink-0 font-display font-medium text-center min-w-[46px]">
                  <span className="block text-[10px] leading-none uppercase text-emerald-100">{MONTHS_NAMES[event.month].slice(0,3)}</span>
                  <span className="block text-xl leading-none mt-1 font-bold">{event.day}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-display font-semibold text-sm text-brand-text-light dark:text-brand-text-dark leading-snug truncate">
                    {event.title}
                  </h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 truncate">
                    <MapPin size={12} className="shrink-0 text-brand-accent" />
                    <span>{event.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                    <Clock size={12} className="shrink-0 text-brand-accent" />
                    <span>{event.time}</span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Modal Overlay para Adicionar Evento */}
      <AnimatePresence>
        {formOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setFormOpen(false)}
              className="absolute inset-0 bg-black"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              className="relative w-full max-w-sm bg-white dark:bg-brand-card-dark rounded-3xl p-6 z-10 shadow-2xl border border-brand-primary/10 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-brand-primary/10">
                <h3 className="font-display font-bold text-lg text-brand-accent dark:text-brand-primary">
                  Adicionar Evento
                </h3>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              {formError && (
                <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-center justify-between">
                  <span>{formError}</span>
                  <button type="button" onClick={() => setFormError("")} className="font-bold text-sm ml-2">✕</button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Título do evento*</label>
                  <input
                    type="text"
                    required
                    value={evtTitle}
                    onChange={(e) => setEvtTitle(e.target.value)}
                    placeholder="Ex: Feira de Ciências"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm"
                  />
                </div>

                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Localização / Endereço*</label>
                  <input
                    type="text"
                    required
                    value={evtLocation}
                    onChange={(e) => setEvtLocation(e.target.value)}
                    placeholder="Ex: Auditório Principal"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Dia*</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={31}
                      value={evtDay}
                      onChange={(e) => setEvtDay(e.target.value)}
                      placeholder="Dia"
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm text-center"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 col-span-2">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Mês</label>
                    <select
                      value={evtMonth}
                      onChange={(e) => setEvtMonth(parseInt(e.target.value))}
                      className="w-full h-10 px-2 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-xs"
                    >
                      {MONTHS_NAMES.map((name, index) => (
                        <option key={name} value={index} className="dark:bg-brand-card-dark">
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Hora</label>
                    <input
                      type="text"
                      value={evtTime}
                      onChange={(e) => setEvtTime(e.target.value)}
                      placeholder="Ex: 14:00"
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm text-center"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Ano</label>
                    <select
                      value={evtYear}
                      onChange={(e) => setEvtYear(parseInt(e.target.value))}
                      className="w-full h-10 px-2 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm"
                    >
                      {yearsRange.map((y) => (
                        <option key={y} value={y} className="dark:bg-brand-card-dark">
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="isPaid"
                    checked={evtIsPaid}
                    onChange={(e) => setEvtIsPaid(e.target.checked)}
                    className="w-4 h-4 text-brand-primary bg-slate-100 rounded border-slate-300 focus:ring-brand-accent"
                  />
                  <label htmlFor="isPaid" className="text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    Evento Pago/Com taxa de inscrição?
                  </label>
                </div>

                {evtIsPaid && (
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Valor / Preço</label>
                    <input
                      type="text"
                      value={evtPrice}
                      onChange={(e) => setEvtPrice(e.target.value)}
                      placeholder="Ex: R$ 20,00"
                      className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Url da Imagem Banner</label>
                  <input
                    type="text"
                    value={evtImage}
                    onChange={(e) => setEvtImage(e.target.value)}
                    placeholder="https://exemplo.com/imagem.png"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-xs"
                  />
                </div>

                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Requisitos (separados por vírgula)</label>
                  <input
                    type="text"
                    value={evtRequirements}
                    onChange={(e) => setEvtRequirements(e.target.value)}
                    placeholder="Ex: Levar documento, Levar autorização"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-sm"
                  />
                </div>

                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] uppercase font-bold text-slate-400">Link Inscrição / Detalhes</label>
                  <input
                    type="text"
                    value={evtWebsite}
                    onChange={(e) => setEvtWebsite(e.target.value)}
                    placeholder="https://meusite.com/evento"
                    className="w-full h-10 px-3 bg-slate-50 dark:bg-black/10 border border-brand-primary rounded-xl text-xs"
                  />
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-white font-semibold rounded-2xl cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-11 bg-brand-primary text-white font-semibold rounded-2xl shadow-md hover:bg-opacity-95 active:scale-98 transition-all cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

