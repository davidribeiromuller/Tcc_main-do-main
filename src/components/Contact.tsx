import { motion } from "motion/react";
import { ArrowLeft, AlertCircle, Bug, Lightbulb, Mail, MessageSquare } from "lucide-react";
import { User } from "../types";
import { recordFeedbackSent } from "../lib/userStats.ts";

interface ContactProps {
  onNavigate: (screen: string) => void;
  currentUser?: User | null;
}

export default function Contact({ onNavigate, currentUser }: ContactProps) {
  const handleEmailRedirect = (subject: string) => {
    if (currentUser) {
      recordFeedbackSent(currentUser.id);
    }
    const encodedSubject = encodeURIComponent(subject);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=solucoes@gmail.com&su=${encodedSubject}`;
    const mailtoUrl = `mailto:solucoes@gmail.com?subject=${encodedSubject}`;
    
    // Tenta abrir o cliente de e-mail padrão ou redireciona para o Gmail
    try {
      window.location.href = mailtoUrl;
    } catch {
      window.open(gmailUrl, "_blank");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full overflow-y-auto pb-24 text-brand-text-light dark:text-brand-text-dark"
    >
      {/* Header */}
      <div className="border-b border-brand-primary/10">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 p-6">
          <button
            onClick={() => onNavigate("settings")}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-display font-medium tracking-tight">Contato</h1>
            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Suporte Técnico</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-6 flex flex-col gap-4">
        <button
          onClick={() => handleEmailRedirect("Reclamação - App Escolar")}
          className="w-full h-14 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl flex items-center gap-4 hover:bg-brand-primary/10 transition-all cursor-pointer text-left"
        >
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">
            <AlertCircle size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">Fazer uma reclamação</div>
            <div className="text-[10px] text-slate-400">Enviar e-mail para a Ouvidoria</div>
          </div>
        </button>

        <button
          onClick={() => handleEmailRedirect("Reportar Bug - App Escolar")}
          className="w-full h-14 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl flex items-center gap-4 hover:bg-brand-primary/10 transition-all cursor-pointer text-left"
        >
          <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400">
            <Bug size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">Reportar um Bug</div>
            <div className="text-[10px] text-slate-400">Enviar e-mail relatando erro</div>
          </div>
        </button>

        <a
          href="mailto:solucoes@gmail.com?subject=Sugest%C3%A3o%20de%20Melhoria"
          onClick={(e) => {
            e.preventDefault();
            handleEmailRedirect("Sugestão de Melhoria - App Escolar");
          }}
          className="w-full h-14 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl flex items-center gap-4 hover:bg-brand-primary/10 transition-all cursor-pointer text-left"
        >
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400">
            <Lightbulb size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">Sugestões de melhorias</div>
            <div className="text-[10px] text-slate-400">Enviar sugestão por e-mail (solucoes@gmail.com)</div>
          </div>
        </a>

        <a
          href="https://mail.google.com/mail/?view=cm&fs=1&to=solucoes@gmail.com"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-14 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl flex items-center gap-4 hover:bg-brand-primary/10 transition-all text-left"
        >
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400">
            <Mail size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">solucoes@gmail.com</div>
            <div className="text-[10px] text-slate-400">Mande um email direto</div>
          </div>
        </a>

        <a
          href="https://wa.me/5541999999999"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-14 px-4 bg-white dark:bg-brand-card-dark border border-brand-primary/10 rounded-2xl flex items-center gap-4 hover:bg-brand-primary/10 transition-all text-left"
        >
          <div className="p-2.5 rounded-xl bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400">
            <MessageSquare size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-white">Fale pelo WhatsApp</div>
            <div className="text-[10px] text-slate-400">Atendimento humanizado instantâneo</div>
          </div>
        </a>
      </div>
    </motion.div>
  );
}
