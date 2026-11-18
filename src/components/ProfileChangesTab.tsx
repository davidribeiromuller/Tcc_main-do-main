import React, { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Check,
  X,
  UserCheck,
  Loader2,
  AlertTriangle,
  Clock,
  History,
} from "lucide-react";
import type { User } from "../types";
import {
  listarSolicitacoesDePerfil,
  aprovarSolicitacaoDePerfil,
  rejeitarSolicitacaoDePerfil,
  ROTULOS_CAMPOS,
  type SolicitacaoDePerfil,
} from "../lib/profileChangeService.ts";

interface ProfileChangesTabProps {
  currentUser: User | null;
  /** Aprovar/rejeitar é permitido a Funcionário ADM e Chefe ADM. */
  canReview: boolean;
  onShowToast?: (message: string, type?: "error" | "warning" | "success" | "info") => void;
  /** Recarrega o diretório de usuários depois de aplicar uma alteração. */
  onRefreshUsers?: () => void | Promise<void>;
}

type Filtro = "pending" | "approved" | "rejected";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "pending", rotulo: "Pendentes" },
  { id: "approved", rotulo: "Aprovadas" },
  { id: "rejected", rotulo: "Rejeitadas" },
];

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Aba "Alterações de perfil" do painel ADM (rodada 25).
 *
 * Foto e telefone mudam na hora; nome, e-mail, CPF, data de nascimento,
 * gênero, instituição e cargo precisam de confirmação de um Funcionário ADM.
 * Esta aba mostra o diff campo a campo (antes → depois) e permite aprovar
 * (aplica no banco) ou rejeitar (arquiva, sem tocar no perfil).
 */
