import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ArrowLeft,
  Users,
  Building2,
  Sparkles,
  FileText,
  Megaphone,
  XCircle,
  CalendarClock,
} from "lucide-react";
import { fetchJsonApi, getStoredSessionToken } from "../lib/staticHosting.ts";
import {
  formatBRL,
  FEATURE_LABELS,
  type AccessState,
} from "../lib/subscription.ts";
import { fetchPlansCatalog, type PlansCatalog, type PlanView } from "../lib/plansService.ts";

interface SchoolMeResponse {
  school: { id: string; slug: string; name: string; city?: string | null; status: string };
  administeredSchools: { id: string; slug: string; name: string }[];
  subscription: {
    id: string;
    status: string;
    effectiveStatus: string;
    planId: string;
    planName: string;
    billingCycle: "monthly" | "annual";
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    graceUntil?: string | null;
    cancelAtPeriodEnd: boolean;
    discountPercent: number;
    founderDiscount: boolean;
    provider: string;
    nextDueAt?: string | null;
  } | null;
  access: AccessState;
  usage: {
    activeStudents: number;
    studentLimit: number | null;
    studentQuota: { ratio: number | null; shouldWarn: boolean; isExhausted: boolean; message: string | null };
    adminLimit: number | null;
    unitLimit: number | null;
    aiRequestsThisMonth: number;
    aiLimit: number | null;
    aiQuota: { ratio: number | null; shouldWarn: boolean; isExhausted: boolean; message: string | null };
  };
  entitlements: { key: string; label: string; enabled: boolean; limit: number | null }[];
  features: Record<string, boolean>;
}

interface Campaign {
  id: string;
  title: string;
  body?: string | null;
  starts_at: string;
  ends_at: string;
  status: "pending" | "approved" | "rejected" | "expired" | "canceled";
  rejection_reason?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  suspended: "Suspensa",
  canceled: "Cancelada",
  expired: "Expirada",
};

const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
  past_due: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
  suspended: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
  canceled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  expired: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface Props {
  onNavigate: (screen: string) => void;
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
}

