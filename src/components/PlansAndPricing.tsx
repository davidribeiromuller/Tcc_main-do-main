import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  MessageCircle,
  Building2,
  ShieldCheck,
  Rocket,
  Users,
  CreditCard,
} from "lucide-react";
import { fetchJsonApi } from "../lib/staticHosting.ts";
import { formatBRL, FEATURE_LABELS } from "../lib/subscription.ts";
import { fetchPlansCatalog, type PlansCatalog, type AddonView } from "../lib/plansService.ts";

interface Props {
  onNavigate: (screen: string) => void;
  onShowToast?: (message: string, type?: "success" | "error" | "info") => void;
}

const addonIcon: Record<string, React.ElementType> = {
  ai_advanced: Sparkles,
  reports: ShieldCheck,
  personalization: Rocket,
  training: Users,
  integration: Building2,
};

export default function PlansAndPricing({ onNavigate, onShowToast }: Props) {
  const [catalog, setCatalog] = useState<PlansCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const [lead, setLead] = useState({ name: "", email: "", phone: "", schoolName: "", planInterest: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetchPlansCatalog().then(({ catalog, error }) => {
      setCatalog(catalog);
      setError(error);
      setLoading(false);
    });
  }, []);

  const plans = useMemo(() => catalog?.plans || [], [catalog]);

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead.name.trim() || !lead.email.trim()) {
      onShowToast?.("Informe seu nome e e-mail.", "error");
      return;
    }
    setSending(true);
    try {
      const res = await fetchJsonApi("/api/saas/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => ({})) : {};
        onShowToast?.(
          body.error ||
            "Não foi possível enviar agora. Este formulário precisa do servidor do eloEscola.",
          "error"
        );
        return;
      }
      const body = await res.json().catch(() => ({}));
      setSent(true);
      onShowToast?.(body.message || "Recebemos seu contato!", "success");
      setLead({ name: "", email: "", phone: "", schoolName: "", planInterest: "" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-[92%] max-w-6xl mx-auto py-6 pb-bottom-nav">
      <button
        onClick={() => onNavigate("welcome")}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-accent mb-4"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <header className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white">
          Planos do eloEscola
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl mx-auto leading-relaxed">
          Mural de eventos, autorizações digitais com assinatura e relatórios para a sua escola.
          Cancele quando quiser, sem perder nenhum dado.
        </p>
        {catalog && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-2 font-semibold">
            {catalog.trialDays} dias de teste grátis
            {catalog.founders.availableSlots > 0 &&
              ` · ${catalog.founders.availableSlots} vaga(s) de Escola Fundadora com ${catalog.founders.discountPercent}% de desconto por ${catalog.founders.discountMonths} meses`}
          </p>
        )}

        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs mt-4">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                cycle === c
                  ? "bg-white dark:bg-slate-900 text-brand-primary shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {c === "monthly" ? "Mensal" : `Anual (−${catalog?.annualDiscountPercent ?? 10}%)`}
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <div className="flex flex-col items-center gap-2 text-slate-500 py-10">
          <Loader2 className="animate-spin" size={22} />
          <p className="text-sm">Carregando planos…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/60 p-4 flex items-start gap-3 max-w-2xl mx-auto">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Catálogo indisponível</p>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">{error}</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              Os preços vivem no banco de dados; não exibimos valores fixos no código.
            </p>
          </div>
        </div>
      )}

      {!loading && catalog && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            {plans.map((plan, idx) => {
              const highlight = idx === 1;
              const price = cycle === "annual" ? plan.annual_price_cents : plan.monthly_price_cents;
              return (
                <div
                  key={plan.id}
                  className={`rounded-3xl border p-5 flex flex-col ${
                    highlight
                      ? "border-brand-primary ring-2 ring-brand-primary/20 bg-white dark:bg-slate-900"
                      : "border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900"
                  }`}
                >
                  {highlight && (
                    <span className="self-start text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-primary text-white mb-2">
                      Mais escolhido
                    </span>
                  )}
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">{plan.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed min-h-[3rem]">
                    {plan.tagline}
                  </p>

                  <div className="mt-3">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatBRL(price)}</p>
                    <p className="text-[11px] text-slate-400">
                      {cycle === "annual" ? "por ano, 10% de desconto" : "por mês"}
                    </p>
                    {plan.setup_fee_cents > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        Implantação única: {formatBRL(plan.setup_fee_cents)}
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 space-y-1.5 text-xs flex-1">
                    <li className="flex items-center gap-2">
                      <Users size={13} className="text-brand-primary shrink-0" />
                      <span>
                        {plan.max_active_students === null
                          ? "Alunos ilimitados"
                          : `Até ${plan.max_active_students.toLocaleString("pt-BR")} alunos ativos`}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Building2 size={13} className="text-brand-primary shrink-0" />
                      <span>
                        {plan.max_units} unidade{plan.max_units > 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <ShieldCheck size={13} className="text-brand-primary shrink-0" />
                      <span>{plan.max_admins} administradores</span>
                    </li>
                    {Object.keys(FEATURE_LABELS).map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        {plan.features[key] ? (
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle size={13} className="text-slate-300 dark:text-slate-600 shrink-0" />
                        )}
                        <span
                          className={
                            plan.features[key]
                              ? "text-slate-700 dark:text-slate-200"
                              : "text-slate-400 dark:text-slate-500"
                          }
                        >
                          {FEATURE_LABELS[key]}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => {
                      setLead({ ...lead, planInterest: plan.id });
                      document.getElementById("contato-comercial")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`mt-4 h-10 rounded-xl text-xs font-bold transition-colors ${
                      highlight
                        ? "bg-brand-primary text-white hover:bg-brand-primary/90"
                        : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    Começar teste de {catalog.trialDays} dias
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add-ons */}
          {catalog.addons.length > 0 && (
            <section className="mb-8">
              <h2 className="text-base font-display font-bold text-slate-900 dark:text-white mb-1">
                Serviços adicionais
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Contratados à parte, sem mudar de plano.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.addons.map((addon: AddonView) => {
                  const Icon = addonIcon[addon.id] || Sparkles;
                  return (
                    <div
                      key={addon.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 flex gap-3"
                    >
                      <div className="w-8 h-8 rounded-xl bg-brand-primary/10 text-brand-primary grid place-items-center shrink-0">
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{addon.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">
                          {addon.description}
                        </p>
                        <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          {addon.billing_type === "from" ? "A partir de " : ""}
                          {formatBRL(addon.price_cents)}
                          {addon.unit_label ? ` ${addon.unit_label}` : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Formalização comercial */}
          <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <CreditCard size={16} className="text-brand-primary" /> Como funciona a cobrança
            </h2>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 leading-relaxed mt-2">
              <li>• Pix, boleto e cartão com recorrência, processados por parceiro de pagamentos.</li>
              <li>• O plano anual tem 10% de desconto; o mensal pode ser cancelado a qualquer momento.</li>
              <li>• Tolerância de 7 dias após o vencimento, com aviso em 80% dos limites.</li>
              <li>• Sem pagamento, publicações ficam bloqueadas — os dados continuam salvos.</li>
              {!catalog.billing.configured && (
                <li className="text-amber-700 dark:text-amber-400 font-semibold">
                  • Neste ambiente o provedor de pagamentos ainda não está configurado (modo
                  demonstração): nenhuma cobrança real é emitida nem marcada como paga.
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      {/* Contato comercial */}
      <section
        id="contato-comercial"
        className="rounded-3xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/60 p-5"
      >
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageCircle size={16} className="text-brand-primary" /> Falar com a equipe
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 mb-3">
          Recebemos seus dados para entrar em contato sobre o eloEscola. Não compartilhamos seus dados com
          terceiros.
        </p>

        {sent ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 size={16} /> Recebemos seu contato. Nossa equipe responde em até 1 dia útil.
          </div>
        ) : (
          <form onSubmit={submitLead} className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Seu nome"
              value={lead.name}
              onChange={(e) => setLead({ ...lead, name: e.target.value })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <input
              placeholder="E-mail"
              type="email"
              value={lead.email}
              onChange={(e) => setLead({ ...lead, email: e.target.value })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <input
              placeholder="Telefone (opcional)"
              value={lead.phone}
              onChange={(e) => setLead({ ...lead, phone: e.target.value })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <input
              placeholder="Nome da escola ou rede"
              value={lead.schoolName}
              onChange={(e) => setLead({ ...lead, schoolName: e.target.value })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            />
            <select
              value={lead.planInterest}
              onChange={(e) => setLead({ ...lead, planInterest: e.target.value })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
            >
              <option value="">Plano de interesse</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="addon">Só um serviço adicional</option>
            </select>
            <button
              type="submit"
              disabled={sending}
              className="h-10 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-60"
            >
              {sending ? "Enviando…" : "Quero conhecer"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
