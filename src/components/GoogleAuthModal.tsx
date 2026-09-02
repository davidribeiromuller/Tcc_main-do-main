import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Globe, ShieldCheck, UserPlus, ArrowRight, CheckCircle2, User, ChevronRight } from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmGoogleLogin: (email: string, name?: string, role?: string) => Promise<void>;
  onTriggerOfficialPopup?: () => Promise<void>;
  isLoading: boolean;
  registeredUsers?: any[];
}

export default function GoogleAuthModal({
  isOpen,
  onClose,
  onConfirmGoogleLogin,
  onTriggerOfficialPopup,
  isLoading,
  registeredUsers = [],
}: GoogleAuthModalProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("Aluno");

  if (!isOpen) return null;

  const defaultSuggestedAccounts = [
    {
      name: "David Ribeiro Müller",
      email: "davidribeiromuller2009@gmail.com",
      role: "Diretor",
      isAdmin: true,
      badge: "Diretoria",
      avatarBg: "bg-blue-600"
    },
    {
      name: "Diretoria Helena Wysocki",
      email: "diretoria@helenawysocki.com",
      role: "Diretor",
      isAdmin: true,
      badge: "Administrador",
      avatarBg: "bg-indigo-600"
    },
    {
      name: "Aluno Institucional",
      email: "aluno.wysocki@gmail.com",
      role: "Aluno",
      isAdmin: false,
      badge: "Aluno",
      avatarBg: "bg-emerald-600"
    }
  ];

  const handleSelectAccount = (email: string, name?: string, role?: string) => {
    onConfirmGoogleLogin(email, name, role);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim()) return;
    const cleanEmail = customEmail.trim().toLowerCase();
    const cleanName = customName.trim() || cleanEmail.split("@")[0].replace(/[._]/g, " ");
    onConfirmGoogleLogin(cleanEmail, cleanName, customRole);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 font-sans antialiased">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="bg-white dark:bg-[#202124] rounded-[28px] max-w-[440px] w-full p-6 sm:p-8 shadow-2xl border border-[#dadce0] dark:border-[#5f6368] relative text-[#202124] dark:text-[#e8eaed] max-h-[90vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-full text-[#5f6368] dark:text-[#9aa0a6] hover:text-[#202124] dark:hover:text-white hover:bg-[#f1f3f4] dark:hover:bg-[#303134] transition-colors cursor-pointer"
          title="Fechar"
        >
          <X size={20} />
        </button>

        {/* Google Header */}
        <div className="flex flex-col items-center text-center">
          {/* Authentic Google 4-color Logo */}
          <div className="mb-3.5">
            <svg className="w-10 h-10" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </div>

          <h2 className="text-[20px] sm:text-[22px] font-normal text-[#202124] dark:text-[#e8eaed] leading-snug">
            Fazer login com o Google
          </h2>
          <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] mt-1 font-normal leading-relaxed">
            Escolha uma conta para acessar o sistema da <span className="font-medium text-[#202124] dark:text-white">Escola Estadual Helena Wysocki</span>
          </p>
        </div>

        {/* Google Account List */}
        <div className="mt-5">
          <div className="border border-[#dadce0] dark:border-[#5f6368] rounded-2xl overflow-hidden divide-y divide-[#dadce0] dark:divide-[#5f6368] bg-white dark:bg-[#202124]">
            {defaultSuggestedAccounts.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleSelectAccount(acc.email, acc.name, acc.role)}
                disabled={isLoading}
                className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-[#f8f9fa] dark:hover:bg-[#303134] text-start transition-all cursor-pointer group active:bg-[#f1f3f4] dark:active:bg-[#3c4043] disabled:opacity-50"
              >
                <div className={`w-10 h-10 rounded-full ${acc.avatarBg} text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform`}>
                  {acc.name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-medium text-[#202124] dark:text-[#e8eaed] group-hover:text-[#1a73e8] dark:group-hover:text-[#8ab4f8] truncate">
                      {acc.name}
                    </p>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#e8f0fe] dark:bg-[#174ea6]/40 text-[#1a73e8] dark:text-[#8ab4f8] shrink-0">
                      {acc.badge}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] truncate font-mono mt-0.5">
                    {acc.email}
                  </p>
                </div>

                <ChevronRight size={16} className="text-[#5f6368] dark:text-[#9aa0a6] group-hover:text-[#1a73e8] dark:group-hover:text-[#8ab4f8] shrink-0" />
              </button>
            ))}

            {/* Custom Google Account Entry Button */}
            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              disabled={isLoading}
              className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-[#f8f9fa] dark:hover:bg-[#303134] text-start transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 border border-dashed border-slate-300 dark:border-slate-600 group-hover:border-[#1a73e8]">
                <UserPlus size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1a73e8] dark:text-[#8ab4f8] group-hover:underline">
                  {showCustomInput ? "Ocultar formulário de e-mail" : "Usar outra conta Google"}
                </p>
                <p className="text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
                  Acesse com qualquer e-mail @gmail.com ou institucional
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Custom Google Account Input Form */}
        <AnimatePresence>
          {showCustomInput && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleCustomSubmit}
              className="mt-3.5 p-4 rounded-2xl bg-slate-50 dark:bg-[#303134] border border-[#dadce0] dark:border-[#5f6368] flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Endereço de E-mail Google*
                </label>
                <input
                  type="email"
                  required
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full h-10 px-3 text-xs bg-white dark:bg-[#202124] border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#1a73e8] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full h-10 px-3 text-xs bg-white dark:bg-[#202124] border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#1a73e8] focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Perfil Escolar
                  </label>
                  <select
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    className="w-full h-10 px-2 text-xs bg-white dark:bg-[#202124] border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#1a73e8] focus:outline-none"
                  >
                    <option value="Aluno">Aluno</option>
                    <option value="Professor">Professor</option>
                    <option value="Funcionário">Funcionário</option>
                    <option value="Diretor">Diretor</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !customEmail.trim()}
                className="w-full h-10 mt-1 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar com esta conta Google</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Google Official Terms & Privacy Text */}
        <div className="mt-5 pt-3.5 border-t border-[#dadce0] dark:border-[#3c4043] text-[11px] text-[#5f6368] dark:text-[#9aa0a6] leading-relaxed">
          <p>
            O Google compartilhará seu nome, endereço de e-mail e foto do perfil com o <strong className="font-semibold text-[#202124] dark:text-[#e8eaed]">Colégio Helena Wysocki</strong> para sincronização de notas, agenda e avisos escolares.
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#1e8e3e] dark:text-[#81c995]">
            <ShieldCheck size={14} className="shrink-0" />
            <span>Login com Google permitido para todos os usuários</span>
          </div>
        </div>

        {/* Authentic Google Footer Bar */}
        <div className="mt-4 pt-2.5 flex items-center justify-between text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
          <div className="flex items-center gap-1 hover:text-[#202124] dark:hover:text-white cursor-pointer">
            <Globe size={12} />
            <span>Português (Brasil)</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://support.google.com/accounts" target="_blank" rel="noreferrer" className="hover:text-[#1a73e8] dark:hover:text-[#8ab4f8]">
              Ajuda
            </a>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="hover:text-[#1a73e8] dark:hover:text-[#8ab4f8]">
              Privacidade
            </a>
            <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="hover:text-[#1a73e8] dark:hover:text-[#8ab4f8]">
              Termos
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
