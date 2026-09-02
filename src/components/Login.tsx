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
  Globe,
  KeyRound,
  Check,
  Sparkles,
  Smartphone,
  ChevronDown,
  X,
  Trash2
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
  appLabel?: string;
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
  
  // Floating Autofill / Credential Selector state
  const [showAutofillMenu, setShowAutofillMenu] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<RecognizedAccount[]>([]);
  const [showManageModal, setShowManageModal] = useState(false);
  const autofillRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const activeError = localError || loginError || "";

  const handleClearError = () => {
    setLocalError("");
    if (clearLoginError) clearLoginError();
  };

  // Load recognized credentials and saved history ONLY from this browser's localStorage
  useEffect(() => {
    const loadRecognizedAccounts = () => {
      const accountsMap = new Map<string, RecognizedAccount>();

      // 1. Check current logged-in user on this browser
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
              appLabel: "eloEscola"
            });
          }
        }
      } catch {}

      // 2. Check saved account history on this specific browser
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
                  appLabel: acc.appLabel || "eloEscola"
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

  // Click outside listener for the autofill popup
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autofillRef.current &&
        !autofillRef.current.contains(event.target as Node) &&
        emailInputRef.current &&
        !emailInputRef.current.contains(event.target as Node)
      ) {
        setShowAutofillMenu(false);
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
        appLabel: "eloEscola",
        lastLogin: new Date().toLocaleDateString("pt-BR")
      };
      const filtered = list.filter((a) => a.email.toLowerCase() !== cleanEmail.toLowerCase());
      filtered.unshift(newEntry);
      localStorage.setItem("saved_accounts_history", JSON.stringify(filtered.slice(0, 10)));
    } catch {}
  };

  const handleSelectAutofillAccount = (acc: RecognizedAccount, autoSubmit: boolean = false) => {
    setEmail(acc.email);
    setPassword(acc.password || "senha123");
    setShowAutofillMenu(false);
    handleClearError();
    setAutoFilledMsg(`Credenciais preenchidas para ${acc.email}`);
    setTimeout(() => setAutoFilledMsg(null), 3000);

    if (autoSubmit) {
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
    setShowAutofillMenu(false);

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

  // Filter accounts when user types
  const filteredAccounts = savedAccounts.filter((acc) => {
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

          {/* Auto filled feedback toast */}
          <AnimatePresence>
            {autoFilledMsg && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mb-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-2 shadow-2xs"
              >
                <Check size={14} className="text-emerald-600 shrink-0" />
                <span className="truncate">{autoFilledMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleStandardSubmit} autoComplete="on" className="flex flex-col gap-3.5">
            {/* Input with Attached Floating Credential Autofill Popover */}
            <div className="flex flex-col gap-1 relative">
              <label htmlFor="username" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Número de celular, nome de usuário ou email
              </label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  ref={emailInputRef}
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username webauthn"
                  required
                  value={email}
                  onFocus={() => setShowAutofillMenu(true)}
                  onClick={() => setShowAutofillMenu(true)}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (!showAutofillMenu) setShowAutofillMenu(true);
                  }}
                  placeholder="Número de celular, nome de usuário ou email"
                  className="w-full h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowAutofillMenu(!showAutofillMenu)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
                  title="Acesso rápido a contas guardadas"
                >
                  <ChevronDown size={15} className={`transition-transform duration-200 ${showAutofillMenu ? "rotate-180 text-blue-600" : ""}`} />
                </button>
              </div>

              {/* NATIVE-STYLE FLOATING AUTOFILL POPOVER (Matched to user's screenshot) */}
              <AnimatePresence>
                {showAutofillMenu && (
                  <motion.div
                    ref={autofillRef}
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-[calc(100%+6px)] left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-2xl shadow-2xl overflow-hidden text-left"
                    style={{ filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.15))" }}
                  >
                    {/* Subtle top indicator arrow pointing right to the input field */}
                    <div className="absolute -top-1.5 left-7 w-3 h-3 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-700 rotate-45" />

                    {/* Section 1: Saved account items */}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                      {filteredAccounts.map((acc) => {
                        const isSelected = email.toLowerCase().trim() === acc.email.toLowerCase().trim();
                        const isDirector = acc.isAdmin || acc.role?.toLowerCase().includes("diretor");
                        const displayName = acc.email.split("@")[0];

                        return (
                          <div
                            key={acc.email}
                            onClick={() => handleSelectAutofillAccount(acc, false)}
                            className={`p-3 transition-colors flex items-center justify-between gap-3 cursor-pointer group ${
                              isSelected
                                ? "bg-blue-50/80 dark:bg-blue-950/50"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/80"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Globe / Credential Icon */}
                              <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 group-hover:text-blue-600 group-hover:bg-blue-100/60 transition-colors">
                                <Globe size={15} />
                              </div>

                              {/* Credential username and masked password bullets */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                                    {displayName}
                                  </span>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-400 font-normal truncate">
                                    {acc.appLabel || "eloEscola"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 tracking-widest font-mono select-none">
                                  ••••••••
                                </div>
                              </div>
                            </div>

                            {/* Actions on hover */}
                            <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                Preencher
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Section 2: Google Account credentials prompt */}
                    <div
                      onClick={async () => {
                        setShowAutofillMenu(false);
                        await onGoogleLogin();
                      }}
                      className="p-3 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800 transition-colors flex items-start gap-3 cursor-pointer border-t border-slate-100 dark:divide-slate-800"
                    >
                      <div className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 shadow-2xs border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-snug font-medium">
                        Para usar as palavras-passe e outros itens guardados na sua Conta Google, valide a sua identidade
                      </p>
                    </div>

                    {/* Section 3: Access key / Other device */}
                    <div
                      onClick={() => {
                        setShowAutofillMenu(false);
                        setActiveSubView("aluno_cgm");
                      }}
                      className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 cursor-pointer border-t border-slate-100 dark:border-slate-800"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                        <Smartphone size={14} />
                      </div>
                      <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                        Usar chave de acesso de outro dispositivo (ou CGM)
                      </span>
                    </div>

                    {/* Section 4: Manage Passwords */}
                    <div
                      onClick={() => {
                        setShowAutofillMenu(false);
                        setShowManageModal(true);
                      }}
                      className="p-2.5 bg-slate-50/90 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                          <KeyRound size={13} />
                        </div>
                        <span className="text-xs font-medium">Gerir palavras-passe...</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Password input */}
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Senha"
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
          </div>
        </div>

        <p className="text-[10px] text-center text-slate-400 mt-6">
          © 2026 Colégio Estadual Helena Wysocki • Araucária - PR
        </p>

        {/* Gerir Palavras-Passe Modal */}
        <AnimatePresence>
          {showManageModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setShowManageModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <KeyRound className="text-blue-600 dark:text-blue-400" size={20} />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Palavras-passe Guardadas
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowManageModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                  Contas e credenciais salvas neste dispositivo para preenchimento automático.
                </p>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto mb-4 border border-slate-100 dark:border-slate-800 rounded-xl">
                  {savedAccounts.map((acc) => (
                    <div
                      key={acc.email}
                      className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{acc.email}</p>
                        <p className="text-[10px] text-slate-400 font-mono">•••••••• ({acc.role})</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveSavedAccount(e, acc.email)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                        title="Remover credencial salva"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowManageModal(false)}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Concluído
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
