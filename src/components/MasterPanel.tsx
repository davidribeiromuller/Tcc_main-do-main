import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  Handshake,
  ScrollText,
  RefreshCw,
  AlertTriangle,
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { fetchJsonApi, getStoredSessionToken } from "../lib/staticHosting.ts";
import { formatBRL } from "../lib/subscription.ts";

type Tab = "overview" | "schools" | "subscriptions" | "finance" | "partners" | "audit" | "leads";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "schools", label: "Instituições", icon: Building2 },
  { id: "subscriptions", label: "Assinaturas", icon: CheckCircle2 },
  { id: "finance", label: "Financeiro", icon: CreditCard },
  { id: "partners", label: "Parceiros", icon: Handshake },
  { id: "leads", label: "Leads", icon: Users },
  { id: "audit", label: "Auditoria", icon: ScrollText },
];

interface Props {
  onNavigate: (screen: string) => void;
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
}

function authHeaders(): Record<string, string> {
  const token = getStoredSessionToken() || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export default function MasterPanel({ onNavigate, onShowToast }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (path: string, init?: RequestInit) => {
    const res = await fetchJsonApi(path, { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
    if (!res) return { ok: false as const, status: 0, body: { error: "Servidor indisponível nesta hospedagem." } };
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const ov = await call("/api/master/overview");
      if (!ov.ok) {
        setError(
          ov.body?.error ||
            (ov.status === 403
              ? "Acesso restrito ao proprietário da plataforma."
              : "Não foi possível carregar o painel Master.")
        );
        return;
      }
      setOverview(ov.body);

      const [subs, pays, parts, audit, leadRes] = await Promise.all([
        call("/api/master/subscriptions"),
        call("/api/master/payments"),
        call("/api/master/partners"),
        call("/api/master/audit"),
        call("/api/master/leads"),
      ]);
      if (subs.ok) setSubscriptions(subs.body.subscriptions || []);
      if (pays.ok) setPayments(pays.body.payments || []);
      if (parts.ok) setPartners(parts.body.partners || []);
      if (audit.ok) setLogs(audit.body.logs || []);
      if (leadRes.ok) setLeads(leadRes.body.leads || []);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar o painel Master.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const totals = overview?.totals || {};
  const billing = overview?.billing;
  const schools: any[] = overview?.schools || [];
  const plans: any[] = overview?.plans || [];

  const mrr = useMemo(() => formatBRL(totals.mrrCents || 0), [totals.mrrCents]);

  const updateSubscription = async (id: string, patch: Record<string, any>, label: string) => {
    setBusy(id);
    try {
      const res = await call(`/api/master/subscriptions/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        onShowToast?.(res.body?.error || "Não foi possível atualizar.", "error");
        return;
      }
      onShowToast?.(label, "success");
      await loadAll();
    } finally {
      setBusy(null);
    }
  };

  const createSchool = async (form: {
    name: string;
    slug: string;
    city: string;
    planId: string;
    ownerEmail: string;
  }) => {
    setBusy("new-school");
    try {
      const res = await call("/api/master/schools", { method: "POST", body: JSON.stringify(form) });
      if (!res.ok) {
        onShowToast?.(res.body?.error || "Não foi possível criar a instituição.", "error");
        return;
      }
      onShowToast?.(
        res.body?.founderDiscount
          ? "Instituição criada como Escola Fundadora (−20% por 12 meses)."
          : "Instituição criada com teste de 30 dias.",
        "success"
      );
      if (res.body?.membershipError) onShowToast?.(res.body.membershipError, "error");
      await loadAll();
    } finally {
      setBusy(null);
    }
  };

  const registerManualPayment = async (form: {
    schoolId: string;
    subscriptionId: string;
    amountCents: number;
    note: string;
  }) => {
    setBusy("manual-payment");
    try {
      const res = await call("/api/master/payments/manual", {
        method: "POST",
        body: JSON.stringify({ ...form, method: "pix" }),
      });
      if (!res.ok) {
        onShowToast?.(res.body?.error || "Não foi possível registrar a baixa.", "error");
        return;
      }
      onShowToast?.("Baixa manual registrada e auditada.", "success");
      await loadAll();
    } finally {
      setBusy(null);
    }
  };

  const setPlanPrice = async (plan: any, field: string, value: number) => {
    setBusy(plan.id);
    try {
      const res = await call(`/api/master/plans/${plan.id}`, {
        method: "PUT",
        body: JSON.stringify({ [field]: Math.round(value) }),
      });
      if (!res.ok) {
        onShowToast?.(res.body?.error || "Não foi possível atualizar o plano.", "error");
        return;
      }
      onShowToast?.("Plano atualizado. A vitrine já usa o novo valor.", "success");
      await loadAll();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="w-[92%] max-w-6xl mx-auto py-10 flex flex-col items-center gap-3 text-slate-500">
        <RefreshCw className="animate-spin" size={22} />
        <p className="text-sm">Carregando painel Master…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[92%] max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm">Painel Master</h2>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{error}</p>
              <p className="text-[11px] text-slate-500 mt-2">
                Configure <code className="px-1 bg-white dark:bg-slate-900 rounded">PLATFORM_OWNER_EMAILS</code> no
                servidor e use uma conta dessa lista com papel de Chefe Administrador.
              </p>
              <button
                onClick={loadAll}
                className="mt-3 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[96%] max-w-[1500px] mx-auto py-5 pb-bottom-nav">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <button
            onClick={() => onNavigate("admin")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent mb-1"
          >
            <ArrowLeft size={14} /> Voltar ao painel da escola
          </button>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
            Painel Master
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Operação comercial do eloEscola — acesso exclusivo do proprietário.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {billing && !billing.configured && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 px-4 py-3 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>Cobrança em modo sandbox.</strong> {billing.note} Ausentes:{" "}
            {billing.missing.length ? billing.missing.join(", ") : "—"}.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-5 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === id
                ? "bg-brand-primary text-white"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Instituições" value={totals.schools ?? 0} hint={`${totals.activeSchools ?? 0} ativas`} />
            <Metric label="Assinaturas ativas" value={totals.active ?? 0} hint={`${totals.trialing ?? 0} em teste`} />
            <Metric label="MRR" value={mrr} hint={`ARR ${formatBRL(totals.arrCents || 0)}`} icon={TrendingUp} />
            <Metric label="Recebido" value={formatBRL(totals.revenuePaidCents || 0)} hint="pagamentos confirmados" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Em atraso" value={totals.pastDue ?? 0} />
            <Metric label="Canceladas" value={totals.canceled ?? 0} />
            <Metric label="Leads" value={totals.leads ?? 0} />
            <Metric
              label="Vagas de fundadora"
              value={`${totals.founderSlotsUsed ?? 0}/${totals.founderSlotsTotal ?? 3}`}
              hint="20% por 12 meses"
            />
          </div>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Instituições recentes</h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {schools.slice(0, 6).map((s) => (
                <li key={s.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
                  <span className="text-slate-400">
                    {s.slug} {s.is_founder ? "· fundadora" : ""}
                  </span>
                </li>
              ))}
              {schools.length === 0 && <li className="py-2 text-xs text-slate-400">Nenhuma instituição.</li>}
            </ul>
          </section>
        </div>
      )}

      {tab === "schools" && (
        <SchoolsTab
          schools={schools}
          plans={plans}
          busy={busy}
          onCreate={createSchool}
          onShowToast={onShowToast}
        />
      )}

      {tab === "subscriptions" && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <Th>Instituição</Th>
                <Th>Plano</Th>
                <Th>Status</Th>
                <Th>Ciclo até</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <Td>{s.schoolName}</Td>
                  <Td>{s.planName}</Td>
                  <Td>
                    <span className="font-semibold">{s.access?.effectiveStatus || s.status}</span>
                    {s.access?.graceDaysLeft !== null && s.access?.graceDaysLeft !== undefined && (
                      <span className="text-amber-600 ml-1">({s.access.graceDaysLeft}d tolerância)</span>
                    )}
                  </Td>
                  <Td>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("pt-BR") : "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <button
                        disabled={busy === s.id}
                        onClick={() => updateSubscription(s.id, { status: "active" }, "Assinatura ativada.")}
                        className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                      >
                        Ativar
                      </button>
                      <button
                        disabled={busy === s.id}
                        onClick={() =>
                          updateSubscription(
                            s.id,
                            {
                              status: "past_due",
                              grace_until: new Date(Date.now() + 7 * 86400000).toISOString(),
                            },
                            "Assinatura em atraso com 7 dias de tolerância."
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-amber-500 text-white font-bold"
                      >
                        Atraso
                      </button>
                      <button
                        disabled={busy === s.id}
                        onClick={() => updateSubscription(s.id, { status: "suspended" }, "Assinatura suspensa.")}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300"
                      >
                        Suspender
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-slate-400">
                    Nenhuma assinatura registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === "finance" && (
        <div className="space-y-5">
          <PlansTab plans={plans} busy={busy} onSave={setPlanPrice} />

          <ManualPayment
            schools={schools}
            subscriptions={subscriptions}
            busy={busy}
            onSubmit={registerManualPayment}
          />

          <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white p-4 pb-2">Cobranças</h2>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                <tr>
                  <Th>Instituição</Th>
                  <Th>Tipo</Th>
                  <Th>Valor</Th>
                  <Th>Status</Th>
                  <Th>Criada</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                    <Td>{p.schoolName}</Td>
                    <Td>{p.kind}</Td>
                    <Td>{formatBRL(p.amount_cents)}</Td>
                    <Td>
                      <span
                        className={`font-bold ${
                          p.status === "paid"
                            ? "text-emerald-600"
                            : p.status === "failed"
                            ? "text-red-600"
                            : "text-amber-600"
                        }`}
                      >
                        {p.status}
                      </span>
                    </Td>
                    <Td>{new Date(p.created_at).toLocaleDateString("pt-BR")}</Td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-slate-400">
                      Nenhuma cobrança. Nada é marcado como pago sem confirmação do provedor ou baixa manual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {tab === "partners" && (
        <PartnersTab
          partners={partners}
          schools={schools}
          onShowToast={onShowToast}
          reload={loadAll}
          call={call}
        />
      )}

      {tab === "leads" && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Escola</Th>
                <Th>Status</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                  <Td>{l.name}</Td>
                  <Td>{l.email}</Td>
                  <Td>{l.school_name || "—"}</Td>
                  <Td>{l.status}</Td>
                  <Td>
                    <select
                      defaultValue={l.status}
                      onChange={async (e) => {
                        const res = await call(`/api/master/leads/${l.id}/status`, {
                          method: "PUT",
                          body: JSON.stringify({ status: e.target.value }),
                        });
                        if (res.ok) {
                          onShowToast?.("Status do lead atualizado.", "success");
                          await loadAll();
                        }
                      }}
                      className="bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                    >
                      {["new", "contacted", "trial_started", "won", "lost"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-slate-400">
                    Nenhum lead recebido.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === "audit" && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <Th>Quando</Th>
                <Th>Quem</Th>
                <Th>Ação</Th>
                <Th>Alvo</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                  <Td>{new Date(l.created_at).toLocaleString("pt-BR")}</Td>
                  <Td>{l.actor_email || "—"}</Td>
                  <Td className="font-mono text-[11px]">{l.action}</Td>
                  <Td>
                    {l.target_type}:{String(l.target_id || "").slice(0, 8)}
                  </Td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-slate-400">
                    Nenhum registro de auditoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">
        {Icon && <Icon size={12} />} {label}
      </p>
      <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SchoolsTab({
  schools,
  plans,
  busy,
  onCreate,
  onShowToast,
}: {
  schools: any[];
  plans: any[];
  busy: string | null;
  onCreate: (form: { name: string; slug: string; city: string; planId: string; ownerEmail: string }) => void;
  onShowToast?: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [form, setForm] = useState({ name: "", slug: "", city: "", planId: "escola", ownerEmail: "" });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
          <Plus size={16} className="text-brand-primary" /> Nova instituição
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            placeholder="Nome da escola"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <input
            placeholder="slug (ex.: escola-sao-jose)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <input
            placeholder="Cidade"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <select
            value={form.planId}
            onChange={(e) => setForm({ ...form, planId: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            placeholder="E-mail do administrador"
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
        </div>
        <button
          disabled={busy === "new-school" || !form.name || !form.slug}
          onClick={() => {
            if (!form.name || !form.slug) {
              onShowToast?.("Informe nome e slug da instituição.", "error");
              return;
            }
            onCreate(form);
          }}
          className="mt-3 px-4 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-60"
        >
          {busy === "new-school" ? "Criando…" : "Criar com teste de 30 dias"}
        </button>
        <p className="text-[11px] text-slate-400 mt-2">
          As 3 primeiras instituições entram como Escola Fundadora com 20% de desconto por 12 meses.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
            <tr>
              <Th>Nome</Th>
              <Th>Slug</Th>
              <Th>Cidade</Th>
              <Th>Status</Th>
              <Th>Fundadora</Th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                <Td>{s.name}</Td>
                <Td>{s.slug}</Td>
                <Td>{s.city || "—"}</Td>
                <Td>{s.status}</Td>
                <Td>{s.is_founder ? `Sim (vaga ${s.founder_slot})` : "—"}</Td>
              </tr>
            ))}
            {schools.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-400">
                  Nenhuma instituição cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PlansTab({
  plans,
  busy,
  onSave,
}: {
  plans: any[];
  busy: string | null;
  onSave: (plan: any, field: string, value: number) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Preços dos planos</h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
        O valor é gravado no banco e passa a valer imediatamente na vitrine — não existe preço fixo no
        código do frontend.
      </p>
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="grid gap-2 sm:grid-cols-4 items-end border-t border-slate-100 dark:border-slate-800 pt-3">
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
              <p className="text-[11px] text-slate-400">{p.id}</p>
            </div>
            <label className="text-[11px] text-slate-500">
              Mensal (R$)
              <div className="flex gap-1">
                <input
                  defaultValue={(p.monthly_price_cents / 100).toFixed(2)}
                  onChange={(e) => setDraft({ ...draft, [`${p.id}-monthly`]: e.target.value })}
                  className="h-9 px-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <button
                  disabled={busy === p.id}
                  onClick={() =>
                    onSave(
                      p,
                      "monthly_price_cents",
                      Math.round(Number(draft[`${p.id}-monthly`] ?? p.monthly_price_cents / 100) * 100)
                    )
                  }
                  className="px-2 rounded-lg bg-brand-primary text-white text-[11px] font-bold"
                >
                  Salvar
                </button>
              </div>
            </label>
            <label className="text-[11px] text-slate-500">
              Anual (R$)
              <div className="flex gap-1">
                <input
                  defaultValue={(p.annual_price_cents / 100).toFixed(2)}
                  onChange={(e) => setDraft({ ...draft, [`${p.id}-annual`]: e.target.value })}
                  className="h-9 px-2 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                />
                <button
                  disabled={busy === p.id}
                  onClick={() =>
                    onSave(
                      p,
                      "annual_price_cents",
                      Math.round(Number(draft[`${p.id}-annual`] ?? p.annual_price_cents / 100) * 100)
                    )
                  }
                  className="px-2 rounded-lg bg-brand-primary text-white text-[11px] font-bold"
                >
                  Salvar
                </button>
              </div>
            </label>
            <p className="text-[11px] text-slate-400">
              Limites: {p.max_active_students ?? "∞"} ativos · {p.max_units} unidade(s) · {p.max_admins} admins
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ManualPayment({
  schools,
  subscriptions,
  busy,
  onSubmit,
}: {
  schools: any[];
  subscriptions: any[];
  busy: string | null;
  onSubmit: (form: { schoolId: string; subscriptionId: string; amountCents: number; note: string }) => void;
}) {
  const [form, setForm] = useState({ schoolId: "", subscriptionId: "", amount: "", note: "" });

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Baixa manual (Pix recebido)</h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
        Único caminho para marcar pagamento como recebido sem webhook. Fica registrado na auditoria com o
        seu e-mail.
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <select
          value={form.schoolId}
          onChange={(e) => {
            const schoolId = e.target.value;
            const sub = subscriptions.find((s) => s.school_id === schoolId);
            setForm({ ...form, schoolId, subscriptionId: sub?.id || "" });
          }}
          className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
        >
          <option value="">Instituição…</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          placeholder="Valor (R$)"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
        />
        <input
          placeholder="Observação (ex.: Pix 12/11)"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
        />
        <button
          disabled={busy === "manual-payment" || !form.schoolId || !form.amount}
          onClick={() =>
            onSubmit({
              schoolId: form.schoolId,
              subscriptionId: form.subscriptionId,
              amountCents: Math.round(Number(form.amount.replace(",", ".")) * 100),
              note: form.note,
            })
          }
          className="h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-60"
        >
          Registrar recebimento
        </button>
      </div>
    </section>
  );
}

function PartnersTab({
  partners,
  schools,
  onShowToast,
  reload,
  call,
}: {
  partners: any[];
  schools: any[];
  onShowToast?: (m: string, t?: "success" | "error" | "info") => void;
  reload: () => Promise<void>;
  call: (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: any }>;
}) {
  const [form, setForm] = useState({ name: "", category: "", city: "", contactEmail: "" });
  const [campaign, setCampaign] = useState({ partnerId: "", schoolId: "", title: "", body: "" });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Novo parceiro</h2>
        <div className="grid gap-3 sm:grid-cols-5">
          <input
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <input
            placeholder="Categoria"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <input
            placeholder="Cidade"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <input
            placeholder="E-mail de contato"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <button
            disabled={!form.name}
            onClick={async () => {
              const res = await call("/api/master/partners", { method: "POST", body: JSON.stringify(form) });
              if (!res.ok) {
                onShowToast?.(res.body?.error || "Erro ao criar parceiro.", "error");
                return;
              }
              onShowToast?.("Parceiro criado como pendente de aprovação.", "success");
              setForm({ name: "", category: "", city: "", contactEmail: "" });
              await reload();
            }}
            className="h-10 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-60"
          >
            Adicionar
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Campanha de 30 dias</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          A campanha só aparece após a instituição aprovar. Nenhum dado de aluno é compartilhado.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          <select
            value={campaign.partnerId}
            onChange={(e) => setCampaign({ ...campaign, partnerId: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          >
            <option value="">Parceiro…</option>
            {partners
              .filter((p) => p.status === "approved")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <select
            value={campaign.schoolId}
            onChange={(e) => setCampaign({ ...campaign, schoolId: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          >
            <option value="">Instituição…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Título"
            value={campaign.title}
            onChange={(e) => setCampaign({ ...campaign, title: e.target.value })}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
          />
          <button
            disabled={!campaign.partnerId || !campaign.schoolId || !campaign.title}
            onClick={async () => {
              const res = await call("/api/master/campaigns", {
                method: "POST",
                body: JSON.stringify(campaign),
              });
              if (!res.ok) {
                onShowToast?.(res.body?.error || "Erro ao criar campanha.", "error");
                return;
              }
              onShowToast?.("Campanha enviada para aprovação da instituição.", "success");
              setCampaign({ partnerId: "", schoolId: "", title: "", body: "" });
              await reload();
            }}
            className="h-10 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-60"
          >
            Enviar para aprovação
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
            <tr>
              <Th>Parceiro</Th>
              <Th>Categoria</Th>
              <Th>Status</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                <Td>{p.name}</Td>
                <Td>{p.category || "—"}</Td>
                <Td>{p.status}</Td>
                <Td>
                  <div className="flex gap-1">
                    <button
                      onClick={async () => {
                        const res = await call(`/api/master/partners/${p.id}/status`, {
                          method: "PUT",
                          body: JSON.stringify({ status: "approved" }),
                        });
                        if (res.ok) {
                          onShowToast?.("Parceiro aprovado.", "success");
                          await reload();
                        }
                      }}
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                    >
                      <CheckCircle2 size={12} />
                    </button>
                    <button
                      onClick={async () => {
                        const res = await call(`/api/master/partners/${p.id}/status`, {
                          method: "PUT",
                          body: JSON.stringify({ status: "rejected" }),
                        });
                        if (res.ok) {
                          onShowToast?.("Parceiro recusado.", "success");
                          await reload();
                        }
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-slate-400">
                  Nenhum parceiro cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
