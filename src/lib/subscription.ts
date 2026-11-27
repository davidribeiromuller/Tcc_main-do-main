/**
 * Regras comerciais do eloEscola — lógica PURA (sem banco, sem React).
 *
 * Fica em `src/lib` porque é usada pelos dois lados:
 *  - backend (`supabase/functions/billing-api`) para decidir acesso, calcular
 *    cobrança e recusar desconto vindo do navegador;
 *  - frontend para exibir "Minha assinatura" e a vitrine de planos.
 *
 * IMPORTANTE (rodada 45): este arquivo é DUPLICADO literalmente em
 * `supabase/functions/_shared/subscription.ts`. Edge Function roda em Deno e
 * não importa de `src/`. O teste `test-round45-monetizacao.mjs` compara os dois
 * byte a byte e falha se divergirem — foi assim que a lógica anterior apodreceu
 * em silêncio, com duas cópias discordando sobre o valor do desconto.
 *
 * Regras de negócio implementadas (Parte 6/7 da auditoria):
 *  - Teste de 30 dias;
 *  - Tolerância de 7 dias após o vencimento (`grace_until`);
 *  - Aviso a partir de 80% do limite (ativos ou cota de IA);
 *  - Bloqueio de ESCRITA em 100%, sem apagar dados (leitura continua);
 *  - Anual com 10% de desconto;
 *  - Escolas Fundadoras: 20% por 12 meses (3 vagas).
 *
 * Nenhum preço é constante aqui: os valores vêm de `plans`/`plan_addons` no
 * banco. Este módulo só calcula em cima do que o banco informou.
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled"
  | "expired";

export type BillingCycle = "monthly" | "annual";

/** Estados em que a instituição ainda pode operar (com ou sem tolerância). */
const OPERATIONAL: SubscriptionStatus[] = ["trialing", "active", "past_due"];

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;
export const WARN_THRESHOLD = 0.8;
export const ANNUAL_DISCOUNT_PERCENT = 10;
export const FOUNDER_DISCOUNT_PERCENT = 20;
export const FOUNDER_SLOTS = 3;

export interface SubscriptionLike {
  status: SubscriptionStatus;
  billing_cycle?: BillingCycle;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  grace_until?: string | null;
  cancel_at_period_end?: boolean;
  discount_percent?: number | string | null;
  founder_discount?: boolean | null;
}

