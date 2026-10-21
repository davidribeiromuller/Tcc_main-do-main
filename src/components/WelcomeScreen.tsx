import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  MapPin,
  Bell,
  ArrowRight,
  Sparkles,
  UserPlus,
  LogIn,
  Eye,
  X,
  Lock,
  Compass,
  Bot,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Layers,
  Clock,
  Navigation
} from "lucide-react";
import logoImg from "../assets/images/logo.jpg";

interface WelcomeScreenProps {
  onNavigate: (screen: string) => void;
}

interface FeaturePreview {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  accentColor: string;
  description: string;
  mockHighlights: { icon: React.ElementType; title: string; desc: string }[];
  sampleMockup: {
    tag: string;
    headline: string;
    meta: string;
    details: string;
  };
}

const PREVIEWS: FeaturePreview[] = [
  {
    id: "events",
    title: "Agenda e Eventos",
    badge: "Módulo Principal",
    subtitle: "Cronograma dinâmico de atividades do Helena Wysocki",
    icon: Calendar,
    iconColor: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-50 dark:bg-blue-950/50",
    accentColor: "border-blue-500/30",
    description:
      "Acompanhe todas as datas comemorativas, semanas culturais, feiras de ciências, olimpíadas do conhecimento e eventos esportivos organizados pela escola com inscrições e lembretes.",
    mockHighlights: [
      {
        icon: Clock,
        title: "Horários e Prazos",
        desc: "Visualização cronológica com contagem regressiva para início e encerramento."
      },
      {
        icon: CheckCircle2,
        title: "Confirmação de Presença",
        desc: "Inscrição com 1 clique e emissão digital para atividades extracurriculares."
      },
      {
        icon: Layers,
        title: "Filtros por Categoria",
        desc: "Filtre por Esportes, Cultura, Acadêmico, Oficinas e Reuniões de Pais."
      }
    ],
    sampleMockup: {
      tag: "Cultura & Ciências • Auditório Principal",
      headline: "Mostra Científica e Cultural de Araucária 2026",
      meta: "14 a 16 de Outubro • Horário Integral",
      details: "Apresentação dos projetos integradores desenvolvidos pelas turmas de Ensino Médio."
    }
  },
  {
    id: "map",
    title: "Locais & Rotas do Campus",
    badge: "Guia Espacial",
    subtitle: "Mapa estrutural e pontos de referência da escola",
    icon: MapPin,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
    accentColor: "border-emerald-500/30",
    description:
      "Navegue facilmente pelas dependências do colégio. Encontre blocos de salas, laboratórios de informática e ciências, biblioteca, quadra poliesportiva e secretarias.",
    mockHighlights: [
      {
        icon: Navigation,
        title: "Localizador Rápido",
        desc: "Identifique exatamente em qual andar, bloco ou sala cada evento acontecerá."
      },
      {
        icon: Compass,
        title: "Rotas de Acesso",
        desc: "Pontos de entrada, rampas de acessibilidade e áreas comuns mapeadas."
      },
      {
        icon: MapPin,
        title: "Espaços Especiais",
        desc: "Localização de refeitório, coordenação pedagógica, grêmio e direção."
      }
    ],
    sampleMockup: {
      tag: "Bloco B • 2º Pavimento",
      headline: "Laboratório Integrado de Tecnologia e Robótica",
      meta: "Próximo à Biblioteca Central",
      details: "Espaço equipado com bancadas interativas, kits eletrônicos e impressoras 3D."
    }
  },
  {
    id: "announcements",
    title: "Avisos & Comunicados",
    badge: "Informativos Oficiais",
    subtitle: "Canal oficial da direção e equipe pedagógica",
    icon: Bell,
    iconColor: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
    accentColor: "border-amber-500/30",
    description:
      "Receba comunicações urgentes, calendários de provas, períodos de rematrícula e convocações oficiais diretamente no celular sem ruídos de comunicação.",
    mockHighlights: [
      {
        icon: Bell,
        title: "Alertas em Tempo Real",
        desc: "Notificações instantâneas sobre mudanças de horários e informativos gerais."
      },
      {
        icon: ShieldCheck,
        title: "Origem Verificada",
        desc: "Mensagens emitidas exclusivamente por diretores e pedagogos autorizados."
      },
      {
        icon: Layers,
        title: "Histórico Centralizado",
        desc: "Arquivo ordenado por data para consulta a qualquer momento do ano letivo."
      }
    ],
    sampleMockup: {
      tag: "Direção Pedagógica • Importante",
      headline: "Divulgação do Calendário Bimestral de Avaliações",
      meta: "Publicado para todas as turmas do matutino e vespertino",
      details: "Orientações gerais sobre conteúdos, cronograma de estudos e plantões de dúvidas."
    }
  },
  {
    id: "assistant",
    title: "Assistente & Calendário",
    badge: "Recurso Interativo",
    subtitle: "Organização acadêmica e respostas instantâneas",
    icon: Bot,
    iconColor: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-50 dark:bg-purple-950/50",
    accentColor: "border-purple-500/30",
    description:
      "Tire dúvidas rápidas sobre a rotina escolar, sincronize datas no seu calendário pessoal e tenha um guia sempre à mão durante os eventos do colégio.",
    mockHighlights: [
      {
        icon: Bot,
        title: "Respostas Automáticas",
        desc: "Consulte locais de provas, regulamentos e horários com linguagem simples."
      },
      {
        icon: Calendar,
        title: "Sincronização Pessoal",
        desc: "Adicione compromissos diretamente ao Google Agenda ou calendário do celular."
      },
      {
        icon: CheckCircle2,
        title: "Acompanhamento Ativo",
        desc: "Lembretes com antecedência para você nunca perder uma atividade importante."
      }
    ],
    sampleMockup: {
      tag: "Assistente eloEscola • Suporte ao Estudante",
      headline: "Qual o horário da feira científica amanhã?",
      meta: "Resposta instantânea baseada na programação oficial",
      details: "A abertura dos portões será às 08h00 no pátio central, com início das bancas às 08h30."
    }
  }
];

