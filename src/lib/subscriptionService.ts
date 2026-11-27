/**
 * Área de assinatura da instituição — leitura.
 *
 * O QUE O NAVEGADOR PODE LER AQUI
 * -------------------------------
 * Com a migration 20261126, `subscriptions`, `payment_transactions` e
 * `subscription_events` só devolvem linhas da PRÓPRIA escola, e só para JWT
 * autenticado (a policy confere `memberships.user_uid` = `sub` do token).
 * Não existe policy de escrita: mudar plano, cancelar ou pagar passa
 * obrigatoriamente pela Edge Function `billing-api`, que confere o vínculo no
 * servidor e registra auditoria.
 *
 * Consequência prática: se a tela tentar escrever direto, o PostgREST devolve
 * 403 — e isso é o comportamento correto, não um bug.
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { resolveAccessState, type AccessState, type SubscriptionStatus, type BillingCycle } from "./subscription.ts";

export interface SubscriptionView {
  id: string;
  school_id: string;
  plan_id: string;
  plan_name: string | null;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  discount_percent: number;
  founder_discount: boolean;
  provider: string;
  next_due_at: string | null;
  last_payment_at: string | null;
}

export interface PaymentView {
  id: string;
  amount_cents: number;
  currency: string;
  kind: string;
  status: string;
  method: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  provider: string;
}

export interface SubscriptionEventView {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface SchoolInfoView {
  id: string;
  slug: string;
  name: string;
  status: string;
  is_founder: boolean;
}

export interface SubscriptionOverview {
  school: SchoolInfoView | null;
  subscription: SubscriptionView | null;
  access: AccessState;
  payments: PaymentView[];
  events: SubscriptionEventView[];
  error: string | null;
}

/**
 * Carrega tudo que a área de assinatura mostra.
 *
 * `slug` identifica a instituição no app (é a mesma chave de `school_profiles`
 * e das URLs `/escolas/<slug>`). Escolas que ainda não têm linha em `schools`
 * aparecem como "sem assinatura" — que é o estado de migração previsto na
 * especificação: ninguém é suspenso automaticamente.
 */
export async function fetchSubscriptionOverview(slug: string): Promise<SubscriptionOverview> {
  const vazio = (erro: string | null): SubscriptionOverview => ({
    school: null,
    subscription: null,
    access: resolveAccessState(null),
    payments: [],
    events: [],
    error: erro,
  });

  if (!isSupabaseConfigured()) return vazio("Banco de dados não configurado neste ambiente.");
  if (!slug) return vazio("Instituição não informada.");

  const supabase = getSupabaseClient();

  try {
    const { data: escola, error: erroEscola } = await supabase
      .from("schools")
      .select("id, slug, name, status, is_founder")
      .eq("slug", slug)
      .maybeSingle();

    if (erroEscola) {
      return vazio(`Não foi possível consultar a instituição (${erroEscola.message}).`);
    }

    if (!escola) {
      /*
        Instituição sem registro comercial ainda. Não é erro: o cadastro escolar
        existe desde antes da monetização e o pedido proíbe interromper quem já
        usa o app. A tela mostra o convite para contratar.
      */
      return vazio(null);
    }

    const { data: assinatura, error: erroAssinatura } = await supabase
      .from("subscriptions")
      .select(
        "id, school_id, plan_id, status, billing_cycle, trial_ends_at, current_period_start, current_period_end, grace_until, cancel_at_period_end, canceled_at, discount_percent, founder_discount, provider, next_due_at, last_payment_at"
      )
      .eq("school_id", escola.id)
      .in("status", ["trialing", "active", "past_due", "suspended"])
      .maybeSingle();

    if (erroAssinatura) {
      return vazio(`Não foi possível consultar a assinatura (${erroAssinatura.message}).`);
    }

    if (!assinatura) {
      return {
        school: escola as SchoolInfoView,
        subscription: null,
        access: resolveAccessState(null),
        payments: [],
        events: [],
        error: null,
      };
    }

    // Nome do plano: vem de `plans` (leitura pública), não de constante no código.
    const { data: plano } = await supabase
      .from("plans")
      .select("id, name")
      .eq("id", assinatura.plan_id)
      .maybeSingle();

    const [pagamentosRes, eventosRes] = await Promise.all([
      supabase
        .from("payment_transactions")
        .select("id, amount_cents, currency, kind, status, method, due_date, paid_at, created_at, provider")
        .eq("school_id", escola.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("subscription_events")
        .select("id, event_type, from_status, to_status, actor_email, created_at")
        .eq("school_id", escola.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const sub: SubscriptionView = {
      ...(assinatura as any),
      discount_percent: Number((assinatura as any).discount_percent) || 0,
      plan_name: plano?.name ?? null,
    };

    return {
      school: escola as SchoolInfoView,
      subscription: sub,
      access: resolveAccessState(sub),
      payments: (pagamentosRes.data ?? []) as PaymentView[],
      events: (eventosRes.data ?? []) as SubscriptionEventView[],
      error: null,
    };
  } catch (err: any) {
    return vazio(`Falha ao consultar a assinatura: ${err?.message || "conexão interrompida"}.`);
  }
}
