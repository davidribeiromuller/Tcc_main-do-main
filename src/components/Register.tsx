import React, { useState } from "react";
import { motion } from "motion/react";
import { User2, Mail, Lock, CreditCard, Calendar, Users, Building, ArrowLeft, Phone } from "lucide-react";
import { SCHOOLS_LIST } from "../lib/schools.ts";

interface RegisterProps {
  onRegister: (data: {
    nome: string;
    email: string;
    password?: string;
    cpf: string;
    phone: string;
    birthdate: string;
    gender: string;
    role: string;
    institution: string;
  }) => void;
  onNavigate: (screen: string) => void;
}

export default function Register({ onRegister, onNavigate }: RegisterProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [institution, setInstitution] = useState(SCHOOLS_LIST[0]);
  const [role, setRole] = useState("Aluno");

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState(false);

  // Clear errors as soon as the user corrects the email
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (emailError) setEmailError(false);
    if (error) setError("");
  };

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

  // Apply date mask
  const handleBirthdateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    
    if (value.length > 4) {
      value = value.replace(/(\d{2})(\d{2})(\d{4})/, "$1/$2/$3");
    } else if (value.length > 2) {
      value = value.replace(/(\d{2})(\d{1,2})/, "$1/$2");
    }
    setBirthdate(value);
  };

  const handleNext = async () => {
    setError("");
    setEmailError(false);

    if (!nome.trim()) {
      setError("Por favor, preencha o nome completo!");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Por favor, preencha um email válido!");
      setEmailError(true);
      return;
    }
    if (!password || password.length < 4) {
      setError("Por favor, defina uma senha de pelo menos 4 caracteres!");
      return;
    }
    if (cpf.length < 14) {
      setError("Por favor, digite um CPF válido!");
      return;
    }
    if (!phone.trim() || phone.length < 10) {
      setError("Por favor, digite um Telefone Celular válido!");
      return;
    }

    try {
      setIsCheckingEmail(true);
      const cleanEmail = email.trim().toLowerCase();

      // The server is the source of truth; local storage may contain stale users.
      const checkRes = await fetch(`/api/auth/check-email?email=${encodeURIComponent(cleanEmail)}`);
      if (checkRes.ok) {
        const contentType = checkRes.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const checkData = await checkRes.json();
          if (checkData && checkData.exists === true) {
            setError("Este e-mail já está cadastrado. Por favor, tente fazer login ou use outro e-mail.");
            setEmailError(true);
            return;
          }
        }
      }
    } catch (err) {
      console.log("Validação online do e-mail prosseguindo em modo offline:", err);
    } finally {
      setIsCheckingEmail(false);
    }

    setCurrentStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!birthdate) {
      setError("Por favor, insira sua data de nascimento!");
      return;
    }
    if (!gender) {
      setError("Por favor, selecione seu gênero!");
      return;
    }

    onRegister({
      nome,
      email,
      password,
      cpf,
      phone,
      birthdate,
      gender,
      role: "Aluno",
      institution,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-full overflow-y-auto p-6 text-brand-text-light dark:text-brand-text-dark max-w-md mx-auto w-full md:py-8"
    >
      <div className="my-auto py-4">
        <div className="flex items-center gap-3 my-4">
        <button
          onClick={() => currentStep === 2 ? setCurrentStep(1) : onNavigate("login")}
          className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-brand-card-dark text-slate-600 dark:text-brand-text-dark"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-mono text-slate-400">Passo {currentStep} de 2</span>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold tracking-tight">Criar sua conta</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Informe seus dados escolares para ativar sua credencial
        </p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium flex items-start gap-3"
        >
          <span className="shrink-0 w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 flex items-center justify-center font-bold text-xs">!</span>
          <div className="flex-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Atenção</p>
            <p className="mt-0.5 leading-relaxed">{error}</p>
            {emailError && error.includes("já está cadastrado") && (
              <button
                type="button"
                onClick={() => onNavigate("login")}
                className="mt-2 text-xs font-bold text-brand-primary dark:text-brand-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                Ir para a tela de login →
              </button>
            )}
          </div>
          <button 
            type="button" 
            onClick={() => setError("")} 
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-bold ml-1 text-sm focus:outline-none"
          >
            ✕
          </button>
        </motion.div>
      )}

      {currentStep === 1 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nome completo</label>
            <div className="relative">
              <User2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Hudson W."
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="nome.sobrenome@escola.pr.gov.br"
                className={`w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border ${
                  emailError 
                    ? "border-red-500 dark:border-red-600 focus:ring-red-500/50 focus:border-red-500" 
                    : "border-brand-primary focus:ring-brand-accent/50 focus:border-brand-accent"
                } rounded-xl focus:ring-2 focus:outline-none text-sm`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Definir Senha de Acesso</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">CPF</label>
            <div className="relative">
              <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={cpf}
                onChange={handleCpfChange}
                placeholder="111.111.111-11"
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Número de Celular</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+55 41 9 9999-9999 ou (41) 99999-9999"
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleNext}
            type="button"
            disabled={isCheckingEmail}
            className="w-full h-12 mt-6 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isCheckingEmail ? "Verificando..." : "Continuar"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nascimento</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full h-12 pl-9 pr-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gênero</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full h-12 pl-9 pr-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
                >
                  <option value="">Selecione</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Instituição</label>
            <div className="relative">
              <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="w-full h-12 pl-11 pr-4 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl focus:ring-2 focus:ring-brand-accent/50 focus:outline-none focus:border-brand-accent text-sm"
              >
                {SCHOOLS_LIST.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-12 mt-4 bg-brand-accent text-white font-semibold rounded-2xl flex items-center justify-center hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
          >
            Finalizar Cadastro
          </button>
        </form>
      )}
      </div>
    </motion.div>
  );
}
