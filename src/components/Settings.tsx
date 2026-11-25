import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getUserDisplayName, getUserInitials, isGuestSession } from "../lib/userDisplay.ts";
import { listarParticipacoes } from "../lib/participationsService.ts";
import { 
  User, 
  Bell, 
  Palette, 
  MessageSquare, 
  ChevronRight, 
  ArrowLeft, 
  Save, 
  LogOut, 
  Database, 
  Server, 
  Camera, 
  Upload, 
  Moon, 
  Sun,
  Ticket,
  Calendar,
  Route as RouteIcon,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  BellRing,
  CreditCard,
  Scale,
  X
} from "lucide-react";
import { SCHOOLS_LIST } from "../lib/schools.ts";
import { Event } from "../types.ts";
import { calculateRealUserStats } from "../lib/userStats.ts";
import { isChefeAdmin, isFuncionarioAdmin, isPlatformOwner } from "../lib/permissions.ts";
import { fetchJsonApi } from "../lib/staticHosting.ts";

const ensureDbDateToInputFormat = (dateVal: string): string => {
  if (!dateVal) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
  const parts = dateVal.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      return `${y}-${m}-${d}`;
    }
  }
  return "";
};

interface SettingsProps {
  user: any;
  events?: Event[];
  onUpdateProfile: (profileData: any) => Promise<void>;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
}

