/**
 * Catálogo comercial — leitura de planos e adicionais.
 *
 * DE ONDE VÊM OS PREÇOS (rodada 45)
 * ---------------------------------
 * Do banco, sempre. A tabela `plans` tem as policies `plans_public_read` e
 * `plan_addons_public_read` (migration 20261126), então o navegador lê o
 * catálogo direto pelo PostgREST — sem passar por servidor. Isso é proposital:
 * a vitrine `/planos` precisa abrir mesmo se a Edge Function estiver fora.
 *
 * Nenhum valor em centavos aparece neste arquivo. O que a especificação fixa
 * (R$ 149 / R$ 299 / R$ 699, implantação, adicionais) está GRAVADO na tabela
 * `plans`/`plan_addons`; se alguém mudar o preço no banco, a tela acompanha
 * sem deploy.
 *
 * Quando o banco está indisponível a UI mostra estado explícito de
 * indisponibilidade — nunca preço inventado.
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import {
  TRIAL_DAYS,
  ANNUAL_DISCOUNT_PERCENT,
  FOUNDER_DISCOUNT_PERCENT,
  FOUNDER_SLOTS,
} from "./subscription.ts";

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

export interface PlansCatalog {
  plans: PlanView[];
  addons: AddonView[];
  founders: FoundersInfo;
  trialDays: number;
  annualDiscountPercent: number;
}

export interface CatalogResult {
  catalog: PlansCatalog | null;
  error: string | null;
}

/**
 * Busca o catálogo no banco.
 *
 * `founders` conta quantas instituições já ocuparam as vagas promocionais —
 * leitura pública de `schools` (policy `schools_public_read`), só a contagem,
 * sem expor nome de escola nenhuma.
 */
export async function fetchPlansCatalog(): Promise<CatalogResult> {
  if (!isSupabaseConfigured()) {
    return { catalog: null, error: "Banco de dados não configurado neste ambiente." };
  }

  const supabase = getSupabaseClient();

  try {
    const [planosRes, addonsRes, fundadorasRes] = await Promise.all([
      supabase
        .from("plans")
        .select(
          "id, name, tagline, monthly_price_cents, annual_price_cents, setup_fee_cents, max_active_students, max_units, max_admins, features, sort_order"
        )
        .eq("is_public", true)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("plan_addons")
        .select("id, name, description, price_cents, billing_type, unit_label")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabase.from("schools").select("id", { count: "exact", head: true }).eq("is_founder", true),
    ]);

    if (planosRes.error) {
      /*
        Erro aqui normalmente é RLS ou tabela ausente. A mensagem diz o que
        fazer em vez de "erro inesperado": é o modo de falha que já aconteceu
        na rodada 44 (policies fechadas e ninguém percebeu).
      */
      return {
        catalog: null,
        error:
          planosRes.error.code === "42P01"
            ? "O catálogo de planos ainda não foi criado neste banco."
            : `Não foi possível carregar os planos (${planosRes.error.message}).`,
      };
    }

    const plans = (planosRes.data ?? []) as unknown as PlanView[];
    if (plans.length === 0) {
      return {
        catalog: null,
        error: "Nenhum plano está publicado no momento. Fale com o suporte do eloEscola.",
      };
    }

    const takenSlots = fundadorasRes.count ?? 0;

    return {
      catalog: {
        plans,
        addons: (addonsRes.data ?? []) as unknown as AddonView[],
        founders: {
          totalSlots: FOUNDER_SLOTS,
          takenSlots,
          availableSlots: Math.max(0, FOUNDER_SLOTS - takenSlots),
          discountPercent: FOUNDER_DISCOUNT_PERCENT,
          discountMonths: 12,
        },
        trialDays: TRIAL_DAYS,
        annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
      },
      error: null,
    };
  } catch (err: any) {
    return {
      catalog: null,
      error: `Não foi possível carregar os planos: ${err?.message || "falha de conexão"}.`,
    };
  }
}

/** Plano específico do catálogo já carregado (evita um segundo SELECT). */
export function findPlan(catalog: PlansCatalog | null, planId: string | null | undefined): PlanView | null {
  if (!catalog || !planId) return null;
  return catalog.plans.find((p) => p.id === planId) ?? null;
}
