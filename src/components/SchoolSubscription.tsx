/**
 * Área de assinatura da instituição.
 *
 * QUEM ENTRA
 * ----------
 * A rota é protegida por dois filtros independentes:
 *   1. o app só mostra o link para Chefe Administrador (`isChefeAdmin`);
 *   2. a Edge Function exige JWT válido + vínculo `school_admin` em
 *      `memberships`.
 * O segundo é o que vale. O primeiro só evita oferecer um botão que vai negar.
 *
 * Funcionário Administrador NÃO vê informação financeira — exigência explícita
 * do pedido. Aqui a tela avisa isso em vez de simplesmente não renderizar.
 *
 * O QUE ESTA TELA NÃO FAZ
 * -----------------------
 * Não calcula preço, não aplica desconto, não muda status. Ela pede à Edge
 * Function e mostra o que voltar. Se a função não estiver configurada, a tela
 * diz exatamente o que falta — não finge que salvou.
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Receipt,
  History,
  Crown,
  CalendarClock,
  CreditCard,
  Ban,
  Users,
} from "lucide-react";
import { fetchMySubscription, requestPlanChange, requestCancellation, type SchoolSubscriptionResponse } from "../lib/billingApi.ts";
import { fetchPlansCatalog, type PlansCatalog } from "../lib/plansService.ts";
import { formatBRL, effectivePriceCents } from "../lib/subscription.ts";

interface SchoolSubscriptionProps {
  onNavigate: (screen: string) => void;
  /** Slug da instituição selecionada no app. */
  schoolSlug: string;
  /** `true` quando a pessoa é Chefe Administrador (só para o aviso de UI). */
  canManage: boolean;
}

const ROTULO_STATUS: Record<string, { texto: string; classe: string; icone: typeof CheckCircle2 }> = {
  active: {
    texto: "Ativa",
    classe: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    icone: CheckCircle2,
  },
  trialing: {
    texto: "Em teste",
    classe: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    icone: Clock,
  },
  past_due: {
    texto: "Pagamento pendente",
    classe: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
    icone: AlertCircle,
  },
  suspended: {
    texto: "Suspensa",
    classe: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    icone: Ban,
  },
  canceled: {
    texto: "Cancelada",
    classe: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icone: XCircle,
  },
  expired: {
    texto: "Expirada",
    classe: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icone: XCircle,
  },
};

function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

