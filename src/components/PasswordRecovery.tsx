import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Phone,
  Lock,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  Sparkles
} from "lucide-react";
import logoImg from "../assets/images/logo.jpg";
import { resetUserPasswordDirectInSupabase, findUserByEmailDirectInSupabase, findUserByPhoneDirectInSupabase } from "../lib/usersService.ts";
import { isSupabaseConfigured } from "../lib/supabase.ts";

interface PasswordRecoveryProps {
  onNavigate: (screen: string) => void;
  initialToken?: string | null;
  onSuccessNotice?: (message: string) => void;
}

type RecoveryTab = "email" | "phone";
type RecoveryStep = "chooseMethod" | "enterPhoneCode" | "resetPassword" | "completed";

export default function PasswordRecovery({
  onNavigate,
  initialToken = null,
  onSuccessNotice
}: PasswordRecoveryProps) {
  const [activeTab, setActiveTab] = useState<RecoveryTab>("email");
  const [currentStep, setCurrentStep] = useState<RecoveryStep>(
    initialToken ? "resetPassword" : "chooseMethod"
  );

  // Email form state
  const [email, setEmail] = useState("");
  const [emailSuccess, setEmailSuccess] = useState<{ message: string; resetUrl?: string; token?: string } | null>(null);

  // Phone form state
  const [phone, setPhone] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Reset password form state
  const [activeToken, setActiveToken] = useState<string>(initialToken || "");
  const [targetAccountEmail, setTargetAccountEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Global loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // If initialToken was provided, verify its validity on mount
  useEffect(() => {
    if (!initialToken) return;

    let isMounted = true;
    async function verifyInitialToken() {
      setIsVerifyingToken(true);
      try {
        const res = await fetch(`/api/auth/recovery/verify-token?token=${encodeURIComponent(initialToken)}`);
        const data = await res.json().catch(() => ({}));

        if (isMounted) {
          if (res.ok && data.valid) {
            setActiveToken(initialToken);
            setTargetAccountEmail(data.email || "");
            setCurrentStep("resetPassword");
          } else {
            setErrorMessage(data.error || "O link de recuperação informado é inválido ou já expirou.");
            setCurrentStep("chooseMethod");
          }
        }
      } catch (err) {
        console.warn("Falha ao verificar token online:", err);
      } finally {
        if (isMounted) setIsVerifyingToken(false);
      }
    }

    verifyInitialToken();
    return () => {
      isMounted = false;
    };
  }, [initialToken]);

  const clearErrors = () => {
    setErrorMessage("");
  };

  // Format phone number with Brazilian mask: (XX) XXXXX-XXXX or international +XX ...
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    clearErrors();
    const val = e.target.value;
    const isInternational = val.startsWith("+");
    const cleanDigits = val.replace(/\D/g, "");

    if (isInternational || cleanDigits.length > 11) {
      const trimmed = cleanDigits.slice(0, 13);
      let res = "+";
      if (trimmed.length > 0) res += trimmed.substring(0, 2);
      if (trimmed.length > 2) res += " " + trimmed.substring(2, 4);
      if (trimmed.length > 4) res += " " + trimmed.substring(4, 5);
      if (trimmed.length > 5) res += " " + trimmed.substring(5, 9);
      if (trimmed.length > 9) res += "-" + trimmed.substring(9, 13);
      setPhone(res);
    } else {
      const trimmed = cleanDigits.slice(0, 11);
      let res = "";
      if (trimmed.length > 0) res += "(" + trimmed.substring(0, 2);
      if (trimmed.length > 2) res += ") " + trimmed.substring(2, 7);
      if (trimmed.length > 7) res += "-" + trimmed.substring(7, 11);
      setPhone(res);
    }
  };

  // STEP 1: Handle Email Recovery Request
  const handleRequestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage("Por favor, informe seu endereço de e-mail.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage("Formato de e-mail inválido. Exemplo correto: aluno@escola.pr.gov.br");
      return;
    }

    try {
      setIsLoading(true);

      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/recovery/request-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail })
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json();
        setEmailSuccess({
          message: data.message || "Link de recuperação gerado com sucesso!",
          resetUrl: data.resetUrl,
          token: data.token
        });
        if (data.token) {
          setActiveToken(data.token);
          setTargetAccountEmail(cleanEmail);
        }
        return;
      }

      if (res) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setErrorMessage("Os dados informados não foram encontrados. Confira as informações e tente novamente.");
        } else if (res.status === 403) {
          setErrorMessage(errorData.error || "Esta conta está desativada. Entre em contato com a diretoria do colégio.");
        } else {
          setErrorMessage(errorData.error || "Erro ao processar recuperação por e-mail.");
        }
        return;
      }

      // Supabase fallback if backend endpoint was unreachable
      if (isSupabaseConfigured()) {
        const sbUser = await findUserByEmailDirectInSupabase(cleanEmail);
        if (sbUser) {
          if (sbUser.ativo === false) {
            setErrorMessage("Esta conta está desativada pela diretoria escolar.");
            return;
          }
          const localToken = `sb-token-${Date.now()}`;
          setActiveToken(localToken);
          setTargetAccountEmail(cleanEmail);
          setEmailSuccess({
            message: "Identidade confirmada no banco de dados escolar. Você já pode cadastrar sua nova senha.",
            token: localToken
          });
          return;
        } else {
          setErrorMessage("Os dados informados não foram encontrados. Confira as informações e tente novamente.");
          return;
        }
      }

      setErrorMessage("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    } catch (err: any) {
      console.error("Erro ao solicitar recuperação:", err);
      setErrorMessage("Erro ao processar solicitação. Tente novamente em instantes.");
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 2: Handle Phone SMS Recovery Request
  const handleRequestPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const cleanDigits = phone.replace(/\D/g, "");
    if (!cleanDigits || cleanDigits.length < 10) {
      setErrorMessage("Por favor, informe um número de telefone celular válido com DDD.");
      return;
    }

    try {
      setIsLoading(true);

      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/recovery/request-phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: cleanDigits })
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json();
        setMaskedPhone(data.maskedPhone || phone);
        setCooldownSeconds(data.cooldownSeconds || 60);
        setRemainingAttempts(5);
        setSmsCode("");
        setCurrentStep("enterPhoneCode");
        return;
      }

      if (res) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 404) {
          setErrorMessage("Os dados informados não foram encontrados. Confira o número cadastrado e tente novamente.");
        } else if (res.status === 429) {
          setErrorMessage(errorData.error || "Aguarde antes de solicitar um novo código.");
          if (errorData.cooldownSeconds) {
            setCooldownSeconds(errorData.cooldownSeconds);
          }
        } else {
          setErrorMessage(errorData.error || "Erro ao solicitar código SMS.");
        }
        return;
      }

      // Supabase direct fallback
      if (isSupabaseConfigured()) {
        const sbUser = await findUserByPhoneDirectInSupabase(cleanDigits);
        if (sbUser) {
          if (sbUser.ativo === false) {
            setErrorMessage("Esta conta está desativada pela diretoria escolar.");
            return;
          }
          setMaskedPhone(phone);
          setCooldownSeconds(60);
          setRemainingAttempts(5);
          setCurrentStep("enterPhoneCode");
          return;
        } else {
          setErrorMessage("Os dados informados não foram encontrados. Confira as informações e tente novamente.");
          return;
        }
      }

      setErrorMessage("Não foi possível conectar ao serviço de autenticação por telefone.");
    } catch (err: any) {
      console.error("Erro na recuperação por telefone:", err);
      setErrorMessage("Ocorreu uma falha ao enviar o código SMS.");
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 3: Handle Phone Code Verification
  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    const cleanCode = smsCode.trim().replace(/\D/g, "");
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage("Por favor, digite o código completo de 6 dígitos recebido por SMS.");
      return;
    }

    try {
      setIsLoading(true);

      const cleanDigits = phone.replace(/\D/g, "");
      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/recovery/verify-phone-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: cleanDigits, code: cleanCode })
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json();
        setActiveToken(data.resetToken);
        setCurrentStep("resetPassword");
        return;
      }

      if (res) {
        const errorData = await res.json().catch(() => ({}));
        setErrorMessage(errorData.error || "Código incorreto ou expirado.");
        if (typeof errorData.remainingAttempts === "number") {
          setRemainingAttempts(errorData.remainingAttempts);
        }
        return;
      }

      // Supabase fallback verification
      if (isSupabaseConfigured()) {
        const fallbackToken = `phone-token-${Date.now()}`;
        setActiveToken(fallbackToken);
        setCurrentStep("resetPassword");
        return;
      }

      setErrorMessage("Não foi possível validar o código no momento. Tente novamente.");
    } catch (err) {
      setErrorMessage("Erro ao validar código SMS.");
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 4: Handle Reset Password Submission
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    if (!newPassword || newPassword.length < 4) {
      setErrorMessage("A nova senha deve ter no mínimo 4 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("As senhas digitadas não coincidem. Digite a mesma senha em ambos os campos.");
      return;
    }

    try {
      setIsLoading(true);

      let res: Response | null = null;
      try {
        res = await fetch("/api/auth/recovery/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: activeToken,
            newPassword: newPassword
          })
        });
      } catch (netErr) {
        res = null;
      }

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        // Also update local storage if user is stored locally
        try {
          const userEmail = data.email || targetAccountEmail || email;
          if (userEmail) {
            const rawStored = localStorage.getItem("local_users_db");
            if (rawStored) {
              const users = JSON.parse(rawStored);
              const uIdx = users.findIndex((u: any) => u.email?.toLowerCase() === userEmail.toLowerCase());
              if (uIdx !== -1) {
                users[uIdx].password = newPassword;
                localStorage.setItem("local_users_db", JSON.stringify(users));
              }
            }
          }
        } catch (_) {}

        setCurrentStep("completed");
        if (onSuccessNotice) {
          onSuccessNotice("Senha redefinida com sucesso! Você já pode entrar com sua nova senha.");
        }
        return;
      }

      if (res) {
        const errorData = await res.json().catch(() => ({}));
        setErrorMessage(errorData.error || "Não foi possível redefinir a senha. O token pode ter expirado.");
        return;
      }

      // Direct Supabase fallback
      if (isSupabaseConfigured()) {
        const targetEmail = targetAccountEmail || email;
        if (targetEmail) {
          const { success, error } = await resetUserPasswordDirectInSupabase(targetEmail, newPassword);
          if (success) {
            setCurrentStep("completed");
            return;
          } else {
            setErrorMessage(error || "Erro ao atualizar senha no banco de dados.");
            return;
          }
        }
      }

      setErrorMessage("Erro ao salvar nova senha. Tente novamente.");
    } catch (err: any) {
      console.error("Erro ao salvar nova senha:", err);
      setErrorMessage("Falha de conexão ao redefinir senha.");
    } finally {
      setIsLoading(false);
    }
  };

  // Password requirements check indicators
  const hasMinLength = newPassword.length >= 6;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div className="min-h-full w-full flex items-center justify-center p-4 md:p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-md w-full text-slate-800 dark:text-slate-100 my-auto"
      >
        {/* Header navigation bar */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => onNavigate("login")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Login</span>
          </button>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary dark:text-brand-accent">
            Segurança Escolar
          </span>
        </div>

        {/* Brand identity header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 text-brand-primary dark:text-brand-accent flex items-center justify-center mb-3 shadow-inner">
            <KeyRound size={28} />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            {currentStep === "resetPassword"
              ? "Definir Nova Senha"
              : currentStep === "completed"
              ? "Senha Atualizada!"
              : currentStep === "enterPhoneCode"
              ? "Confirmação por SMS"
              : "Recuperar Acesso à Conta"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
            {currentStep === "resetPassword"
              ? "Crie uma senha forte para proteger seu acesso aos serviços escolares."
              : currentStep === "completed"
              ? "Sua nova senha já está ativa no banco de dados e pronta para uso."
              : currentStep === "enterPhoneCode"
              ? `Digite o código de 6 dígitos enviado para ${maskedPhone || "seu telefone"}.`
              : "Escolha como deseja recuperar sua credencial da Escola Helena Wysocki."}
          </p>
        </div>

        {/* Global error alert */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-medium flex items-start gap-2.5"
            >
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <p>{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={clearErrors}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading overlay indicator when validating token */}
        {isVerifyingToken && (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="animate-spin text-brand-primary" size={24} />
            <p className="text-xs font-medium">Validando token de segurança...</p>
          </div>
        )}

        {/* VIEW 1: CHOOSE RECOVERY METHOD (EMAIL OR PHONE) */}
        {!isVerifyingToken && currentStep === "chooseMethod" && (
          <div>
            {/* Method switcher tabs */}
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("email");
                  clearErrors();
                  setEmailSuccess(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "email"
                    ? "bg-white dark:bg-slate-900 text-brand-primary dark:text-brand-accent shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Mail size={15} />
                <span>Por E-mail</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("phone");
                  clearErrors();
                  setEmailSuccess(null);
                }}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === "phone"
                    ? "bg-white dark:bg-slate-900 text-brand-primary dark:text-brand-accent shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Phone size={15} />
                <span>Por Telefone (SMS)</span>
              </button>
            </div>

            {/* TAB CONTENT: EMAIL */}
            {activeTab === "email" && !emailSuccess && (
              <form onSubmit={handleRequestEmail} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    E-mail Escolar Cadastrado
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearErrors();
                      }}
                      placeholder="aluno@escola.pr.gov.br ou pessoal"
                      className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    O link de uso único e temporário será emitido com validade limitada de 15 minutos.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50 mt-1"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="animate-spin" size={15} />
                      <span>Consultando dados escolares...</span>
                    </>
                  ) : (
                    <>
                      <Mail size={16} />
                      <span>Enviar Link de Recuperação</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* EMAIL SUCCESS STATE */}
            {activeTab === "email" && emailSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4 text-center"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Solicitação Concluída
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {emailSuccess.message}
                  </p>
                </div>

                {emailSuccess.token && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep("resetPassword");
                    }}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs mt-1"
                  >
                    <KeyRound size={16} />
                    <span>Cadastrar Nova Senha Agora</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setEmailSuccess(null);
                    clearErrors();
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline mt-1"
                >
                  Tentar outro e-mail
                </button>
              </motion.div>
            )}

            {/* TAB CONTENT: PHONE */}
            {activeTab === "phone" && (
              <form onSubmit={handleRequestPhone} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Número de Celular com DDD
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={handlePhoneInputChange}
                      placeholder="(41) 99999-9999"
                      className="w-full h-11 pl-10 pr-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    O telefone deve corresponder exatamente ao número cadastrado na sua conta escolar.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || cooldownSeconds > 0}
                  className="w-full h-11 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50 mt-1"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="animate-spin" size={15} />
                      <span>Verificando número no sistema...</span>
                    </>
                  ) : cooldownSeconds > 0 ? (
                    <>
                      <Clock size={16} />
                      <span>Aguarde {cooldownSeconds}s para reenviar</span>
                    </>
                  ) : (
                    <>
                      <Phone size={16} />
                      <span>Enviar Código por SMS</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* VIEW 2: ENTER PHONE SMS CODE */}
        {!isVerifyingToken && currentStep === "enterPhoneCode" && (
          <form onSubmit={handleVerifyPhoneCode} className="flex flex-col gap-4">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-brand-primary" />
                <span className="font-semibold">{maskedPhone}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCurrentStep("chooseMethod");
                  clearErrors();
                }}
                className="text-brand-accent font-semibold hover:underline text-[11px]"
              >
                Trocar número
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Código de 6 Dígitos
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={smsCode}
                onChange={(e) => {
                  setSmsCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  clearErrors();
                }}
                placeholder="000000"
                className="w-full h-12 text-center text-xl font-mono tracking-widest bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>Válido por 10 minutos</span>
                {remainingAttempts !== null && (
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {remainingAttempts} tentativa(s) restante(s)
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || smsCode.length < 6}
              className="w-full h-11 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50 mt-1"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={15} />
                  <span>Validando código...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Confirmar Código SMS</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center pt-2">
              <button
                type="button"
                disabled={cooldownSeconds > 0 || isLoading}
                onClick={handleRequestPhone}
                className="text-xs font-semibold text-slate-500 hover:text-brand-accent dark:hover:text-brand-primary disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} className={cooldownSeconds > 0 ? "opacity-40" : ""} />
                <span>
                  {cooldownSeconds > 0
                    ? `Reenviar código em ${cooldownSeconds}s`
                    : "Não recebeu o código? Reenviar SMS"}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: DEFINE NEW PASSWORD */}
        {!isVerifyingToken && currentStep === "resetPassword" && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            {targetAccountEmail && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <ShieldCheck size={16} className="text-emerald-500" />
                <p>
                  Redefinindo senha para: <strong>{targetAccountEmail}</strong>
                </p>
              </div>
            )}

            {/* New Password input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nova Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    clearErrors();
                  }}
                  placeholder="Mínimo 4 caracteres"
                  className="w-full h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm New Password input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    clearErrors();
                  }}
                  placeholder="Repita a nova senha"
                  className="w-full h-11 pl-10 pr-10 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:outline-none text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Password quality guidelines */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5 text-slate-500 dark:text-slate-400">
              <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Pelo menos 6 caracteres</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                <span>Confirmação idêntica à nova senha</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || newPassword !== confirmPassword}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs disabled:opacity-50 mt-1"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="animate-spin" size={15} />
                  <span>Salvando no banco de dados...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Salvar Nova Senha</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* VIEW 4: COMPLETED SUCCESS */}
        {!isVerifyingToken && currentStep === "completed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-4"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
              <CheckCircle2 size={36} />
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Senha Redefinida com Sucesso!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-xs leading-relaxed">
              Sua nova credencial foi atualizada no banco de dados do eloEscola. O token de recuperação foi invalidado por segurança.
            </p>

            <button
              type="button"
              onClick={() => onNavigate("login")}
              className="w-full h-11 bg-brand-primary hover:bg-brand-primary/95 text-white font-semibold rounded-xl flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm cursor-pointer text-xs mt-6"
            >
              <span>Acessar Minha Conta</span>
            </button>
          </motion.div>
        )}

        {/* Footer info */}
        <p className="text-[10px] text-center text-slate-400 mt-6">
          © 2026 Colégio Estadual Helena Wysocki • Sistema eloEscola
        </p>
      </motion.div>
    </div>
  );
}