export default function ProfileChangesTab({
  currentUser,
  canReview,
  onShowToast,
  onRefreshUsers,
}: ProfileChangesTabProps) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoDePerfil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pending");
  const [processandoId, setProcessandoId] = useState<number | null>(null);

  const notificar = (msg: string, tipo: "error" | "warning" | "success" | "info" = "info") => {
    onShowToast?.(msg, tipo);
  };

  const carregar = useCallback(
    async (alvo: Filtro = filtro) => {
      setCarregando(true);
      setErro(null);
      const { solicitacoes: lista, error } = await listarSolicitacoesDePerfil(alvo);
      if (error) {
        setErro("Não foi possível carregar as solicitações de alteração de perfil.");
        setSolicitacoes([]);
      } else {
        setSolicitacoes(lista);
      }
      setCarregando(false);
    },
    [filtro]
  );

  useEffect(() => {
    void carregar(filtro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const handleAprovar = async (solicitacao: SolicitacaoDePerfil) => {
    if (!canReview) {
      notificar("Apenas um administrador pode aprovar alterações de perfil.", "error");
      return;
    }
    setProcessandoId(solicitacao.id);
    const { error } = await aprovarSolicitacaoDePerfil({
      solicitacao,
      reviewedBy: currentUser?.nome || currentUser?.email || "Administrador",
    });
    setProcessandoId(null);

    if (error) {
      notificar(error.message || "Não foi possível aprovar a solicitação.", "error");
      return;
    }

    notificar(`Alterações de ${solicitacao.userNome} aplicadas ao perfil.`, "success");
    setSolicitacoes((prev) => prev.filter((s) => s.id !== solicitacao.id));
    await onRefreshUsers?.();
  };

  const handleRejeitar = async (solicitacao: SolicitacaoDePerfil) => {
    if (!canReview) {
      notificar("Apenas um administrador pode rejeitar alterações de perfil.", "error");
      return;
    }
    const motivo = window.prompt(
      `Rejeitar as alterações de ${solicitacao.userNome}? Deixe em branco ou escreva o motivo:`,
      ""
    );
    if (motivo === null) return;

    setProcessandoId(solicitacao.id);
    const { success, error } = await rejeitarSolicitacaoDePerfil({
      solicitacaoId: solicitacao.id,
      reviewedBy: currentUser?.nome || currentUser?.email || "Administrador",
      motivo: motivo.trim() || undefined,
    });
    setProcessandoId(null);

    if (!success) {
      notificar(error?.message || "Não foi possível rejeitar a solicitação.", "error");
      return;
    }

    notificar("Solicitação rejeitada. O perfil permanece como estava.", "info");
    setSolicitacoes((prev) => prev.filter((s) => s.id !== solicitacao.id));
  };

  return (
    <div className="mt-4 space-y-3">
      {/* Cabeçalho explicativo */}
      <div className="bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
        <h3 className="text-sm font-serif font-bold text-amber-950 dark:text-amber-200 flex items-center gap-2">
          <ShieldCheck size={16} className="text-amber-700 dark:text-amber-400" />
          Alterações de perfil aguardando confirmação
        </h3>
        <p className="text-[11px] text-amber-900/90 dark:text-amber-200/80 mt-1 leading-relaxed">
          Foto de perfil e telefone para contato são atualizados pelo próprio usuário. Nome, e-mail,
          CPF, data de nascimento, gênero, instituição e cargo só valem depois da aprovação de um
          administrador.
        </p>
      </div>

      {/* Filtros + recarregar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-x-snap py-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
              filtro === f.id
                ? "bg-brand-accent dark:bg-brand-primary text-white dark:text-slate-900 border-transparent"
                : "bg-white dark:bg-brand-card-dark text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10"
            }`}
          >
            {f.rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void carregar(filtro)}
          className="ml-auto px-3 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-brand-card-dark border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Estados */}
      {carregando && (
        <div className="flex items-center justify-center py-10 text-slate-400 text-xs gap-2">
          <Loader2 size={16} className="animate-spin" />
          Carregando solicitações...
        </div>
      )}

      {!carregando && erro && (
        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/25 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{erro}</p>
            <button
              type="button"
              onClick={() => void carregar(filtro)}
              className="mt-2 underline font-semibold cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!carregando && !erro && solicitacoes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center text-slate-400 bg-white dark:bg-brand-card-dark rounded-3xl border border-dashed border-slate-300 dark:border-white/10 p-8">
          {filtro === "pending" ? (
            <UserCheck size={36} className="text-slate-300 dark:text-slate-600 mb-2" />
          ) : (
            <History size={36} className="text-slate-300 dark:text-slate-600 mb-2" />
          )}
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {filtro === "pending"
              ? "Nenhuma alteração aguardando aprovação."
              : `Nenhuma solicitação ${filtro === "approved" ? "aprovada" : "rejeitada"}.`}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {filtro === "pending"
              ? "Quando um usuário alterar nome, e-mail, CPF, data de nascimento, gênero, instituição ou cargo, a solicitação aparece aqui."
              : "O histórico é mantido para auditoria."}
          </p>
        </div>
      )}

      {/* Lista */}
      {!carregando &&
        !erro &&
        solicitacoes.map((s) => {
          const processando = processandoId === s.id;
          return (
            <div
              key={s.id}
              className="bg-white dark:bg-brand-card-dark rounded-2xl border border-brand-primary/20 dark:border-white/10 shadow-xs overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 p-3.5 border-b border-slate-100 dark:border-white/5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {s.userNome}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock size={11} />
                    {formatarData(s.createdAt)}
                    {s.reviewedAt && (
                      <span className="ml-1">· revisado em {formatarData(s.reviewedAt)}</span>
                    )}
                  </p>
                  {s.reviewedBy && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      por {s.reviewedBy}
                    </p>
                  )}
                </div>
                {filtro === "pending" && canReview && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleAprovar(s)}
                      disabled={processando}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                    >
                      {processando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRejeitar(s)}
                      disabled={processando}
                      className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                    >
                      <X size={13} />
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>

              {/* Diff campo a campo */}
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {s.alteracoes.map((a) => (
                  <li key={a.campo} className="px-3.5 py-2.5 text-xs">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      {ROTULOS_CAMPOS[a.campo] || a.campo}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="line-through text-slate-400 dark:text-slate-500 break-anywhere">
                        {a.valorAnterior || "(vazio)"}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="font-semibold text-slate-900 dark:text-white break-anywhere">
                        {a.valorNovo || "(vazio)"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {s.rejectionReason && (
                <p className="px-3.5 py-2.5 text-[11px] text-red-700 dark:text-red-300 bg-red-50/70 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/30">
                  Motivo da rejeição: {s.rejectionReason}
                </p>
              )}
            </div>
          );
        })}

      {!canReview && (
        <p className="text-[11px] text-slate-400 text-center pt-1">
          Somente administradores podem aprovar ou rejeitar alterações.
        </p>
      )}
    </div>
  );
}
