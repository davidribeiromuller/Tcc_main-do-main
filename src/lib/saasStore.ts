/**
 * Acesso a dados do núcleo SaaS (instituições, assinaturas, entitlements...).
 *
 * Decisão de arquitetura: estas tabelas NÃO têm política de RLS para
 * `anon`/`authenticated` (ver migration `20261111_saas_core.sql`). Portanto a
 * leitura/escrita acontece exclusivamente por aqui, no backend, com a chave
 * de serviço (`SUPABASE_SECRET_KEY`) — que nunca chega ao navegador.
 *
 * Todo ponto de entrada recebe a instituição já validada pelo chamador
 * (`requireSchoolScope` no server). Nenhuma função aqui confia em `school_id`
 * vindo do corpo da requisição sem checagem de vínculo.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | null = null;

export function isSaasBackendConfigured(): boolean {
  return !!(
    (process.env.SUPABASE_URL || "").trim() &&
    (process.env.SUPABASE_SECRET_KEY || "").trim()
  );
}

/**
 * Cliente com chave de serviço. `null` quando não configurado — nesse caso as
 * rotas devolvem 503 explicando o que falta, em vez de fingir sucesso.
 */
export function getSaasAdminClient(): SupabaseClient | null {
  if (!isSaasBackendConfigured()) return null;
  if (cachedAdmin) return cachedAdmin;

  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || "").trim();

  try {
    cachedAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return cachedAdmin;
  } catch (err: any) {
    console.error("[Saas] Falha ao criar cliente administrativo:", err?.message || err);
    return null;
  }
}

function fail<T>(message: string): { data: T | null; error: string } {
  return { data: null, error: message };
}

