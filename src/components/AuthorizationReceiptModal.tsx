import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ShieldCheck, CheckCircle2, Calendar, MapPin, School, UserCheck, Clock } from "lucide-react";
import { EventAttendanceAuthorization } from "../types.ts";

interface AuthorizationReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  authorization: EventAttendanceAuthorization | null;
}

export const AuthorizationReceiptModal: React.FC<AuthorizationReceiptModalProps> = ({
  isOpen,
  onClose,
  authorization,
}) => {
  if (!isOpen || !authorization) return null;

  const signedDateFormatted = new Date(authorization.signedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const signatureSrc = authorization.signatureDataUrl || `/api/authorizations/${authorization.id}/signature`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl border border-emerald-200 dark:border-emerald-800 relative my-auto"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100/70 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-800 dark:text-emerald-300">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                    Comprovante de Autorização
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                    Ativo
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Validação digital de presença escolar
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="py-4 space-y-4">
            {/* Event snapshot */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-700/60 space-y-2">
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {authorization.eventSnapshot?.title || "Evento Escolar"}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span>{authorization.eventSnapshot?.date || "Data confirmada"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" />
                  <span className="truncate">{authorization.eventSnapshot?.location || "Araucária/PR"}</span>
                </div>
              </div>
            </div>

            {/* Student & Guardian Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Estudante</div>
                <div className="font-semibold text-slate-800 dark:text-slate-100">{authorization.studentName}</div>
                <div className="text-[11px] text-slate-500 truncate">{authorization.studentSchool}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] uppercase font-semibold text-slate-400 mb-0.5">Responsável Legal</div>
                <div className="font-semibold text-slate-800 dark:text-slate-100">{authorization.guardianFullName}</div>
                <div className="text-[11px] text-slate-500">
                  {authorization.guardianRelationship} {authorization.guardianContact ? `• ${authorization.guardianContact}` : ""}
                </div>
              </div>
            </div>

            {/* Handwritten Signature Container */}
            <div className="border border-emerald-200 dark:border-emerald-800 rounded-2xl p-3.5 bg-emerald-50/30 dark:bg-emerald-950/20">
              <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300 mb-2 flex items-center justify-between">
                <span>Assinatura Digital Manuscrita</span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock size={11} />
                  {signedDateFormatted}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl p-2 border border-slate-200 dark:border-slate-800 flex items-center justify-center min-h-[90px]">
                <img
                  src={signatureSrc}
                  alt="Assinatura manuscrita do responsável"
                  className="max-h-24 max-w-full object-contain"
                />
              </div>
            </div>

            {/* Legal compliance footer stamp */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                <CheckCircle2 size={13} />
                Validado com carimbo do servidor
              </span>
              <span className="font-mono text-[10px] text-slate-400">{authorization.id}</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Fechar Comprovante
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AuthorizationReceiptModal;
