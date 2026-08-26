import React, { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, LogIn, ChevronRight, GraduationCap, Users, User2, ArrowLeft, ShieldCheck } from "lucide-react";
import { User } from "../types";
import logoImg from "../assets/images/logo.jpg";

interface LoginProps {
  onGoogleLogin: () => Promise<void>;
  onLocalLogin: (email: string, password?: string) => Promise<void> | void;
  onNavigate: (screen: string) => void;
  isLoading: boolean;
  loginError?: string | null;
  clearLoginError?: () => void;
}

export default function Login({ onGoogleLogin, onLocalLogin, onNavigate, isLoading, loginError, clearLoginError }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activeSubView, setActiveSubView] = useState<"options" | "forgot" | "aluno_cgm">("options");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryCpf, setRecoveryCpf] = useState("");
  const [cgm, setCgm] = useState("");
  const [cgmPassword, setCgmPassword] = useState("");
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

  if (activeSubView === "forgot") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        className="flex flex-col h-full overflow-y-auto p-6 text-brand-text-light dark:text-brand-text-dark max-w-md mx-auto w-full justify-center md:py-12"
      >
        <div className="flex flex-col items-center my-6">
          <h2 className="text-2xl font-display font-semibold text-center leading-tight">
            Recuperar Senha
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center leading-relaxed">
            Insira seu email e CPF cadastrados para receber um código de verificação seguro
          </p>
        </div>

        {activeError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
              <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
            </div>
            <button
              type="button"
              onClick={handleClearError}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0"
            >
              ✕
            </button>
          </motion.div>
        )}

        <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email Escolar</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                required
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="exemplo@escola.pr.gov.br"
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">CPF Cadastrado</label>
            <div className="relative">
              <input
                type="text"
                required
                value={recoveryCpf}
                onChange={(e) => setRecoveryCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full h-12 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 mt-4 bg-brand-accent text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-98 transition-all shadow-md cursor-pointer"
          >
            Enviar Código de Recuperação
          </button>

          <button
            type="button"
            onClick={() => setActiveSubView("options")}
            className="w-full h-12 border-2 border-brand-primary/50 text-brand-accent dark:text-brand-primary font-semibold rounded-2xl flex items-center justify-center hover:bg-black/5 active:scale-98 transition-all mt-1 cursor-pointer"
          >
            Voltar
          </button>
        </form>
      </motion.div>
    );
  }

  if (activeSubView === "aluno_cgm") {
    return (
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        className="flex flex-col h-full overflow-y-auto p-6 text-brand-text-light dark:text-brand-text-dark max-w-md mx-auto w-full justify-center md:py-12"
      >
        <div className="flex flex-col items-center my-6">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-brand-primary/20 shadow-lg mb-4 bg-white p-1 flex items-center justify-center">
            <img
              src={logoImg}
              alt="Logo do Projeto"
              className="w-full h-full object-cover rounded-full"
              referrerPolicy="no-referrer"
            />
          </div>
          <h2 className="text-xl font-display font-semibold text-center leading-tight">
            Área do Aluno • CGM
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 text-center leading-relaxed max-w-xs">
            Informe o número de matrícula CGM e a senha fornecida pela secretaria escolar para acessar seu portal.
          </p>
        </div>

        {activeError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
          >
            <div className="flex items-start gap-2">
              <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
              <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
            </div>
            <button
              type="button"
              onClick={handleClearError}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0"
            >
              ✕
            </button>
          </motion.div>
        )}

        <form onSubmit={handleCgmSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">MÁTRICULA / CGM</label>
            <div className="relative">
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
                className="w-full h-12 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm font-mono tracking-wider"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Senha do Aluno</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                required
                value={cgmPassword}
                onChange={(e) => setCgmPassword(e.target.value)}
                placeholder="Digite sua senha de acesso"
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 mt-4 bg-brand-primary dark:bg-brand-accent text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
          >
            <LogIn size={18} />
            Conectar na Área do Aluno
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubView("options");
              handleClearError();
            }}
            className="w-full h-12 border-2 border-brand-primary/50 text-brand-accent dark:text-brand-primary font-semibold rounded-2xl flex items-center justify-center hover:bg-black/5 active:scale-98 transition-all mt-1 cursor-pointer"
          >
            Voltar
          </button>
        </form>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-full overflow-y-auto p-6 text-brand-text-light dark:text-brand-text-dark max-w-md mx-auto w-full md:py-8"
    >
      <div className="my-auto py-4">
        <div className="flex items-center justify-between w-full mb-1">
          <button
            type="button"
            onClick={() => onNavigate("welcome")}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-brand-accent transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-brand-card-dark"
          >
            <ArrowLeft size={16} />
            <span>Início</span>
          </button>
        </div>

      <div className="flex flex-col items-center my-4 text-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-brand-primary/20 shadow-lg mb-3 bg-white p-1 flex items-center justify-center">
          <img
            src={logoImg}
            alt="Logo do Projeto"
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          eloEscola
        </h1>
        <p className="text-brand-accent dark:text-brand-primary text-xs sm:text-sm font-semibold mt-0.5">
          Colégio Estadual Helena Wysocki
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mt-1.5 leading-relaxed">
          Portal integrado de divulgação de eventos, feiras culturais, atividades esportivas e mapa escolar.
        </p>
      </div>

      {activeError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start justify-between gap-2.5"
        >
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-[10px] mt-0.5">!</span>
            <p className="leading-snug text-slate-800 dark:text-slate-200">{activeError}</p>
          </div>
          <button
            type="button"
            onClick={handleClearError}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-sm shrink-0"
          >
            ✕
          </button>
        </motion.div>
      )}

      <form onSubmit={handleStandardSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Email ou Registro
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@gmail.com"
              className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Senha</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveSubView("forgot")}
          className="text-start text-xs font-medium text-brand-accent dark:text-brand-primary hover:underline mt-1 self-start cursor-pointer"
        >
          Esqueci minha senha
        </button>

        <button
          type="submit"
          className="w-full h-12 mt-4 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
        >
          <LogIn size={18} />
          Entrar
        </button>
      </form>

      <div className="flex items-center gap-2 my-6">
        <hr className="flex-1 opacity-20 border-brand-primary" />
        <span className="text-xs text-slate-400 font-mono tracking-wider uppercase">Ou conecte com</span>
        <hr className="flex-1 opacity-20 border-brand-primary" />
      </div>

      <div className="flex flex-col gap-3">
        {/* Conectar área do aluno button */}
        <button
          onClick={() => setActiveSubView("aluno_cgm")}
          type="button"
          className="w-full h-12 bg-emerald-50 text-emerald-700 font-semibold border-2 border-emerald-300 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-100/50 active:scale-98 transition-all cursor-pointer"
        >
          <GraduationCap size={18} className="text-emerald-600" />
          Conectar com Área do Aluno
          <ChevronRight size={16} className="text-emerald-500 ml-1" />
        </button>

        {/* Google OAuth Login Button */}
        <button
          onClick={onGoogleLogin}
          disabled={isLoading}
          type="button"
          className="w-full h-12 bg-white text-slate-700 font-semibold border-2 border-slate-200 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-50 active:scale-98 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          id="btn-login-google"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
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
          {isLoading ? "Conectando..." : "Entrar com Google"}
        </button>

        {/* Botão Criar Conta */}
        <button
          onClick={() => onNavigate("register")}
          type="button"
          className="w-full h-12 mt-2 font-semibold text-brand-accent dark:text-brand-primary border-2 border-brand-primary/50 hover:border-brand-primary rounded-2xl flex items-center justify-center transition-all cursor-pointer"
        >
          Criar nova conta escolar
        </button>

        {/* Acesso exclusivo da Diretoria */}
        <button
          type="button"
          onClick={() => {
            setEmail("diretoria@helenawysocki.com");
            setPassword("senha123");
            handleClearError();
          }}
          className="w-full py-2 px-3 text-[11px] font-medium text-slate-500 hover:text-brand-accent dark:hover:text-brand-primary rounded-xl hover:bg-slate-100 dark:hover:bg-brand-card-dark transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-1"
        >
          <ShieldCheck size={14} className="text-brand-accent dark:text-brand-primary" />
          <span>Acesso Exclusivo da Diretoria (Admin)</span>
        </button>
      </div>

      <p className="text-[10px] text-center text-slate-400 mt-6 mb-4">
        © 2026 Escola estadual Helena Wysocki. Todos os direitos reservados.
      </p>
    </div>
  </motion.div>
  );
}
