import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Navigation,
  MapPin,
  Clock,
  Calendar,
  ShieldCheck,
  Compass,
  X,
  Sparkles,
  ArrowRight,
  Route
} from "lucide-react";
import { Event } from "../types";

interface EventLocationModalProps {
  isOpen: boolean;
  event: Event | null;
  onClose: () => void;
  onAuthorize: (event: Event, coords?: { lat: number; lng: number }) => void;
  onSkip: (event: Event) => void;
}

const MONTHS_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function EventLocationModal({
  isOpen,
  event,
  onClose,
  onAuthorize,
  onSkip,
}: EventLocationModalProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  if (!isOpen || !event) return null;

  const handleRequestLocation = () => {
    setIsLocating(true);
    setLocError(null);

    if (!("geolocation" in navigator)) {
      setIsLocating(false);
      onSkip(event);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        try {
          localStorage.setItem("user_geolocation_coords", JSON.stringify(coords));
        } catch (e) {
          console.warn("Could not cache user coords:", e);
        }
        setIsLocating(false);
        onAuthorize(event, coords);
      },
      (err) => {
        console.warn("Geolocation permission error or rejected:", err);
        setIsLocating(false);
        // If rejected, still proceed smoothly to the event detail view
        onSkip(event);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleSkip = () => {
    onSkip(event);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 15 }}
        className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative text-slate-800 dark:text-slate-100"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Header Icon */}
        <div className="w-14 h-14 rounded-2xl bg-blue-500/15 text-[#1A73E8] mx-auto flex items-center justify-center mb-3 ring-4 ring-blue-500/10">
          <Navigation size={28} className="animate-bounce" />
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-slate-900 dark:text-white text-lg leading-snug">
          Permissão de Localização
        </h3>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1 max-w-[280px] mx-auto">
          Deseja permitir o acesso à sua localização para traçar a rota e calcular a distância até este evento?
        </p>

        {/* Event Preview Card */}
        <div className="mt-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-700/60 text-left flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex flex-col items-center justify-center shrink-0 font-display shadow-xs">
            <span className="text-[8px] uppercase font-bold leading-none">
              {MONTHS_NAMES[event.month].slice(0, 3)}
            </span>
            <span className="text-sm font-extrabold leading-none mt-0.5">
              {event.day}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
              {event.title}
            </h4>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              <MapPin size={11} className="text-red-500 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          </div>
        </div>

        {/* Benefits list */}
        <div className="mt-3.5 space-y-1.5 text-left text-[11px] text-slate-600 dark:text-slate-300 bg-blue-50/50 dark:bg-blue-950/20 p-2.5 rounded-xl border border-blue-500/20">
          <div className="flex items-center gap-2">
            <Route size={13} className="text-[#1A73E8] shrink-0" />
            <span>Traçado da melhor rota no mapa interativo</span>
          </div>
          <div className="flex items-center gap-2">
            <Compass size={13} className="text-[#1A73E8] shrink-0" />
            <span>Cálculo automático de distância em km</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRequestLocation}
            disabled={isLocating}
            className="w-full h-11 bg-[#1A73E8] hover:bg-[#1557b0] active:scale-98 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-75"
          >
            <ShieldCheck size={16} />
            <span>{isLocating ? "Obtendo sua localização..." : "Permitir e Abrir Evento"}</span>
          </button>

          <button
            type="button"
            onClick={handleSkip}
            disabled={isLocating}
            className="w-full h-9 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-semibold cursor-pointer"
          >
            Continuar sem localização
          </button>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1 text-[10px] text-slate-400">
          <ShieldCheck size={11} className="text-blue-500" />
          <span>Sua posição é usada apenas dentro do mapa do evento</span>
        </div>
      </motion.div>
    </div>
  );
}
