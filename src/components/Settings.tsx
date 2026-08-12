import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { User, Bell, Palette, MessageSquare, ChevronRight, ArrowLeft, Save, LogOut, Database, Server, Camera, Upload } from "lucide-react";
import { SCHOOLS_LIST } from "../lib/schools.ts";

const ensureDbDateToInputFormat = (dateVal: string): string => {
  if (!dateVal) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
  const parts = dateVal.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      return `${y}-${m}-${d}`;
    }
  }
  return "";
};

interface SettingsProps {
  user: any;
  onUpdateProfile: (profileData: any) => Promise<void>;
  onNavigate: (screen: string) => void;
  onLogout: () => void;
}

export default function Settings({
  user,
  onUpdateProfile,
  onNavigate,
  onLogout
}: SettingsProps) {
  const [editMode, setEditMode] = useState(false);
  const [nome, setNome] = useState(user?.nome || "");
  const [email, setEmail] = useState(user?.email || "");
  const [cpf, setCpf] = useState(user?.cpf || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate || "");
  const [gender, setGender] = useState(user?.gender || "Masculino");
  const [institution, setInstitution] = useState(user?.institution || SCHOOLS_LIST[0]);
  const [role, setRole] = useState(user?.role || "Aluno");
  const [fotoPerfil, setFotoPerfil] = useState(user?.foto_perfil || "");

  // Keep state in sync with updated user
  useEffect(() => {
    if (user) {
      setNome(user.nome || "");
      setEmail(user.email || "");
      setCpf(user.cpf || "");
      setPhone(user.phone || "");
      setBirthdate(user.birthdate || "");
      setGender(user.gender || "Masculino");
      setInstitution(user.institution || SCHOOLS_LIST[0]);
      setRole(user.role || "Aluno");
      setFotoPerfil(user.foto_perfil || "");
    }
  }, [user]);

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

  const [dbStatus, setDbStatus] = useState<{
    active: boolean;
    provider: string;
    host: string;
    version: string;
    sdkInstalled: boolean;
    error?: string;
  } | null>(null);

  const [isLoadingDbStatus, setIsLoadingDbStatus] = useState(true);

  const fetchDbStatus = () => {
    setIsLoadingDbStatus(true);
    fetch("/api/db-status")
      .then((res) => res.json())
      .then((data) => {
        setDbStatus(data);
        setIsLoadingDbStatus(false);
      })
      .catch((err) => {
        console.warn("Erro ao buscar status do banco:", err);
        setIsLoadingDbStatus(false);
      });
  };

  useEffect(() => {
    if (!editMode) {
      fetchDbStatus();
    }
  }, [editMode]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      alert("Por favor, digite seu nome completo!");
      return;
    }

    await onUpdateProfile({
      nome,
      email,
      cpf,
      phone,
      birthdate,
      gender,
      institution,
      role,
      foto_perfil: fotoPerfil
    });

    setEditMode(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 p-6">
          {editMode ? (
            <button
              onClick={() => setEditMode(false)}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 animate-in fade-in zoom-in-75 duration-100"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button
              onClick={() => onNavigate("feed")}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 md:hidden animate-in fade-in zoom-in-75 duration-100"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-display font-medium tracking-tight">
              {editMode ? "Editar Perfil" : "Configurações"}
            </h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
              {user?.email || "Minha conta escolar"}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!editMode ? (
          <motion.div
            key="settings-list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto w-full p-6 flex flex-col gap-6"
          >
            {/* Short User Snapshot */}
            <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-4 flex items-center gap-4 border border-brand-primary/10">
              <div className="w-14 h-14 rounded-full bg-yellow-400 border-2 border-white flex items-center justify-center font-display font-medium text-white text-xl uppercase overflow-hidden">
                {user?.foto_perfil ? (
                  <img src={user.foto_perfil} alt={user.nome} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  (user?.nome || user?.email || "U").slice(0, 2)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-display font-semibold text-base leading-tight truncate">
                  {user?.nome || " Hudson W."}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 uppercase font-mono tracking-wider">
                  {user?.role || "Aluno"}
                </p>
              </div>
            </div>

            {/* List Menu Options */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setEditMode(true)}
                className="w-full h-14 px-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between hover:bg-brand-primary/10 active:scale-99 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
                    <User size={18} />
                  </div>
                  <span className="text-sm font-semibold">Editar Perfil</span>
                </div>
                <ChevronRight size={18} className="text-slate-400" />
              </button>

              <div className="w-full h-14 px-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex md:hidden items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">
                    <Bell size={18} />
                  </div>
                  <span className="text-sm font-semibold">Notificações Escolares</span>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-9 h-5 bg-slate-200 checked:bg-brand-accent rounded-full appearance-none relative before:content-[''] before:absolute before:h-4 before:w-4 before:rounded-full before:bg-white before:top-0.5 before:left-0.5 checked:before:translate-x-4 before:transition-all cursor-pointer border border-slate-300 dark:border-slate-700"
                />
              </div>

              <button
                onClick={() => onNavigate("contact")}
                className="w-full h-14 px-4 rounded-2xl bg-white dark:bg-brand-card-dark border border-brand-primary/10 flex items-center justify-between hover:bg-brand-primary/10 active:scale-99 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400">
                    <MessageSquare size={18} />
                  </div>
                  <span className="text-sm font-semibold">Entrar em contato</span>
                </div>
                <ChevronRight size={18} className="text-slate-400" />
              </button>
            </div>

            {/* Supabase / Postgres Database Connection Diagnostics for Employees (Funcionários) only */}
            {(user?.role === "Professor" || user?.role === "Diretor" || user?.role === "Pedagogo(a)" || user?.role === "Funcionário") && (
              <div className="bg-brand-secondary/30 dark:bg-brand-card-dark rounded-3xl p-5 border border-brand-primary/10 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-2 border-b border-brand-primary/10">
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-brand-accent dark:text-brand-primary" />
                    <span className="text-sm font-semibold">Banco de Dados Supabase</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${dbStatus?.active ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500 animate-pulse'}`} />
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                      {dbStatus?.active ? "Conectado" : "Padrão Escola"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Canal Ativo:</span>
                    <span className="font-semibold text-right">{dbStatus ? dbStatus.provider : "Carregando..."}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Host / Origem:</span>
                    <span className="font-mono text-[10px] break-all text-right">{dbStatus ? dbStatus.host : "Identificando..."}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Tecnologia:</span>
                    <span className="text-[10px] text-right">Drizzle ORM + Supabase JS SDK</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed bg-brand-primary/5 dark:bg-black/20 p-3 rounded-xl border border-brand-primary/5 mt-1">
                  <strong>Configuração Flexível:</strong> O aplicativo está pré-compilado para carregar o Supabase. Adicione as chaves <code>DATABASE_URL</code>, <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> nas variáveis de ambiente do AI Studio para sincronizar.
                </div>
              </div>
            )}

            {/* Logout button */}
            <button
              onClick={onLogout}
              className="w-full h-12 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 font-semibold rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-950/35 active:scale-98 transition-all mt-6 cursor-pointer"
            >
              <LogOut size={18} />
              Sair da Conta Escolar
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="edit-profile-form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto w-full p-6"
          >
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              {/* Profile Image Section */}
              <div className="flex flex-col items-center gap-3 py-4 bg-brand-secondary/20 dark:bg-brand-card-dark/40 rounded-3xl border border-brand-primary/10 mb-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Foto de Perfil</span>
                
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-yellow-400 border-4 border-white dark:border-brand-card-dark flex items-center justify-center font-display font-medium text-white text-3xl uppercase overflow-hidden shadow-md">
                    {fotoPerfil ? (
                      <img src={fotoPerfil} alt={nome || "Avatar"} className="w-full h-full object-cover" />
                    ) : (
                      (nome || email || "U").slice(0, 2)
                    )}
                  </div>
                  
                  <label 
                    htmlFor="profile-image-upload" 
                    className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
                  >
                    <Camera size={22} />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="profile-image-upload"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setFotoPerfil(String(event.target.result));
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById("profile-image-upload")?.click()}
                    className="h-9 px-4 rounded-xl border border-brand-primary text-xs font-semibold hover:bg-brand-primary/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload size={14} />
                    Carregar Foto
                  </button>
                  {fotoPerfil && (
                    <button
                      type="button"
                      onClick={() => setFotoPerfil("")}
                      className="h-9 px-4 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border border-red-200/50 hover:bg-red-100 text-xs font-semibold cursor-pointer"
                    >
                      Remover
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  Formatos aceitos: JPG, PNG, WEBP.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Nome</span>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Alterar email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">CPF</span>
                <input
                  type="text"
                  value={cpf}
                  onChange={handleCpfChange}
                  placeholder="111.111.111-11"
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Número de Celular</span>
                <input
                  type="text"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="+55 41 9 9999-9999"
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Data de Nascimento</span>
                <input
                  type="date"
                  value={ensureDbDateToInputFormat(birthdate)}
                  onChange={(e) => setBirthdate(e.target.value)}
                  className="w-full h-11 px-3 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Gênero</span>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Instituição</span>
                <select
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-xs"
                >
                  {SCHOOLS_LIST.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">Cargo / Função</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full h-11 px-2 bg-white dark:bg-brand-card-dark border border-brand-primary rounded-xl text-sm"
                >
                  <option value="Aluno">Aluno(a)</option>
                  <option value="Diretor">Diretor(a)</option>
                  <option value="Pedagogo(a)">Pedagogo(a)</option>
                  <option value="Professor">Professor(a)</option>
                  <option value="Responsáveis">Responsáveis</option>
                  <option value="Funcionário">Funcionário(a)</option>
                  <option value="Cliente">Cliente</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full h-12 mt-4 bg-brand-primary text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:opacity-95 active:scale-98 transition-all shadow-md cursor-pointer"
              >
                <Save size={18} />
                Salvar Perfil
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