export default function Settings({
  user,
  events = [],
  onUpdateProfile,
  onNavigate,
  onLogout,
  theme = "light",
  onToggleTheme,
  onShowToast
}: SettingsProps) {
  const notifySettings = (message: string, type: "error" | "warning" | "success" | "info" = "info") => {
    if (onShowToast) {
      onShowToast(message, type);
    }
  };

  const displayName = getUserDisplayName(user);
  const guestSession = isGuestSession(user);

  const [editMode, setEditMode] = useState(false);
  const [nome, setNome] = useState(user?.nome || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cpf, setCpf] = useState(user?.cpf || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate || "");
  const [gender, setGender] = useState(user?.gender || "Masculino");
  const [institution, setInstitution] = useState(user?.institution || SCHOOLS_LIST[0]);
  const [role, setRole] = useState(user?.role || "Aluno");
  const [fotoPerfil, setFotoPerfil] = useState(user?.foto_perfil || "");
  const [participations, setParticipations] = useState<any[]>([]);
  const [showPrivacyRequest, setShowPrivacyRequest] = useState(false);
  const [loadingParticipations, setLoadingParticipations] = useState(false);

  // Load user's permanent participation history
  useEffect(() => {
    if (user?.id) {
      /*
        Lê do Supabase (com fallback para o backend local e para o cache). A
        versão anterior chamava /api/... direto e, no GitHub Pages, recebia 404
        — o histórico aparecia sempre vazio.
      */
      const fetchParticipations = async () => {
        setLoadingParticipations(true);
        try {
          const lista = await listarParticipacoes(user.id);
          setParticipations(lista);
        } catch (err) {
          console.warn("Aviso ao carregar participações:", err);
        } finally {
          setLoadingParticipations(false);
        }
      };
      fetchParticipations();
    }
  }, [user?.id]);

  // Keep state in sync with updated user
  useEffect(() => {
    if (user) {
      setNome(user.nome || "");
      setEmail(user.email || "");
      setCpf(user.cpf || "");
      setPhone(user.phone || "");
      setBirthdate(user.birthdate || "");
      setGender(user.gender || "Masculino");
      setInstitution(user.institution || SCHOOLS_LIST[0]);
      setRole(user.role || "Aluno");
      setFotoPerfil(user.foto_perfil || "");
    }
  }, [user]);

  // Apply CPF Mask
  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 9) {
      value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (value.length > 6) {
      value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (value.length > 3) {
      value = value.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    }
    setCpf(value);
  };

  // Smart Phone Formatting (+XX XX X XXXX-XXXX or (XX) XXXXX-XXXX)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const isInternational = val.startsWith("+");
    let clean = val.replace(/\D/g, "");
    
    if (isInternational || clean.length > 11) {
      if (clean.length > 13) clean = clean.slice(0, 13);
      let res = "+";
      if (clean.length > 0) {
        res += clean.substring(0, 2);
      }
      if (clean.length > 2) {
        res += " " + clean.substring(2, 4);
      }
      if (clean.length > 4) {
        res += " " + clean.substring(4, 5);
      }
      if (clean.length > 5) {
        res += " " + clean.substring(5, 9);
      }
      if (clean.length > 9) {
        res += "-" + clean.substring(9, 13);
      }
      setPhone(res);
    } else {
      if (clean.length > 11) clean = clean.slice(0, 11);
      let res = "";
      if (clean.length > 0) {
        res += "(" + clean.substring(0, 2);
      }
      if (clean.length > 2) {
        res += ") " + clean.substring(2, 7);
      }
      if (clean.length > 7) {
        res += "-" + clean.substring(7, 11);
      }
      setPhone(res);
    }
  };

  const [dbStatus, setDbStatus] = useState<{
    active: boolean;
    provider: string;
    host: string;
    version: string;
    sdkInstalled: boolean;
    error?: string;
  } | null>(null);

  const [notificationStatus, setNotificationStatus] = useState<string>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "unsupported";
  });

  const handleRequestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationStatus(permission);
        if (permission === "granted") {
          try {
            new Notification("Escola Estadual Helena Wysocki", {
              body: "Notificações escolares ativadas com sucesso! Você receberá avisos sobre novos eventos.",
              icon: "/favicon.ico"
            });
          } catch {}
        }
      } catch (e) {
        console.warn("Erro ao solicitar notificação:", e);
      }
    } else {
      notifySettings("Notificações do sistema não são suportadas pelo seu navegador atual.", "warning");
    }
  };

  const userStats = useMemo(() => {
    return calculateRealUserStats(user?.id, events || []);
  }, [user?.id, events]);

  const [isLoadingDbStatus, setIsLoadingDbStatus] = useState(true);

  const fetchDbStatus = () => {
    setIsLoadingDbStatus(true);
    /*
      RODADA 39 — `fetch` cru numa rota que não existe na hospedagem estática
      resultava em 404 no console e, pior, `res.json()` sobre o HTML do
      fallback de SPA. `fetchJsonApi` devolve `null` e a tela mostra o estado
      "sem servidor" em vez de erro.
    */
    fetchJsonApi("/api/db-status")
      .then((res) => (res ? res.json() : null))
      .then((data) => {
        setDbStatus(data ?? null);
        setIsLoadingDbStatus(false);
      })
      .catch((err) => {
        console.warn("Erro ao buscar status do banco:", err);
        setIsLoadingDbStatus(false);
      });
  };

  useEffect(() => {
    if (!editMode) {
      fetchDbStatus();
    }
  }, [editMode]);

  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  /**
   * Salvar perfil (rodada 25).
   * -----------------------------------------------------------------------
   * Foto e telefone vão direto ao banco; o resto vira solicitação de
   * aprovação para um ADM. Em caso de falha, o formulário PERMANECE aberto
   * com o que foi digitado — antes a tela saía do modo de edição mesmo no
   * erro, dando a impressão de que tudo tinha sido perdido.
   */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      notifySettings("Por favor, digite seu nome completo!", "warning");
      return;
    }
    if (salvandoPerfil) return;

    setSalvandoPerfil(true);
    let alterouFotoOuTelefone = false;
    try {
      await onUpdateProfile({
        nome,
        email,
        cpf,
        phone,
        birthdate,
        gender,
        institution,
        role,
        foto_perfil: fotoPerfil
      });
      alterouFotoOuTelefone = true;

      // O perfil em si só muda com aprovação; recarrega os campos a partir do
      // que está no banco para o formulário não "mentir" sobre o estado real.
      setFotoPerfil(user?.foto_perfil || fotoPerfil);
      setPhone(user?.phone || phone);
      setEditMode(false);
    } catch {
      // A mensagem de erro específica já foi mostrada pelo App. Mantemos a
      // edição aberta para o usuário tentar de novo sem redigitar tudo.
    } finally {
      setSalvandoPerfil(false);
    }
    void alterouFotoOuTelefone;
  };

  /* Selos que explicam, campo a campo, o que precisa de aprovação. */
  const seloAprovacao = (
    <span className="normal-case tracking-normal font-semibold text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800/60">
      requer ADM
    </span>
  );
  const seloLivre = (
    <span className="normal-case tracking-normal font-semibold text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800/60">
      imediato
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col w-full pb-bottom-nav touch-scroll text-brand-text-light dark:text-brand-text-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 px-4 py-4 sm:p-6">
          {editMode ? (
            <button
              onClick={() => setEditMode(false)}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 animate-in fade-in zoom-in-75 duration-100"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button
              onClick={() => onNavigate("feed")}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 md:hidden animate-in fade-in zoom-in-75 duration-100"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-display font-medium tracking-tight">
              {editMode ? "Editar Perfil" : "Configurações"}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              {user?.email || "Minha conta escolar"}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!editMode ? (
          <motion.div
            key="settings-list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto w-full px-4 py-4 sm:p-6 flex flex-col gap-4 sm:gap-6"
          >
            {/* Short User Snapshot */}
            <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-4 flex items-center gap-4 border border-brand-primary/10">
              <div className="w-14 h-14 rounded-full bg-yellow-400 border-2 border-white flex items-center justify-center font-display font-medium text-white text-xl uppercase overflow-hidden">
                {user?.foto_perfil ? (
                  <img src={user.foto_perfil} alt={displayName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  getUserInitials(user)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-display font-semibold text-base leading-tight truncate">
                  {displayName}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase font-mono tracking-wider">
                  {user?.role || "Aluno"}
                </p>
              </div>
            </div>

            {/* Real User Statistics Grid */}
            <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-brand-primary/10">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-brand-accent dark:text-brand-primary" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-white">Minhas Estatísticas no Portal</span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Atividade Real</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-white dark:bg-black/20 rounded-2xl border border-brand-primary/10 flex flex-col items-center justify-center text-center">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 mb-1">
                    <Ticket size={16} />
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-800 dark:text-white leading-none">
                    {userStats.participatedEventsCount}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Inscrições
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-black/20 rounded-2xl border border-brand-primary/10 flex flex-col items-center justify-center text-center">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400 mb-1">
                    <Calendar size={16} />
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-800 dark:text-white leading-none">
                    {userStats.createdEventsCount}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Eventos Criados
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-black/20 rounded-2xl border border-brand-primary/10 flex flex-col items-center justify-center text-center">
                  <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 mb-1">
                    <RouteIcon size={16} />
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-800 dark:text-white leading-none">
                    {userStats.routesCalculatedCount}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Rotas Traçadas
                  </span>
                </div>

                <div className="p-3 bg-white dark:bg-black/20 rounded-2xl border border-brand-primary/10 flex flex-col items-center justify-center text-center">
                  <div className="p-2 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 mb-1">
                    <MessageSquare size={16} />
                  </div>
                  <span className="text-xl font-bold font-mono text-slate-800 dark:text-white leading-none">
                    {userStats.feedbacksSentCount}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1">
                    Contatos / Avisos
                  </span>
                </div>
              </div>
            </div>

            {/* Histórico Permanente de Participações em Eventos */}
            <div className="bg-white dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-3 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-brand-primary/10">
                <div className="flex items-center gap-2">
                  <Ticket size={18} className="text-emerald-700" />
                  <span className="text-sm font-semibold text-slate-800 dark:text-white">
                    Histórico de Participações em Eventos
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                  {participations.length} Confirmado(s)
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Seu registro de presença e participação em atividades escolares e culturais é preservado permanentemente aqui, mesmo após o arquivamento automático do evento.
              </p>

              {loadingParticipations ? (
                <p className="text-xs text-slate-400 py-3 text-center">Carregando histórico...</p>
              ) : participations.length === 0 ? (
                <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-2xl text-center text-xs text-slate-500">
                  Você ainda não confirmou presença em nenhum evento. Navegue no mural ou calendário para participar!
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {participations.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/5 rounded-xl flex items-start justify-between gap-2"
                    >
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {p.eventTitle}
                        </h5>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          📍 {p.eventLocation} • 🕒 {p.eventTime}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Data do evento: <strong>{p.eventDate}</strong> • Confirmado em: {new Date(p.confirmedAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>

                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/60 shrink-0">
                        Preservado
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* List Menu Options */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (guestSession) {
                    notifySettings(
                      "Sessão de convidado: crie uma conta para editar seu perfil.",
                      "info"
                    );
                    return;
                  }
                  setEditMode(true);
                }}
                className={`w-full h-14 px-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between hover:bg-brand-primary/10 active:scale-99 transition-all cursor-pointer ${
                  guestSession ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                    <User size={18} />
                  </div>
                  <span className="text-sm font-semibold">Editar Perfil</span>
                </div>
                {guestSession ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Convidado
                  </span>
                ) : (
                  <ChevronRight size={18} className="text-slate-400" />
                )}
              </button>

              {/* Modo Escuro / Modo Claro Toggle */}
              <div className="w-full p-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl transition-colors ${
                    theme === "dark" 
                      ? "bg-indigo-950/50 text-indigo-400" 
                      : "bg-amber-50 text-amber-600"
                  }`}>
                    {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-tight text-slate-800 dark:text-white">
                      Modo Escuro
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-400">
                      {theme === "dark" 
                        ? "Tema escuro ativado (tons confortáveis)" 
                        : "Tema claro original ativado"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleTheme}
                  role="switch"
                  aria-checked={theme === "dark"}
                  title={theme === "dark" ? "Desativar modo escuro" : "Ativar modo escuro"}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    theme === "dark" ? "bg-brand-accent dark:bg-brand-primary" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center text-[10px] ${
                      theme === "dark" ? "translate-x-5 text-brand-accent" : "translate-x-0 text-amber-500"
                    }`}
                  >
                    {theme === "dark" ? <Moon size={11} /> : <Sun size={11} />}
                  </span>
                </button>
              </div>

              {/* Notification Permission Request Flow */}
              <div className="w-full p-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                    <Bell size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-tight">Notificações Escolares</div>
                    <div className="text-[11px] text-slate-400">
                      {notificationStatus === "granted"
                        ? "Permissão concedida no sistema"
                        : notificationStatus === "denied"
                        ? "Permissão bloqueada no navegador"
                        : "Receba alertas sobre novos eventos"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestNotificationPermission}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                    notificationStatus === "granted"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-[#1A73E8] text-white hover:bg-[#1557b0] shadow-sm active:scale-95"
                  }`}
                >
                  {notificationStatus === "granted" ? "Ativado ✓" : "Ativar Permissão"}
                </button>
              </div>

              <button
                onClick={() => onNavigate("contact")}
                className="w-full h-14 px-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between hover:bg-brand-primary/10 active:scale-99 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                    <MessageSquare size={18} />
                  </div>
                  <span className="text-sm font-semibold">Entrar em contato</span>
                </div>
                <ChevronRight size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Supabase / Postgres Database Connection Diagnostics for Administrators & Staff */}
            {(isChefeAdmin(user) || isFuncionarioAdmin(user) || user?.role === "Professor" || user?.role === "Diretor" || user?.role === "Pedagogo(a)" || user?.role === "Funcionário") && (
              <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-2 border-b border-brand-primary/10">
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-brand-accent dark:text-brand-primary" />
                    <span className="text-sm font-semibold">Banco de Dados Supabase</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${dbStatus?.active ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                      {dbStatus?.active ? "Conectado" : "Padrão Escola"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Canal Ativo:</span>
                    <span className="font-semibold text-right">{dbStatus ? dbStatus.provider : "Carregando..."}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Host / Origem:</span>
                    <span className="font-mono text-[10px] break-all text-right">{dbStatus ? dbStatus.host : "Identificando..."}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Tecnologia:</span>
                    <span className="text-[10px] text-right">Drizzle ORM + Supabase JS SDK</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed bg-brand-primary/5 dark:bg-black/20 p-3 rounded-xl border border-brand-primary/5 mt-1">
                  <strong>Configuração Flexível:</strong> O aplicativo está pré-compilado para carregar o Supabase. Adicione as chaves <code>DATABASE_URL</code>, <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> nas variáveis de ambiente do AI Studio para sincronizar.
                </div>
              </div>
            )}

            {/* Área comercial: assinatura e painel Master */}
            {(isChefeAdmin(user) || user?.role === "Escola") && (
              <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-brand-accent dark:text-brand-primary" />
                  <span className="text-sm font-semibold">Assinatura e instituição</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Consulte o plano, os limites de alunos e a cota do assistente, e gerencie o pagamento da
                  sua instituição.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate("subscription")}
                  className="w-full h-11 rounded-2xl bg-white dark:bg-slate-900 border border-brand-primary/20 text-xs font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/5 transition-colors"
                >
                  <CreditCard size={15} /> Minha assinatura
                </button>
                {isPlatformOwner(user) && (
                  <button
                    type="button"
                    onClick={() => onNavigate("master")}
                    className="w-full h-11 rounded-2xl bg-brand-primary text-white text-xs font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors"
                  >
                    <ShieldCheck size={15} /> Painel Master
                  </button>
                )}
              </div>
            )}

            {/* Privacidade e LGPD */}
            <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-brand-accent dark:text-brand-primary" />
                <span className="text-sm font-semibold">Privacidade e seus dados</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento, conforme a
                LGPD.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate("privacy")}
                  className="h-10 rounded-2xl bg-white dark:bg-slate-900 border border-brand-primary/20 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-brand-primary/5 transition-colors"
                >
                  Política de privacidade
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrivacyRequest(true)}
                  className="h-10 rounded-2xl bg-white dark:bg-slate-900 border border-brand-primary/20 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:bg-brand-primary/5 transition-colors"
                >
                  Falar sobre meus dados
                </button>
              </div>
              {showPrivacyRequest && (
                <PrivacyRequestForm
                  defaultEmail={user?.email || ""}
                  defaultName={user?.nome || ""}
                  onClose={() => setShowPrivacyRequest(false)}
                  onShowToast={onShowToast}
                />
              )}
            </div>

            {/* Logout button */}
            <button
              onClick={onLogout}
              className="w-full h-12 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-950/35 active:scale-98 transition-all mt-6 cursor-pointer"
            >
              <LogOut size={18} />
              Sair da Conta Escolar
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="edit-profile-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto w-full px-4 py-4 sm:p-6"
          >
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              {/*
                Aviso de aprovação (rodada 25): só foto e telefone mudam na
                hora. O resto depende de um Funcionário ADM — sem isso o
                usuário achava que tinha salvo tudo.
              */}
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                <ShieldCheck size={15} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Foto de perfil</strong> e <strong>telefone para contato</strong> são
                  atualizados na hora. As alterações de <strong>nome, e-mail, CPF, data de
                  nascimento, gênero, instituição e cargo</strong> passam por aprovação de um ADM
                  antes de valer.
                </span>
              </div>
              {/* Profile Image Section */}
              <div className="flex flex-col items-center gap-3 py-4 bg-brand-secondary/20 dark:bg-brand-card-dark/40 rounded-3xl border border-brand-primary/10 mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5 justify-center">Foto de Perfil {seloLivre}</span>
                
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-yellow-400 border-4 border-white dark:border-brand-card-dark flex items-center justify-center font-display font-medium text-white text-3xl uppercase overflow-hidden shadow-md">
                    {fotoPerfil ? (
                      <img src={fotoPerfil} alt={nome || "Avatar"} className="w-full h-full object-cover" />
                    ) : (
                      (nome || email || "U").slice(0, 2)
                    )}
                  </div>
                  
                  <label 
                    htmlFor="profile-image-upload" 
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                  >
                    <Camera size={22} />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="profile-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setFotoPerfil(String(event.target.result));
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById("profile-image-upload")?.click()}
                    className="h-9 px-4 rounded-xl border border-brand-primary text-xs font-semibold hover:bg-brand-primary/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={14} />
                    Carregar Foto
                  </button>
                  {fotoPerfil && (
                    <button
                      type="button"
                      onClick={() => setFotoPerfil("")}
                      className="h-9 px-4 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50 hover:bg-red-100 text-xs font-semibold cursor-pointer"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  Formatos aceitos: JPG, PNG, WEBP.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Nome {seloAprovacao}</span>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Alterar email {seloAprovacao}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">CPF {seloAprovacao}</span>
                <input
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  placeholder="111.111.111-11"
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Número de Celular {seloLivre}</span>
                <input
                  type="text"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="+55 41 9 9999-9999"
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Data de Nascimento {seloAprovacao}</span>
                <input
                  type="date"
                  value={ensureDbDateToInputFormat(birthdate)}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Gênero {seloAprovacao}</span>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Instituição {seloAprovacao}</span>
                <select
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-xs"
                >
                  {SCHOOLS_LIST.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">Cargo / Função {seloAprovacao}</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                >
                  <option value="Aluno">Aluno(a)</option>
                  <option value="Diretor">Diretor(a)</option>
                  <option value="Pedagogo(a)">Pedagogo(a)</option>
                  <option value="Professor">Professor(a)</option>
                  <option value="Responsáveis">Responsáveis</option>
                  <option value="Funcionário">Funcionário(a)</option>
                  <option value="Cliente">Cliente</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={salvandoPerfil}
                className="w-full h-12 mt-4 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <Save size={18} />
                {salvandoPerfil ? "Enviando..." : "Salvar Perfil"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Formulário do canal do titular (LGPD).
 *
 * Registra o pedido em `data_subject_requests` pelo backend. Sem backend
 * (hospedagem estática) informa o e-mail do encarregado em vez de fingir envio.
 */
function PrivacyRequestForm({
  defaultEmail,
  defaultName,
  onClose,
  onShowToast
}: {
  defaultEmail: string;
  defaultName: string;
  onClose: () => void;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
}) {
  const [requestType, setRequestType] = useState<"access" | "correction" | "deletion" | "portability" | "info">("access");
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      onShowToast?.("Informe o e-mail do titular.", "warning");
      return;
    }
    setSending(true);
    try {
      const res = await fetchJsonApi("/api/privacy/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, requestType, details })
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => ({})) : {};
        onShowToast?.(
          body.error || "Não foi possível registrar agora. Escreva para privacidade@eloescola.com.br.",
          "error"
        );
        return;
      }
      setDone(true);
      onShowToast?.("Solicitação registrada. Responderemos em até 15 dias.", "success");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-brand-primary/20 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Scale size={14} /> Solicitação sobre dados pessoais
        </p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>

      {done ? (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed flex items-center gap-1.5">
          <CheckCircle2 size={14} /> Pedido registrado. Você receberá resposta no e-mail informado em até 15
          dias corridos.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <select
            value={requestType}
            onChange={(e) => setRequestType(e.target.value as any)}
            className="h-9 px-2 rounded-xl border border-brand-primary/20 bg-transparent text-[11px]"
          >
            <option value="access">Quero saber quais dados vocês têm sobre mim</option>
            <option value="correction">Quero corrigir um dado incorreto</option>
            <option value="deletion">Quero excluir meus dados</option>
            <option value="portability">Quero uma cópia dos meus dados</option>
            <option value="info">Tenho uma dúvida sobre privacidade</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="h-9 px-2 rounded-xl border border-brand-primary/20 bg-transparent text-[11px]"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail do titular"
              type="email"
              className="h-9 px-2 rounded-xl border border-brand-primary/20 bg-transparent text-[11px]"
            />
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Detalhe seu pedido (opcional)"
            rows={2}
            className="px-2 py-1.5 rounded-xl border border-brand-primary/20 bg-transparent text-[11px] resize-none"
          />
          <button
            type="submit"
            disabled={sending}
            className="h-9 rounded-xl bg-brand-primary text-white text-[11px] font-bold disabled:opacity-60"
          >
            {sending ? "Enviando…" : "Enviar solicitação"}
          </button>
        </form>
      )}
    </div>
  );
}
