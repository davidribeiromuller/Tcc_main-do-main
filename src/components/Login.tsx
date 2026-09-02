import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  LogIn,
  ChevronRight,
  GraduationCap,
  ArrowLeft,
  ShieldCheck,
  UserPlus,
  History,
  X,
  UserCheck,
  Sparkles,
  Zap,
  ChevronDown,
  Check
} from "lucide-react";
import logoImg from "../assets/images/logo.jpg";
import { User } from "../types";

interface LoginProps {
  onGoogleLogin: () => Promise<void>;
  onLocalLogin: (email: string, password?: string) => Promise<void> | void;
  onNavigate: (screen: string) => void;
  isLoading: boolean;
  loginError?: string | null;
  clearLoginError?: () => void;
  registeredUsers?: User[];
}

interface RecognizedAccount {
  id?: string | number;
  email: string;
  name: string;
  role: string;
  isAdmin?: boolean;
  password?: string;
  provider?: string;
  lastLogin?: string;
}

export default function Login({
  onGoogleLogin,
  onLocalLogin,
  onNavigate,
  isLoading,
  loginError,
  clearLoginError,
  registeredUsers = []
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSubView, setActiveSubView] = useState<"options" | "forgot" | "aluno_cgm">("options");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryCpf, setRecoveryCpf] = useState("");
  const [cgm, setCgm] = useState("");
  const [cgmPassword, setCgmPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [autoFilledMsg, setAutoFilledMsg] = useState<string | null>(null);
  
  // Quick Logins recognition state
  const [showQuickLogins, setShowQuickLogins] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<RecognizedAccount[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const activeError = localError || loginError || "";

  const handleClearError = () => {
    setLocalError("");
    if (clearLoginError) clearLoginError();
  };

  // Load recognized & previously logged accounts strictly from the user's computer (localStorage)
  useEffect(() => {
    const loadRecognizedAccounts = () => {
      const accountsMap = new Map<string, RecognizedAccount>();

      // 0. Default recognized quick-access accounts available immediately
      const defaultRecognized: RecognizedAccount[] = [
        {
          email: "davidribeiromuller2009@gmail.com",
          name: "David Ribeiro Müller",
          role: "Diretor / Admin",
          isAdmin: true,
          password: "admin",
          provider: "google",
          lastLogin: "Acesso Principal"
        },
        {
          email: "diretoria@helenawysocki.com",
          name: "Diretoria Helena Wysocki",
          role: "Diretoria",
          isAdmin: true,
          password: "admin",
          provider: "local",
          lastLogin: "Gestão Escolar"
        },
        {
          email: "aluno@escola.pr.gov.br",
          name: "Aluno Helena Wysocki",
          role: "Aluno",
          isAdmin: false,
          password: "aluno",
          provider: "local",
          lastLogin: "Estudante"
        }
      ];

      defaultRecognized.forEach(acc => {
        accountsMap.set(acc.email.toLowerCase().trim(), acc);
      });

      // 1. Check previously active session stored on this computer
      try {
        const storedUser = localStorage.getItem("local_user");
        if (storedUser) {
          const u = JSON.parse(storedUser);
          if (u && u.email) {
            accountsMap.set(u.email.toLowerCase().trim(), {
              email: u.email,
              name: u.nome || u.name || u.email.split("@")[0].replace(/[._]/g, " "),
              role: u.role || (u.isAdmin ? "Diretor" : "Aluno"),
              isAdmin: !!u.isAdmin,
              password: u.password || "senha123",
              provider: u.provider || "local",
              lastLogin: "Sessão salva no computador"
            });
          }
        }
      } catch {}

      // 2. Check accounts previously logged in / saved on this computer
      try {
        const savedHistory = localStorage.getItem("saved_accounts_history");
        if (savedHistory) {
          const list: RecognizedAccount[] = JSON.parse(savedHistory);
          if (Array.isArray(list)) {
            list.forEach((acc) => {
              if (acc && acc.email) {
                const key = acc.email.toLowerCase().trim();
                accountsMap.set(key, {
                  ...acc,
                  name: acc.name || acc.email.split("@")[0].replace(/[._]/g, " "),
                  role: acc.role || (acc.isAdmin ? "Diretor" : "Aluno"),
                });
              }
            });
          }
        }
      } catch {}

      setSavedAccounts(Array.from(accountsMap.values()));
    };

    loadRecognizedAccounts();
  }, []);

  // Click outside listener for quick logins dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        emailInputRef.current &&
        !emailInputRef.current.contains(event.target as Node)
      ) {
        setShowQuickLogins(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Save account to history upon login
  const persistAccountToHistory = (cleanEmail: string, accName?: string, role?: string, pass?: string) => {
    try {
      const existingHistory = localStorage.getItem("saved_accounts_history");
      let list: RecognizedAccount[] = [];
      if (existingHistory) list = JSON.parse(existingHistory);
      const isDirector = cleanEmail === "davidribeiromuller2009@gmail.com" || cleanEmail === "diretoria@helenawysocki.com";
      const newEntry: RecognizedAccount = {
        email: cleanEmail,
        name: accName || cleanEmail.split("@")[0].replace(/[._]/g, " "),
        role: role || (isDirector ? "Diretor" : "Aluno"),
        isAdmin: isDirector,
        password: pass || "senha123",
        lastLogin: new Date().toLocaleDateString("pt-BR")
      };
      const filtered = list.filter((a) => a.email.toLowerCase() !== cleanEmail.toLowerCase());
      filtered.unshift(newEntry);
      localStorage.setItem("saved_accounts_history", JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  };

  const handleSelectQuickAccount = (acc: RecognizedAccount, autoLogin: boolean = false) => {
    setEmail(acc.email);
    setPassword(acc.password || "senha123");
    setShowQuickLogins(false);
    handleClearError();
    setAutoFilledMsg(`E-mail inserido: ${acc.email}`);
    setTimeout(() => setAutoFilledMsg(null), 3000);

    if (autoLogin) {
      persistAccountToHistory(acc.email, acc.name, acc.role, acc.password);
      onLocalLogin(acc.email, acc.password || "senha123");
    }
  };

  const handleRemoveSavedAccount = (e: React.MouseEvent, emailToRemove: string) => {
    e.stopPropagation();
    try {
      const existingHistory = localStorage.getItem("saved_accounts_history");
      if (existingHistory) {
        const list: RecognizedAccount[] = JSON.parse(existingHistory);
        const updated = list.filter((a) => a.email.toLowerCase() !== emailToRemove.toLowerCase());
        localStorage.setItem("saved_accounts_history", JSON.stringify(updated));
      }
      setSavedAccounts((prev) => prev.filter((a) => a.email.toLowerCase() !== emailToRemove.toLowerCase()));
    } catch {}
  };

  const handleStandardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleClearError();
    setShowQuickLogins(false);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setLocalError("Por favor, informe seu endereço de e-mail.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setLocalError("Formato de e-mail inválido. Exemplo correto: aluno@escola.pr.gov.br");
      return;
    }

    if (!password) {
      setLocalError("Por favor, digite sua senha de acesso.");
      return;
    }

    if (password.length < 3) {
      setLocalError("A senha deve conter no mínimo 3 caracteres.");
      return;
    }

    persistAccountToHistory(cleanEmail, undefined, undefined, password);
    onLocalLogin(cleanEmail, password);
  };

  const handleCgmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleClearError();

    const cleanCgm = cgm.trim();
    if (!cleanCgm) {
      setLocalError("Por favor, informe seu número de matrícula CGM.");
      return;
    }
    if (cleanCgm.length < 6) {
      setLocalError("O CGM escolar deve conter pelo menos 6 dígitos numéricos.");
      return;
    }
    if (!cgmPassword) {
      setLocalError("Por favor, informe sua senha de acesso para a Área do Aluno.");
      return;
    }

    const fauxEmail = `cgm-${cleanCgm}@aluno.pr.gov.br`;
    persistAccountToHistory(fauxEmail, `Aluno CGM ${cleanCgm}`, "Aluno", cgmPassword);
    onLocalLogin(fauxEmail, cgmPassword);
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleClearError();

    if (!recoveryEmail || !recoveryEmail.includes("@")) {
      setLocalError("Por favor, informe um e-mail escolar válido para recuperação.");
      return;
    }
    if (!recoveryCpf || recoveryCpf.replace(/\D/g, "").length < 11) {
      setLocalError("Por favor, digite um CPF válido com 11 dígitos.");
      return;
    }
    onNavigate("codeSent");
  };

  // Filter recognized accounts by input
  const filteredQuickAccounts = savedAccounts.filter((acc) => {
    if (!email) return true;
    const q = email.toLowerCase().trim();
    return (
      acc.email.toLowerCase().includes(q) ||
      acc.name.toLowerCase().includes(q) ||
      acc.role.toLowerCase().includes(q)
    );
  });

  if (activeSubView === "forgot") {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 flex flex-col justify-center my-auto"
        >
          <div className="flex flex-col items-center mb-6">
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-center leading-tight">
              Recuperar Senha
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center leading-relaxed">
              Insira seu email e CPF cadastrados para receber um código de verificação seguro.
            </p>
          </div>

          {activeError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
                <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
              </div>
              <button
                type="button"
                onClick={handleClearError}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}

          <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Email Escolar</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="email"
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="exemplo@escola.pr.gov.br"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">CPF Cadastrado</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={recoveryCpf}
                  onChange={(e) => setRecoveryCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full h-11 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 mt-2 bg-brand-accent text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all shadow-md cursor-pointer text-xs"
            >
              Enviar Código de Recuperação
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView("options")}
              className="w-full h-11 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-98 transition-all cursor-pointer text-xs"
            >
              Voltar ao Login
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (activeSubView === "aluno_cgm") {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 flex flex-col justify-center my-auto"
        >
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-brand-primary/20 shadow-md mb-3 bg-white p-1 flex items-center justify-center">
              <img
                src={logoImg}
                alt="Logo Helena Wysocki"
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <h2 className="text-xl font-display font-semibold text-center leading-tight">
              Área do Aluno • CGM
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 text-center leading-relaxed">
              Informe sua matrícula CGM e senha cadastrada na secretaria escolar.
            </p>
          </div>

          {activeError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
                <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
              </div>
              <button
                type="button"
                onClick={handleClearError}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}

          <form onSubmit={handleCgmSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">MATRÍCULA / CGM</label>
              <input
                type="text"
                required
                value={cgm}
                onChange={(e) => {
                  setCgm(e.target.value.replace(/\D/g, ""));
                  setLocalError("");
                }}
                maxLength={10}
                placeholder="Exemplo: 4893021"
                className="w-full h-11 px-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs font-mono tracking-wider"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Senha do Aluno</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  required
                  value={cgmPassword}
                  onChange={(e) => setCgmPassword(e.target.value)}
                  placeholder="Digite sua senha de acesso"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-11 mt-2 bg-brand-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer text-xs"
            >
              <LogIn size={15} />
              Conectar na Área do Aluno
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSubView("options");
                handleClearError();
              }}
              className="w-full h-11 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-98 transition-all cursor-pointer text-xs"
            >
              Voltar
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 flex flex-col justify-between my-auto"
      >
        <div>
          <div className="flex items-center justify-between w-full mb-3">
            <button
              type="button"
              onClick={() => onNavigate("welcome")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Início</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("register")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent dark:text-brand-primary hover:underline p-1 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Cadastrar</span>
            </button>
          </div>

          <div className="flex flex-col items-center mb-5 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border border-brand-primary/20 shadow-md mb-2.5 bg-white p-1 flex items-center justify-center">
              <img
                src={logoImg}
                alt="Logo Helena Wysocki"
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight">
              eloEscola
            </h1>
            <p className="text-brand-accent dark:text-brand-primary text-xs font-semibold mt-0.5">
              C.E. Helena Wysocki • Araucária
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-xs">
              Acesse sua conta para ver a agenda de eventos, avisos e atividades escolares.
            </p>
          </div>

          {activeError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
                <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
              </div>
              <button
                type="button"
                onClick={handleClearError}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </motion.div>
          )}

          <form onSubmit={handleStandardSubmit} className="flex flex-col gap-3.5">
            {/* Quick Access / Inserir Email Rápido Chips */}
            {savedAccounts.length > 0 && (
              <div className="flex flex-col gap-1.5 pb-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <Zap size={13} className="text-amber-500 fill-amber-500" />
                    Acesso Rápido (Preencher E-mail):
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQuickLogins(!showQuickLogins)}
                    className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <span>{showQuickLogins ? "Fechar lista" : "Ver todas"}</span>
                    <ChevronDown size={11} className={`transition-transform duration-200 ${showQuickLogins ? "rotate-180" : ""}`} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {savedAccounts.slice(0, 3).map((acc) => {
                    const isSelected = email.toLowerCase().trim() === acc.email.toLowerCase().trim();
                    const isDirector = acc.isAdmin || acc.role?.toLowerCase().includes("diretor");
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => handleSelectQuickAccount(acc, false)}
                        className={`group px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                          isSelected
                            ? "bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-200 font-semibold ring-1 ring-blue-400"
                            : "bg-slate-100/80 hover:bg-slate-200/80 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 hover:border-slate-300"
                        }`}
                        title={`Clique para preencher o e-mail: ${acc.email}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isDirector ? "bg-blue-500" : "bg-emerald-500"}`} />
                        <span className="truncate max-w-[140px] text-[11px]">{acc.email.split("@")[0]}</span>
                        <span className="text-[9px] text-slate-400 group-hover:text-blue-600 transition-colors font-bold">
                          {isSelected ? "✓" : "+ Inserir"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auto filled feedback toast */}
            <AnimatePresence>
              {autoFilledMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium flex items-center gap-1.5"
                >
                  <Check size={13} className="text-emerald-600 shrink-0" />
                  <span className="truncate">{autoFilledMsg} (Preenchido automaticamente)</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email ou Registro Input with Recognized Quick Logins Dropdown */}
            <div className="flex flex-col gap-1 relative">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email ou Registro
              </label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  value={email}
                  onFocus={() => setShowQuickLogins(true)}
                  onClick={() => setShowQuickLogins(true)}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (!showQuickLogins) setShowQuickLogins(true);
                  }}
                  placeholder="exemplo@gmail.com ou institucional"
                  className="w-full h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowQuickLogins(!showQuickLogins)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 rounded-lg transition-colors cursor-pointer"
                  title="Abrir contas para acesso rápido"
                >
                  <ChevronDown size={15} className={`transition-transform duration-200 ${showQuickLogins ? "rotate-180 text-blue-600" : ""}`} />
                </button>
              </div>

              {/* QUICK LOGINS DROPDOWN OVERLAY */}
              <AnimatePresence>
                {showQuickLogins && filteredQuickAccounts.length > 0 && (
                  <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-1 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto"
                  >
                    <div className="p-2.5 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                        <Zap size={13} className="text-amber-500 fill-amber-500" />
                        <span>Acesso Rápido (Selecione para Preencher)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuickLogins(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded-md cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {filteredQuickAccounts.map((acc) => {
                      const isDirector = acc.isAdmin || acc.role?.toLowerCase().includes("diretor");
                      const letter = (acc.name || acc.email || "U").charAt(0).toUpperCase();

                      return (
                        <div
                          key={acc.email}
                          onClick={() => handleSelectQuickAccount(acc, false)}
                          className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/90 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs ${
                                isDirector
                                  ? "bg-blue-600"
                                  : acc.role?.toLowerCase().includes("aluno")
                                  ? "bg-emerald-600"
                                  : "bg-indigo-600"
                              }`}
                            >
                              {letter}
                            </div>
                            <div className="min-w-0 flex-1 text-start">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {acc.name}
                                </p>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    isDirector
                                      ? "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300"
                                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                                  }`}
                                >
                                  {acc.role}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                                {acc.email}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Insert Email Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectQuickAccount(acc, false);
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 dark:text-blue-300 rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1 border border-blue-200 dark:border-blue-800"
                              title="Inserir este e-mail no formulário"
                            >
                              <Mail size={11} />
                              <span>Inserir</span>
                            </button>

                            {/* 1-Click Fast Login Action */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectQuickAccount(acc, true);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Entrar imediatamente com esta conta"
                            >
                              <UserCheck size={11} />
                              <span>Entrar</span>
                            </button>

                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={(e) => handleRemoveSavedAccount(e, acc.email)}
                              className="p-1 text-slate-300 hover:text-red-500 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer"
                              title="Remover do histórico"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha de acesso"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => setActiveSubView("forgot")}
                className="text-xs font-medium text-brand-accent dark:text-brand-primary hover:underline cursor-pointer"
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-1 bg-brand-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50"
            >
              <LogIn size={16} />
              {isLoading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="flex items-center gap-2 my-5">
            <hr className="flex-1 border-slate-200 dark:border-slate-800" />
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Ou conecte com</span>
            <hr className="flex-1 border-slate-200 dark:border-slate-800" />
          </div>

          <div className="flex flex-col gap-2.5">
            {/* Google OAuth Login Button */}
            <button
              onClick={onGoogleLogin}
              disabled={isLoading}
              type="button"
              className="w-full h-11 bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-semibold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-98 transition-all shadow-xs cursor-pointer disabled:opacity-50 text-xs"
              id="btn-login-google"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#ea4335"
                  d="M12 5.04c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.4 15 0 12 0 7.3 0 3.3 2.7 1.4 6.7l3.9 3C6.2 6.9 8.9 5.04 12 5.04z"
                />
                <path
                  fill="#4285f4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.1-2 3.7-4.9 3.7-8.7z"
                />
                <path
                  fill="#fbbc05"
                  d="M5.3 14.3c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.4 6.7C.5 8.4 0 10.1 0 12s.5 3.6 1.4 5.3l3.9-3z"
                />
                <path
                  fill="#34a853"
                  d="M12 24c3.2 0 6-1.1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-1.9-6.7-4.7l-3.9 3c1.9 4 5.9 6.7 10 6.7z"
                />
              </svg>
              <span>{isLoading ? "Conectando..." : "Entrar com o Google"}</span>
            </button>

            {/* Conectar área do aluno button */}
            <button
              onClick={() => setActiveSubView("aluno_cgm")}
              type="button"
              className="w-full h-11 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/50 active:scale-98 transition-all cursor-pointer text-xs"
            >
              <GraduationCap size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span>Conectar com Área do Aluno (CGM)</span>
              <ChevronRight size={14} className="text-emerald-500 opacity-80" />
            </button>

            {/* Acesso exclusivo da Diretoria */}
            <button
              type="button"
              onClick={() => {
                setEmail("davidribeiromuller2009@gmail.com");
                setPassword("senha123");
                handleClearError();
                setShowQuickLogins(false);
              }}
              className="w-full py-2 px-3 text-[11px] font-semibold text-slate-500 hover:text-brand-accent dark:hover:text-brand-primary rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
            >
              <ShieldCheck size={14} className="text-brand-accent dark:text-brand-primary" />
              <span>Acesso Exclusivo da Diretoria (Admin)</span>
            </button>
          </div>
        </div>

        <p className="text-[10px] text-center text-slate-400 mt-6">
          © 2026 Colégio Estadual Helena Wysocki • Araucária - PR
        </p>
      </motion.div>
    </div>
  );
}
