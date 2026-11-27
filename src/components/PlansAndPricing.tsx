/**
 * Página pública de planos — a vitrine comercial do eloEscola.
 *
 * DE ONDE VÊM OS NÚMEROS
 * ----------------------
 * Todos de `public.plans` e `public.plan_addons`, via `fetchPlansCatalog()`.
 * Não existe constante de preço neste arquivo. Se o proprietário mudar
 * R$ 149 para R$ 169 no painel, esta tela mostra o valor novo no próximo
 * carregamento, sem deploy.
 *
 * Se o banco não responder, aparece um estado de indisponibilidade explícito.
 * A regra do projeto é não inventar valor para "ficar bonito".
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Sparkles,
  Users,
  Building2,
  Loader2,
  AlertCircle,
  Crown,
  CalendarCheck,
  BadgePercent,
  Puzzle,
  GraduationCap,
  Code2,
  Palette,
  Bot,
  BarChart3,
} from "lucide-react";
import { fetchPlansCatalog, type PlansCatalog, type PlanView } from "../lib/plansService.ts";
import { formatBRL, annualSavingsCents, monthlyEquivalent, FEATURE_LABELS } from "../lib/subscription.ts";
import { submitDemoLead } from "../lib/billingApi.ts";

interface PlansAndPricingProps {
  onNavigate: (screen: string) => void;
}

/** Ícone por adicional, para o card não ser só texto. */
const ICONE_ADDON: Record<string, typeof Bot> = {
  ai_advanced: Bot,
  reports: BarChart3,
  personalization: Palette,
  training: GraduationCap,
  integration: Code2,
};

/** Recursos que todo plano entrega (base do produto). */
const RECURSOS_BASE = [
  "Feed de comunicados",
  "Mural de eventos",
  "Calendário",
  "Compromissos",
  "Mapas",
  "Pesquisa de eventos",
  "Perfil institucional",
  "Gestão da assinatura",
];

