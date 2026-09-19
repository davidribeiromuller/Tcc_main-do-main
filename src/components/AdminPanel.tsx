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
  Info,
  Lock,
  Unlock,
  Ticket,
  Route as RouteIcon,
  AlertTriangle,
  Crown,
  Eye,
  Table as TableIcon,
  LayoutGrid,
  Check,
  RefreshCw,
  MoreVertical,
  Filter,
  CalendarDays
} from "lucide-react";
import { User, Event } from "../types";
import { formatLastActive, formatDateTimeBR } from "../lib/dateUtils";
import { calculateRealUserStats } from "../lib/userStats";
import {
  isChefeAdmin,
  isFuncionarioAdmin,
  getRoleBadgeLabel,
  getAdminRoleType
} from "../lib/permissions";

interface AdminPanelProps {
  usersList: User[];
  events?: Event[];
  onUpdateUser: (userId: number, updateData: any) => Promise<void>;
  onDeleteUser: (userId: number) => Promise<void>;
  onUnblockUser?: (userId: number) => Promise<void>;
  onPermanentDeleteUser?: (userId: number) => Promise<void>;
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
  onUnblockUser,
  onPermanentDeleteUser,
  onImpersonateUser,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onSelectEvent,
  currentUser
}: AdminPanelProps) {
  const isChefe = isChefeAdmin(currentUser);
  const isFuncionario = isFuncionarioAdmin(currentUser);
  const currentAdminRole = getAdminRoleType(currentUser);

  const [activeTab, setActiveTab] = useState<"users" | "blocked" | "events">("users");
  const [viewMode, setViewMode] = useState<"table" | "cards">(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      return "cards";
    }
    return "table";
  });
  const [filterRole, setFilterRole] = useState<"all" | "aluno" | "funcionario" | "chefe" | "ativos" | "bloqueados">("all");
  const [userToViewDetails, setUserToViewDetails] = useState<User | null>(null);
  const [userForMobileActions, setUserForMobileActions] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [eventSearchTerm, setEventSearchTerm] = useState("");

  // Role modification modal state
  const [userToChangeRole, setUserToChangeRole] = useState<User | null>(null);
  const [selectedRoleOption, setSelectedRoleOption] = useState<"chefe" | "funcionario" | "user">("user");
  const [isSavingRole, setIsSavingRole] = useState(false);

  // User edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    nome: "",
    email: "",
    role: "Aluno",
    phone: "",
    institution: "",
    isAdmin: false,
    ativo: true
  });
  const [isSavingUser, setIsSavingUser] = useState(false);

  // User block/unblock/delete modal states
  const [userToBlock, setUserToBlock] = useState<User | null>(null);
  const [isBlocking, setIsBlocking] = useState(false);
  const [userToUnblock, setUserToUnblock] = useState<User | null>(null);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userToPermanentDelete, setUserToPermanentDelete] = useState<User | null>(null);
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false);

  // Event modal states
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "free" | "paid">("all");

  const [eventFormData, setEventFormData] = useState({
    title: "",
    location: "Escola Estadual Helena Wysocki - Pátio Principal",
    day: new Date().getDate(),
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    time: "14:00",
    isPaid: false,
    price: "",
    requirements: "Aberto para todos os alunos e comunidade escolar",
    website: "",
    image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
  });

  // Filtered lists
  const filteredUsers = usersList.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchesTerm =
      !term ||
      (u.nome && u.nome.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.role && u.role.toLowerCase().includes(term)) ||
      (u.institution && u.institution.toLowerCase().includes(term));
    if (!matchesTerm) return false;

    if (filterRole === "aluno") {
      return !isChefeAdmin(u) && !isFuncionarioAdmin(u);
    }
    if (filterRole === "funcionario") {
      return isFuncionarioAdmin(u);
    }
    if (filterRole === "chefe") {
      return isChefeAdmin(u);
    }
    if (filterRole === "ativos") {
      return u.ativo !== false;
    }
    if (filterRole === "bloqueados") {
      return u.ativo === false;
    }
    return true;
  });

  const activeUsers = filteredUsers.filter((u) => u.ativo !== false);
  const blockedUsers = filteredUsers.filter((u) => u.ativo === false);

  const filteredEvents = events.filter((ev) => {
    const term = eventSearchTerm.toLowerCase();
    const matchesTerm =
      ev.title.toLowerCase().includes(term) ||
      ev.location.toLowerCase().includes(term) ||
      (ev.requirements && ev.requirements.toLowerCase().includes(term));
    if (!matchesTerm) return false;
    if (eventFilter === "free") return !ev.isPaid;
    if (eventFilter === "paid") return !!ev.isPaid;
    return true;
  });

  // ================= ACTION HANDLERS =================

  // Open Change Role Modal
  const handleOpenChangeRoleModal = (u: User) => {
    setUserToChangeRole(u);
    if (isChefeAdmin(u)) {
      setSelectedRoleOption("chefe");
    } else if (isFuncionarioAdmin(u)) {
      setSelectedRoleOption("funcionario");
    } else {
      setSelectedRoleOption("user");
    }
  };

  // Confirm Change Role
  const handleConfirmChangeRole = async () => {
    if (!userToChangeRole) return;
    const isTargetMe =
      currentUser?.id === userToChangeRole.id ||
      (currentUser?.email &&
        userToChangeRole.email &&
        currentUser.email.toLowerCase() === userToChangeRole.email.toLowerCase());

    if (isTargetMe && selectedRoleOption !== "chefe") {
      alert("Você não pode rebaixar seu próprio acesso de Chefe Administrador.");
      return;
    }

    try {
      setIsSavingRole(true);
      let payloadRole = "Aluno";
      let payloadIsAdmin = false;

      if (selectedRoleOption === "chefe") {
        payloadRole = "Diretor";
        payloadIsAdmin = true;
      } else if (selectedRoleOption === "funcionario") {
        payloadRole = "Funcionário";
        payloadIsAdmin = false;
      } else {
        payloadRole = "Aluno";
        payloadIsAdmin = false;
      }

      await onUpdateUser(userToChangeRole.id, {
        role: payloadRole,
        isAdmin: payloadIsAdmin,
        email: userToChangeRole.email,
        nome: userToChangeRole.nome,
        uid: userToChangeRole.uid,
        institution: userToChangeRole.institution,
        ativo: userToChangeRole.ativo !== false
      });
      setUserToChangeRole(null);
    } catch (err) {
      console.error("Falha ao atualizar permissões do usuário:", err);
    } finally {
      setIsSavingRole(false);
    }
  };

  // Open Edit Profile Modal
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

  // Save Edit Profile
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setIsSavingUser(true);
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
    } catch (err) {
      console.warn("Falha ao salvar edição do usuário:", err);
    } finally {
      setIsSavingUser(false);
    }
  };

  // Block Account Handler
  const handleOpenBlockModal = (u: User) => {
    const isTargetMe =
      currentUser?.id === u.id ||
      (currentUser?.email &&
        u.email &&
        currentUser.email.toLowerCase() === u.email.toLowerCase());

    if (isTargetMe) {
      alert("Você não pode bloquear sua própria conta ativa.");
      return;
    }
    setUserToBlock(u);
  };

  const confirmBlockUser = async () => {
    if (!userToBlock) return;
    try {
      setIsBlocking(true);
      await onDeleteUser(userToBlock.id);
      setUserToBlock(null);
    } catch (err) {
      console.error("Falha ao bloquear conta do usuário:", err);
    } finally {
      setIsBlocking(false);
    }
  };

  // Unblock Account Handler
  const confirmUnblockUser = async () => {
    if (!userToUnblock || !onUnblockUser) return;
    try {
      setIsUnblocking(true);
      await onUnblockUser(userToUnblock.id);
      setUserToUnblock(null);
    } catch (err) {
      console.error("Falha ao desbloquear conta do usuário:", err);
    } finally {
      setIsUnblocking(false);
    }
  };

  // Delete User Handler (soft delete / suspend)
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      setIsDeletingUser(true);
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    } catch (err) {
      console.error("Falha ao excluir usuário:", err);
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Permanent Delete User Handler (DB removal)
  const confirmPermanentDeleteUser = async () => {
    if (!userToPermanentDelete || !onPermanentDeleteUser) return;
    try {
      setIsPermanentDeleting(true);
      await onPermanentDeleteUser(userToPermanentDelete.id);
      setUserToPermanentDelete(null);
    } catch (err) {
      console.error("Falha ao excluir definitivamente o usuário:", err);
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  // Event Handlers
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
      setIsSavingEvent(true);
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
    } catch (err) {
      console.error("Erro ao criar novo evento:", err);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleSaveEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !onUpdateEvent) return;
    try {
      setIsSavingEvent(true);
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
    } catch (err) {
      console.error("Erro ao atualizar evento:", err);
    } finally {
      setIsSavingEvent(false);
    }
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete || !onDeleteEvent) return;
    try {
      setIsDeletingEvent(true);
      await onDeleteEvent(eventToDelete.id);
      setEventToDelete(null);
    } catch (err) {
      console.error("Erro ao excluir evento:", err);
    } finally {
      setIsDeletingEvent(false);
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
      className="flex flex-col flex-1 h-full min-h-0 admin-scrollable overflow-y-auto overflow-x-hidden pb-56 sm:pb-44 text-brand-text-light dark:text-brand-text-dark bg-brand-bg-light dark:bg-brand-bg-dark transition-colors scroll-smooth overscroll-contain"
    >
      {/* Top Bar / Header */}
      <div className="border-b border-brand-primary/10 dark:border-white/10 bg-brand-bg-light/90 dark:bg-brand-bg-dark/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="max-w-6xl mx-auto w-full p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="text-brand-accent dark:text-brand-primary shrink-0" size={24} />
                  Painel de Controle Escolar
                </h1>

                {/* Role Badge Indicator */}
                {isChefe ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 shadow-2xs">
                    <Crown size={13} className="text-amber-600 dark:text-amber-400" />
                    <span>Chefe Administrador (Controle Total)</span>
                  </span>
                ) : isFuncionario ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/80 shadow-2xs">
                    <ShieldCheck size={13} className="text-blue-600 dark:text-blue-400" />
                    <span>Funcionário Administrador (Gestão de Eventos)</span>
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {isChefe
                  ? "Acesso irrestrito: você pode gerenciar contas, alterar níveis de permissão, bloquear/desbloquear e editar todos os eventos."
                  : "Acesso administrativo restrito: você pode consultar todo o diretório escolar e cadastrar novos eventos na agenda."}
              </p>
            </div>

            {/* Main Tabs (Ativos, Bloqueados, Eventos) */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-black/30 p-1 rounded-2xl border border-slate-200 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("users")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "users"
                    ? "bg-white dark:bg-brand-card-dark text-brand-accent dark:text-brand-primary shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Users size={14} />
                <span>Ativos ({activeUsers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("blocked")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "blocked"
                    ? "bg-red-500 text-white shadow-xs font-bold"
                    : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
                }`}
              >
                <Lock size={14} />
                <span>Bloqueados ({blockedUsers.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("events")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "events"
                    ? "bg-white dark:bg-brand-card-dark text-brand-accent dark:text-brand-primary shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Calendar size={14} />
                <span>Eventos ({events.length})</span>
              </button>
            </div>
          </div>

          {/* Search & Secondary Action Bar */}
          {activeTab !== "events" ? (
            <>
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={
                      activeTab === "blocked"
                        ? "Pesquisar contas bloqueadas por nome ou e-mail..."
                        : "Pesquisar usuários por nome, e-mail, permissão ou instituição..."
                    }
                    className="w-full h-10 pl-10 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/20 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark placeholder-slate-400 shadow-2xs"
                  />
                </div>

                {/* View Switcher (Table vs Cards) */}
                <div className="flex items-center gap-1 bg-white dark:bg-brand-card-dark p-1 rounded-xl border border-brand-primary/20 dark:border-white/10 shadow-2xs shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === "table"
                        ? "bg-brand-primary/20 dark:bg-brand-primary/30 text-brand-accent dark:text-brand-primary font-bold shadow-2xs"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    }`}
                    title="Visualizar em Formato de Tabela"
                  >
                    <TableIcon size={14} />
                    <span>Tabela</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      viewMode === "cards"
                        ? "bg-brand-primary/20 dark:bg-brand-primary/30 text-brand-accent dark:text-brand-primary font-bold shadow-2xs"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
                    }`}
                    title="Visualizar em Formato de Cartões"
                  >
                    <LayoutGrid size={14} />
                    <span>Cartões</span>
                  </button>
                </div>
              </div>

              {/* Mobile & Touch Quick Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-3 scrollbar-none w-full select-none text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0 mr-1 flex items-center gap-1">
                  <Filter size={11} /> Filtros:
                </span>
                {[
                  { id: "all", label: "Todos", count: usersList.length },
                  { id: "aluno", label: "Alunos", count: usersList.filter((u) => !isChefeAdmin(u) && !isFuncionarioAdmin(u)).length },
                  { id: "funcionario", label: "Funcionários ADM", count: usersList.filter((u) => isFuncionarioAdmin(u)).length },
                  { id: "chefe", label: "Chefes ADM", count: usersList.filter((u) => isChefeAdmin(u)).length },
                  { id: "ativos", label: "Ativos", count: usersList.filter((u) => u.ativo !== false).length },
                  { id: "bloqueados", label: "Bloqueados", count: usersList.filter((u) => u.ativo === false).length },
                ].map((chip) => {
                  const isSelected = filterRole === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        setFilterRole(chip.id as any);
                        if (chip.id === "bloqueados") {
                          setActiveTab("blocked");
                        } else if (activeTab === "blocked" && chip.id !== "bloqueados") {
                          setActiveTab("users");
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full shrink-0 font-medium transition-all text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                        isSelected
                          ? "bg-brand-accent dark:bg-brand-primary text-white dark:text-slate-900 font-bold shadow-2xs"
                          : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                      }`}
                    >
                      <span>{chip.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          isSelected ? "bg-black/20 text-white dark:text-slate-900" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={eventSearchTerm}
                  onChange={(e) => setEventSearchTerm(e.target.value)}
                  placeholder="Pesquisar eventos por título, local ou detalhes..."
                  className="w-full h-10 pl-10 pr-4 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/20 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark placeholder-slate-400 shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <select
                  value={eventFilter}
                  onChange={(e: any) => setEventFilter(e.target.value)}
                  className="h-10 px-3 text-xs bg-white dark:bg-brand-card-dark border border-brand-primary/20 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent text-brand-text-light dark:text-brand-text-dark"
                >
                  <option value="all">Todos os Eventos</option>
                  <option value="free">Apenas Gratuitos</option>
                  <option value="paid">Apenas Pagos</option>
                </select>

                <button
                  type="button"
                  onClick={handleOpenAddEventModal}
                  className="h-10 px-4 bg-brand-accent hover:bg-brand-accent/90 dark:bg-brand-primary dark:text-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-2 active:scale-98 transition-all shadow-xs cursor-pointer shrink-0"
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
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex flex-col gap-4">
        {/* ================= ACTIVE USERS TAB ================= */}
        {activeTab === "users" && (
          <>
            {/* Info notice banner */}
            <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-2xs">
              <CheckCircle2 className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                <p className="font-semibold">Diretório de Usuários Ativos da Escola Helena Wysocki:</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {isChefe
                    ? "Como Chefe Administrador, você possui permissão total para alterar permissões, editar dados cadastrais, suspender ou excluir contas."
                    : "Como Funcionário Administrador, você tem acesso de consulta ao diretório completo para suporte escolar aos estudantes e responsáveis."}
                </p>
              </div>
            </div>

            {activeUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-300 dark:border-white/10 p-8">
                <Users size={40} className="text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Nenhum usuário ativo encontrado.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Verifique o termo digitado na barra de pesquisa acima.
                </p>
              </div>
            ) : viewMode === "table" ? (
              /* ================= TABLE VIEW ================= */
              <div className="bg-white dark:bg-brand-card-dark rounded-2xl border border-brand-primary/20 dark:border-white/10 shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/90 dark:bg-black/25 border-b border-slate-100 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold select-none">
                        <th className="py-3.5 px-4">Nome & Identificação</th>
                        <th className="py-3.5 px-4">E-mail</th>
                        <th className="py-3.5 px-4">Tipo / Permissão</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4">Última Atividade</th>
                        <th className="py-3.5 px-4 text-right">
                          {isChefe ? "Ações Administrativas" : "Permissão"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {activeUsers.map((u) => {
                        const isMe =
                          currentUser?.id === u.id ||
                          (currentUser?.email &&
                            u.email &&
                            currentUser.email.toLowerCase() === u.email.toLowerCase());
                        const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
                        const activity = formatLastActive(activityDate);
                        const formattedDateStr = formatDateTimeBR(activityDate);
                        const userIsChefe = isChefeAdmin(u);
                        const userIsFuncionario = isFuncionarioAdmin(u);

                        return (
                          <tr
                            key={u.id}
                            className={`hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors ${
                              isMe ? "bg-brand-primary/5 dark:bg-brand-primary/10" : ""
                            }`}
                          >
                            {/* Nome */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3 min-w-[180px]">
                                <div className="w-9 h-9 rounded-full bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-xs uppercase shrink-0 select-none overflow-hidden border border-brand-primary/30">
                                  {u.foto_perfil ? (
                                    <img
                                      src={u.foto_perfil}
                                      alt={u.nome}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    (u.nome || u.email || "U").slice(0, 1)
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                                      {u.nome || "Usuário Escolar"}
                                    </span>
                                    {isMe && (
                                      <span className="text-[10px] bg-brand-primary/30 text-brand-accent dark:text-brand-primary px-1.5 py-0.2 rounded font-bold">
                                        Você
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-400 block truncate">
                                    {u.institution || "C.E. Helena Wysocki"}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* E-mail */}
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300 min-w-[180px]">
                              {u.email}
                            </td>

                            {/* Tipo / Permissão */}
                            <td className="py-3 px-4 min-w-[160px]">
                              {userIsChefe ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/80 shadow-2xs">
                                  <Crown size={12} className="text-amber-600 dark:text-amber-400" />
                                  <span>Chefe Administrador</span>
                                </span>
                              ) : userIsFuncionario ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 shadow-2xs">
                                  <ShieldCheck size={12} className="text-blue-600 dark:text-blue-400" />
                                  <span>Funcionário Administrador</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  <UserIcon size={12} className="text-slate-400" />
                                  <span>{u.role || "Aluno / Usuário"}</span>
                                </span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-center min-w-[100px]">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Ativo</span>
                              </span>
                            </td>

                            {/* Última Atividade */}
                            <td className="py-3 px-4 min-w-[160px]">
                              <div className="flex flex-col text-[11px]">
                                <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                                  <Clock size={11} className="text-slate-400" />
                                  <span>{activity.text}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                  {formattedDateStr}
                                </span>
                              </div>
                            </td>

                            {/* Ações */}
                            <td className="py-3 px-4 text-right min-w-[180px]">
                              {isChefe ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Alterar Permissão */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenChangeRoleModal(u)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[11px] font-semibold border border-amber-200 dark:border-amber-800/60 transition-colors flex items-center gap-1 cursor-pointer"
                                    title="Alterar permissão entre Chefe, Funcionário ou Aluno"
                                  >
                                    <Crown size={12} />
                                    <span>Permissão</span>
                                  </button>

                                  {/* Editar Dados */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(u)}
                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] transition-colors cursor-pointer"
                                    title="Editar dados cadastrais"
                                  >
                                    <Edit3 size={13} />
                                  </button>

                                  {/* Bloquear Conta */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBlockModal(u)}
                                    disabled={isMe}
                                    className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 disabled:opacity-30 transition-colors cursor-pointer"
                                    title={isMe ? "Você não pode bloquear sua própria conta" : "Bloquear acesso desta conta"}
                                  >
                                    <Lock size={13} />
                                  </button>

                                  {/* Excluir Conta */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isMe) {
                                        alert("Você não pode excluir sua própria conta ativa.");
                                        return;
                                      }
                                      setUserToDelete(u);
                                    }}
                                    disabled={isMe}
                                    className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 disabled:opacity-30 transition-colors cursor-pointer"
                                    title={isMe ? "Você não pode excluir sua própria conta" : "Excluir conta escolar"}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                  <Eye size={13} />
                                  <span>Somente leitura</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* ================= CARDS VIEW ================= */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeUsers.map((u) => {
                  const isMe =
                    currentUser?.id === u.id ||
                    (currentUser?.email &&
                      u.email &&
                      currentUser.email.toLowerCase() === u.email.toLowerCase());
                  const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
                  const activity = formatLastActive(activityDate);
                  const formattedDateStr = formatDateTimeBR(activityDate);
                  const uStats = calculateRealUserStats(u.id, events);
                  const userIsChefe = isChefeAdmin(u);
                  const userIsFuncionario = isFuncionarioAdmin(u);

                  return (
                    <div
                      key={u.id}
                      className="bg-white dark:bg-brand-card-dark rounded-2xl p-4.5 border border-brand-primary/15 dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-3 relative overflow-hidden"
                    >
                      {isMe && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-brand-accent dark:bg-brand-primary" />
                      )}

                      {/* Header: 👤 Nome & E-mail */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-sm uppercase shrink-0 select-none overflow-hidden border border-brand-primary/30">
                            {u.foto_perfil ? (
                              <img
                                src={u.foto_perfil}
                                alt={u.nome}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              (u.nome || u.email || "U").slice(0, 1)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                {u.nome || "Usuário Escolar"}
                              </h4>
                              {isMe && (
                                <span className="text-[10px] bg-brand-primary/20 text-brand-accent dark:text-brand-primary px-1.5 py-0.5 rounded-md font-bold">
                                  Você
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono block truncate mt-0.5">
                              {u.email}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Tipo / Cargo & Status */}
                      <div className="space-y-2 py-2 border-y border-slate-100 dark:border-white/5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Cargo:</span>
                          {userIsChefe ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/40">
                              <Crown size={12} /> Chefe ADM
                            </span>
                          ) : userIsFuncionario ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                              <ShieldCheck size={12} /> Funcionário ADM
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5">
                              <UserIcon size={12} className="text-slate-400" />
                              {u.role || "Aluno"}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Status:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              {activity.isOnline && (
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              )}
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${u.ativo === false ? "bg-rose-500" : "bg-emerald-500"}`} />
                            </span>
                            <span className={`text-xs font-bold ${u.ativo === false ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {u.ativo === false ? "🔴 Bloqueado" : activity.isOnline ? "🟢 Ativo (Online)" : "🟢 Ativo"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stats Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="bg-slate-100 dark:bg-black/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                          <Ticket size={11} className="text-blue-500" />
                          <span>{uStats.participatedEventsCount} inscr.</span>
                        </span>
                        <span className="bg-slate-100 dark:bg-black/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                          <RouteIcon size={11} className="text-emerald-500" />
                          <span>{uStats.routesCalculatedCount} rotas</span>
                        </span>
                        <span className="bg-slate-100 dark:bg-black/30 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                          <Calendar size={11} className="text-purple-500" />
                          <span>{uStats.createdEventsCount} criados</span>
                        </span>
                      </div>

                      {/* Action buttons: [Visualizar] [Ações] */}
                      <div className="pt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setUserToViewDetails(u)}
                          className={`h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 border border-slate-200 dark:border-white/10 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 ${
                            isChefe ? "flex-1" : "w-full"
                          }`}
                          title="Visualizar ficha completa"
                        >
                          <Eye size={14} />
                          <span>Visualizar</span>
                        </button>

                        {/* [Ações] Only for Chefe Admin */}
                        {isChefe && (
                          <button
                            type="button"
                            onClick={() => setUserForMobileActions(u)}
                            className="flex-1 h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-accent dark:text-brand-primary border border-brand-primary/30 shadow-2xs"
                            title="Opções de edição, permissões e bloqueio"
                          >
                            <MoreVertical size={14} />
                            <span>Ações</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ================= BLOCKED USERS TAB ================= */}
        {activeTab === "blocked" && (
          <>
            <div className="bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
              <ShieldAlert className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
                <p className="font-semibold">Gerenciamento de Contas Bloqueadas & Suspensas:</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Estas contas estão impedidas de autenticar no portal escolar.{" "}
                  {isChefe
                    ? "Você pode restabelecer o acesso imediatamente com 1 clique ou excluir permanentemente o registro do banco de dados."
                    : "Somente o Chefe Administrador possui permissão para desbloquear ou excluir contas."}
                </p>
              </div>
            </div>

            {blockedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-300 dark:border-white/10 p-8">
                <Unlock size={44} className="text-emerald-500 mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Nenhuma conta bloqueada no momento!
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Todos os usuários cadastrados estão com acesso regular às funcionalidades do portal escolar.
                </p>
              </div>
            ) : viewMode === "table" ? (
              /* Blocked users Table */
              <div className="bg-white dark:bg-brand-card-dark rounded-2xl border border-red-200 dark:border-red-900/40 shadow-sm overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-red-50/70 dark:bg-red-950/25 border-b border-red-100 dark:border-red-900/40 text-red-900 dark:text-red-200 font-semibold select-none">
                        <th className="py-3.5 px-4">Nome & Identificação</th>
                        <th className="py-3.5 px-4">E-mail</th>
                        <th className="py-3.5 px-4">Função Original</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4">Último Acesso</th>
                        <th className="py-3.5 px-4 text-right">
                          {isChefe ? "Ações de Desbloqueio" : "Permissão"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {blockedUsers.map((u) => {
                        const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
                        const formattedDateStr = formatDateTimeBR(activityDate);

                        return (
                          <tr
                            key={u.id}
                            className="hover:bg-red-50/30 dark:hover:bg-red-950/20 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-red-200 dark:border-red-850">
                                  <Lock size={14} />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-semibold text-slate-900 dark:text-white block truncate">
                                    {u.nome || "Usuário Bloqueado"}
                                  </span>
                                  <span className="text-[11px] text-slate-400 block truncate">
                                    {u.institution || "C.E. Helena Wysocki"}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {u.email}
                            </td>

                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {u.role || "Aluno"}
                            </td>

                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                <Lock size={10} /> Bloqueado
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {formattedDateStr}
                            </td>

                            <td className="py-3 px-4 text-right">
                              {isChefe ? (
                                <div className="flex items-center justify-end gap-2">
                                  {onUnblockUser && (
                                    <button
                                      type="button"
                                      onClick={() => setUserToUnblock(u)}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                    >
                                      <Unlock size={12} />
                                      <span>Desbloquear</span>
                                    </button>
                                  )}

                                  {onPermanentDeleteUser && (
                                    <button
                                      type="button"
                                      onClick={() => setUserToPermanentDelete(u)}
                                      className="p-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-lg text-[11px] transition-all cursor-pointer border border-red-200 dark:border-red-800"
                                      title="Excluir Definitivamente do Banco"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                  Somente leitura
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Blocked Users Cards */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {blockedUsers.map((u) => {
                  const activityDate = u.lastActiveAt || u.updatedAt || u.createdAt;
                  const formattedDateStr = formatDateTimeBR(activityDate);

                  return (
                    <div
                      key={u.id}
                      className="bg-white dark:bg-brand-card-dark rounded-2xl p-5 border-2 border-red-200 dark:border-red-900/50 shadow-sm flex flex-col justify-between gap-3.5 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />

                      <div className="flex justify-between items-start gap-2 pt-1">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-sm uppercase shrink-0 border border-red-200 dark:border-red-800">
                            <Lock size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                {u.nome || "Usuário Bloqueado"}
                              </h4>
                              <span className="text-[10px] bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 px-2 py-0.5 rounded font-bold border border-red-200 dark:border-red-800">
                                Bloqueado
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono block truncate mt-0.5">
                              {u.email}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-black/30 rounded-xl border border-slate-100 dark:border-white/10 text-xs flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">Função:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {u.role || "Aluno"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-500">Instituição:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                            {u.institution || "Escola Helena Wysocki"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200/50 dark:border-white/10">
                          <span className="text-slate-500">Último Acesso:</span>
                          <span className="font-mono text-slate-600 dark:text-slate-400">
                            {formattedDateStr}
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons for Blocked Accounts */}
                      {isChefe ? (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                          {onUnblockUser && (
                            <button
                              type="button"
                              onClick={() => setUserToUnblock(u)}
                              className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                            >
                              <Unlock size={14} />
                              <span>Desbloquear</span>
                            </button>
                          )}

                          {onPermanentDeleteUser && (
                            <button
                              type="button"
                              onClick={() => setUserToPermanentDelete(u)}
                              className="h-9 px-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-red-200 dark:border-red-800"
                              title="Excluir Definitivamente do Banco de Dados"
                            >
                              <Trash2 size={14} />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-center text-[11px] text-slate-400 py-1 font-medium">
                          Apenas o Chefe Administrador pode desbloquear contas.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ================= EVENTS TAB (FOR BOTH ADMINS) ================= */}
        {activeTab === "events" && (
          <>
            <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-4 rounded-2xl flex items-start gap-3 shadow-xs">
              <Calendar className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={18} />
              <div className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                <p className="font-semibold">Gestão de Eventos da Escola Helena Wysocki:</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {isChefe
                    ? "Como Chefe Administrador, você pode criar novos eventos, editar ou excluir qualquer evento existente na agenda."
                    : "Como Funcionário Administrador, você pode cadastrar novos eventos e editar/excluir apenas os eventos criados por você mesmo."}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEvents.length === 0 ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-slate-400 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-300 dark:border-white/10 p-8">
                  <Calendar size={48} className="text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Nenhum evento encontrado na agenda.
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    Clique no botão abaixo para criar um novo evento e publicá-lo para todos os estudantes.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddEventModal}
                    className="mt-4 px-4 py-2 bg-brand-accent dark:bg-brand-primary dark:text-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-2 hover:opacity-90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus size={15} />
                    <span>Cadastrar Novo Evento Agora</span>
                  </button>
                </div>
              ) : (
                filteredEvents.map((ev) => {
                  // Permission check for modifying this event
                  const isMyEvent =
                    ev.creatorId && currentUser?.id ? ev.creatorId === currentUser.id : false;
                  const canModifyThisEvent = isChefe || (isFuncionario && isMyEvent);

                  return (
                    <div
                      key={ev.id}
                      className="bg-white dark:bg-brand-card-dark rounded-2xl border border-brand-primary/15 dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                    >
                      {/* Event Image */}
                      <div className="relative h-36 w-full bg-slate-100 dark:bg-black/30 overflow-hidden">
                        <img
                          src={
                            ev.image ||
                            "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=600&auto=format&fit=crop"
                          }
                          alt={ev.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                        {/* Price Badge */}
                        <div className="absolute top-2.5 left-2.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs ${
                              ev.isPaid ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
                            }`}
                          >
                            {ev.isPaid ? (ev.price ? `R$ ${ev.price}` : "Pago") : "Gratuito"}
                          </span>
                        </div>

                        {/* Creator tag if employee */}
                        {isMyEvent && (
                          <div className="absolute top-2.5 right-2.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-600/90 text-white shadow-xs">
                              Seu Evento
                            </span>
                          </div>
                        )}

                        {/* Date Badge */}
                        <div className="absolute bottom-2.5 left-2.5 text-white">
                          <div className="flex items-center gap-1.5 text-xs font-bold drop-shadow-md">
                            <Calendar size={13} />
                            <span>
                              {ev.day} de {monthNames[ev.month] || "Mês"} de {ev.year} •{" "}
                              {ev.time || "14:00"}
                            </span>
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
                            <MapPin size={13} className="text-brand-accent dark:text-brand-primary shrink-0" />
                            <span className="truncate">{ev.location}</span>
                          </div>

                          {ev.requirements && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 bg-slate-50 dark:bg-black/20 p-2 rounded-lg border border-slate-100 dark:border-white/5">
                              {ev.requirements}
                            </p>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-white/10">
                          {onSelectEvent && (
                            <button
                              type="button"
                              onClick={() => onSelectEvent(ev)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Info size={13} />
                              <span>Ver</span>
                            </button>
                          )}

                          {canModifyThisEvent ? (
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
                          ) : (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium ml-auto flex items-center gap-1">
                              <Lock size={11} />
                              <span>Criado por outro admin</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ================= MODALS ================= */}

      {/* MODAL 1: Alterar Nível de Permissão (Chefe Admin Only) */}
      <AnimatePresence>
        {userToChangeRole && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 flex flex-col gap-4 my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                    <Crown size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Alterar Nível de Permissão
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {userToChangeRole.nome || userToChangeRole.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSavingRole && setUserToChangeRole(null)}
                  disabled={isSavingRole}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Selecione o nível de privilégio que deseja atribuir a este usuário no banco escolar:
              </div>

              {/* Role Selection Options */}
              <div className="flex flex-col gap-2.5">
                {/* Option 1: Chefe Administrador */}
                <label
                  onClick={() => setSelectedRoleOption("chefe")}
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    selectedRoleOption === "chefe"
                      ? "border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 shadow-xs ring-1 ring-amber-500"
                      : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleOption"
                    value="chefe"
                    checked={selectedRoleOption === "chefe"}
                    onChange={() => setSelectedRoleOption("chefe")}
                    className="mt-1 accent-amber-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-200">
                      <Crown size={14} className="text-amber-500" />
                      <span>Chefe Administrador</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Controle total: pode gerenciar usuários, alterar permissões, bloquear contas e editar/excluir todos os eventos.
                    </p>
                  </div>
                </label>

                {/* Option 2: Funcionário Administrador */}
                <label
                  onClick={() => setSelectedRoleOption("funcionario")}
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    selectedRoleOption === "funcionario"
                      ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 shadow-xs ring-1 ring-blue-500"
                      : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleOption"
                    value="funcionario"
                    checked={selectedRoleOption === "funcionario"}
                    onChange={() => setSelectedRoleOption("funcionario")}
                    className="mt-1 accent-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900 dark:text-blue-200">
                      <ShieldCheck size={14} className="text-blue-500" />
                      <span>Funcionário Administrador</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Acesso intermediário: visualiza o diretório escolar completo e cadastra/gerencia seus próprios eventos.
                    </p>
                  </div>
                </label>

                {/* Option 3: Usuário Comum / Aluno */}
                <label
                  onClick={() => setSelectedRoleOption("user")}
                  className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                    selectedRoleOption === "user"
                      ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 shadow-xs ring-1 ring-emerald-500"
                      : "border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="roleOption"
                    value="user"
                    checked={selectedRoleOption === "user"}
                    onChange={() => setSelectedRoleOption("user")}
                    className="mt-1 accent-emerald-500"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200">
                      <UserIcon size={14} className="text-slate-500" />
                      <span>Usuário Comum (Aluno / Responsável)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Acesso padrão ao feed e calendário de eventos sem privilégios administrativos.
                    </p>
                  </div>
                </label>
              </div>

              {/* Actions with Anti-Double-Click debounce state */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setUserToChangeRole(null)}
                  disabled={isSavingRole}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmChangeRole}
                  disabled={isSavingRole}
                  className="flex-1 h-10 rounded-xl bg-brand-accent hover:bg-brand-accent/90 dark:bg-brand-primary dark:text-slate-900 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isSavingRole ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Salvando no Banco...</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Salvar Permissão</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Bloquear Conta de Usuário */}
      <AnimatePresence>
        {userToBlock && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
                <Lock size={24} />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Bloquear Acesso Escolar?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja bloquear a conta de{" "}
                  <strong>{userToBlock.nome || userToBlock.email}</strong>? O usuário será impedido de entrar no sistema até ser desbloqueado por um Chefe Administrador.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToBlock(null)}
                  disabled={isBlocking}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmBlockUser}
                  disabled={isBlocking}
                  className="flex-1 h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isBlocking ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Bloqueando...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={14} />
                      <span>Sim, Bloquear</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Desbloquear Conta */}
      <AnimatePresence>
        {userToUnblock && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <Unlock size={24} />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Desbloquear Acesso Escolar?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Deseja restabelecer o acesso de{" "}
                  <strong>{userToUnblock.nome || userToUnblock.email}</strong>? Ele poderá entrar novamente no portal escolar imediatamente.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToUnblock(null)}
                  disabled={isUnblocking}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmUnblockUser}
                  disabled={isUnblocking}
                  className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isUnblocking ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Desbloqueando...</span>
                    </>
                  ) : (
                    <>
                      <Unlock size={14} />
                      <span>Sim, Desbloquear</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: Excluir Usuário (Soft Delete) */}
      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir / Suspender Conta?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja desativar a conta de{" "}
                  <strong>{userToDelete.nome || userToDelete.email}</strong>? A conta será movida para a aba de contas suspensas.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToDelete(null)}
                  disabled={isDeletingUser}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  disabled={isDeletingUser}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isDeletingUser ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Sim, Excluir</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: Exclusão Definitiva (Permanent Delete from DB) */}
      <AnimatePresence>
        {userToPermanentDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-red-200 dark:border-red-900/50 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto border border-red-200 dark:border-red-800">
                <Trash2 size={24} />
              </div>

              <div>
                <h3 className="text-base font-bold text-red-600 dark:text-red-400">
                  Excluir Definitivamente?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  ATENÇÃO: A conta de{" "}
                  <strong>{userToPermanentDelete.nome || userToPermanentDelete.email}</strong> será{" "}
                  <strong>removida permanentemente</strong> do banco de dados (Supabase / local). Esta ação não pode ser desfeita!
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserToPermanentDelete(null)}
                  disabled={isPermanentDeleting}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmPermanentDeleteUser}
                  disabled={isPermanentDeleting}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isPermanentDeleting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Excluir Definitivo</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 6: Excluir Evento */}
      <AnimatePresence>
        {eventToDelete && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 flex flex-col gap-4 text-center my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Excluir Evento da Agenda?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Tem certeza que deseja remover o evento <strong>"{eventToDelete.title}"</strong> da agenda da escola?
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEventToDelete(null)}
                  disabled={isDeletingEvent}
                  className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={confirmDeleteEvent}
                  disabled={isDeletingEvent}
                  className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {isDeletingEvent ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Sim, Excluir</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 7: Editar Usuário Completo */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative text-slate-800 dark:text-slate-100 my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold">
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Modificar Dados Cadastrais
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ID: {editingUser.id} • {editingUser.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSavingUser && setEditingUser(null)}
                  disabled={isSavingUser}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
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
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
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
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
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
                      className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Função / Cargo
                    </label>
                    <select
                      value={editFormData.role}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                      className="w-full h-10 px-2 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    >
                      <option value="Aluno">Aluno</option>
                      <option value="Professor">Professor</option>
                      <option value="Diretor">Diretor</option>
                      <option value="Funcionário">Funcionário</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2 border-t border-slate-100 dark:border-white/10">
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

                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    disabled={isSavingUser}
                    className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="px-5 h-10 rounded-xl bg-brand-accent hover:bg-brand-accent/90 dark:bg-brand-primary dark:text-slate-900 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSavingUser ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Salvar Modificações</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 8: Cadastrar Novo Evento */}
      <AnimatePresence>
        {isAddingEvent && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative text-slate-800 dark:text-slate-100 my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-accent text-white flex items-center justify-center font-bold">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Cadastrar Novo Evento
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      O evento será publicado no Feed e no Calendário Escolar
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSavingEvent && setIsAddingEvent(false)}
                  disabled={isSavingEvent}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveNewEvent} className="flex flex-col gap-3 mt-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Título do Evento *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventFormData.title}
                    onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                    placeholder="Ex: Feira de Ciências 2026, Festa Junina..."
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Localização / Endereço *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventFormData.location}
                    onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Dia
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      required
                      value={eventFormData.day}
                      onChange={(e) => setEventFormData({ ...eventFormData, day: Number(e.target.value) })}
                      className="w-full h-10 px-2 text-xs text-center bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Mês
                    </label>
                    <select
                      value={eventFormData.month}
                      onChange={(e) => setEventFormData({ ...eventFormData, month: Number(e.target.value) })}
                      className="w-full h-10 px-2 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    >
                      {monthNames.map((m, idx) => (
                        <option key={idx} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Horário
                    </label>
                    <input
                      type="text"
                      required
                      value={eventFormData.time}
                      onChange={(e) => setEventFormData({ ...eventFormData, time: e.target.value })}
                      placeholder="14:00"
                      className="w-full h-10 px-2 text-xs text-center bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={eventFormData.isPaid}
                      onChange={(e) => setEventFormData({ ...eventFormData, isPaid: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Evento Pago</span>
                  </label>

                  {eventFormData.isPaid && (
                    <input
                      type="text"
                      placeholder="Valor (ex: 15,00)"
                      value={eventFormData.price}
                      onChange={(e) => setEventFormData({ ...eventFormData, price: e.target.value })}
                      className="flex-1 h-9 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Descrição & Requisitos
                  </label>
                  <textarea
                    rows={2}
                    value={eventFormData.requirements}
                    onChange={(e) => setEventFormData({ ...eventFormData, requirements: e.target.value })}
                    className="w-full p-2.5 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsAddingEvent(false)}
                    disabled={isSavingEvent}
                    className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingEvent}
                    className="px-5 h-10 rounded-xl bg-brand-accent hover:bg-brand-accent/90 dark:bg-brand-primary dark:text-slate-900 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSavingEvent ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Publicando...</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Publicar Evento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 9: Editar Evento */}
      <AnimatePresence>
        {editingEvent && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/10 relative text-slate-800 dark:text-slate-100 my-auto max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Editar Evento Escolar
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      ID: {editingEvent.id} • {editingEvent.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSavingEvent && setEditingEvent(null)}
                  disabled={isSavingEvent}
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEditEvent} className="flex flex-col gap-3 mt-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Título do Evento *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventFormData.title}
                    onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Localização *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventFormData.location}
                    onChange={(e) => setEventFormData({ ...eventFormData, location: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Dia
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      required
                      value={eventFormData.day}
                      onChange={(e) => setEventFormData({ ...eventFormData, day: Number(e.target.value) })}
                      className="w-full h-10 px-2 text-xs text-center bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Mês
                    </label>
                    <select
                      value={eventFormData.month}
                      onChange={(e) => setEventFormData({ ...eventFormData, month: Number(e.target.value) })}
                      className="w-full h-10 px-2 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    >
                      {monthNames.map((m, idx) => (
                        <option key={idx} value={idx}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Horário
                    </label>
                    <input
                      type="text"
                      required
                      value={eventFormData.time}
                      onChange={(e) => setEventFormData({ ...eventFormData, time: e.target.value })}
                      className="w-full h-10 px-2 text-xs text-center bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={eventFormData.isPaid}
                      onChange={(e) => setEventFormData({ ...eventFormData, isPaid: e.target.checked })}
                      className="w-4 h-4 rounded accent-brand-accent"
                    />
                    <span>Evento Pago</span>
                  </label>

                  {eventFormData.isPaid && (
                    <input
                      type="text"
                      placeholder="Valor"
                      value={eventFormData.price}
                      onChange={(e) => setEventFormData({ ...eventFormData, price: e.target.value })}
                      className="flex-1 h-9 px-3 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none"
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Descrição & Requisitos
                  </label>
                  <textarea
                    rows={2}
                    value={eventFormData.requirements}
                    onChange={(e) => setEventFormData({ ...eventFormData, requirements: e.target.value })}
                    className="w-full p-2.5 text-xs bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-100 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    disabled={isSavingEvent}
                    className="px-4 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingEvent}
                    className="px-5 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isSavingEvent ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        <span>Salvar Modificações</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {/* MODAL: Visualizar Detalhes do Usuário (Consulta Read-Only para Chefe e Funcionário) */}
        {userToViewDetails && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-brand-card-dark rounded-3xl p-5 sm:p-6 w-full max-w-md border border-brand-primary/20 dark:border-white/10 shadow-2xl relative my-auto max-h-[90vh] flex flex-col"
            >
              <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary">
                    <UserIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      Ficha Cadastral
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Informações completas do usuário
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUserToViewDetails(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 py-4 overflow-y-auto pr-1">
                {/* User Avatar + Identity */}
                <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-black/30 border border-slate-100 dark:border-white/5">
                  <div className="w-14 h-14 rounded-2xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-lg uppercase shrink-0 overflow-hidden border border-brand-primary/30">
                    {userToViewDetails.foto_perfil ? (
                      <img
                        src={userToViewDetails.foto_perfil}
                        alt={userToViewDetails.nome}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (userToViewDetails.nome || userToViewDetails.email || "U").slice(0, 1)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-base text-slate-900 dark:text-white truncate">
                      {userToViewDetails.nome || "Usuário Escolar"}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                      {userToViewDetails.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {isChefeAdmin(userToViewDetails) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          <Crown size={11} /> Chefe ADM
                        </span>
                      ) : isFuncionarioAdmin(userToViewDetails) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                          <ShieldCheck size={11} /> Funcionário ADM
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                          <UserIcon size={11} /> {userToViewDetails.role || "Aluno"}
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          userToViewDetails.ativo === false
                            ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                            : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {userToViewDetails.ativo === false ? "🔴 Bloqueado" : "🟢 Ativo"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Profile Fields */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 size={13} /> Instituição:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right max-w-[200px] truncate">
                      {userToViewDetails.institution || "Escola Estadual Helena Wysocki"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Phone size={13} /> Telefone:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                      {userToViewDetails.phone || "Não cadastrado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock size={13} /> Última Atividade:
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                      {formatDateTimeBR(userToViewDetails.lastActiveAt || userToViewDetails.updatedAt || userToViewDetails.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Real Usage Stats */}
                {(() => {
                  const s = calculateRealUserStats(userToViewDetails.id, events);
                  return (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30 text-center">
                        <div className="text-base font-bold text-blue-700 dark:text-blue-300 font-mono">
                          {s.participatedEventsCount}
                        </div>
                        <div className="text-[10px] text-blue-600 dark:text-blue-400">Inscrições</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 text-center">
                        <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                          {s.routesCalculatedCount}
                        </div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Rotas</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/30 text-center">
                        <div className="text-base font-bold text-purple-700 dark:text-purple-300 font-mono">
                          {s.createdEventsCount}
                        </div>
                        <div className="text-[10px] text-purple-600 dark:text-purple-400">Criados</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex items-center gap-2 shrink-0">
                {isChefe && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = userToViewDetails;
                      setUserToViewDetails(null);
                      setUserForMobileActions(target);
                    }}
                    className="flex-1 h-11 rounded-2xl bg-brand-accent dark:bg-brand-primary text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                  >
                    <MoreVertical size={15} />
                    <span>Ações Administrativas</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setUserToViewDetails(null)}
                  className={`h-11 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                    isChefe ? "px-5" : "w-full"
                  }`}
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* MODAL: Menu de Ações Administrativas Mobile (Exclusivo para CHEFE_ADMIN) */}
        {userForMobileActions && isChefe && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-white dark:bg-brand-card-dark rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md border-t sm:border border-brand-primary/20 dark:border-white/10 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/20 text-brand-accent dark:text-brand-primary flex items-center justify-center font-bold text-sm uppercase">
                    {(userForMobileActions.nome || userForMobileActions.email || "U").slice(0, 1)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {userForMobileActions.nome || "Usuário"}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                      {userForMobileActions.email}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUserForMobileActions(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action Buttons List */}
              <div className="space-y-2 py-4">
                {/* 1. Alterar Administrador / Nível */}
                <button
                  type="button"
                  onClick={() => {
                    const u = userForMobileActions;
                    setUserForMobileActions(null);
                    handleOpenChangeRoleModal(u);
                  }}
                  className="w-full p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/50 flex items-center gap-3 text-left transition-all cursor-pointer active:scale-98"
                >
                  <div className="p-2 rounded-xl bg-amber-200/60 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 shrink-0">
                    <Crown size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold">Alterar Administrador / Cargo</div>
                    <div className="text-[11px] text-amber-700/80 dark:text-amber-400">
                      Promover ou rebaixar entre Chefe, Funcionário e Aluno
                    </div>
                  </div>
                </button>

                {/* 2. Editar Dados Cadastrais */}
                <button
                  type="button"
                  onClick={() => {
                    const u = userForMobileActions;
                    setUserForMobileActions(null);
                    handleOpenEditModal(u);
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 flex items-center gap-3 text-left transition-all cursor-pointer active:scale-98"
                >
                  <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 shrink-0">
                    <Edit3 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold">Editar Dados Cadastrais</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Alterar nome, e-mail, telefone ou instituição
                    </div>
                  </div>
                </button>

                {/* 3. Bloquear / Desbloquear Usuário */}
                <button
                  type="button"
                  onClick={() => {
                    const u = userForMobileActions;
                    setUserForMobileActions(null);
                    if (u.ativo === false) {
                      setUserToUnblock(u);
                    } else {
                      handleOpenBlockModal(u);
                    }
                  }}
                  disabled={
                    currentUser?.id === userForMobileActions.id ||
                    (currentUser?.email &&
                      userForMobileActions.email &&
                      currentUser.email.toLowerCase() === userForMobileActions.email.toLowerCase())
                  }
                  className="w-full p-3.5 rounded-2xl bg-orange-50/80 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800/50 flex items-center gap-3 text-left transition-all cursor-pointer active:scale-98 disabled:opacity-40"
                >
                  <div className="p-2 rounded-xl bg-orange-200/60 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 shrink-0">
                    {userForMobileActions.ativo === false ? <Unlock size={18} /> : <Lock size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold">
                      {userForMobileActions.ativo === false ? "Desbloquear Conta" : "Bloquear Usuário"}
                    </div>
                    <div className="text-[11px] text-orange-700/80 dark:text-orange-400">
                      {userForMobileActions.ativo === false
                        ? "Restaurar acesso e permissões"
                        : "Suspender temporariamente o acesso do usuário"}
                    </div>
                  </div>
                </button>

                {/* 4. Excluir Usuário */}
                <button
                  type="button"
                  onClick={() => {
                    const u = userForMobileActions;
                    setUserForMobileActions(null);
                    setUserToDelete(u);
                  }}
                  disabled={
                    currentUser?.id === userForMobileActions.id ||
                    (currentUser?.email &&
                      userForMobileActions.email &&
                      currentUser.email.toLowerCase() === userForMobileActions.email.toLowerCase())
                  }
                  className="w-full p-3.5 rounded-2xl bg-red-50/80 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800/50 flex items-center gap-3 text-left transition-all cursor-pointer active:scale-98 disabled:opacity-40"
                >
                  <div className="p-2 rounded-xl bg-red-200/60 dark:bg-red-900/60 text-red-700 dark:text-red-300 shrink-0">
                    <Trash2 size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold">Excluir Usuário</div>
                    <div className="text-[11px] text-red-700/80 dark:text-red-400">
                      Remover este usuário do sistema
                    </div>
                  </div>
                </button>

                {/* 5. Impersonate (se configurado) */}
                {onImpersonateUser &&
                  currentUser?.id !== userForMobileActions.id &&
                  currentUser?.email?.toLowerCase() !== userForMobileActions.email?.toLowerCase() && (
                    <button
                      type="button"
                      onClick={() => {
                        const u = userForMobileActions;
                        setUserForMobileActions(null);
                        onImpersonateUser(u);
                      }}
                      className="w-full p-3.5 rounded-2xl bg-brand-primary/15 hover:bg-brand-primary/25 text-brand-accent dark:text-brand-primary border border-brand-primary/30 flex items-center gap-3 text-left transition-all cursor-pointer active:scale-98"
                    >
                      <div className="p-2 rounded-xl bg-brand-primary/30 text-brand-accent dark:text-brand-primary shrink-0">
                        <LogIn size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold">Entrar nesta Conta (Impersonar)</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Navegar no app visualizando exatamente o que este aluno vê
                        </div>
                      </div>
                    </button>
                  )}
              </div>

              {/* Cancel Button */}
              <div className="pt-2 border-t border-slate-100 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setUserForMobileActions(null)}
                  className="w-full h-11 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
