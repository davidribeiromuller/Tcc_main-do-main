import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  Trash2,
  Search,
  Users,
  LogIn,
  Edit3,
  X,
  Save,
  Mail,
  User as UserIcon,
  Phone,
  Building2,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Activity,
  Calendar,
  Plus,
  MapPin,
  Tag,
  DollarSign,
  ExternalLink,
  Sparkles,
  Info
} from "lucide-react";
import { User, Event } from "../types";
import { formatLastActive, formatDateTimeBR } from "../lib/dateUtils";

interface AdminPanelProps {
  usersList: User[];
  events?: Event[];
  onUpdateUser: (userId: number, updateData: any) => Promise<void>;
  onDeleteUser: (userId: number) => Promise<void>;
  onImpersonateUser?: (user: User) => void;
  onAddEvent?: (eventData: any) => Promise<void>;
  onUpdateEvent?: (eventId: number, eventData: Partial<Event>) => Promise<void>;
  onDeleteEvent?: (eventId: number) => Promise<void>;
  onSelectEvent?: (event: Event) => void;
  currentUser: User | null;
}

export default function AdminPanel({
  usersList,
  events = [],
  onUpdateUser,
  onDeleteUser,
  onImpersonateUser,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onSelectEvent,
  currentUser
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<"users" | "events">("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [eventSearchTerm, setEventSearchTerm] = useState("");
  
  // User modals state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    nome: "",
    email: "",
    role: "Aluno",
    phone: "",
    institution: "",
    isAdmin: false,
    ativo: true
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Event modals state
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventFilter, setEventFilter] = useState<"all" | "free" | "paid">("all");
  
  const [eventFormData, setEventFormData] = useState({
    title: "",
    location: "Escola Estadual Helena Wysocki",
    day: new Date().getDate(),
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    time: "18:00",
    isPaid: false,
    price: "",
    requirements: "",
    website: "",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
  });

  const filteredUsers = usersList.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      (u.nome && u.nome.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.role && u.role.toLowerCase().includes(term)) ||
      (u.institution && u.institution.toLowerCase().includes(term))
    );
  });

  const filteredEvents = events.filter((ev) => {
    const term = eventSearchTerm.toLowerCase();
    const matchesTerm = (
      ev.title.toLowerCase().includes(term) ||
      ev.location.toLowerCase().includes(term) ||
      (ev.requirements && ev.requirements.toLowerCase().includes(term))
    );
    if (!matchesTerm) return false;
    if (eventFilter === "free") return !ev.isPaid;
    if (eventFilter === "paid") return !!ev.isPaid;
    return true;
  });

  // User Actions
  const handleOpenEditModal = (u: User) => {
    setEditingUser(u);
    setEditFormData({
      nome: u.nome || "",
      email: u.email || "",
      role: u.role || "Aluno",
      phone: u.phone || "",
      institution: u.institution || "Escola estadual Helena Wysocki",
      isAdmin: !!u.isAdmin,
      ativo: u.ativo !== false
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setIsSaving(true);
      const payload: any = {
        nome: editFormData.nome.trim(),
        email: editFormData.email.trim().toLowerCase(),
        role: editFormData.role,
        institution: editFormData.institution.trim(),
        phone: editFormData.phone.trim(),
        isAdmin: editFormData.isAdmin,
        ativo: editFormData.ativo
      };

      await onUpdateUser(editingUser.id, payload);
      setEditingUser(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAdminToggle = async (userId: number, currVal: boolean) => {
    if (currentUser?.id === userId && currVal) {
      alert("Você não pode remover seu próprio acesso administrativo!");
      return;
    }
    const newIsAdmin = !currVal;
    await onUpdateUser(userId, { 
      isAdmin: newIsAdmin,
      role: newIsAdmin ? "Diretor" : "Aluno"
    });
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Event Actions
  const handleOpenAddEventModal = () => {
    const today = new Date();
    setEventFormData({
      title: "",
      location: "Escola Estadual Helena Wysocki - Pátio Principal",
      day: today.getDate(),
      month: today.getMonth(),
      year: today.getFullYear(),
      time: "14:00",
      isPaid: false,
      price: "",
      requirements: "Aberto para todos os alunos e comunidade escolar",
      website: "",
      image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
    });
    setIsAddingEvent(true);
  };

  const handleOpenEditEventModal = (ev: Event) => {
    setEditingEvent(ev);
    setEventFormData({
      title: ev.title,
      location: ev.location,
      day: ev.day,
      month: ev.month,
      year: ev.year,
      time: ev.time || "14:00",
      isPaid: !!ev.isPaid,
      price: ev.price || "",
      requirements: ev.requirements || "",
      website: ev.website || "",
      image: ev.image || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
    });
  };

  const handleSaveNewEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddEvent) return;
    try {
      setIsSaving(true);
      await onAddEvent({
        title: eventFormData.title.trim(),
        location: eventFormData.location.trim(),
        day: Number(eventFormData.day),
        month: Number(eventFormData.month),
        year: Number(eventFormData.year),
        time: eventFormData.time.trim() || "14:00",
        isPaid: Boolean(eventFormData.isPaid),
        price: eventFormData.isPaid ? eventFormData.price : null,
        requirements: eventFormData.requirements.trim(),
        website: eventFormData.website.trim() || null,
        image: eventFormData.image.trim()
      });
      setIsAddingEvent(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !onUpdateEvent) return;
    try {
      setIsSaving(true);
      await onUpdateEvent(editingEvent.id, {
        title: eventFormData.title.trim(),
        location: eventFormData.location.trim(),
        day: Number(eventFormData.day),
        month: Number(eventFormData.month),
        year: Number(eventFormData.year),
        time: eventFormData.time.trim() || "14:00",
        isPaid: Boolean(eventFormData.isPaid),
        price: eventFormData.isPaid ? eventFormData.price : null,
        requirements: eventFormData.requirements.trim(),
        website: eventFormData.website.trim() || null,
        image: eventFormData.image.trim()
      });
      setEditingEvent(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete || !onDeleteEvent) return;
    try {
      setIsDeleting(true);
      await onDeleteEvent(eventToDelete.id);
      setEventToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10 bg-brand-bg-light/80 dark:bg-brand-bg-dark/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto w-full p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-2">
                <ShieldCheck className="text-brand-accent dark:text-brand-primary shrink-0" />
                Painel da Diretoria & Administração
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Controle integral de usuários, eventos da agenda escolar e permissões de acesso
              </p>
            </div>

            {/* Quick Stats Tabs */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === "users"
                    ? "bg-white dark:bg-brand-card-dark text-brand-accent dark:text-brand-primary shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
              >
                <Users size={15} />
                <span>Usuários ({usersList.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("events")}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === "events"
                    ? "bg-white dark:bg-brand-card-dark text-brand-accent dark:text-brand-primary shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
              >
                <Calendar size={15} />
                <span>Eventos Escolares ({events.length})</span>
              </button>
            </div>
          </div>

          {/* Search & Action Bar */}
          {activeTab === "users" ? (
            <div className="relative mt-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar usuários por nome, e-mail ou instituição..."
                className="w-full h-11 pl-10 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark placeholder-slate-400 shadow-xs"
              />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={eventSearchTerm}
                  onChange={(e) => setEventSearchTerm(e.target.value)}
                  placeholder="Pesquisar eventos por título, local ou detalhes..."
                  className="w-full h-11 pl-10 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark placeholder-slate-400 shadow-xs"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <select
                  value={eventFilter}
                  onChange={(e: any) => setEventFilter(e.target.value)}
                  className="h-11 px-3 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark"
                >
                  <option value="all">Todos os Eventos</option>
                  <option value="free">Apenas Gratuitos</option>
                  <option value="paid">Apenas Pagos</option>
                </select>

                <button
                  type="button"
                  onClick={handleOpenAddEventModal}
                  className="h-11 px-4 bg-brand-accent text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-xs cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                  <span>Cadastrar Novo Evento</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full p-6 flex flex-col gap-4">
        
        {/* ================= USERS TAB ================= */}
        {activeTab === "users" && (
          <>
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
              <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                <p className="font-semibold">Gerenciamento Escolar & Atividade de Usuários:</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Acompanhe a <strong>última vez que cada usuário entrou no aplicativo</strong>, acesse contas com 1 clique, ative <strong>Privilégios de Administrador</strong>, modifique dados cadastrais e gerencie acessos com segurança.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUsers.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400">
                  <Users size={40} className="text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm font-medium">Nenhum perfil escolar encontrado.</p>
                  <p className="text-xs text-slate-400 mt-1">Verifique o termo de pesquisa digitado.</p>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isMe = currentUser?.id === u.id || (currentUser?.email && u.email && currentUser.email.toLowerCase() === u.email.toLowerCase());
                  const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
                  const activity = formatLastActive(activityDate);
                  const formattedDateStr = formatDateTimeBR(activityDate);

                  return (
                    <div
                      key={u.id}
                      className="bg-white dark:bg-brand-card-dark rounded-2xl p-5 border border-brand-primary/15 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-3.5 relative overflow-hidden"
                    >
                      {/* Top Bar Indicator */}
                      {isMe && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-brand-accent" />
                      )}

                      {/* Header info */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-sm uppercase shrink-0 select-none overflow-hidden border border-brand-primary/30">
                            {u.foto_perfil ? (
                              <img src={u.foto_perfil} alt={u.nome} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                            ) : (
                              (u.nome || u.email || "U").slice(0, 1)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                {u.nome || "Usuário Escolar"}
                              </h4>
                              {isMe && (
                                <span className="text-[10px] bg-brand-primary/20 text-brand-accent dark:text-brand-primary px-1.5 py-0.5 rounded-md font-bold">
                                  Você
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block truncate mt-0.5">
                              {u.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(u)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Modificar dados completos do usuário"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isMe) {
                                alert("Você não pode deletar sua própria conta ativa.");
                                return;
                              }
                              setUserToDelete(u);
                            }}
                            disabled={isMe}
                            className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 disabled:opacity-25 transition-colors cursor-pointer"
                            title="Excluir conta permanentemente"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Última Atividade */}
                      <div 
                        className={`px-3 py-2 rounded-xl flex items-center justify-between text-xs border transition-colors ${activity.badgeBg}`}
                        title={`Último acesso registrado: ${formattedDateStr}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="relative flex h-2 w-2 shrink-0">
                            {activity.isOnline && (
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${activity.dotColor}`} />
                          </span>
                          <span className={`text-[11px] font-semibold truncate ${activity.statusColor}`}>
                            {activity.text}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0 ml-1.5">
                          <Clock size={11} className="opacity-70" />
                          <span>{formattedDateStr.split(' ')[1] || formattedDateStr}</span>
                        </div>
                      </div>

                      {/* Privilégios & Status */}
                      <div className="flex flex-col gap-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={!!u.isAdmin}
                              disabled={isMe}
                              onChange={() => handleQuickAdminToggle(u.id, !!u.isAdmin)}
                              className="w-4 h-4 rounded accent-brand-accent cursor-pointer"
                            />
                            <span className="flex items-center gap-1">
                              <ShieldCheck size={14} className={u.isAdmin ? "text-amber-500" : "text-slate-400"} />
                              <span>Privilégios de Administrador</span>
                            </span>
                          </label>

                          {u.isAdmin ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/50">
                              Admin Ativo
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              Padrão
                            </span>
                          )}
                        </div>

                        {/* Impersonate Button */}
                        {onImpersonateUser && !isMe && (
                          <button
                            type="button"
                            onClick={() => onImpersonateUser(u)}
                            className="w-full h-9 bg-brand-primary/15 hover:bg-brand-primary/25 active:scale-98 text-brand-accent dark:text-brand-primary border border-brand-primary/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
                          >
                            <LogIn size={13} />
                            <span>Entrar nesta conta</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ================= EVENTS TAB (FOR ADMINS) ================= */}
        {activeTab === "events" && (
          <>
            <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
              <Calendar className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <p className="font-semibold">Gestão Direta de Eventos da Escola Helena Wysocki:</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Todos os eventos adicionados pela administração aparecem <strong>imediatamente aqui no painel administrativo, na aba de Feed e no Calendário Escolar</strong> para todos os alunos e professores.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEvents.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-8">
                  <Calendar size={48} className="text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Nenhum evento encontrado na agenda.
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Clique no botão abaixo para criar o primeiro evento e publicá-lo para todos os estudantes.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddEventModal}
                    className="mt-4 px-4 py-2 bg-brand-accent text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus size={15} />
                    <span>Cadastrar Novo Evento Agora</span>
                  </button>
                </div>
              ) : (
                filteredEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-white dark:bg-brand-card-dark rounded-2xl border border-brand-primary/15 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    {/* Event Image */}
                    <div className="relative h-36 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <img
                        src={ev.image || "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"}
                        alt={ev.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      
                      {/* Price Badge */}
                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs ${
                            ev.isPaid
                              ? "bg-amber-500 text-white"
                              : "bg-emerald-600 text-white"
                          }`}
                        >
                          {ev.isPaid ? (ev.price ? `R$ ${ev.price}` : "Pago") : "Gratuito"}
                        </span>
                      </div>

                      {/* Date Badge */}
                      <div className="absolute bottom-2.5 left-2.5 text-white">
                        <div className="flex items-center gap-1.5 text-xs font-bold drop-shadow-md">
                          <Calendar size={13} />
                          <span>{ev.day} de {monthNames[ev.month] || "Mês"} de {ev.year} • {ev.time || "14:00"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Event Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-1">
                          {ev.title}
                        </h4>
                        
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <MapPin size={13} className="text-brand-accent shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </div>

                        {ev.requirements && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 bg-slate-50 dark:bg-slate-850 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            {ev.requirements}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons for Admin */}
                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        {onSelectEvent && (
                          <button
                            type="button"
                            onClick={() => onSelectEvent(ev)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Info size={13} />
                            <span>Ver</span>
                          </button>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => handleOpenEditEventModal(ev)}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 border border-blue-200 dark:border-blue-800/60"
                          >
                            <Edit3 size={13} />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEventToDelete(ev)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg text-[11px] transition-colors cursor-pointer"
                            title="Excluir evento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

      </div>

      {/* ================= MODALS ================= */}

      {/* Delete User Modal */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir Conta Escolar?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja excluir permanentemente a conta de <strong>{userToDelete.nome || userToDelete.email}</strong>? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? "Excluindo..." : "Sim, Excluir"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Event Modal */}
      <AnimatePresence>
        {eventToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir Evento Escolar?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja remover o evento <strong>"{eventToDelete.title}"</strong> da agenda da escola?
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEventToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteEvent}
                  disabled={isDeleting}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? "Excluindo..." : "Sim, Excluir"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal Dialog */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 relative text-slate-800 dark:text-slate-100 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold">
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Modificar Dados do Usuário
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ID: {editingUser.id} • {editingUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="flex flex-col gap-3.5 mt-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.nome}
                    onChange={(e) => setEditFormData({ ...editFormData, nome: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Endereço de E-mail
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Instituição / Escola
                    </label>
                    <input
                      type="text"
                      value={editFormData.institution}
                      onChange={(e) => setEditFormData({ ...editFormData, institution: e.target.value })}
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Função / Cargo
                    </label>
                    <select
                      value={editFormData.role}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                      className="w-full h-10 px-2 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    >
                      <option value="Aluno">Aluno</option>
                      <option value="Professor">Professor</option>
                      <option value="Diretor">Diretor</option>
                      <option value="Funcionário">Funcionário</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={editFormData.isAdmin}
                      onChange={(e) => setEditFormData({ ...editFormData, isAdmin: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Privilégios de Administrador</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={editFormData.ativo}
                      onChange={(e) => setEditFormData({ ...editFormData, ativo: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Conta Ativa</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="h-10 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="h-10 px-5 bg-brand-accent text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-90 active:scale-98 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{isSaving ? "Salvando..." : "Salvar Alterações"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Event Modal Dialog */}
      <AnimatePresence>
        {(isAddingEvent || editingEvent) && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-accent text-white flex items-center justify-center font-bold">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {isAddingEvent ? "Cadastrar Novo Evento Escolar" : "Editar Evento da Agenda"}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      O evento ficará visível no calendário e no feed de todos os usuários
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingEvent(false);
                    setEditingEvent(null);
                  }}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={isAddingEvent ? handleSaveNewEvent : handleSaveEditEvent} className="flex flex-col gap-3.5 mt-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Título do Evento*
                  </label>
                  <input
                    type="text"
                    required
                    value={eventFormData.title}
                    onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                    placeholder="Ex: Feira de Ciências 2025, Reunião de Pais..."
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Local*
                    </label>
                    <input
                      type="text"
                      required
                      value={eventFormData.location}
                      onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                      placeholder="Ex: Pátio Principal, Quadra..."
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Horário*
                    </label>
                    <input
                      type="text"
                      required
                      value={eventFormData.time}
                      onChange={(e) => setEventFormData({ ...eventFormData, time: e.target.value })}
                      placeholder="Ex: 14:00, 08:30..."
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Date Fields */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Dia (1-31)*
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      required
                      value={eventFormData.day}
                      onChange={(e) => setEventFormData({ ...eventFormData, day: Number(e.target.value) })}
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Mês*
                    </label>
                    <select
                      value={eventFormData.month}
                      onChange={(e) => setEventFormData({ ...eventFormData, month: Number(e.target.value) })}
                      className="w-full h-10 px-2 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    >
                      {monthNames.map((name, idx) => (
                        <option key={name} value={idx}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Ano*
                    </label>
                    <input
                      type="number"
                      required
                      value={eventFormData.year}
                      onChange={(e) => setEventFormData({ ...eventFormData, year: Number(e.target.value) })}
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Paid Toggle & Price */}
                <div className="p-3 bg-slate-50 dark:bg-black/20 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={eventFormData.isPaid}
                      onChange={(e) => setEventFormData({ ...eventFormData, isPaid: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Evento com taxa de inscrição ou ingresso pago</span>
                  </label>

                  {eventFormData.isPaid && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">R$</span>
                      <input
                        type="text"
                        value={eventFormData.price}
                        onChange={(e) => setEventFormData({ ...eventFormData, price: e.target.value })}
                        placeholder="Ex: 15,00"
                        className="w-32 h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-accent focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Requisitos / Descrição do Evento
                  </label>
                  <textarea
                    rows={2}
                    value={eventFormData.requirements}
                    onChange={(e) => setEventFormData({ ...eventFormData, requirements: e.target.value })}
                    placeholder="Ex: Trazer uniforme escolar, aberto à comunidade..."
                    className="w-full p-2.5 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none resize-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    URL da Imagem de Capa
                  </label>
                  <input
                    type="url"
                    value={eventFormData.image}
                    onChange={(e) => setEventFormData({ ...eventFormData, image: e.target.value })}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none font-mono"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingEvent(false);
                      setEditingEvent(null);
                    }}
                    className="h-10 px-4 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || !eventFormData.title.trim()}
                    className="h-10 px-5 bg-brand-accent text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-90 active:scale-98 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{isSaving ? "Salvando..." : (isAddingEvent ? "Publicar Evento" : "Salvar Alterações")}</span>
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
