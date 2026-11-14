import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  MapPin,
  Bell,
  LogIn,
  LogOut,
  X,
  ShieldAlert,
  AlertTriangle,
  HeartHandshake,
  CheckCircle2,
  Copy,
  Phone,
  User as UserIcon,
  ChevronRight,
  ExternalLink,
  Moon,
  Sun
} from "lucide-react";
import { User, Event } from "../types.ts";
import { SchoolCarousel } from "./SchoolCarousel";

export interface PartnerItem {
  id: string;
  name: string;
  category: string;
  description: string;
  url: string;
  badge: string;
  iconText?: string;
  repoName?: string;
}

export const PARTNERS_DATA: PartnerItem[] = [
  {
    id: "faculda-plus",
    name: "Faculda+",
    category: "Projeto parceiro • Educação e tecnologia",
    description: "Iniciativa colaborativa e ecossistema de aprendizagem voltado ao desenvolvimento de soluções educacionais, capacitação e inovação tecnológica comunitária.",
    url: "https://faculda-2-0.vercel.app/",
    badge: "Educação & Tecnologia",
    iconText: "F+",
    repoName: "faculda-2-0.vercel.app"
  }
];

interface WelcomeScreenProps {
  onNavigate: (screen: string, param?: string) => void;
  currentUser?: User | null;
  onLogout?: () => void;
  onGuestLogin?: (destination: string) => Promise<void>;
  onSelectSchool?: (slug: string) => void;
  events?: Event[];
  /** Tema atual, para o alternador na tela de introdução. */
  theme?: "light" | "dark";
  /** Alterna claro/escuro. */
  onToggleTheme?: () => void;
}

interface EmergencyContact {
  title: string;
  number: string;
  description: string;
  badge: string;
  icon: React.ElementType;
  urgent?: boolean;
}

const EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    title: "Patrulha Escolar Comunitária de Araucária",
    number: "(41) 3614-7600",
    description: "Atendimento e policiamento comunitário escolar para todas as instituições de Araucária",
    badge: "Prioridade Escolar",
    icon: ShieldAlert,
    urgent: true,
  },
  {
    title: "Polícia Militar do Paraná",
    number: "190",
    description: "Ocorrências de emergência imediata e segurança pública geral",
    badge: "Emergência 24h",
    icon: AlertTriangle,
    urgent: true,
  },
  {
    title: "SAMU Emergência Médica",
    number: "192",
    description: "Socorro pré-hospitalar móvel para acidentes e emergências de saúde",
    badge: "Saúde 24h",
    icon: HeartHandshake,
  },
  {
    title: "Corpo de Bombeiros",
    number: "193",
    description: "Combate a incêndios, primeiros socorros e evacuações prediais",
    badge: "Resgate",
    icon: ShieldAlert,
  },
  {
    title: "Conselho Tutelar de Araucária",
    number: "(41) 3901-5367",
    description: "Proteção integral de direitos e suporte a crianças e adolescentes",
    badge: "Apoio Social",
    icon: HeartHandshake,
  },
  {
    title: "Ouvidoria da Educação (SEED/PR)",
    number: "0800-041-1500",
    description: "Canal oficial da Secretaria de Estado da Educação do Paraná para orientações e suporte",
    badge: "Canal Oficial",
    icon: Phone,
  },
];