export interface AccessState {
  /** Pode ler os próprios dados. Bloqueio nunca apaga nem esconde dados. */
  canRead: boolean;
  /** Pode criar/editar (eventos, alunos, autorizações...). */
  canWrite: boolean;
  /** Motivo legível, quando bloqueado ou em atraso. */
  reason: string | null;
  /** Dias restantes de teste, quando aplicável. */
  trialDaysLeft: number | null;
  /** Dias restantes de tolerância, quando em atraso. */
  graceDaysLeft: number | null;
  /** Estado efetivo, já considerando datas (ex.: trialing vencido → expired). */
  effectiveStatus: SubscriptionStatus;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve o estado efetivo da assinatura considerando as datas.
 *
 * `trialing` cujo `trial_ends_at` já passou vira `past_due` (entra na
 * tolerância) e, passada a tolerância, `expired`.
 */
export function resolveEffectiveStatus(
  sub: SubscriptionLike | null | undefined,
  now: Date = new Date()
): SubscriptionStatus {
  if (!sub) return "expired";
  const trialEnd = parseDate(sub.trial_ends_at);
  const periodEnd = parseDate(sub.current_period_end);
  const graceUntil = parseDate(sub.grace_until);

  if (sub.status === "trialing") {
    if (!trialEnd || now <= trialEnd) return "trialing";
    if (graceUntil && now <= graceUntil) return "past_due";
    return "expired";
  }

  if (sub.status === "active") {
    if (periodEnd && now > periodEnd) {
      if (graceUntil && now <= graceUntil) return "past_due";
      // Sem confirmação de pagamento após o período: cai para atraso/tolerância.
      return "past_due";
    }
    return "active";
  }

  if (sub.status === "past_due") {
    if (graceUntil && now > graceUntil) return "expired";
    return "past_due";
  }

  return sub.status;
}

/**
 * Calcula o que a instituição pode fazer AGORA.
 *
 * Princípio da auditoria: em 100% do limite ou assinatura expirada, o acesso é
 * bloqueado para ESCRITA, mas leitura continua — nunca apagamos dados de uma
 * escola por inadimplência.
 */
export function resolveAccessState(
  sub: SubscriptionLike | null | undefined,
  now: Date = new Date()
): AccessState {
  const effectiveStatus = resolveEffectiveStatus(sub, now);
  const trialEnd = parseDate(sub?.trial_ends_at);
  const graceUntil = parseDate(sub?.grace_until);
  const periodEnd = parseDate(sub?.current_period_end);

  const trialDaysLeft =
    effectiveStatus === "trialing" && trialEnd ? Math.max(0, daysBetween(now, trialEnd)) : null;
  const graceDaysLeft =
    effectiveStatus === "past_due" && graceUntil ? Math.max(0, daysBetween(now, graceUntil)) : null;

  if (!sub) {
    return {
      canRead: true,
      canWrite: false,
      reason: "Nenhuma assinatura encontrada para esta instituição. Escolha um plano para publicar.",
      trialDaysLeft: null,
      graceDaysLeft: null,
      effectiveStatus: "expired",
    };
  }

  if (effectiveStatus === "trialing") {
    return {
      canRead: true,
      canWrite: true,
      reason:
        trialDaysLeft !== null && trialDaysLeft <= GRACE_DAYS
          ? `Seu período de teste termina em ${trialDaysLeft} dia(s).`
          : null,
      trialDaysLeft,
      graceDaysLeft: null,
      effectiveStatus,
    };
  }

  if (effectiveStatus === "past_due") {
    const overdueFrom = graceUntil ? graceUntil : periodEnd;
    return {
      canRead: true,
      canWrite: !(overdueFrom && now > overdueFrom),
      reason:
        graceDaysLeft !== null
          ? `Pagamento pendente. Você tem ${graceDaysLeft} dia(s) de tolerância antes do bloqueio de publicação.`
          : "Pagamento pendente. Regularize para evitar o bloqueio de publicação.",
      trialDaysLeft: null,
      graceDaysLeft,
      effectiveStatus,
    };
  }

  if (effectiveStatus === "active") {
    return {
      canRead: true,
      canWrite: true,
      reason: null,
      trialDaysLeft: null,
      graceDaysLeft: null,
      effectiveStatus,
    };
  }

  const suspendedReason =
    effectiveStatus === "suspended"
      ? "Assinatura suspensa. Fale com o suporte para reativar."
      : effectiveStatus === "canceled"
      ? "Assinatura cancelada. Seus dados continuam aqui — reative quando quiser."
      : "Assinatura expirada. Seus dados continuam aqui — escolha um plano para voltar a publicar.";

  return {
    canRead: true,
    canWrite: false,
    reason: suspendedReason,
    trialDaysLeft: null,
    graceDaysLeft: null,
    effectiveStatus,
  };
}

/** `true` quando a instituição está em estado operacional. */
export function isOperational(sub: SubscriptionLike | null | undefined, now = new Date()): boolean {
  return OPERATIONAL.includes(resolveEffectiveStatus(sub, now));
}

// ---------------------------------------------------------------------------
// Limites e cotas
// ---------------------------------------------------------------------------

export interface QuotaState {
  used: number;
  limit: number | null;
  /** 0..1 (ou >1 quando estourou). `null` quando o limite é ilimitado. */
  ratio: number | null;
  /** >= 80% do limite: a UI precisa avisar. */
  shouldWarn: boolean;
  /** >= 100%: bloqueia novas operações que consomem cota. */
  isExhausted: boolean;
  message: string | null;
}

/** Avalia o uso de um recurso limitado (alunos ativos, cota de IA, relatórios). */
export function evaluateQuota(used: number, limit: number | null | undefined, label = "registros"): QuotaState {
  const safeUsed = Math.max(0, Number(used) || 0);
  if (limit === null || limit === undefined || limit < 0) {
    return { used: safeUsed, limit: null, ratio: null, shouldWarn: false, isExhausted: false, message: null };
  }
  const safeLimit = Math.max(0, Number(limit) || 0);
  const ratio = safeLimit === 0 ? (safeUsed > 0 ? 1 : 0) : safeUsed / safeLimit;
  const isExhausted = safeUsed >= safeLimit;
  const shouldWarn = !isExhausted && ratio >= WARN_THRESHOLD;

  let message: string | null = null;
  if (isExhausted) {
    message = `Limite de ${label} atingido (${safeUsed}/${safeLimit}). Faça upgrade do plano para continuar.`;
  } else if (shouldWarn) {
    message = `Você já usou ${Math.round(ratio * 100)}% do limite de ${label} (${safeUsed}/${safeLimit}).`;
  }

  return { used: safeUsed, limit: safeLimit, ratio, shouldWarn, isExhausted, message };
}

// ---------------------------------------------------------------------------
// Preços
// ---------------------------------------------------------------------------

/** Formata centavos em BRL ("R$ 149,00"). */
export function formatBRL(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Preço efetivo considerando desconto.
 *
 * `total` é o valor do CICLO: mensal = preço mensal; anual = 12× mensal menos
 * os 10% de desconto já gravados em `plans.annual_price_cents`.
 */
export function effectivePriceCents(
  sub: Pick<SubscriptionLike, "discount_percent" | "founder_discount"> | null | undefined,
  baseCents: number
): number {
  const base = Math.max(0, Number(baseCents) || 0);
  const pct = Math.max(0, Math.min(100, Number(sub?.discount_percent) || 0));
  return Math.round(base * (1 - pct / 100));
}

/** Valor mensal equivalente do ciclo anual (para comparar planos na vitrine). */
export function monthlyEquivalent(annualPriceCents: number): number {
  return Math.round((Number(annualPriceCents) || 0) / 12);
}

/** Economia do plano anual em relação a 12 mensalidades. */
export function annualSavingsCents(monthlyPriceCents: number, annualPriceCents: number): number {
  return Math.max(0, (Number(monthlyPriceCents) || 0) * 12 - (Number(annualPriceCents) || 0));
}

/** Data de fim do próximo ciclo a partir de um início. */
export function nextPeriodEnd(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start.getTime());
  if (cycle === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

/** Fim do teste de 30 dias. */
export function trialEndFrom(start: Date): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Fim da tolerância de 7 dias após o vencimento. */
export function graceEndFrom(due: Date): Date {
  return new Date(due.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Catálogo de recursos (a UI e o backend usam as mesmas chaves)
// ---------------------------------------------------------------------------

export const FEATURE_LABELS: Record<string, string> = {
  events: "Mural de eventos",
  school_profile: "Perfil público da escola",
  student_area: "Área do aluno",
  authorizations: "Autorizações digitais",
  reports: "Relatórios",
  ai_assistant: "Assistente Elo (IA)",
  ai_advanced: "IA avançada",
  multi_unit: "Múltiplas unidades",
  partners_directory: "Diretório de parceiros",
  custom_domain: "Domínio próprio",
  api_integration: "Integração via API",
};

export function featureLabel(key: string): string {
  return FEATURE_LABELS[key] || key;
}

/** Tipos aceitos no rodapé de cada recurso. */
export type FeatureKey = keyof typeof FEATURE_LABELS;