export default function SchoolSubscription({ onNavigate, schoolSlug, canManage }: SchoolSubscriptionProps) {
  const [dados, setDados] = useState<SchoolSubscriptionResponse | null>(null);
  const [catalogo, setCatalogo] = useState<PlansCatalog | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaLogin, setPrecisaLogin] = useState(false);
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    setPrecisaLogin(false);

    const [assinaturaRes, catalogoRes] = await Promise.all([fetchMySubscription(), fetchPlansCatalog()]);
    setCatalogo(catalogoRes.catalog);

    if (!assinaturaRes.ok) {
      setErro(assinaturaRes.error);
      setPrecisaLogin(assinaturaRes.precisaLoginSupabase === true);
      setCarregando(false);
      return;
    }

    setDados(assinaturaRes.data);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trocarPlano = async (planId: string, ciclo: "monthly" | "annual") => {
    setAcaoEmCurso(`plano:${planId}`);
    setMensagem(null);
    const { ok, data, error } = await requestPlanChange(planId, ciclo);
    setAcaoEmCurso(null);
    if (!ok) {
      setMensagem({ tipo: "erro", texto: error || "Não foi possível alterar o plano." });
      return;
    }
    setMensagem({ tipo: "ok", texto: (data as any)?.mensagem || "Plano alterado." });
    await carregar();
  };

  const cancelar = async () => {
    if (!window.confirm(
      "Solicitar o cancelamento da assinatura?\n\n" +
      "A instituição continua com acesso até o fim do período já contratado e nenhum dado escolar é apagado."
    )) return;

    setAcaoEmCurso("cancelar");
    setMensagem(null);
    const { ok, data, error } = await requestCancellation();
    setAcaoEmCurso(null);
    if (!ok) {
      setMensagem({ tipo: "erro", texto: error || "Não foi possível solicitar o cancelamento." });
      return;
    }
    setMensagem({ tipo: "ok", texto: (data as any)?.mensagem || "Cancelamento solicitado." });
    await carregar();
  };

  const assinatura = dados?.assinatura;
  const statusInfo = ROTULO_STATUS[assinatura?.status || "expired"] || ROTULO_STATUS.expired;
  const IconeStatus = statusInfo.icone;
  const planoAtual = catalogo?.plans.find((p) => p.id === assinatura?.plan_id) || null;
  const desconto = Number(assinatura?.discount_percent) || 0;
  const valorCiclo = planoAtual
    ? effectivePriceCents(
        { discount_percent: desconto, founder_discount: assinatura?.founder_discount },
        assinatura?.billing_cycle === "annual" ? planoAtual.annual_price_cents : planoAtual.monthly_price_cents
      )
    : 0;

  return (
    <div className="flex flex-col w-full pb-24 text-brand-text-light dark:text-brand-text-dark">
      <div className="border-b border-brand-primary/10">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 px-5 sm:px-6 py-4">
          <button
            onClick={() => onNavigate("feed")}
            aria-label="Voltar"
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-bold">Plano e assinatura</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-5 sm:px-6 py-6">
        {mensagem && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm flex items-start gap-2 ${
              mensagem.tipo === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-300/60 dark:border-red-800"
            }`}
          >
            {mensagem.tipo === "ok" ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
            <span>{mensagem.texto}</span>
          </div>
        )}

        {carregando && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-sm">Carregando sua assinatura…</p>
          </div>
        )}

        {!carregando && erro && (
          <div className="rounded-2xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-5">
            <div className="flex gap-3">
              <ShieldAlert className="text-amber-600 shrink-0" size={20} />
              <div>
                <p className="font-semibold text-sm text-amber-900 dark:text-amber-200">
                  Não foi possível abrir a assinatura
                </p>
                <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">{erro}</p>
                {precisaLogin && (
                  <p className="text-xs mt-2 text-amber-700 dark:text-amber-400">
                    Dica: saia e entre novamente com o botão “Entrar com Google”. É o login que o
                    servidor consegue verificar.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!carregando && !erro && !canManage && (
          <div className="rounded-2xl border border-brand-primary/20 p-5 flex gap-3">
            <ShieldAlert className="text-brand-primary shrink-0" size={20} />
            <div>
              <p className="font-semibold text-sm">Área restrita ao responsável da instituição</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Informações financeiras ficam disponíveis apenas para o Chefe Administrador.
                Funcionários administradores continuam com acesso às demais funções do painel.
              </p>
            </div>
          </div>
        )}

        {!carregando && !erro && canManage && (
          <>
            {/* Sem assinatura ainda */}
            {!assinatura && (
              <div className="rounded-2xl border border-brand-primary/20 p-6">
                <h2 className="font-bold text-base">
                  {dados?.escola ? dados.escola.name : "Sua instituição"} ainda não tem assinatura
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                  O acesso atual continua funcionando normalmente — nenhuma funcionalidade escolar foi
                  interrompida. Escolha um plano para formalizar a contratação e liberar os recursos do
                  plano.
                </p>
                <button
                  onClick={() => onNavigate("plans")}
                  className="mt-4 px-4 py-2.5 rounded-xl bg-brand-primary text-white font-semibold text-sm cursor-pointer hover:opacity-90"
                >
                  Ver planos
                </button>
              </div>
            )}

            {assinatura && (
              <>
                {/* Cartão do plano */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-brand-primary/20 p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Plano contratado</p>
                      <h2 className="text-xl font-bold flex items-center gap-2 mt-0.5">
                        {planoAtual?.name || assinatura.plan_id}
                        {assinatura.founder_discount && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <Crown size={11} /> Fundadora
                          </span>
                        )}
                      </h2>
                      <p className="text-sm mt-1">
                        <span className="font-bold text-lg">{formatBRL(valorCiclo)}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {assinatura.billing_cycle === "annual" ? " /ano" : " /mês"}
                        </span>
                        {desconto > 0 && (
                          <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                            ({desconto}% de desconto aplicado)
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.classe}`}>
                      <IconeStatus size={13} />
                      {statusInfo.texto}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-brand-primary/10">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <CalendarClock size={12} /> Início do período
                      </p>
                      <p className="text-sm font-semibold mt-0.5">{formatarData(assinatura.current_period_start)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <CalendarClock size={12} /> Renovação
                      </p>
                      <p className="text-sm font-semibold mt-0.5">{formatarData(assinatura.current_period_end)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Users size={12} /> Limite do plano
                      </p>
                      <p className="text-sm font-semibold mt-0.5">
                        {planoAtual?.max_active_students
                          ? `${planoAtual.max_active_students.toLocaleString("pt-BR")} usuários`
                          : "Ilimitado"}
                      </p>
                    </div>
                  </div>

                  {assinatura.cancel_at_period_end && (
                    <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300/60 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
                      Cancelamento solicitado. O acesso continua até {formatarData(assinatura.current_period_end)};
                      depois disso nenhuma nova cobrança é gerada e nenhum dado é apagado.
                    </div>
                  )}

                  {dados?.acesso?.reason && !assinatura.cancel_at_period_end && (
                    <div className="mt-4 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-300/60 dark:border-sky-800 p-3 text-xs text-sky-900 dark:text-sky-200">
                      {dados.acesso.reason}
                    </div>
                  )}
                </motion.div>

                {/* Trocar de plano */}
                {catalogo && (
                  <div className="mt-6">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <TrendingUp size={15} className="text-brand-primary" />
                      Alterar plano
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {catalogo.plans.map((plano) => {
                        const atual = plano.id === assinatura.plan_id;
                        const valor = effectivePriceCents(
                          { discount_percent: desconto, founder_discount: assinatura.founder_discount },
                          signatura(assinatura.billing_cycle) === "annual"
                            ? plano.annual_price_cents
                            : plano.monthly_price_cents
                        );
                        return (
                          <div
                            key={plano.id}
                            className={`rounded-xl border p-4 ${
                              atual ? "border-brand-primary bg-brand-primary/5" : "border-brand-primary/15"
                            }`}
                          >
                            <p className="font-semibold text-sm">{plano.name}</p>
                            <p className="text-sm font-bold mt-1">
                              {formatBRL(valor)}
                              <span className="text-xs font-normal text-slate-500">
                                {assinatura.billing_cycle === "annual" ? "/ano" : "/mês"}
                              </span>
                            </p>
                            {atual ? (
                              <p className="mt-3 text-xs text-brand-primary font-semibold">Plano atual</p>
                            ) : (
                              <button
                                onClick={() => trocarPlano(plano.id, assinatura.billing_cycle)}
                                disabled={acaoEmCurso !== null}
                                className="mt-3 w-full py-2 rounded-lg border border-brand-primary text-brand-primary text-xs font-semibold cursor-pointer hover:bg-brand-primary/10 disabled:opacity-50 flex items-center justify-center gap-1.5"
                              >
                                {acaoEmCurso === `plano:${plano.id}` ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (plano.monthly_price_cents > (planoAtual?.monthly_price_cents ?? 0) ? (
                                  <TrendingUp size={12} />
                                ) : (
                                  <TrendingDown size={12} />
                                ))}
                                {plano.monthly_price_cents > (planoAtual?.monthly_price_cents ?? 0)
                                  ? "Fazer upgrade"
                                  : "Fazer downgrade"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cobranças */}
                <div className="mt-8">
                  <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                    <Receipt size={15} className="text-brand-primary" />
                    Cobranças
                  </h3>
                  {(dados?.cobrancas?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-brand-primary/15 p-4">
                      Nenhuma cobrança emitida ainda.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-brand-primary/15 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-white/5 text-left">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Vencimento</th>
                            <th className="px-3 py-2 font-semibold">Tipo</th>
                            <th className="px-3 py-2 font-semibold">Valor</th>
                            <th className="px-3 py-2 font-semibold">Situação</th>
                            <th className="px-3 py-2 font-semibold">Pago em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados?.cobrancas.map((c) => (
                            <tr key={c.id} className="border-t border-brand-primary/10">
                              <td className="px-3 py-2">{formatarData(c.due_date)}</td>
                              <td className="px-3 py-2 capitalize">{c.kind}</td>
                              <td className="px-3 py-2 font-semibold">{formatBRL(c.amount_cents)}</td>
                              <td className="px-3 py-2">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    c.status === "paid"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                                      : c.status === "failed" || c.status === "canceled"
                                      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                                      : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                                  }`}
                                >
                                  {c.status === "paid" ? "Paga" : c.status === "pending" ? "Pendente" : c.status === "processing" ? "Processando" : c.status}
                                </span>
                              </td>
                              <td className="px-3 py-2">{formatarData(c.paid_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
                    <CreditCard size={11} />
                    O pagamento é confirmado pelo provedor. Nenhuma cobrança aparece como paga sem confirmação real.
                  </p>
                </div>

                {/* Histórico */}
                {(dados?.historico?.length ?? 0) > 0 && (
                  <div className="mt-8">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <History size={15} className="text-brand-primary" />
                      Histórico de alterações
                    </h3>
                    <div className="space-y-2">
                      {dados?.historico.map((e) => (
                        <div key={e.id} className="rounded-xl border border-brand-primary/15 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium">{e.event_type}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {formatarData(e.created_at)}
                            {e.actor_email ? ` · ${e.actor_email}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cancelamento */}
                {!assinatura.cancel_at_period_end && assinatura.status !== "canceled" && (
                  <div className="mt-8 pt-6 border-t border-brand-primary/10">
                    <button
                      onClick={cancelar}
                      disabled={acaoEmCurso !== null}
                      className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5 cursor-pointer hover:underline disabled:opacity-50"
                    >
                      {acaoEmCurso === "cancelar" ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                      Solicitar cancelamento da assinatura
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      O acesso continua até o fim do período contratado. Nada é apagado.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Normaliza o ciclo para o tipo esperado (o banco devolve string). */
function signatura(ciclo: string | null | undefined): "monthly" | "annual" {
  return ciclo === "annual" ? "annual" : "monthly";
}