function mapDbError(context: string, error: any): string {
  const msg = String(error?.message || error || "erro desconhecido");
  console.error(`[Saas] ${context}:`, msg);
  if (/relation .* does not exist|schema cache/i.test(msg)) {
    return "Tabelas do núcleo SaaS ausentes. Aplique a migration 20261111_saas_core.sql.";
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SchoolRow {
  id: string;
  slug: string;
  name: string;
  legal_name?: string | null;
  cnpj?: string | null;
  city?: string | null;
  state?: string | null;
  status: "active" | "suspended" | "archived";
  is_founder: boolean;
  founder_slot?: number | null;
  created_at?: string;
}

export interface MembershipRow {
  id: string;
  user_uid: string;
  school_id: string;
  unit_id?: string | null;
  role: "school_admin" | "school_staff" | "teacher" | "student" | "guardian";
  status: "invited" | "active" | "suspended" | "revoked";
}

export interface PlanRow {
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
  is_public: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface SubscriptionRow {
  id: string;
  school_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "suspended" | "canceled" | "expired";
  billing_cycle: "monthly" | "annual";
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  grace_until?: string | null;
  cancel_at_period_end: boolean;
  discount_percent: number;
  founder_discount: boolean;
  provider: string;
  next_due_at?: string | null;
  created_at?: string;
}

export interface EntitlementRow {
  id: string;
  school_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  used_value: number;
  period_start?: string | null;
  period_end?: string | null;
}

// ---------------------------------------------------------------------------
// Instituições e vínculos
// ---------------------------------------------------------------------------

export async function listSchools(): Promise<{ data: SchoolRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado (SUPABASE_URL / SUPABASE_SECRET_KEY).");
  const { data, error } = await sb.from("schools").select("*").order("created_at", { ascending: false });
  if (error) return fail(mapDbError("listSchools", error));
  return { data: (data || []) as SchoolRow[], error: null };
}

export async function getSchoolBySlug(slug: string): Promise<{ data: SchoolRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb.from("schools").select("*").eq("slug", slug).maybeSingle();
  if (error) return fail(mapDbError("getSchoolBySlug", error));
  return { data: (data as SchoolRow) || null, error: null };
}

export async function getSchoolById(id: string): Promise<{ data: SchoolRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb.from("schools").select("*").eq("id", id).maybeSingle();
  if (error) return fail(mapDbError("getSchoolById", error));
  return { data: (data as SchoolRow) || null, error: null };
}

export async function listMembershipsForUser(
  userUid: string
): Promise<{ data: MembershipRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("memberships")
    .select("*")
    .eq("user_uid", userUid)
    .eq("status", "active");
  if (error) return fail(mapDbError("listMembershipsForUser", error));
  return { data: (data || []) as MembershipRow[], error: null };
}

export async function listMembershipsForSchool(
  schoolId: string
): Promise<{ data: MembershipRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("memberships")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: true });
  if (error) return fail(mapDbError("listMembershipsForSchool", error));
  return { data: (data || []) as MembershipRow[], error: null };
}

/**
 * Verifica se o usuário é administrador da instituição informada.
 * É a função que responde "esta pessoa pode operar ESTA escola?".
 */
export async function hasSchoolAdminRole(userUid: string, schoolId: string): Promise<boolean> {
  const sb = getSaasAdminClient();
  if (!sb) return false;
  const { data, error } = await sb
    .from("memberships")
    .select("id, role, status")
    .eq("user_uid", userUid)
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("role", ["school_admin"]);
  if (error) {
    console.warn("[Saas] hasSchoolAdminRole:", error.message);
    return false;
  }
  return (data || []).length > 0;
}

/** Todas as instituições que o usuário administra (para o seletor do painel). */
export async function listAdministeredSchools(userUid: string): Promise<SchoolRow[]> {
  const sb = getSaasAdminClient();
  if (!sb) return [];
  const { data: mships } = await sb
    .from("memberships")
    .select("school_id")
    .eq("user_uid", userUid)
    .eq("status", "active")
    .eq("role", "school_admin");
  const ids = (mships || []).map((m: any) => m.school_id);
  if (ids.length === 0) return [];
  const { data } = await sb.from("schools").select("*").in("id", ids);
  return (data || []) as SchoolRow[];
}

export async function createSchool(input: {
  name: string;
  slug: string;
  city?: string;
  state?: string;
  cnpj?: string;
}): Promise<{ data: SchoolRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("schools")
    .insert([
      {
        name: input.name,
        slug: input.slug,
        city: input.city || null,
        state: input.state || "PR",
        cnpj: input.cnpj || null,
      },
    ])
    .select()
    .single();
  if (error) return fail(mapDbError("createSchool", error));
  return { data: data as SchoolRow, error: null };
}

export async function addMembership(input: {
  userUid: string;
  schoolId: string;
  role: MembershipRow["role"];
  unitId?: string | null;
  invitedBy?: string | null;
}): Promise<{ data: MembershipRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("memberships")
    .upsert(
      [
        {
          user_uid: input.userUid,
          school_id: input.schoolId,
          role: input.role,
          unit_id: input.unitId || null,
          invited_by: input.invitedBy || null,
          status: "active",
        },
      ],
      { onConflict: "user_uid,school_id,role" }
    )
    .select()
    .single();
  if (error) return fail(mapDbError("addMembership", error));
  return { data: data as MembershipRow, error: null };
}

export async function countActiveStudents(schoolId: string): Promise<number> {
  const sb = getSaasAdminClient();
  if (!sb) return 0;
  const { count } = await sb
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "active")
    .in("role", ["student", "guardian"]);
  return count || 0;
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------

export async function listPlans(includeHidden = false): Promise<{ data: PlanRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  let q = sb.from("plans").select("*").order("sort_order", { ascending: true });
  if (!includeHidden) q = q.eq("is_active", true).eq("is_public", true);
  const { data, error } = await q;
  if (error) return fail(mapDbError("listPlans", error));
  return { data: (data || []) as PlanRow[], error: null };
}

export async function listPlanAddons(): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb.from("plan_addons").select("*").order("sort_order", { ascending: true });
  if (error) return fail(mapDbError("listPlanAddons", error));
  return { data: data || [], error: null };
}

/** Atualiza preço/limites de um plano (só painel Master). Registra auditoria. */
export async function updatePlan(
  planId: string,
  patch: Partial<Pick<PlanRow, "monthly_price_cents" | "annual_price_cents" | "setup_fee_cents" | "max_active_students" | "max_units" | "max_admins" | "is_active" | "is_public">>
): Promise<{ data: PlanRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("plans")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .select()
    .single();
  if (error) return fail(mapDbError("updatePlan", error));
  return { data: data as PlanRow, error: null };
}