export default function WelcomeScreen({ onNavigate }: WelcomeScreenProps) {
  const [selectedPreview, setSelectedPreview] = useState<FeaturePreview | null>(null);

  return (
    <div className="h-full w-full bg-slate-50 dark:bg-[#1a231a] text-slate-800 dark:text-slate-100 flex flex-col justify-between overflow-y-auto relative">
      {/* Header Bar */}
      <header className="w-full border-b border-brand-primary/10 bg-white/80 dark:bg-brand-bg-dark/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-brand-primary/30 shadow-xs bg-white flex items-center justify-center p-0.5">
              <img
                src={logoImg}
                alt="Logo eloEscola"
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="text-base font-display font-bold text-[#283e28] dark:text-[#A3C69D] tracking-tight">
                eloEscola
              </span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono -mt-0.5">
                C.E. Helena Wysocki
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("login")}
              className="px-4 py-1.5 rounded-full bg-[#4C6B4C] hover:bg-[#3d593d] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <LogIn size={13} />
              <span>Entrar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8 sm:py-12 flex flex-col items-center justify-center text-center">
        {/* Big School Logo */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-white shadow-xl bg-white p-1 mb-5"
        >
          <img
            src={logoImg}
            alt="Logo Colégio Estadual Helena Wysocki"
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Hero Title */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl sm:text-4xl font-display font-bold text-slate-900 dark:text-white tracking-tight max-w-xl"
        >
          Bem-vindo(a) ao <span className="text-[#4C6B4C] dark:text-[#A3C69D]">eloEscola</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium mt-1"
        >
          Colégio Estadual Helena Wysocki • Araucária - PR
        </motion.p>

        {/* Description Summary */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xl mt-4 leading-relaxed"
        >
          O <strong>eloEscola</strong> conecta estudantes, professores e responsáveis a todas as atividades do colégio. Clique em uma das opções abaixo para <strong>espiar uma prévia</strong> de cada recurso:
        </motion.p>

        {/* Interactive Feature Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 w-full max-w-3xl mt-7 text-start"
        >
          {PREVIEWS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedPreview(item)}
                className="bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 hover:border-[#4C6B4C]/50 dark:hover:border-[#A3C69D]/50 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 text-start cursor-pointer group relative overflow-hidden"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between w-full">
                    <div
                      className={`w-9 h-9 rounded-xl ${item.iconBg} ${item.iconColor} flex items-center justify-center shadow-xs transition-transform group-hover:scale-105`}
                    >
                      <Icon size={19} />
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#4C6B4C] dark:text-[#A3C69D] bg-[#4C6B4C]/10 dark:bg-[#4C6B4C]/25 px-2 py-0.5 rounded-full">
                      <Eye size={10} />
                      <span>Preview</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#4C6B4C] dark:group-hover:text-[#A3C69D] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-1 line-clamp-2">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/40 flex items-center justify-between text-[10px] font-semibold text-slate-400 group-hover:text-[#4C6B4C] dark:group-hover:text-[#A3C69D] transition-colors">
                  <span>Toque para ver detalhes</span>
                  <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Call To Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center w-full max-w-sm mt-8"
        >
          {/* Main Primary Button to Login */}
          <button
            onClick={() => onNavigate("login")}
            className="w-full h-13 bg-[#4C6B4C] hover:bg-[#3d593d] active:scale-98 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-[#4C6B4C]/25 transition-all cursor-pointer"
          >
            <span>Acessar o Portal (Login)</span>
            <ArrowRight size={17} />
          </button>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center border-t border-slate-200/80 dark:border-slate-800/80 bg-white/40 dark:bg-black/20">
        <p className="text-[11px] text-slate-400 font-medium">
          © 2026 Colégio Estadual Helena Wysocki • Todos os direitos reservados
        </p>
      </footer>

      {/* Feature Preview Modal (Shows overview & structure without revealing private user data) */}
      <AnimatePresence>
        {selectedPreview && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto flex flex-col gap-4 text-start"
            >
              {/* Close Button */}
              <button
                onClick={() => setSelectedPreview(null)}
                className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 pr-8">
                <div
                  className={`w-11 h-11 rounded-2xl ${selectedPreview.iconBg} ${selectedPreview.iconColor} flex items-center justify-center shadow-xs shrink-0`}
                >
                  <selectedPreview.icon size={22} />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                    <span>{selectedPreview.badge}</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedPreview.title}
                  </h3>
                </div>
              </div>

              {/* Overview Description */}
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedPreview.description}
              </p>

              {/* Simulated Conceptual Mockup with Protected Content Blur */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/60 relative overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {selectedPreview.sampleMockup.tag}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md font-semibold">
                    Visualização Demonstrativa
                  </span>
                </div>

                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {selectedPreview.sampleMockup.headline}
                </h4>
                <p className="text-[11px] text-[#4C6B4C] dark:text-[#A3C69D] font-medium mb-2">
                  {selectedPreview.sampleMockup.meta}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {selectedPreview.sampleMockup.details}
                </p>

                {/* Subtle Protected Overlay badge */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/40 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Lock size={11} className="text-amber-500" />
                    <span>Dados de turmas e presenças protegidos</span>
                  </span>
                  <span className="font-mono text-[9px]">ID #HW-DEMO</span>
                </div>
              </div>

              {/* Functional Highlights */}
              <div className="flex flex-col gap-2">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Recursos disponíveis nesta seção:
                </h5>
                <div className="grid grid-cols-1 gap-2">
                  {selectedPreview.mockHighlights.map((hl, i) => {
                    const HIcon = hl.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="p-1 rounded-lg bg-white dark:bg-slate-700 text-[#4C6B4C] dark:text-[#A3C69D] shadow-2xs mt-0.5">
                          <HIcon size={14} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {hl.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                            {hl.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2 mt-1">
                <button
                  onClick={() => {
                    setSelectedPreview(null);
                    onNavigate("login");
                  }}
                  className="flex-1 h-11 bg-[#4C6B4C] hover:bg-[#3d593d] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <LogIn size={15} />
                  <span>Entrar para Acessar Tudo</span>
                </button>

                <button
                  onClick={() => setSelectedPreview(null)}
                  className="px-4 h-11 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