export default function SchoolSubscription({ onNavigate, onShowToast }: Props) {
  const [data, setData] = useState<SchoolMeResponse | null>(null);
  const [catalog, setCatalog] = useState<PlansCatalog | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getStoredSessionToken() || "";
      const res = await fetchJsonApi("/api/school/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res) {
        setError(
          "A área \"Minha assinatura\" precisa do servidor do eloEscola. Esta é uma hospedagem estática de demonstração."
        );
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Não foi possível carregar sua assinatura (HTTP ${res.status}).`);
        return;
      }

      const body = (await res.json()) as SchoolMeResponse;
      setData(body);
      setCycle(body.subscription?.billingCycle || "monthly");

      const campRes = await fetchJsonApi("/api/school/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (campRes && campRes.ok) {
        const campBody = await campRes.json();
        setCampaigns(campBody.campaigns || []);
      }
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar a assinatura.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetchPlansCatalog().then((r) => setCatalog(r.catalog));
  }, []);

  const currentPlan = useMemo<PlanView | null>(() => {
    if (!catalog || !data?.subscription) return null;
    return catalog.plans.find((p) => p.id === data.subscription!.planId) || null;
  }, [catalog, data]);

  const changePlan = async (planId: string) => {
    const token = getStoredSessionToken() || "";
    setBusy(planId);
    try {
      const res = await fetchJsonApi("/api/school/subscription/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId, billingCycle: cycle }),
      });
      if (!res) {
        onShowToast?.("Alteração de plano exige o servidor do eloEscola.", "error");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        onShowToast?.(body.error || "Não foi possível alterar o plano.", "error");
        return;
      }
      // Cobrança fica PENDENTE quando não há provedor: a mensagem diz isso.
      onShowToast?.(
        body.charge?.message || "Plano atualizado. A cobrança ficou registrada como pendente.",
        "success"
      );
      await load();
    } catch (err: any) {
      onShowToast?.(err?.message || "Erro ao alterar o plano.", "error");
    } finally {
      setBusy(null);
    }
  };

  const cancelSubscription = async () => {
    if (!window.confirm("Agendar o cancelamento ao fim do período atual? Nenhum dado é apagado.")) return;
    const token = getStoredSessionToken() || "";
    setBusy("cancel");
    try {
      const res = await fetchJsonApi("/api/school/subscription/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        onShowToast?.(body.error || "Não foi possível agendar o cancelamento.", "error");
        return;
      }
      onShowToast?.(body.message || "Cancelamento agendado.", "success");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const decideCampaign = async (id: string, approve: boolean) => {
    const token = getStoredSessionToken() || "";
    setBusy(id);
    try {
      const res = await fetchJsonApi(`/api/school/campaigns/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ approve }),
      });
      const body = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        onShowToast?.(body.error || "Não foi possível registrar a decisão.", "error");
        return;
      }
      onShowToast?.(approve ? "Campanha aprovada." : "Campanha recusada.", "success");
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="w-[92%] max-w-4xl mx-auto py-10 flex flex-col items-center gap-3 text-slate-500">
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-sm">Carregando sua assinatura…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[92%] max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Minha assinatura indisponível</h2>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{error}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={load}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={() => onNavigate("feed")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Voltar ao mural
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const sub = data.subscription;
  const statusKey = sub?.effectiveStatus || "expired";

  return (
    <div className="w-[92%] max-w-5xl mx-auto py-6 pb-bottom-nav">
      <button
        onClick={() => onNavigate("admin")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent mb-4"
      >
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      <header className="mb-5">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
          Minha assinatura
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {data.school.name}
          {data.school.city ? ` • ${data.school.city}` : ""}
        </p>
      </header>

      {!data.access.canWrite && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/60 p-4 flex items-start gap-3">
          <XCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-red-800 dark:text-red-200">Publicação bloqueada</p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1 leading-relaxed">
              {data.access.reason} Seus dados continuam salvos — nada foi apagado.
            </p>
          </div>
        </div>
      )}

      {data.access.canWrite && data.access.reason && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 flex items-start gap-3">
          <Clock className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{data.access.reason}</p>
        </div>
      )}

      {/* Situação atual */}
      <section className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Plano</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {sub?.planName || "Sem plano"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Cobrança {sub?.billingCycle === "annual" ? "anual" : "mensal"}
          </p>
          {sub?.founderDiscount && (
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
              <Sparkles size={10} /> Escola Fundadora −{sub.discountPercent}%
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Situação</p>
          <span
            className={`inline-flex items-center gap-1.5 mt-2 text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLE[statusKey]}`}
          >
            <ShieldCheck size={12} /> {STATUS_LABEL[statusKey] || statusKey}
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {statusKey === "trialing"
              ? `Teste até ${formatDate(sub?.trialEndsAt)}`
              : `Ciclo até ${formatDate(sub?.currentPeriodEnd)}`}
          </p>
          {sub?.cancelAtPeriodEnd && (
            <p className="text-[11px] text-amber-600 mt-1">Cancelamento agendado ao fim do ciclo.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Valor</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            {currentPlan
              ? formatBRL(
                  sub?.billingCycle === "annual"
                    ? currentPlan.annual_price_cents
                    : currentPlan.monthly_price_cents
                )
              : "—"}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {sub?.nextDueAt ? `Próximo vencimento ${formatDate(sub.nextDueAt)}` : "Sem vencimento definido"}
          </p>
        </div>
      </section>

      {/* Consumo e cotas */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 sm:p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <Users size={16} className="text-brand-primary" /> Limites do plano
        </h2>

        <div className="space-y-4">
          <QuotaBar
            label="Alunos e responsáveis ativos"
            used={data.usage.activeStudents}
            limit={data.usage.studentLimit}
            warning={data.usage.studentQuota.message}
          />
          <QuotaBar
            label="Mensagens do Assistente Elo neste mês"
            used={data.usage.aiRequestsThisMonth}
            limit={data.usage.aiLimit}
            warning={data.usage.aiQuota.message}
          />
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Building2 size={14} /> Unidades: até {data.usage.unitLimit ?? "—"}
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <ShieldCheck size={14} /> Administradores: até {data.usage.adminLimit ?? "—"}
            </div>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 sm:p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
          <FileText size={16} className="text-brand-primary" /> Recursos incluídos
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.keys(FEATURE_LABELS).map((key) => {
            const enabled = data.features[key] === true;
            return (
              <li key={key} className="flex items-center gap-2 text-xs">
                {enabled ? (
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                ) : (
                  <XCircle size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
                )}
                <span className={enabled ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500"}>
                  {FEATURE_LABELS[key]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Troca de plano */}
      <section className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard size={16} className="text-brand-primary" /> Planos disponíveis
          </h2>
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  cycle === c
                    ? "bg-white dark:bg-slate-900 text-brand-primary shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {c === "monthly" ? "Mensal" : "Anual −10%"}
              </button>
            ))}
          </div>
        </div>

        {!catalog && (
          <p className="text-xs text-slate-500">
            Catálogo de planos indisponível neste ambiente (precisa do servidor). Nenhum preço é exibido
            sem vir do banco.
          </p>
        )}

        {catalog && (
          <div className="grid gap-4 sm:grid-cols-3">
            {catalog.plans.map((plan) => {
              const isCurrent = data.subscription?.planId === plan.id;
              const price = cycle === "annual" ? plan.annual_price_cents : plan.monthly_price_cents;
              return (
                <div
                  key={plan.id}
                  className={`rounded-2xl border p-4 flex flex-col ${
                    isCurrent
                      ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10"
                      : "border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900"
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{plan.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex-1 leading-relaxed">
                    {plan.tagline}
                  </p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white mt-3">{formatBRL(price)}</p>
                  <p className="text-[11px] text-slate-400">
                    {cycle === "annual" ? "por ano (10% off)" : "por mês"}
                  </p>
                  {plan.setup_fee_cents > 0 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Implantação {formatBRL(plan.setup_fee_cents)}
                    </p>
                  )}
                  <button
                    disabled={isCurrent || busy === plan.id}
                    onClick={() => changePlan(plan.id)}
                    className={`mt-3 h-9 rounded-xl text-xs font-bold transition-colors ${
                      isCurrent
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default"
                        : "bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-60"
                    }`}
                  >
                    {isCurrent ? "Plano atual" : busy === plan.id ? "Alterando…" : "Mudar para este plano"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Campanhas de parceiros — aprovação pela escola */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 sm:p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <Megaphone size={16} className="text-brand-primary" /> Campanhas de parceiros
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          A instituição decide o que aparece para seus alunos. Nenhum dado de estudante é vendido ou
          compartilhado com parceiros.
        </p>

        {campaigns.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma campanha enviada para esta instituição.</p>
        ) : (
          <ul className="space-y-2">
            {campaigns.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{c.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDate(c.starts_at)} → {formatDate(c.ends_at)} · {c.status}
                  </p>
                </div>
                {c.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      disabled={busy === c.id}
                      onClick={() => decideCampaign(c.id, true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                    >
                      Aprovar
                    </button>
                    <button
                      disabled={busy === c.id}
                      onClick={() => decideCampaign(c.id, false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sub && !sub.cancelAtPeriodEnd && (
        <section className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/60 p-4">
          <CalendarClock size={18} className="text-slate-400" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Cancelar assinatura</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              O acesso de leitura é mantido e nenhum dado é apagado.
            </p>
          </div>
          <button
            onClick={cancelSubscription}
            disabled={busy === "cancel"}
            className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 dark:border-red-900/60 dark:hover:bg-red-950/30 disabled:opacity-60"
          >
            {busy === "cancel" ? "Agendando…" : "Agendar cancelamento"}
          </button>
        </section>
      )}
    </div>
  );
}

function QuotaBar({
  label,
  used,
  limit,
  warning,
}: {
  label: string;
  used: number;
  limit: number | null;
  warning: string | null;
}) {
  const ratio = limit && limit > 0 ? Math.min(1, used / limit) : null;
  const isWarn = ratio !== null && ratio >= 0.8;
  const isFull = ratio !== null && ratio >= 1;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600 dark:text-slate-300 font-medium">{label}</span>
        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
          {used}
          {limit === null ? " / ilimitado" : ` / ${limit}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isFull ? "bg-red-500" : isWarn ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${ratio === null ? 8 : Math.max(4, ratio * 100)}%` }}
        />
      </div>
      {warning && (
        <p className={`text-[11px] mt-1 ${isFull ? "text-red-600" : "text-amber-600"}`}>{warning}</p>
      )}
    </div>
  );
}