// ---------------------------------------------------------------------------
// Assinaturas
// ---------------------------------------------------------------------------

export async function getSubscriptionBySchool(
  schoolId: string
): Promise<{ data: SubscriptionRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("school_id", schoolId)
    .in("status", ["trialing", "active", "past_due", "suspended"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail(mapDbError("getSubscriptionBySchool", error));
  return { data: (data as SubscriptionRow) || null, error: null };
}

export async function listAllSubscriptions(): Promise<{ data: SubscriptionRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return fail(mapDbError("listAllSubscriptions", error));
  return { data: (data || []) as SubscriptionRow[], error: null };
}

export async function updateSubscription(
  id: string,
  patch: Partial<SubscriptionRow>
): Promise<{ data: SubscriptionRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("subscriptions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return fail(mapDbError("updateSubscription", error));
  return { data: data as SubscriptionRow, error: null };
}

export async function createSubscription(input: {
  schoolId: string;
  planId: string;
  status?: SubscriptionRow["status"];
  billingCycle?: SubscriptionRow["billing_cycle"];
  trialEndsAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  discountPercent?: number;
  founderDiscount?: boolean;
}): Promise<{ data: SubscriptionRow | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("subscriptions")
    .insert([
      {
        school_id: input.schoolId,
        plan_id: input.planId,
        status: input.status || "trialing",
        billing_cycle: input.billingCycle || "monthly",
        trial_started_at: input.status === "trialing" ? new Date().toISOString() : null,
        trial_ends_at: input.trialEndsAt || null,
        current_period_start: input.periodStart || new Date().toISOString(),
        current_period_end: input.periodEnd || input.trialEndsAt || null,
        discount_percent: input.discountPercent ?? 0,
        founder_discount: input.founderDiscount ?? false,
      },
    ])
    .select()
    .single();
  if (error) return fail(mapDbError("createSubscription", error));
  return { data: data as SubscriptionRow, error: null };
}

export async function logSubscriptionEvent(input: {
  subscriptionId?: string | null;
  schoolId?: string | null;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  payload?: Record<string, any>;
  actorEmail?: string | null;
}): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb.from("subscription_events").insert([
    {
      subscription_id: input.subscriptionId || null,
      school_id: input.schoolId || null,
      event_type: input.eventType,
      from_status: input.fromStatus || null,
      to_status: input.toStatus || null,
      payload: input.payload || {},
      actor_email: input.actorEmail || null,
    },
  ]);
  if (error) console.warn("[Saas] logSubscriptionEvent:", error.message);
}

export async function listSubscriptionEvents(
  schoolId: string,
  limit = 50
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("subscription_events")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(mapDbError("listSubscriptionEvents", error));
  return { data: data || [], error: null };
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

export async function listEntitlements(
  schoolId: string
): Promise<{ data: EntitlementRow[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb.from("feature_entitlements").select("*").eq("school_id", schoolId);
  if (error) return fail(mapDbError("listEntitlements", error));
  return { data: (data || []) as EntitlementRow[], error: null };
}

export async function upsertEntitlement(input: {
  schoolId: string;
  subscriptionId?: string | null;
  featureKey: string;
  enabled: boolean;
  limitValue?: number | null;
  source?: "plan" | "addon" | "override" | "trial";
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<{ error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { error: "Backend SaaS não configurado." };
  const { error } = await sb.from("feature_entitlements").upsert(
    [
      {
        school_id: input.schoolId,
        subscription_id: input.subscriptionId || null,
        feature_key: input.featureKey,
        enabled: input.enabled,
        limit_value: input.limitValue ?? null,
        source: input.source || "plan",
        period_start: input.periodStart || null,
        period_end: input.periodEnd || null,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "school_id,feature_key" }
  );
  if (error) return { error: mapDbError("upsertEntitlement", error) };
  return { error: null };
}

/** Sincroniza entitlements a partir do plano (chamado ao trocar de plano). */
export async function syncEntitlementsFromPlan(
  schoolId: string,
  subscriptionId: string | null,
  plan: PlanRow
): Promise<{ error: string | null }> {
  const features = plan.features || {};
  for (const [key, value] of Object.entries(features)) {
    const { error } = await upsertEntitlement({
      schoolId,
      subscriptionId,
      featureKey: key,
      enabled: value === true,
      limitValue: key === "ai_assistant" ? 300 : key === "reports" ? 50 : null,
      source: "plan",
    });
    if (error) return { error };
  }
  return { error: null };
}

/**
 * Regista consumo e devolve o estado da cota.
 * Nunca passa do limite: quem chama decide bloquear antes de chamar a IA.
 */
export async function recordUsage(input: {
  schoolId: string;
  featureKey: string;
  quantity?: number;
  userUid?: string | null;
  metadata?: Record<string, any>;
}): Promise<{ countInPeriod: number; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { countInPeriod: 0, error: "Backend SaaS não configurado." };

  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const { error } = await sb.from("usage_records").insert([
    {
      school_id: input.schoolId,
      feature_key: input.featureKey,
      quantity: input.quantity ?? 1,
      user_uid: input.userUid || null,
      metadata: input.metadata || {},
    },
  ]);
  if (error) return { countInPeriod: 0, error: mapDbError("recordUsage", error) };

  const { count } = await sb
    .from("usage_records")
    .select("id", { count: "exact", head: true })
    .eq("school_id", input.schoolId)
    .eq("feature_key", input.featureKey)
    .gte("occurred_at", since.toISOString());

  return { countInPeriod: count || 0, error: null };
}

/** Conta o consumo do mês corrente SEM registrar um novo uso. */
export async function countUsageInPeriod(schoolId: string, featureKey: string): Promise<number> {
  const sb = getSaasAdminClient();
  if (!sb) return 0;
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await sb
    .from("usage_records")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("feature_key", featureKey)
    .gte("occurred_at", since.toISOString());
  return count || 0;
}

// ---------------------------------------------------------------------------
// Pagamentos e webhooks
// ---------------------------------------------------------------------------

export async function createPaymentTransaction(input: {
  schoolId: string;
  subscriptionId?: string | null;
  provider: string;
  providerChargeId?: string | null;
  method: string;
  kind: string;
  amountCents: number;
  status?: string;
  dueDate?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}): Promise<{ data: any | null; error: string | null; duplicate: boolean }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado.", duplicate: false };

  const { data: existing } = await sb
    .from("payment_transactions")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing) return { data: existing, error: null, duplicate: true };

  const { data, error } = await sb
    .from("payment_transactions")
    .insert([
      {
        school_id: input.schoolId,
        subscription_id: input.subscriptionId || null,
        provider: input.provider,
        provider_charge_id: input.providerChargeId || null,
        method: input.method,
        kind: input.kind,
        amount_cents: input.amountCents,
        status: input.status || "pending",
        due_date: input.dueDate || null,
        idempotency_key: input.idempotencyKey,
        metadata: input.metadata || {},
      },
    ])
    .select()
    .single();

  if (error) return { data: null, error: mapDbError("createPaymentTransaction", error), duplicate: false };
  return { data, error: null, duplicate: false };
}

export async function updatePaymentStatus(input: {
  id?: string;
  providerChargeId?: string;
  status: string;
  paidAt?: string | null;
  metadata?: Record<string, any>;
}): Promise<{ data: any | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };

  let q = sb.from("payment_transactions").update({
    status: input.status,
    paid_at: input.paidAt ?? (input.status === "paid" ? new Date().toISOString() : null),
    updated_at: new Date().toISOString(),
  });

  if (input.id) q = q.eq("id", input.id);
  else if (input.providerChargeId) q = q.eq("provider_charge_id", input.providerChargeId);
  else return { data: null, error: "Informe id ou providerChargeId." };

  const { data, error } = await q.select().maybeSingle();
  if (error) return { data: null, error: mapDbError("updatePaymentStatus", error) };
  return { data, error: null };
}

export async function listPaymentsForSchool(
  schoolId: string,
  limit = 50
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("payment_transactions")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(mapDbError("listPaymentsForSchool", error));
  return { data: data || [], error: null };
}

export async function listAllPayments(limit = 200): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return fail("Backend SaaS não configurado.");
  const { data, error } = await sb
    .from("payment_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(mapDbError("listAllPayments", error));
  return { data: data || [], error: null };
}

export async function registerWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType?: string | null;
  signatureValid: boolean;
  payload: any;
  status?: string;
  errorMessage?: string | null;
}): Promise<{ duplicate: boolean; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { duplicate: false, error: "Backend SaaS não configurado." };

  const { error } = await sb.from("webhook_events").insert([
    {
      provider: input.provider,
      event_id: input.eventId,
      event_type: input.eventType || null,
      signature_valid: input.signatureValid,
      payload: input.payload,
      status: input.status || "received",
      error_message: input.errorMessage || null,
    },
  ]);

  if (error) {
    // 23505 = unique_violation → evento já processado (idempotência).
    if ((error as any).code === "23505") return { duplicate: true, error: null };
    return { duplicate: false, error: mapDbError("registerWebhookEvent", error) };
  }
  return { duplicate: false, error: null };
}

export async function markWebhookProcessed(
  provider: string,
  eventId: string,
  status: "processed" | "ignored" | "failed",
  errorMessage?: string | null
): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb
    .from("webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq("provider", provider)
    .eq("event_id", eventId);
  if (error) console.warn("[Saas] markWebhookProcessed:", error.message);
}

// ---------------------------------------------------------------------------
// Parceiros
// ---------------------------------------------------------------------------

export async function listPartners(
  status?: string
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  let q = sb.from("partners").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return fail(mapDbError("listPartners", error));
  return { data: data || [], error: null };
}

export async function createPartner(input: {
  name: string;
  category?: string;
  description?: string;
  city?: string;
  state?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
}) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("partners")
    .insert([
      {
        name: input.name,
        category: input.category || null,
        description: input.description || null,
        city: input.city || null,
        state: input.state || "PR",
        contact_email: input.contactEmail || null,
        contact_phone: input.contactPhone || null,
        website: input.website || null,
      },
    ])
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("createPartner", error) };
  return { data, error: null };
}

