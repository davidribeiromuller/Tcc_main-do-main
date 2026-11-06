import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Calendar,
  ChevronRight,
  X,
  Info,
  ArrowRight
} from "lucide-react";
import logoImg from "../assets/images/logo.jpg";

interface IntroBannerProps {
  onNavigate: (screen: string) => void;
  userName?: string;
}

export default function IntroBanner({ onNavigate, userName }: IntroBannerProps) {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("eloescola_intro_dismissed") === "true";
    } catch {
      return false;
    }
  });

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem("eloescola_intro_dismissed", "true");
    } catch {}
  };

  const handleRestore = () => {
    setIsDismissed(false);
    try {
      localStorage.removeItem("eloescola_intro_dismissed");
    } catch {}
  };

  if (isDismissed) {
    return (
      <div className="max-w-6xl mx-auto w-full px-6 pt-4 pb-1">
        <button
          onClick={handleRestore}
          className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-primary/10 hover:bg-brand-primary/20 dark:bg-brand-card-dark/60 text-brand-accent dark:text-brand-primary text-xs font-semibold transition-all cursor-pointer border border-brand-primary/15 active:scale-95 shadow-xs"
          title="Ver introdução ao eloEscola"
        >
          <Info size={14} className="text-brand-accent dark:text-brand-primary group-hover:rotate-12 transition-transform" />
          <span>Sobre o aplicativo eloEscola</span>
          <ChevronRight size={13} className="text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        className="max-w-6xl mx-auto w-full px-6 pt-5 pb-2"
      >
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#4C6B4C] via-[#3d593d] to-[#283e28] text-white p-6 sm:p-7 shadow-lg border border-white/10">
          {/* Subtle Ambient Decorative Circles */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#A3C69D]/15 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-12 w-64 h-64 rounded-full bg-white/5 blur-xl pointer-events-none" />

          {/* Close / Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-all cursor-pointer backdrop-blur-xs"
            title="Ocultar introdução"
            aria-label="Ocultar introdução"
          >
            <X size={16} />
          </button>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left Content Column */}
            <div className="flex-1 flex flex-col gap-2.5">
              {/* Badge & Project Tag */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/40 shadow-sm bg-white shrink-0">
                  <img
                    src={logoImg}
                    alt="eloEscola Logo"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-[#e6f3e4] text-[11px] font-mono uppercase tracking-wider font-semibold border border-white/10 backdrop-blur-xs flex items-center gap-1.5">
                  <Sparkles size={11} className="text-yellow-300" />
                  eloEscola • C.E. Helena Wysocki
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-white leading-snug">
                {userName ? `Olá, ${userName.split(" ")[0]}!` : "Bem-vindo(a) ao eloEscola!"}
              </h2>

              {/* Introduction Text */}
              <p className="text-white/85 text-xs sm:text-sm leading-relaxed max-w-2xl">
                O <strong>eloEscola</strong> é a plataforma integrada de divulgação e organização de eventos da <strong>Escola Estadual Helena Wysocki</strong>. Acompanhe feiras culturais, atividades esportivas, avisos institucionais e o cronograma oficial de datas do colégio.
              </p>
            </div>

            {/* Right Quick Action Column */}
            <div className="flex shrink-0 justify-start md:justify-center">
              <button
                onClick={() => onNavigate("calendar")}
                className="px-5 py-3 rounded-2xl bg-white text-[#283e28] font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-md hover:bg-[#eaf5e8] active:scale-95 transition-all cursor-pointer"
              >
                <Calendar size={17} className="text-[#4C6B4C]" />
                <span>Ver Calendário Completo</span>
                <ArrowRight size={15} className="text-[#4C6B4C]" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
