import React, { useState } from "react";
import { motion } from "motion/react";
import { X, CheckCircle, ShieldCheck, Mail, ArrowRight, User as UserIcon } from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmGoogleLogin: (email: string, name?: string) => Promise<void>;
  isLoading: boolean;
}

export default function GoogleAuthModal({
  isOpen,
  onClose,
  onConfirmGoogleLogin,
  isLoading,
}: GoogleAuthModalProps) {
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const defaultAccount = {
    name: "David Ribeiro Müller",
    email: "davidribeiromuller2009@gmail.com",
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120",
  };

  const handleSelectDefault = () => {
    setError("");
    onConfirmGoogleLogin(defaultAccount.email, defaultAccount.name);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = customEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Por favor, digite um e-mail Google válido (ex: @gmail.com ou @escola.pr.gov.br).");
      return;
    }
    const derivedName = customName.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " ");
    onConfirmGoogleLogin(cleanEmail, derivedName);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative text-slate-800 dark:text-slate-100"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Google Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-white shadow-md border border-slate-200 flex items-center justify-center mb-3">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
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

          <h3 className="text-lg font-bold">Fazer login com o Google</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Escolha uma conta para continuar no <strong>Portal Helena Wysocki</strong>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        {!useManual ? (
          <div className="flex flex-col gap-3">
            {/* Detected / Default Google Account */}
            <button
              onClick={handleSelectDefault}
              disabled={isLoading}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl border-2 border-[#1A73E8]/30 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/40 active:scale-98 transition-all text-start cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-[#1A73E8] text-white font-bold flex items-center justify-center shadow-xs">
                D
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#1A73E8] transition-colors truncate">
                  {defaultAccount.name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {defaultAccount.email}
                </p>
              </div>
              <CheckCircle size={18} className="text-[#1A73E8] shrink-0" />
            </button>

            {/* Use another Google account */}
            <button
              onClick={() => setUseManual(true)}
              type="button"
              className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-start text-xs font-medium transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <UserIcon size={16} />
              </div>
              <span className="flex-1">Usar outra conta Google</span>
              <ArrowRight size={15} className="text-slate-400" />
            </button>

            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <ShieldCheck size={13} className="text-emerald-500" />
              <span>Conexão direta e segura com o serviço escolar</span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                E-mail da Conta Google
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  required
                  autoFocus
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="seu.nome@gmail.com"
                  className="w-full h-11 pl-9 pr-3 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1A73E8]/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Nome de Exibição (Opcional)
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex: David Müller"
                className="w-full h-11 px-3 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-[#1A73E8]/50 focus:outline-none"
              />
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-[#1A73E8] hover:bg-[#1557b0] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? "Conectando..." : "Entrar com Esta Conta"}
              </button>

              <button
                type="button"
                onClick={() => setUseManual(false)}
                className="w-full h-9 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