export async function setPartnerStatus(
  partnerId: string,
  status: "pending" | "approved" | "suspended" | "rejected"
) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("partners")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", partnerId)
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("setPartnerStatus", error) };
  return { data, error: null };
}

export async function listCampaignsForSchool(
  schoolId: string
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("partner_campaigns")
    .select("*")
    .eq("school_id", schoolId)
    .order("starts_at", { ascending: false });
  if (error) return fail(mapDbError("listCampaignsForSchool", error));
  return { data: data || [], error: null };
}

export async function createCampaign(input: {
  partnerId: string;
  schoolId: string;
  title: string;
  body?: string;
  days?: number;
  priceCents?: number;
}) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const start = new Date();
  const end = new Date(start.getTime() + (input.days || 30) * 24 * 60 * 60 * 1000);
  const { data, error } = await sb
    .from("partner_campaigns")
    .insert([
      {
        partner_id: input.partnerId,
        school_id: input.schoolId,
        title: input.title,
        body: input.body || null,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        price_cents: input.priceCents ?? 24900,
      },
    ])
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("createCampaign", error) };
  return { data, error: null };
}

/** Aprovação/rejeição SEMPRE pela instituição — nunca pelo parceiro. */
export async function decideCampaign(input: {
  campaignId: string;
  approve: boolean;
  actorUid: string;
  reason?: string;
}) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("partner_campaigns")
    .update({
      status: input.approve ? "approved" : "rejected",
      approved_by_uid: input.actorUid,
      approved_at: new Date().toISOString(),
      rejection_reason: input.approve ? null : input.reason || "Não aprovado pela instituição",
    })
    .eq("id", input.campaignId)
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("decideCampaign", error) };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// Auditoria de plataforma e leads
// ---------------------------------------------------------------------------