export default function PlansAndPricing({ onNavigate }: PlansAndPricingProps) {
  const [catalogo, setCatalogo] = useState<PlansCatalog | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ciclo, setCiclo] = useState<"monthly" | "annual">("monthly");

  // Formulário de demonstração
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", school_name: "", plan_interest: "" });
  const [enviando, setEnviando] = useState(false);
  const [formOk, setFormOk] = useState<string | null>(null);
  const [formErro, setFormErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { catalog, error } = await fetchPlansCatalog();
      if (cancelado) return;
      setCatalogo(catalog);
      setErro(error);
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const descontoAnual = catalogo?.annualDiscountPercent ?? 10;

  /** Valor exibido no card, conforme o ciclo escolhido. */
  const valorDoCiclo = useMemo(
    () => (plano: PlanView) =>
      ciclo === "annual" ? plano.annual_price_cents : plano.monthly_price_cents,
    [ciclo]
  );

  const enviarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);
    setFormOk(null);
    setEnviando(true);
    const { ok, error } = await submitDemoLead({ ...form });
    setEnviando(false);
    if (!ok) {
      setFormErro(error || "Não foi possível enviar seu contato agora.");
      return;
    }
    setFormOk("Recebemos seu contato. A equipe do eloEscola vai chamar você para agendar a demonstração.");
    setForm({ name: "", email: "", phone: "", school_name: "", plan_interest: "" });
  };

  return (
    <div className="flex flex-col w-full pb-24 text-brand-text-light dark:text-brand-text-dark">
      {/* Cabeçalho */}
      <div className="border-b border-brand-primary/10">
        <div className="max-w-6xl mx-auto w-full flex items-center gap-3 px-5 sm:px-6 py-4">
          <button
            onClick={() => onNavigate("welcome")}
            aria-label="Voltar"
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold">Planos do eloEscola</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-5 sm:px-6 py-8">
        {/* Apresentação */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-semibold mb-4">
            <Sparkles size={13} />
            Plataforma para instituições de ensino
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Tudo o que a escola precisa para se comunicar, em um só lugar
          </h2>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
            Eventos, comunicados, calendário, autorizações e o assistente Elo.
            Alunos e responsáveis usam de graça — quem contrata é a instituição.
          </p>
        </div>

        {/* Alternância de ciclo */}
        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex rounded-xl border border-brand-primary/15 p-1 bg-white/60 dark:bg-white/5">
            <button
              onClick={() => setCiclo("monthly")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition cursor-pointer ${
                ciclo === "monthly"
                  ? "bg-brand-primary text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setCiclo("annual")}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                ciclo === "annual"
                  ? "bg-brand-primary text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              Anual
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  ciclo === "annual" ? "bg-white/20" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                }`}
              >
                −{descontoAnual}%
              </span>
            </button>
          </div>
        </div>

        {carregando && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-sm">Carregando planos…</p>
          </div>
        )}

        {!carregando && erro && (
          <div className="max-w-xl mx-auto rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5 flex gap-3">
            <AlertCircle className="text-amber-600 shrink-0" size={20} />
            <div>
              <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
                Não foi possível mostrar os planos agora
              </p>
              <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">{erro}</p>
              <p className="text-xs mt-2 text-amber-700 dark:text-amber-400">
                Preferimos avisar em vez de mostrar um valor que pode estar errado.
              </p>
            </div>
          </div>
        )}

        {/* Cards dos planos */}
        {!carregando && catalogo && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {catalogo.plans.map((plano, indice) => {
              const destaque = indice === 1;
              const valor = valorDoCiclo(plano);
              const economia =
                ciclo === "annual" ? annualSavingsCents(plano.monthly_price_cents, plano.annual_price_cents) : 0;

              return (
                <motion.div
                  key={plano.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: indice * 0.06 }}
                  className={`relative flex flex-col rounded-2xl border p-6 ${
                    destaque
                      ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10"
                      : "border-brand-primary/15 bg-white/70 dark:bg-white/5"
                  }`}
                >
                  {destaque && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-[11px] font-bold px-3 py-1 rounded-full">
                      Mais escolhido
                    </span>
                  )}

                  <h3 className="text-lg font-bold">{plano.name}</h3>
                  {plano.tagline && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{plano.tagline}</p>
                  )}

                  <div className="mt-4">
                    <span className="text-3xl font-bold">{formatBRL(valor)}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {ciclo === "annual" ? "/ano" : "/mês"}
                    </span>
                    {ciclo === "annual" && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                        equivale a {formatBRL(monthlyEquivalent(plano.annual_price_cents))}/mês · economia de{" "}
                        {formatBRL(economia)}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <p className="flex items-center gap-1.5">
                      <Users size={13} className="shrink-0" />
                      {plano.max_active_students
                        ? `Até ${plano.max_active_students.toLocaleString("pt-BR")} usuários ativos`
                        : "Usuários ativos ilimitados"}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Building2 size={13} className="shrink-0" />
                      {plano.max_units === 1 ? "1 unidade escolar" : `Até ${plano.max_units} unidades escolares`}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CalendarCheck size={13} className="shrink-0" />
                      Implantação: {formatBRL(plano.setup_fee_cents)} (única)
                    </p>
                  </div>

                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    {RECURSOS_BASE.map((r) => (
                      <li key={r} className="flex items-start gap-2">
                        <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                    {Object.entries(plano.features || {})
                      .filter(([, ativo]) => ativo)
                      .map(([chave]) => (
                        <li key={chave} className="flex items-start gap-2">
                          <Check size={14} className="text-brand-primary shrink-0 mt-0.5" />
                          <span>{FEATURE_LABELS[chave] || chave}</span>
                        </li>
                      ))}
                  </ul>

                  <button
                    onClick={() => {
                      setForm(f => ({ ...f, plan_interest: plano.id }));
                      setFormAberto(true);
                    }}
                    className={`mt-6 w-full py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${
                      destaque
                        ? "bg-brand-primary text-white hover:opacity-90"
                        : "border border-brand-primary text-brand-primary hover:bg-brand-primary/10"
                    }`}
                  >
                    Contratar {plano.name}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Condições comerciais */}
        {!carregando && catalogo && (
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-brand-primary/15 p-5">
              <BadgePercent className="text-brand-primary mb-2" size={18} />
              <p className="font-semibold text-sm">Pagamento anual</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {catalogo.annualDiscountPercent}% de desconto sobre 12 mensalidades. A taxa de implantação é
                cobrada separadamente e não entra no desconto.
              </p>
            </div>
            <div className="rounded-2xl border border-brand-primary/15 p-5">
              <Crown className="text-brand-primary mb-2" size={18} />
              <p className="font-semibold text-sm">Escolas Fundadoras</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {catalogo.founders.discountPercent}% por {catalogo.founders.discountMonths} meses para as{" "}
                {catalogo.founders.totalSlots} primeiras instituições.
                {catalogo.founders.availableSlots > 0
                  ? ` Restam ${catalogo.founders.availableSlots} vaga(s).`
                  : " Vagas encerradas."}
              </p>
            </div>
            <div className="rounded-2xl border border-brand-primary/15 p-5">
              <Sparkles className="text-brand-primary mb-2" size={18} />
              <p className="font-semibold text-sm">Teste de {catalogo.trialDays} dias</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Sem cobrança durante o teste. Ao final, você escolhe o plano — nada é cobrado
                automaticamente.
              </p>
            </div>
          </div>
        )}

        {/* Adicionais */}
        {!carregando && catalogo && catalogo.addons.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Puzzle size={17} className="text-brand-primary" />
              Recursos adicionais
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Contratados à parte, sem precisar trocar de plano.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalogo.addons.map((addon) => {
                const Icone = ICONE_ADDON[addon.id] || Puzzle;
                return (
                  <div key={addon.id} className="rounded-2xl border border-brand-primary/15 p-4 flex gap-3">
                    <Icone className="text-brand-primary shrink-0 mt-0.5" size={18} />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{addon.name}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{addon.description}</p>
                      <p className="text-sm font-bold mt-2">
                        {formatBRL(addon.price_cents)}
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                          {" "}
                          {addon.unit_label || (addon.billing_type === "monthly" ? "por mês" : "")}
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Perguntas frequentes */}
        <div className="mt-12">
          <h3 className="text-lg font-bold mb-4">Perguntas frequentes</h3>
          <div className="space-y-3">
            {[
              {
                q: "Alunos e responsáveis precisam pagar?",
                a: "Não. A contratação é da instituição. Estudantes, professores e responsáveis usam as funcionalidades essenciais gratuitamente.",
              },
              {
                q: "O que acontece se eu cancelar?",
                a: "Você continua com acesso até o fim do período já pago. Nenhum dado escolar é apagado — eventos, comunicados e históricos permanecem.",
              },
              {
                q: "A taxa de implantação é mensal?",
                a: "Não. É cobrada uma única vez, no início, e é separada da mensalidade.",
              },
              {
                q: "Como funciona o teste?",
                a: `São até ${catalogo?.trialDays ?? 30} dias sem cobrança. Ao final, a instituição escolhe o plano; nada é cobrado automaticamente.`,
              },
              {
                q: "Posso mudar de plano depois?",
                a: "Sim. O upgrade entra em vigor imediatamente e o downgrade respeita o período já contratado.",
              },
            ].map((faq) => (
              <details
                key={faq.q}
                className="rounded-xl border border-brand-primary/15 p-4 group"
              >
                <summary className="font-semibold text-sm cursor-pointer list-none flex items-center justify-between gap-3">
                  {faq.q}
                  <span className="text-brand-primary group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                </summary>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Formulário de demonstração */}
        <div className="mt-12 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 dark:bg-brand-primary/10 p-6">
          <h3 className="text-lg font-bold">Quer ver funcionando antes de decidir?</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 mb-4">
            Agende uma demonstração com a equipe do eloEscola.
          </p>

          {formOk && (
            <div className="mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/60 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-200">
              {formOk}
            </div>
          )}
          {formErro && (
            <div className="mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-200">
              {formErro}
            </div>
          )}

          {!formAberto ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setFormAberto(true)}
                className="px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer hover:opacity-90"
              >
                Solicitar demonstração
              </button>
              <button
                onClick={() => onNavigate("feed")}
                className="px-4 py-2.5 rounded-xl border border-brand-primary text-brand-primary font-semibold text-sm cursor-pointer hover:bg-brand-primary/10"
              >
                Ver eventos públicos
              </button>
            </div>
          ) : (
            <form onSubmit={enviarLead} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Seu nome"
                className="px-3 py-2.5 rounded-xl border border-brand-primary/20 bg-white dark:bg-slate-900 text-sm outline-none focus:border-brand-primary"
              />
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="E-mail"
                className="px-3 py-2.5 rounded-xl border border-brand-primary/20 bg-white dark:bg-slate-900 text-sm outline-none focus:border-brand-primary"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Telefone (opcional)"
                className="px-3 py-2.5 rounded-xl border border-brand-primary/20 bg-white dark:bg-slate-900 text-sm outline-none focus:border-brand-primary"
              />
              <input
                value={form.school_name}
                onChange={(e) => setForm({ ...form, school_name: e.target.value })}
                placeholder="Nome da escola"
                className="px-3 py-2.5 rounded-xl border border-brand-primary/20 bg-white dark:bg-slate-900 text-sm outline-none focus:border-brand-primary"
              />
              <div className="sm:col-span-2 flex gap-3">
                <button
                  type="submit"
                  disabled={enviando}
                  className="px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {enviando && <Loader2 size={14} className="animate-spin" />}
                  Enviar
                </button>
                <button
                  type="button"
                  onClick={() => setFormAberto(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-500 text-sm cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
