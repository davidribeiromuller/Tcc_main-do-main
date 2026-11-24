/**
 * Cliente do catálogo comercial.
 *
 * IMPORTANTE: nenhum preço é constante no frontend. Tudo vem de `/api/saas/plans`,
 * que lê a tabela `plans` do banco. Se o servidor não estiver disponível, a UI
 * mostra um estado explícito de indisponibilidade em vez de inventar valores.
 */

export interface PlanView {
  id: string;
  name: string;
  tagline?: string | null;
  monthly_price_cents: number;
  annual_price_cents: number;
  setup_fee_cents: number;
  max_active_students: number | null;
  max_units: number;
  max_admins: number;
  features: Record<string, boolean>;
  sort_order: number;
}

export interface AddonView {
  id: string;
  name: string;
  description?: string | null;
  price_cents: number;
  billing_type: "monthly" | "one_time" | "per_session" | "from";
  unit_label?: string | null;
}

export interface FoundersInfo {
  totalSlots: number;
  takenSlots: number;
  availableSlots: number;
  discountPercent: number;
  discountMonths: number;
}

export interface BillingDiagnosticsView {
  provider: string;
  configured: boolean;
  acceptsRealPayments: boolean;
  missing: string[];
  note: string;
}

export interface PlansCatalog {
  plans: PlanView[];
  addons: AddonView[];
  founders: FoundersInfo;
  trialDays: number;
  annualDiscountPercent: number;
  billing: BillingDiagnosticsView;
}

export interface CatalogResult {
  catalog: PlansCatalog | null;
  error: string | null;
}

export async function fetchPlansCatalog(): Promise<CatalogResult> {
  try {
    const res = await fetch("/api/saas/plans", { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        catalog: null,
        error:
          data.error ||
          (res.status === 503
            ? "O catálogo comercial precisa do servidor do eloEscola (não está disponível nesta hospedagem estática)."
            : `Não foi possível carregar os planos (HTTP ${res.status}).`),
      };
    }
    const data = (await res.json()) as PlansCatalog;
    if (!Array.isArray(data.plans) || data.plans.length === 0) {
      return { catalog: null, error: "Nenhum plano publicado ainda. Fale com o suporte." };
    }
    return { catalog: data, error: null };
  } catch (err: any) {
    return {
      catalog: null,
      error: "Não foi possível falar com o servidor para carregar os planos.",
    };
  }
}

/** Preço por ciclo, já formatado. */
export function planPriceForCycle(plan: PlanView, cycle: "monthly" | "annual"): number {
  return cycle === "annual" ? plan.annual_price_cents : plan.monthly_price_cents;
}

export function monthlyEquivalent(annualCents: number): number {
  return Math.round(annualCents / 12);
}