export async function logPlatformAudit(input: {
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const sb = getSaasAdminClient();
  if (!sb) return;
  const { error } = await sb.from("platform_audit_logs").insert([
    {
      actor_email: input.actorEmail || null,
      actor_role: input.actorRole || null,
      action: input.action,
      target_type: input.targetType || null,
      target_id: input.targetId || null,
      metadata: input.metadata || {},
      ip: input.ip || null,
      user_agent: input.userAgent || null,
    },
  ]);
  if (error) console.warn("[Saas] logPlatformAudit:", error.message);
}

export async function listPlatformAudit(
  limit = 100
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("platform_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(mapDbError("listPlatformAudit", error));
  return { data: data || [], error: null };
}

export async function listSalesLeads(
  limit = 200
): Promise<{ data: any[] | null; error: string | null }> {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(mapDbError("listSalesLeads", error));
  return { data: data || [], error: null };
}

export async function createSalesLead(input: {
  name: string;
  email: string;
  phone?: string;
  schoolName?: string;
  city?: string;
  state?: string;
  planInterest?: string;
  source?: string;
}) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("sales_leads")
    .insert([
      {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        school_name: input.schoolName || null,
        city: input.city || null,
        state: input.state || "PR",
        plan_interest: input.planInterest || null,
        source: input.source || "site",
      },
    ])
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("createSalesLead", error) };
  return { data, error: null };
}

