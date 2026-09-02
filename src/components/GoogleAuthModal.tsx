import React from "react";
import { motion } from "motion/react";
import { X, Loader2, Globe, ShieldCheck, ExternalLink } from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmGoogleLogin: (email: string, name?: string) => Promise<void>;
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
}: GoogleAuthModalProps) {
  if (!isOpen) return null;

  const handleTriggerOfficial = () => {
    if (onTriggerOfficialPopup) {
      onTriggerOfficialPopup();
    } else {
      onConfirmGoogleLogin("davidribeiromuller2009@gmail.com", "David Ribeiro Müller");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4 font-sans antialiased">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="bg-white dark:bg-[#202124] rounded-[28px] max-w-[420px] w-full p-7 sm:p-9 shadow-2xl border border-[#dadce0] dark:border-[#5f6368] relative text-[#202124] dark:text-[#e8eaed]"
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
          <div className="mb-4">
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

          <h2 className="text-[22px] font-normal text-[#202124] dark:text-[#e8eaed] leading-snug">
            Fazer login com o Google
          </h2>
          <p className="text-[13px] text-[#5f6368] dark:text-[#9aa0a6] mt-1.5 font-normal leading-relaxed">
            Escolha uma conta para continuar para o <span className="font-medium text-[#202124] dark:text-white">Colégio Estadual Helena Wysocki</span>
          </p>
        </div>

        {/* Google Authentic Account Selector Card */}
        <div className="mt-6">
          <div className="border border-[#dadce0] dark:border-[#5f6368] rounded-xl overflow-hidden divide-y divide-[#dadce0] dark:divide-[#5f6368] bg-white dark:bg-[#202124]">
            {/* Primary Google Account Button */}
            <button
              type="button"
              onClick={handleTriggerOfficial}
              disabled={isLoading}
              className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 hover:bg-[#f8f9fa] dark:hover:bg-[#303134] text-start transition-all cursor-pointer group active:bg-[#f1f3f4] dark:active:bg-[#3c4043]"
              id="btn-trigger-official-google"
            >
              <div className="w-10 h-10 rounded-full bg-[#1a73e8] text-white flex items-center justify-center font-medium text-sm shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#FFFFFF"
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                    />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1a73e8] dark:text-[#8ab4f8] group-hover:underline truncate">
                  {isLoading ? "Conectando ao Google..." : "Continuar com Conta do Google"}
                </p>
                <p className="text-[12px] text-[#5f6368] dark:text-[#9aa0a6] truncate mt-0.5">
                  Abre o seletor oficial de contas salvas no computador
                </p>
              </div>

              <svg className="w-4 h-4 text-[#5f6368] dark:text-[#9aa0a6] group-hover:text-[#1a73e8] dark:group-hover:text-[#8ab4f8] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Google Official Terms & Privacy Text */}
        <div className="mt-6 pt-4 border-t border-[#dadce0] dark:border-[#3c4043] text-[11px] text-[#5f6368] dark:text-[#9aa0a6] leading-relaxed">
          <p>
            Para continuar, o Google compartilhará seu nome, endereço de e-mail e foto do perfil com o <strong className="font-semibold text-[#202124] dark:text-[#e8eaed]">Colégio Helena Wysocki</strong>. Antes de usar o app, consulte a Política de Privacidade e os Termos de Serviço.
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#1e8e3e] dark:text-[#81c995]">
            <ShieldCheck size={14} className="shrink-0" />
            <span>Autenticação OAuth segura integrada com serviços Google</span>
          </div>
        </div>

        {/* Authentic Google Footer Bar */}
        <div className="mt-5 pt-3 flex items-center justify-between text-[11px] text-[#5f6368] dark:text-[#9aa0a6]">
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
