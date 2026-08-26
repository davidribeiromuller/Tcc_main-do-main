import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Bell,
  BellRing,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  X,
  ShieldCheck,
  Sparkles,
  ChevronRight
} from "lucide-react";
import { Event } from "../types";

interface EventNotificationModalProps {
  isOpen: boolean;
  event: Event | null;
  onClose: () => void;
  onConfirm: (event: Event, schedule: NotificationSchedule) => void;
  onSkip: (event: Event) => void;
}

export interface NotificationSchedule {
  oneWeekBefore: boolean;
  threeDaysBefore: boolean;
  oneDayBefore: boolean;
  onEventDay: boolean;
}

const MONTHS_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function EventNotificationModal({
  isOpen,
  event,
  onClose,
  onConfirm,
  onSkip,
}: EventNotificationModalProps) {
  const [schedule, setSchedule] = useState<NotificationSchedule>({
    oneWeekBefore: true,
    threeDaysBefore: true,
    oneDayBefore: true,
    onEventDay: true,
  });

  if (!isOpen || !event) return null;

  const toggleOption = (key: keyof NotificationSchedule) => {
    setSchedule((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleActivate = async () => {
    if ("Notification" in window) {
      try {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
      } catch (err) {
        console.warn("Notification request permission error:", err);
      }
    }
    onConfirm(event, schedule);
  };

  const handleSkip = () => {
    onSkip(event);
  };

  const reminderOptions = [
    {
      id: "oneWeekBefore" as keyof NotificationSchedule,
      title: "1 semana de antecedência",
      desc: "Lembrete 7 dias antes para se planejar com calma",
      badge: "7 dias antes",
      icon: "📅",
    },
    {
      id: "threeDaysBefore" as keyof NotificationSchedule,
      title: "3 dias antes",
      desc: "Aviso de contagem regressiva e preparativos",
      badge: "3 dias antes",
      icon: "🔔",
    },
    {
      id: "oneDayBefore" as keyof NotificationSchedule,
      title: "1 dia antes (Véspera)",
      desc: "Lembrete final para separar materiais e documentos",
      badge: "1 dia antes",
      icon: "⏰",
    },
    {
      id: "onEventDay" as keyof NotificationSchedule,
      title: "No dia do evento",
      desc: "Alerta no horário de início para você não perder",
      badge: "Hoje / No dia",
      icon: "🎯",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header Visual */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 shadow-xs ring-4 ring-emerald-500/10">
            <BellRing size={28} className="animate-bounce" />
          </div>

          <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">
            Notificações do Evento
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[320px]">
            Deseja receber lembretes automáticos para não esquecer deste evento escolar?
          </p>
        </div>

        {/* Event Preview Card */}
        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl p-3.5 border border-emerald-500/20 mb-5 flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center shrink-0 font-display shadow-xs">
            <span className="text-[9px] uppercase font-bold leading-none">
              {MONTHS_NAMES[event.month].slice(0, 3)}
            </span>
            <span className="text-base font-extrabold leading-none mt-0.5">
              {event.day}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-display font-bold text-xs text-slate-900 dark:text-white truncate">
              {event.title}
            </h4>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-emerald-600" />
                {event.time}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 truncate">
                <MapPin size={11} className="text-red-500" />
                {event.location}
              </span>
            </div>
          </div>
        </div>

        {/* Notification Intervals List */}
        <div className="flex flex-col gap-2.5 mb-5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Frequência de Notificações
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              4 lembretes programados
            </span>
          </div>

          {reminderOptions.map((opt) => {
            const isChecked = schedule[opt.id];
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleOption(opt.id)}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-start cursor-pointer ${
                  isChecked
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500/50 shadow-xs"
                    : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-base shrink-0">{opt.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {opt.title}
                      </p>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                        isChecked
                          ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300"
                          : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                      }`}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {opt.desc}
                    </p>
                  </div>
                </div>

                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-2 transition-colors ${
                  isChecked ? "bg-emerald-600 text-white" : "border-2 border-slate-300 dark:border-slate-600"
                }`}>
                  {isChecked && <CheckCircle2 size={14} className="stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleActivate}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Bell size={16} />
            <span>Permitir e Ativar Notificações</span>
          </button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full h-9 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer"
          >
            Continuar sem notificações
          </button>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-400 text-center">
          <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
          <span>Você pode alterar ou cancelar os lembretes a qualquer momento</span>
        </div>
      </motion.div>
    </div>
  );
}