export default function WelcomeScreen({
  onNavigate,
  currentUser,
  onLogout,
  onGuestLogin,
  onSelectSchool,
  theme = "light",
  onToggleTheme,
}: WelcomeScreenProps) {
  const [showSosModal, setShowSosModal] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  const [isEnteringGuest, setIsEnteringGuest] = useState(false);

  const handleCopyNumber = (num: string) => {
    navigator.clipboard.writeText(num.replace(/\D/g, ""));
    setCopiedNumber(num);
    setTimeout(() => setCopiedNumber(null), 2500);
  };

  // Automated seamless entry into card destination without requiring password or CGM
  const handleCardClick = async (targetScreen: string) => {
    if (currentUser) {
      onNavigate(targetScreen);
      return;
    }

    if (onGuestLogin) {
      setIsEnteringGuest(true);
      try {
        await onGuestLogin(targetScreen);
      } catch (err) {
        onNavigate(targetScreen);
      } finally {
        setIsEnteringGuest(false);
      }
    } else {
      onNavigate(targetScreen);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#f2f8f3] dark:bg-[#121c14] text-[#1b3d24] dark:text-[#e4f2e6] flex flex-col justify-between overflow-x-hidden selection:bg-[#9cc4a3] selection:text-[#14361e] transition-colors">
      {/* Background Soft Organic Green Atmosphere Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] sm:w-[600px] sm:h-[600px] rounded-full bg-gradient-to-br from-[#bfe4c6]/45 to-[#8ec898]/20 dark:from-[#21432a]/30 dark:to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 -left-20 w-[360px] h-[360px] rounded-full bg-gradient-to-tr from-[#cfe9d3]/40 to-transparent dark:from-[#1b3623]/25 dark:to-transparent blur-2xl"
      />

      {/* TOP HEADER: Clean brand on left (SOS and weather removed per Etapa 2), login/profile on right */}
      <header className="relative z-20 w-full px-5 sm:px-10 pt-5 sm:pt-7">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Wordmark Logo */}
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => onNavigate("welcome")}>
            <span className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#1a3d24] dark:text-[#a9d9b2] transition-colors">
              eloEscola
            </span>
          </div>

          {/* Right: Theme toggle + User Login / Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/*
              Alternador de tema na tela de introdução.
              A tela já tinha todas as classes `dark:` prontas, mas não havia
              como acionar o modo escuro antes de entrar no app — era preciso
              fazer login e ir em Configurações.
            */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                title={theme === "dark" ? "Modo claro" : "Modo escuro"}
                className="p-2 rounded-full bg-[#cbe7d0]/80 dark:bg-[#1f3825] hover:bg-[#bde0c3] dark:hover:bg-[#284930] border border-[#a3cfa9]/60 dark:border-[#3a6341] text-[#163a20] dark:text-[#d3eed7] transition-all cursor-pointer"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate("settings")}
                  className="px-4 py-2 rounded-full bg-[#cbe7d0]/80 dark:bg-[#1f3825] hover:bg-[#bde0c3] dark:hover:bg-[#284930] border border-[#a3cfa9]/60 dark:border-[#3a6341] text-[#163a20] dark:text-[#d3eed7] text-xs font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                  title="Configurações e Perfil"
                >
                  <UserIcon size={14} className="text-[#2b643a] dark:text-[#88d29b]" />
                  <span className="max-w-[120px] truncate">{currentUser.nome || "Minha Conta"}</span>
                </button>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    title="Sair da sessão"
                  >
                    <LogOut size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate("login")}
                  className="px-4 py-1.5 rounded-full bg-[#c8e5cc]/80 dark:bg-[#1e3825]/90 hover:bg-[#b8ddbd] dark:hover:bg-[#274830] border border-[#a1cfa8]/70 dark:border-[#3b6343] text-[#173d23] dark:text-[#cce8d2] text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <LogIn size={15} className="text-[#296038] dark:text-[#8ad09d]" />
                  <span>Entrar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-10 max-w-7xl mx-auto w-full px-5 sm:px-10 py-6 sm:py-8 flex-1 flex flex-col justify-start">
        {/* EDITORIAL HERO SECTION */}
        <section className="mb-6 sm:mb-8 max-w-3xl text-left">
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-[#153820] dark:text-[#e4f3e6] leading-[1.2]">
            Um portal para oportunidades e informações para todos.
          </h1>

          <p className="mt-3 sm:mt-4 text-sm sm:text-base text-[#385940] dark:text-[#a8c9b0] leading-relaxed max-w-2xl font-normal">
            Encontre informações sobre eventos escolares e eventos por Araucária e Curitiba.
          </p>
        </section>

        {/* 4 CARDS ROW: Directly initiates guest session on click if unauthenticated */}
        <section
          aria-label="Funcionalidades principais"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full my-2 sm:my-3"
        >
          {/* Card 1: Mural & Avisos */}
          <button
            type="button"
            onClick={() => handleCardClick("feed")}
            disabled={isEnteringGuest}
            className="group relative flex flex-col justify-between p-6 rounded-[28px] bg-[#d5ebd8]/80 dark:bg-[#1a2f20]/80 hover:bg-[#cbe5cf] dark:hover:bg-[#213b29] border border-[#aed7b5]/70 dark:border-[#375e3f]/70 shadow-[0_4px_24px_rgba(20,50,28,0.04)] hover:shadow-[0_8px_32px_rgba(20,50,28,0.12)] transition-all duration-300 text-left cursor-pointer min-h-[160px] overflow-hidden active:scale-98"
          >
            <div className="flex flex-col gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-white/10 text-[#255732] dark:text-[#99d7a6] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <Bell size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#14361e] dark:text-[#e4f2e6] tracking-tight group-hover:text-[#235830] dark:group-hover:text-[#a7e2b4] transition-colors">
                  Mural & Avisos
                </h3>
                <p className="text-xs text-[#395b41] dark:text-[#a3c5ab] mt-1 leading-snug line-clamp-2">
                  Notícias, comunicados oficiais e oportunidades acadêmicas atualizadas.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-[#b7dcbd]/50 dark:border-[#35583b]/60 text-[11px] font-semibold text-[#2f5d38] dark:text-[#8fd19d]">
              <span>Acessar mural</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card 2: Calendário Letivo */}
          <button
            type="button"
            onClick={() => handleCardClick("calendar")}
            disabled={isEnteringGuest}
            className="group relative flex flex-col justify-between p-6 rounded-[28px] bg-[#d5ebd8]/80 dark:bg-[#1a2f20]/80 hover:bg-[#cbe5cf] dark:hover:bg-[#213b29] border border-[#aed7b5]/70 dark:border-[#375e3f]/70 shadow-[0_4px_24px_rgba(20,50,28,0.04)] hover:shadow-[0_8px_32px_rgba(20,50,28,0.12)] transition-all duration-300 text-left cursor-pointer min-h-[160px] overflow-hidden active:scale-98"
          >
            <div className="flex flex-col gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-white/10 text-[#255732] dark:text-[#99d7a6] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <Calendar size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#14361e] dark:text-[#e4f2e6] tracking-tight group-hover:text-[#235830] dark:group-hover:text-[#a7e2b4] transition-colors">
                  Calendário Letivo
                </h3>
                <p className="text-xs text-[#395b41] dark:text-[#a3c5ab] mt-1 leading-snug line-clamp-2">
                  Eventos escolares, feiras científicas, festivais culturais e datas letivas.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-[#b7dcbd]/50 dark:border-[#35583b]/60 text-[11px] font-semibold text-[#2f5d38] dark:text-[#8fd19d]">
              <span>Ver calendário</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card 3: Mapa & Localização */}
          <button
            type="button"
            onClick={() => handleCardClick("map")}
            disabled={isEnteringGuest}
            className="group relative flex flex-col justify-between p-6 rounded-[28px] bg-[#d5ebd8]/80 dark:bg-[#1a2f20]/80 hover:bg-[#cbe5cf] dark:hover:bg-[#213b29] border border-[#aed7b5]/70 dark:border-[#375e3f]/70 shadow-[0_4px_24px_rgba(20,50,28,0.04)] hover:shadow-[0_8px_32px_rgba(20,50,28,0.12)] transition-all duration-300 text-left cursor-pointer min-h-[160px] overflow-hidden active:scale-98"
          >
            <div className="flex flex-col gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-white/10 text-[#255732] dark:text-[#99d7a6] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <MapPin size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#14361e] dark:text-[#e4f2e6] tracking-tight group-hover:text-[#235830] dark:group-hover:text-[#a7e2b4] transition-colors">
                  Mapa & Localização
                </h3>
                <p className="text-xs text-[#395b41] dark:text-[#a3c5ab] mt-1 leading-snug line-clamp-2">
                  Mapa real com as escolas de Araucária e os eventos de Araucária e Curitiba.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-[#b7dcbd]/50 dark:border-[#35583b]/60 text-[11px] font-semibold text-[#2f5d38] dark:text-[#8fd19d]">
              <span>Abrir mapa</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card 4: Central SOS & Apoio */}
          <button
            type="button"
            onClick={() => setShowSosModal(true)}
            className="group relative flex flex-col justify-between p-6 rounded-[28px] bg-[#d5ebd8]/80 dark:bg-[#1a2f20]/80 hover:bg-[#cbe5cf] dark:hover:bg-[#213b29] border border-[#aed7b5]/70 dark:border-[#375e3f]/70 shadow-[0_4px_24px_rgba(20,50,28,0.04)] hover:shadow-[0_8px_32px_rgba(20,50,28,0.12)] transition-all duration-300 text-left cursor-pointer min-h-[160px] overflow-hidden active:scale-98"
          >
            <div className="flex flex-col gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/70 dark:bg-white/10 text-[#d32f2f] flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#14361e] dark:text-[#e4f2e6] tracking-tight group-hover:text-[#235830] dark:group-hover:text-[#a7e2b4] transition-colors">
                  Central SOS & Apoio
                </h3>
                <p className="text-xs text-[#395b41] dark:text-[#a3c5ab] mt-1 leading-snug line-clamp-2">
                  Patrulha Escolar, Polícia Militar, SAMU e canais de proteção aos estudantes.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-[#b7dcbd]/50 dark:border-[#35583b]/60 text-[11px] font-semibold text-[#2f5d38] dark:text-[#8fd19d]">
              <span>Contatos de emergência</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </section>

        {/* SECTION: CONHEÇA NOSSAS ESCOLAS (HORIZONTAL CAROUSEL) */}
        <SchoolCarousel
          onSelectSchool={(slug) => onSelectSchool ? onSelectSchool(slug) : onNavigate("schoolDetail", slug)}
        />

        {/* SECTION: NOSSAS PARCERIAS */}
        <section aria-labelledby="parcerias-heading" className="w-full my-6 sm:my-8 text-left">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-300/60 dark:border-emerald-800/60 mb-2">
                <HeartHandshake className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Colaboração & Futuro</span>
              </div>
              <h2 id="parcerias-heading" className="text-2xl sm:text-3xl font-serif font-bold text-[#153820] dark:text-[#e4f3e6] leading-tight">
                Nossas Parcerias
              </h2>
              <p className="text-xs sm:text-sm text-[#385940] dark:text-[#a8c9b0] mt-1 max-w-2xl leading-relaxed">
                Conheça as instituições e iniciativas que caminham conosco, contribuindo para ampliar oportunidades, conectar pessoas e fortalecer a educação.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PARTNERS_DATA.map((partner) => (
              <div
                key={partner.id}
                className="group relative rounded-3xl bg-white/90 dark:bg-[#16271a]/90 border border-emerald-200/90 dark:border-emerald-800/60 p-5 sm:p-6 shadow-[0_4px_20px_rgba(20,50,28,0.04)] hover:shadow-[0_8px_30px_rgba(20,50,28,0.1)] transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      {/* Monograma / Identidade Visual da Faculda+ */}
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 text-white flex items-center justify-center font-bold font-serif text-lg shadow-sm border border-emerald-600/40 shrink-0 group-hover:scale-105 transition-transform">
                        {partner.iconText}
                      </div>
                      <div>
                        <h3 className="text-lg font-serif font-bold text-slate-900 dark:text-white leading-tight">
                          {partner.name}
                        </h3>
                        <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {partner.category}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 px-2 py-0.5 rounded-full shrink-0">
                      {partner.badge}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3 mb-4">
                    {partner.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-emerald-100/80 dark:border-emerald-900/40 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[150px]">
                    {partner.repoName}
                  </span>

                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white text-xs font-semibold shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Conhecer projeto</span>
                    <ExternalLink size={13} className="text-emerald-200" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* INSTITUTIONAL FOOTER */}
      <footer className="relative z-10 w-full px-5 sm:px-10 pb-5 pt-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-[#446b4d] dark:text-[#8dbd98]">
          <p className="font-medium tracking-wide">
            eloEscola • Portal Integrado de Oportunidades Escolares e Culturais • Araucária & Curitiba / PR
          </p>
          <div className="flex items-center gap-4 text-[10px] text-[#55805f] dark:text-[#7ba884]">
            <button
              onClick={() => onNavigate("contact")}
              className="hover:underline cursor-pointer"
            >
              Secretarias Escolares & Apoio
            </button>
            <span>•</span>
            <button
              onClick={() => setShowSosModal(true)}
              className="hover:underline cursor-pointer font-bold text-[#d32f2f]"
            >
              Canais de Emergência (SOS)
            </button>
          </div>
        </div>
      </footer>

      {/* SOS EMERGENCY MODAL */}
      <AnimatePresence>
        {showSosModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-[#19261d] rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-red-200 dark:border-red-950/60 relative text-slate-800 dark:text-slate-100 max-h-[92vh] overflow-y-auto flex flex-col gap-4 text-left"
            >
              <button
                onClick={() => setShowSosModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3 pr-8">
                <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shadow-xs shrink-0 ring-4 ring-red-50 dark:ring-red-950/30">
                  <ShieldAlert size={26} />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/80 text-[10px] font-bold text-red-700 dark:text-red-300 mb-0.5 uppercase tracking-wider">
                    <span>Central de Apoio & Emergência</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white font-serif">
                    Canais de Resposta Rápida
                  </h3>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-red-50 dark:bg-red-950/20 p-3 rounded-2xl border border-red-100 dark:border-red-900/40">
                <strong>Atenção:</strong> Em situações de emergência ou risco iminente, contate imediatamente a Patrulha Escolar de Araucária ou a Polícia Militar (190).
              </p>

              <div className="flex flex-col gap-2.5">
                {EMERGENCY_CONTACTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-[#203225] border border-slate-200/80 dark:border-[#2f4937] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            item.urgent
                              ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 font-bold"
                              : "bg-[#d5ebd8] text-[#1b4426] dark:bg-[#1a3822] dark:text-[#9ad7a6]"
                          }`}
                        >
                          <Icon size={19} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {item.title}
                            </span>
                            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-700/60 text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                              {item.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.description}
                          </p>
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                            {item.number}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleCopyNumber(item.number)}
                          className="p-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                          title="Copiar número"
                        >
                          {copiedNumber === item.number ? (
                            <CheckCircle2 size={15} className="text-emerald-600" />
                          ) : (
                            <Copy size={15} />
                          )}
                        </button>
                        <a
                          href={`tel:${item.number.replace(/\D/g, "")}`}
                          className="px-3 py-1.5 rounded-xl bg-[#20512b] hover:bg-[#163a1e] text-white text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <Phone size={13} />
                          <span>Ligar</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
