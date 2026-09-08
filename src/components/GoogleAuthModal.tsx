import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Key,
  GraduationCap,
  Mail,
  CheckCircle2,
  ChevronRight
} from "lucide-react";

interface GoogleAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryOfficialLogin?: () => Promise<void> | void;
  onNavigateToLocal?: () => void;
  onNavigateToCgm?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  errorType?: "popup_blocked" | "provider_disabled" | "unauthorized_domain" | "general";
}

export default function GoogleAuthModal({
  isOpen,
  onClose,
  onRetryOfficialLogin,
  onNavigateToLocal,
  onNavigateToCgm,
  isLoading = false,
  errorMessage,
  errorType = "general"
}: GoogleAuthModalProps) {
  const [showConfigGuide, setShowConfigGuide] = useState(false);

  if (!isOpen) return null;

  const isPopupBlocked = errorType === "popup_blocked" || errorMessage?.toLowerCase().includes("pop-up") || errorMessage?.toLowerCase().includes("popup");
  const isProviderDisabled = errorType === "provider_disabled" || errorMessage?.toLowerCase().includes("provider") || errorMessage?.toLowerCase().includes("não habilitado");

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans antialiased">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-slate-800 relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Fechar"
        >
          <X size={20} />
        </button>

        {/* Header with authentic Google Logo */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center mb-3">
            <svg className="w-7 h-7" viewBox="0 0 24 24">
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

          <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">
            Autenticação Google
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
            {isPopupBlocked
              ? "O navegador bloqueou a abertura da janela oficial de seleção de conta do Google."
              : isProviderDisabled
              ? "O provedor Google OAuth está aguardando ativação no painel de controle do Supabase."
              : "Status da conexão entre o aplicativo e a autenticação oficial do Google."}
          </p>
        </div>

        {/* Notification details */}
        <div className="my-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                {isPopupBlocked
                  ? "Permitir pop-ups para continuar:"
                  : isProviderDisabled
                  ? "Configuração Externa Pendente:"
                  : "Aviso de Conexão:"}
              </p>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                {isPopupBlocked
                  ? "Clique no ícone de pop-up na barra de endereço do seu navegador e selecione 'Sempre permitir pop-ups'."
                  : isProviderDisabled
                  ? "Para que o Google exiba a tela 'Escolha uma conta', habilite o provedor Google no Supabase (Authentication > Providers > Google)."
                  : errorMessage || "Não foi possível carregar o diálogo oficial do Google no momento."}
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Button: Retry Google */}
        <div className="flex flex-col gap-2.5 mt-2">
          {onRetryOfficialLogin && (
            <button
              onClick={onRetryOfficialLogin}
              disabled={isLoading}
              className="w-full h-11 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2.5 text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
              <span>{isLoading ? "Abrindo Google..." : "Tentar Conectar com Google Novamente"}</span>
            </button>
          )}

          {/* Alternative: Local Email/Password */}
          {onNavigateToLocal && (
            <button
              onClick={() => {
                onClose();
                onNavigateToLocal();
              }}
              className="w-full h-11 bg-brand-primary text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-xs shadow-xs hover:opacity-95 transition-all cursor-pointer"
            >
              <Mail size={15} />
              <span>Entrar com E-mail Escolar e Senha</span>
            </button>
          )}

          {/* Alternative: CGM */}
          {onNavigateToCgm && (
            <button
              onClick={() => {
                onClose();
                onNavigateToCgm();
              }}
              className="w-full h-11 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 font-semibold rounded-xl flex items-center justify-center gap-2 text-xs hover:bg-emerald-100/50 transition-all cursor-pointer"
            >
              <GraduationCap size={15} />
              <span>Acessar via CGM (Área do Aluno)</span>
            </button>
          )}
        </div>

        {/* Expandable Guide for Administrators */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowConfigGuide(!showConfigGuide)}
            className="w-full text-left text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-between cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <Key size={13} className="text-brand-accent" />
              <span>Instruções para o Administrador (Supabase & Google Cloud)</span>
            </span>
            <ChevronRight
              size={14}
              className={`transform transition-transform ${showConfigGuide ? "rotate-90" : ""}`}
            />
          </button>

          <AnimatePresence>
            {showConfigGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="text-[11px] text-slate-600 dark:text-slate-300 space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 leading-relaxed overflow-hidden"
              >
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1.5">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    Como ativar o Google OAuth no Supabase:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400">
                    <li>Acesse o <strong>Google Cloud Console</strong> &gt; APIs &amp; Services &gt; Credentials.</li>
                    <li>Crie um <strong>OAuth Client ID</strong> para aplicação Web.</li>
                    <li>No painel do <strong>Supabase</strong>, vá em <strong>Authentication &gt; Providers &gt; Google</strong>.</li>
                    <li>Ative o botão e insira o <strong>Client ID</strong> e <strong>Client Secret</strong>.</li>
                    <li>Adicione a URL de callback do Supabase aos URIs de redirecionamento autorizados no Google Cloud.</li>
                  </ol>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
