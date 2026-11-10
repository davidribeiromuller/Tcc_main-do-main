import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  LogIn,
  School,
  ArrowLeft,
  UserPlus,
  Compass,
  KeyRound,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import logoImg from "../assets/images/logo.jpg";
import { User } from "../types";

interface LoginProps {
  onGoogleLogin: () => Promise<void>;
  onLocalLogin: (email: string, password?: string) => Promise<void> | void;
  onGuestLogin?: (destination?: string) => Promise<void>;
  onInstitutionalLogin?: (identificador: string, password: string) => Promise<void>;
  onNavigate: (screen: string) => void;
  isLoading: boolean;
  loginError?: string | null;
  clearLoginError?: () => void;
}

export default function Login({
  onGoogleLogin,
  onLocalLogin,
  onGuestLogin,
  onInstitutionalLogin,
  onNavigate,
  isLoading,
  loginError,
  clearLoginError,
}: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSubView, setActiveSubView] = useState<"options" | "institutional">("options");
  
  // Institutional school login fields
  const [instIdentifier, setInstIdentifier] = useState("");
  const [instPassword, setInstPassword] = useState("");
  const [instLoading, setInstLoading] = useState(false);
  const [localError, setLocalError] = useState("");

  const activeError = localError || loginError || "";

  const handleClearError = () => {
    setLocalError("");
    if (clearLoginError) clearLoginError();
  };

  const handleStandardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleClearError();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setLocalError("Por favor, informe seu endereço de e-mail.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setLocalError("Formato de e-mail inválido. Exemplo: seu.nome@gmail.com ou institucional.");
      return;
    }

    if (!password) {
      setLocalError("Por favor, digite sua senha de acesso.");
      return;
    }

    onLocalLogin(cleanEmail, password);
  };

  const handleInstitutionalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleClearError();

    const cleanId = instIdentifier.trim();
    if (!cleanId) {
      setLocalError("Por favor, informe o identificador institucional da escola.");
      return;
    }

    if (!instPassword) {
      setLocalError("Por favor, informe a senha de acesso institucional.");
      return;
    }

    setInstLoading(true);
    try {
      if (onInstitutionalLogin) {
        await onInstitutionalLogin(cleanId, instPassword);
      } else {
        const res = await fetch("/api/auth/institutional-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identificador: cleanId, password: instPassword })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Identificador ou senha institucional inválidos.");
        }
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.reload();
      }
    } catch (err: any) {
      setLocalError(err.message || "Falha na autenticação institucional da escola.");
    } finally {
      setInstLoading(false);
    }
  };

  const handleGuestEntry = async () => {
    handleClearError();
    if (onGuestLogin) {
      await onGuestLogin("feed");
    } else {
      try {
        const res = await fetch("/api/auth/guest-login", { method: "POST" });
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("user", JSON.stringify(data.user));
          window.location.reload();
        }
      } catch (err) {
        onNavigate("feed");
      }
    }
  };

  // Subview: Institutional School Login
  if (activeSubView === "institutional") {
    return (
      <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 my-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => {
                setActiveSubView("options");
                handleClearError();
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Voltar</span>
            </button>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              Gestão Escolar
            </span>
          </div>

          <div className="flex flex-col items-center mb-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-3 shadow-sm">
              <School size={28} />
            </div>
            <h2 className="text-xl font-serif font-bold text-slate-900 dark:text-white">
              Portal das Escolas
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
              Acesse o ambiente exclusivo da sua instituição
            </p>
          </div>

          {activeError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
              <p className="leading-snug">{activeError}</p>
            </div>
          )}

          <form onSubmit={handleInstitutionalSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Identificador Institucional ou E-mail
              </label>
              <div className="relative">
                <School className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="text"
                  required
                  value={instIdentifier}
                  onChange={(e) => setInstIdentifier(e.target.value)}
                  placeholder="Ex: escola.szymanski ou escola.wysocki"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none text-xs"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Credencial institucional gerenciada pelo Administrador Chefe.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Senha Institucional
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  required
                  value={instPassword}
                  onChange={(e) => setInstPassword(e.target.value)}
                  placeholder="Senha de acesso da instituição"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={instLoading}
              className="w-full h-11 mt-1 bg-emerald-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-900 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50"
            >
              <ShieldCheck size={16} />
              {instLoading ? "Verificando..." : "Entrar como Escola"}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSubView("options");
                handleClearError();
              }}
              className="w-full h-11 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-98 transition-all cursor-pointer text-xs"
            >
              Voltar para login de usuário
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Main View
  return (
    <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 flex flex-col justify-between my-auto"
      >
        <div>
          {/* Top navigation row */}
          <div className="flex items-center justify-between w-full mb-3">
            <button
              type="button"
              onClick={() => onNavigate("welcome")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Início</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate("register")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline p-1 cursor-pointer"
            >
              <UserPlus size={14} />
              <span>Cadastrar</span>
            </button>
          </div>

          {/* Logo and Brand */}
          <div className="flex flex-col items-center mb-5 text-center">
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full overflow-hidden border border-emerald-600/20 shadow-md mb-2.5 bg-white p-1 flex items-center justify-center">
              <img
                src={logoImg}
                alt="Logo eloEscola"
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 dark:text-white tracking-tight">
              eloEscola
            </h1>
            <p className="text-emerald-800 dark:text-emerald-400 text-xs font-semibold mt-0.5">
              Portal de Oportunidades & Informações Escolares
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-xs">
              Acesse sua conta para participar de eventos, ver comunicados e acompanhar escolas de Araucária e Curitiba.
            </p>
          </div>


          {activeError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
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
            {/* Email Input */}
            <div className="flex flex-col gap-1 relative">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                E-mail de Acesso
              </label>

              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@exemplo.com"
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none text-xs"
                />
              </div>
            </div>

            {/* Senha Input */}
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
                  className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => onNavigate("recovery")}
                className="text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Esqueci minha senha
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 mt-1 bg-emerald-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-900 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50"
            >
              <LogIn size={16} />
              {isLoading ? "Entrando..." : "Entrar na Conta"}
            </button>
          </form>

          <div className="flex items-center gap-2 my-4">
            <hr className="flex-1 border-slate-200 dark:border-slate-800" />
            <span className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Outras opções</span>
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
              <span>{isLoading ? "Conectando..." : "Continuar com Google"}</span>
            </button>

            {/* Portal das Escolas */}
            <button
              onClick={() => {
                setActiveSubView("institutional");
                handleClearError();
              }}
              type="button"
              className="w-full h-11 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 active:scale-98 transition-all cursor-pointer text-xs"
            >
              <School size={16} className="text-emerald-700 dark:text-emerald-400" />
              <span>Portal das Escolas (Acesso Institucional)</span>
            </button>
          </div>
        </div>

        <p className="text-[10px] text-center text-slate-400 mt-6">
          © 2026 eloEscola • Araucária & Curitiba / PR
        </p>
      </motion.div>
    </div>
  );
}