export async function updateSalesLeadStatus(id: string, status: string) {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };
  const { data, error } = await sb
    .from("sales_leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return { data: null, error: mapDbError("updateSalesLeadStatus", error) };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// Visão agregada para o painel Master
// ---------------------------------------------------------------------------

export async function getPlatformOverview() {
  const sb = getSaasAdminClient();
  if (!sb) return { data: null, error: "Backend SaaS não configurado." };

  const [schools, subs, payments, leads, plans] = await Promise.all([
    listSchools(),
    listAllSubscriptions(),
    listAllPayments(500),
    listSalesLeads(500),
    // O MRR precisa do preço do plano. `subscriptions` guarda só `plan_id`:
    // antes deste join, `plan_monthly_cents` não existia no retorno e o MRR
    // saía sempre 0 — número errado exibido como se fosse real.
    listPlans(true),
  ]);

  if (schools.error) return { data: null, error: schools.error };

  const allSubs = subs.data || [];
  const allPayments = payments.data || [];

  const precoPorPlano = new Map<string, PlanRow>((plans.data || []).map((p) => [p.id, p]));

  const mrrCents = allSubs
    .filter((s) => s.status === "active")
    .reduce((acc, s) => {
      const plano = precoPorPlano.get(s.plan_id);
      if (!plano) return acc;
      const descontoPercentual = Number(s.discount_percent) || 0;
      // Plano anual é cobrado à vista, mas o MRR é reconhecido por mês:
      // divide o valor anual por 12 para comparar com o mensal na mesma base.
      const baseMensal =
        s.billing_cycle === "annual"
          ? (Number(plano.annual_price_cents) || 0) / 12
          : Number(plano.monthly_price_cents) || 0;
      return acc + Math.round(baseMensal * (1 - descontoPercentual / 100));
    }, 0);

  const paidCents = allPayments
    .filter((p) => p.status === "paid")
    .reduce((acc: number, p: any) => acc + (Number(p.amount_cents) || 0), 0);

  return {
    data: {
      totals: {
        schools: (schools.data || []).length,
        activeSchools: (schools.data || []).filter((s) => s.status === "active").length,
        trialing: allSubs.filter((s) => s.status === "trialing").length,
        active: allSubs.filter((s) => s.status === "active").length,
        pastDue: allSubs.filter((s) => s.status === "past_due").length,
        canceled: allSubs.filter((s) => s.status === "canceled").length,
        revenuePaidCents: paidCents,
        mrrCents,
        leads: (leads.data || []).length,
      },
      schools: schools.data || [],
      subscriptions: allSubs,
      payments: allPayments.slice(0, 50),
      leads: leads.data || [],
    },
    error: null,
  };
}
