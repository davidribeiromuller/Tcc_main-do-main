import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ShieldCheck,
  Search,
  UserCheck,
  Calendar,
  Clock,
  Eye,
  FileCheck2,
  Users
} from "lucide-react";
import { EventAttendanceAuthorization } from "../types.ts";
import AuthorizationReceiptModal from "./AuthorizationReceiptModal.tsx";
import { safeParseJsonResponse } from "../lib/apiResilience.ts";

interface EventAuthorizationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: number;
  eventTitle: string;
}

export const EventAuthorizationsModal: React.FC<EventAuthorizationsModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventTitle,
}) => {
  const [authorizations, setAuthorizations] = useState<EventAttendanceAuthorization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAuth, setSelectedAuth] = useState<EventAttendanceAuthorization | null>(null);

  useEffect(() => {
    if (isOpen && eventId) {
      setIsLoading(true);
      fetch(`/api/events/${eventId}/authorizations`)
        .then((res) => safeParseJsonResponse<EventAttendanceAuthorization[]>(res))
        .then((parsed) => {
          if (parsed.data && Array.isArray(parsed.data)) {
            setAuthorizations(parsed.data);
          } else {
            setAuthorizations([]);
          }
        })
        .catch((err) => {
          console.warn("Failed to load authorizations:", err);
          setAuthorizations([]);
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, eventId]);

  if (!isOpen) return null;

  const filtered = authorizations.filter((a) => {
    const q = searchQuery.toLowerCase();
    return (
      a.studentName.toLowerCase().includes(q) ||
      a.guardianFullName.toLowerCase().includes(q) ||
      (a.guardianRelationship && a.guardianRelationship.toLowerCase().includes(q))
    );
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-5 sm:p-7 shadow-2xl border border-emerald-200 dark:border-emerald-800 relative my-auto flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-800 dark:text-emerald-300 shrink-0">
                <FileCheck2 size={22} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  Autorizações dos Responsáveis Legais
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-sm sm:max-w-md">
                  Evento: {eventTitle}
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

          {/* Search bar and counter */}
          <div className="pt-4 pb-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar aluno ou responsável..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 self-end sm:self-center">
              <Users size={14} />
              <span>{authorizations.length} presença(s) autorizada(s)</span>
            </div>
          </div>

          {/* Content List */}
          <div className="overflow-y-auto flex-1 pr-1 space-y-2.5 my-2">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Carregando autorizações...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                <ShieldCheck size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {authorizations.length === 0
                    ? "Nenhum estudante menor com autorização registrada para este evento até o momento."
                    : "Nenhuma autorização corresponde aos termos da pesquisa."}
                </p>
              </div>
            ) : (
              filtered.map((auth) => (
                <div
                  key={auth.id}
                  className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 hover:border-emerald-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {auth.studentName}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        Autorizado
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Responsável: <strong className="text-slate-700 dark:text-slate-300">{auth.guardianFullName}</strong> ({auth.guardianRelationship})
                      {auth.guardianContact ? ` • Contato: ${auth.guardianContact}` : ""}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock size={11} />
                      <span>Assinado em: {new Date(auth.signedAt).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedAuth(auth)}
                    className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>Ver Termo</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>

          {/* Receipt Modal */}
          {selectedAuth && (
            <AuthorizationReceiptModal
              isOpen={!!selectedAuth}
              onClose={() => setSelectedAuth(null)}
              authorization={selectedAuth}
            />
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default EventAuthorizationsModal;
