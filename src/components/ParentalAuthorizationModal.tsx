import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  ShieldCheck,
  FileText,
  UserCheck,
  Calendar,
  MapPin,
  Clock,
  AlertCircle,
  School,
  Lock
} from "lucide-react";
import { Event, User, EventAttendanceAuthorization } from "../types.ts";
import SignatureCanvas from "./SignatureCanvas.tsx";
import { safeParseJsonResponse } from "../lib/apiResilience.ts";

interface ParentalAuthorizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event;
  student: User;
  onAuthorizedSuccess: (authorization: EventAttendanceAuthorization) => void;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
}

export const ParentalAuthorizationModal: React.FC<ParentalAuthorizationModalProps> = ({
  isOpen,
  onClose,
  event,
  student,
  onAuthorizedSuccess,
  onShowToast,
}) => {
  const [guardianFullName, setGuardianFullName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("Mãe");
  const [guardianContact, setGuardianContact] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [hasSignatureStrokes, setHasSignatureStrokes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const eventDateFormatted = `${event.day} de ${months[event.month] || "Novembro"} de ${event.year}`;
  const eventTimeFormatted = event.time || "18:00";
  const schoolName = event.schoolName || student.institution || "Rede de Ensino de Araucária";

  const formalDeclarationText = `Eu, abaixo identificado(a) na qualidade de responsável legal pelo(a) estudante ${student.nome || "Estudante"}, autorizo de forma expressa, consciente e inequívoca a sua participação e presença no evento escolar "${event.title}", a realizar-se no dia ${eventDateFormatted}, às ${eventTimeFormatted}, nas dependências de "${event.location}". Declaro estar ciente dos horários e da natureza educacional das atividades programadas sob supervisão institucional, em observância ao Estatuto da Criança e do Adolescente (ECA) e à Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).`;

  const handleSignatureChange = (dataUrl: string | null, hasStrokes: boolean) => {
    setSignatureDataUrl(dataUrl);
    setHasSignatureStrokes(hasStrokes);
    if (errorMessage && hasStrokes) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!guardianFullName.trim()) {
      setErrorMessage("Por favor, preencha o nome completo do responsável legal.");
      return;
    }

    if (!guardianRelationship.trim()) {
      setErrorMessage("Por favor, informe o parentesco ou vínculo com o estudante.");
      return;
    }

    if (!declarationAccepted) {
      setErrorMessage("É obrigatório concordar com o termo de declaração e consentimento.");
      return;
    }

    if (!hasSignatureStrokes || !signatureDataUrl) {
      setErrorMessage("Por favor, realize a assinatura manuscrita no campo de desenho antes de confirmar.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        studentUserId: student.uid || student.id,
        studentName: student.nome || "Estudante",
        studentSchool: student.institution || schoolName,
        studentClass: student.role || "Aluno",
        guardianFullName: guardianFullName.trim(),
        guardianRelationship: guardianRelationship.trim(),
        guardianContact: guardianContact.trim(),
        authorizationText: formalDeclarationText,
        consentVersion: "v1.0-2026",
        declarationAccepted: true,
        signatureDataUrl,
        eventSnapshot: {
          title: event.title,
          location: event.location,
          date: eventDateFormatted,
          time: eventTimeFormatted,
          schoolName: schoolName,
        },
      };

      const response = await fetch(`/api/events/${event.id}/authorizations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const parsed = await safeParseJsonResponse<{
        success: boolean;
        authorization: EventAttendanceAuthorization;
        message?: string;
        error?: string;
      }>(response);

      if (!response.ok || !parsed.data || parsed.data.error) {
        throw new Error(parsed.data?.error || "Erro ao registrar a assinatura e autorização.");
      }

      if (onShowToast) {
        onShowToast("Autorização do responsável legal registrada com sucesso!", "success");
      }

      onAuthorizedSuccess(parsed.data.authorization);
      onClose();
    } catch (err: any) {
      console.error("Authorization submit error:", err);
      setErrorMessage(err.message || "Não foi possível registrar a autorização. Tente novamente.");
      if (onShowToast) {
        onShowToast(err.message || "Erro ao registrar autorização.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-emerald-100 dark:border-slate-800 relative my-auto max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  Autorização do Responsável Legal
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Termo de consentimento e assinatura digital para estudante
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Content */}
          <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 py-4 flex flex-col gap-4.5">
            {/* Student Handoff Prompt */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-start gap-3">
              <UserCheck size={18} className="text-emerald-700 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                <span className="font-semibold">Atenção ao estudante:</span> Entregue este dispositivo para a sua mãe, pai ou responsável legal preencher os campos abaixo e realizar a assinatura manuscrita.
              </div>
            </div>

            {/* Event & Student Summary Card */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-700/60 flex flex-col gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Dados do Evento e Estudante
              </div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <span>{event.title}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5">
                  <UserCheck size={13} className="text-slate-400" />
                  <span>Estudante: <strong>{student.nome || "Não informado"}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <School size={13} className="text-slate-400" />
                  <span className="truncate">{schoolName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span>{eventDateFormatted} às {eventTimeFormatted}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-slate-400" />
                  <span className="truncate">{event.location}</span>
                </div>
              </div>
            </div>

            {/* Guardian Input Fields */}
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Nome Completo do Responsável Legal *
                </label>
                <input
                  type="text"
                  required
                  value={guardianFullName}
                  onChange={(e) => setGuardianFullName(e.target.value)}
                  placeholder="Ex: Maria Aparecida da Silva"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Grau de Parentesco / Vínculo *
                  </label>
                  <select
                    value={guardianRelationship}
                    onChange={(e) => setGuardianRelationship(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                  >
                    <option value="Mãe">Mãe</option>
                    <option value="Pai">Pai</option>
                    <option value="Responsável Legal / Tutor">Responsável Legal / Tutor</option>
                    <option value="Avó / Avô">Avó / Avô</option>
                    <option value="Outro Familiar Autorizado">Outro Familiar Autorizado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Telefone para Contato / Confirmação
                  </label>
                  <input
                    type="tel"
                    value={guardianContact}
                    onChange={(e) => setGuardianContact(e.target.value)}
                    placeholder="(41) 99999-0000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Formal Declaration Text */}
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                <FileText size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span>Termo Formal de Autorização Escolar (LGPD & ECA)</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-h-32 overflow-y-auto pr-1">
                {formalDeclarationText}
              </p>
            </div>

            {/* Agreement Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none group">
              <input
                type="checkbox"
                required
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors leading-tight">
                Declaro que as informações preenchidas são verdadeiras e concedo autorização formal para a presença do estudante neste evento.
              </span>
            </label>

            {/* Digital Handwritten Signature Canvas */}
            <div className="pt-1">
              <SignatureCanvas
                onSignatureChange={handleSignatureChange}
                disabled={isSubmitting}
              />
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !declarationAccepted || !hasSignatureStrokes || !guardianFullName.trim()}
                className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Registrando termo...</span>
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    <span>Confirmar e Assinar Autorização</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ParentalAuthorizationModal;
