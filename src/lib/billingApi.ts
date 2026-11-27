/**
 * Cliente da Edge Function `billing-api`.
 *
 * POR QUE TUDO AQUI PASSA POR UMA FUNÇÃO DE SERVIDOR
 * --------------------------------------------------
 * Três coisas NÃO podem acontecer no navegador, por mais que a tela seja bonita:
 *
 *   1. Ler o financeiro global (MRR, cobranças de todas as escolas). Com a
 *      chave publicável, isso exigiria uma policy `using (true)` — exatamente o
 *      vazamento que a migration 20261126 fechou.
 *   2. Escrever status de assinatura. Hoje não existe policy de escrita e o
 *      GRANT foi revogado, então o banco recusa. Se alguém "consertar" isso
 *      com uma policy aberta, qualquer visitante promove a própria escola para
 *      `active` sem pagar.
 *   3. Calcular desconto. Preço e desconto são decididos no servidor; o
 *      navegador só manda QUAL plano e QUAL ciclo quer.
 *
 * A função roda em Deno, no projeto Supabase, com `SUPABASE_URL` e a chave de
 * serviço no ambiente dela — segredo que nunca entra no bundle.
 *
 * A IDENTIDADE É O JWT DO SUPABASE AUTH
 * -------------------------------------
 * `getSession().access_token` é assinado pelo Supabase (RS256, JWKS público).
 * A função verifica a assinatura, extrai `sub` e `email`, e então lê
 * `memberships` para saber o que aquela pessoa pode fazer. O navegador não
 * escolhe o próprio papel — só apresenta um token que não consegue forjar.
 *
 * Se não houver JWT (login por senha local), a função responde 401 com
 * `precisaLoginSupabase`. A UI mostra o motivo em vez de "erro inesperado".
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";

/** Mesmo padrão de resposta da função, para a UI tratar igual em todo lugar. */
export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** `true` quando a operação exige login Google (JWT verificável). */
  precisaLoginSupabase?: boolean;
}

function baseUrl(): string {
  // A URL do projeto já está no cliente Supabase; reaproveita para não duplicar
  // configuração. `/functions/v1` é o caminho padrão das Edge Functions.
  const url = (getSupabaseClient() as any)?.supabaseUrl as string | undefined;
  return `${(url || "").replace(/\/$/, "")}/functions/v1/billing-api`;
}

async function authHeader(): Promise<string | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "PUT";
    body?: unknown;
    /**
     * Rotas públicas (vitrine de planos, formulário de demonstração) NÃO
     * exigem login. Sem esta flag, um visitante sem conta receberia "entre com
     * o Google" ao pedir uma demonstração — que é justamente o oposto do
     * objetivo da página de planos.
     */
    publico?: boolean;
  } = { method: "GET" }
): Promise<ApiResult<T>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 0, data: null, error: "Banco de dados não configurado neste ambiente." };
  }

  const auth = await authHeader();
  if (!auth && !init.publico) {
    return {
      ok: false,
      status: 401,
      data: null,
      error:
        "Para abrir o painel financeiro entre com a conta do Google: é a única forma de confirmar quem você é no servidor.",
      precisaLoginSupabase: true,
    };
  }

  try {
    /*
      Timeout obrigatório: sem `signal`, um servidor que aceita a conexão e não
      responde deixa a tela em "Carregando…" para sempre. 15 s cobre o cold
      start de uma Edge Function.
    */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: {
        ...(auth ? { Authorization: auth } : {}),
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const texto = await res.text();
    let corpo: any = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: "A resposta do servidor veio em formato inesperado.",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: corpo?.error || `O servidor respondeu ${res.status}.`,
        precisaLoginSupabase: corpo?.precisaLoginSupabase === true,
      };
    }

    return { ok: true, status: res.status, data: corpo as T, error: null };
  } catch (err: any) {
    const abortou = err?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: abortou
        ? "O servidor demorou demais para responder. Tente novamente."
        : `Não foi possível falar com o servidor financeiro: ${err?.message || "sem conexão"}.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Painel do proprietário
// ---------------------------------------------------------------------------

export interface OwnerOverview {
  indicadores: {
    instituicoesContratantes: number;
    assinaturasAtivas: number;
    assinaturasEmTeste: number;
    assinaturasVencidas: number;
    assinaturasCanceladas: number;
    receitaRecorrenteMensalCents: number;
    receitaRecorrenteAnualizadaCents: number;
    pagamentosRecebidosCents: number;
    pagamentosPendentesCents: number;
    taxasImplantacaoRecebidasCents: number;
    adicionaisVendidosCents: number;
  };
  assinaturas: OwnerSubscription[];
  cobrancas: OwnerPayment[];
  planos: OwnerPlan[];
  adicionais: OwnerAddon[];
  parceiros: OwnerPartner[];
  auditoria: OwnerAuditEntry[];
  leads: OwnerLead[];
  cobranca: { provedor: string; configurado: boolean; aceitaPagamentoReal: boolean; faltando: string[]; nota: string };
}

export interface OwnerSubscription {
  id: string;
  school_id: string;
  school_name: string | null;
  school_slug: string | null;
  plan_id: string;
  plan_name: string | null;
  status: string;
  billing_cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  discount_percent: number;
  founder_discount: boolean;
  provider: string;
  monthly_cents: number;
}

export interface OwnerPayment {
  id: string;
  school_name: string | null;
  amount_cents: number;
  kind: string;
  status: string;
  method: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  provider: string;
}

export interface OwnerPlan {
  id: string;
  name: string;
  tagline: string | null;
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

export interface OwnerAddon {
  id: string;
  name: string;
  price_cents: number;
  billing_type: string;
  unit_label: string | null;
  is_active: boolean;
}

export interface OwnerPartner {
  id: string;
  name: string;
  category: string | null;
  status: string;
  directory_plan: string | null;
  directory_paid_until: string | null;
}

export interface OwnerAuditEntry {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: any;
  created_at: string;
}

export interface OwnerLead {
  id: number;
  name: string;
  email: string;
  school_name: string | null;
  plan_interest: string | null;
  status: string;
  created_at: string;
}

export function fetchOwnerOverview() {
  return request<OwnerOverview>("/owner/overview");
}

export function updatePlan(
  planId: string,
  mudancas: Partial<Pick<OwnerPlan, "monthly_price_cents" | "annual_price_cents" | "setup_fee_cents" | "max_active_students" | "max_units" | "is_active" | "is_public" | "tagline">>
) {
  return request<{ plan: OwnerPlan }>(`/owner/plans/${encodeURIComponent(planId)}`, {
    method: "PUT",
    body: mudancas,
  });
}

export function updateSubscription(
  subscriptionId: string,
  mudancas: {
    status?: string;
    plan_id?: string;
    billing_cycle?: string;
    discount_percent?: number;
    notes?: string;
  }
) {
  return request<{ inscricao: unknown }>(`/owner/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: mudancas,
  });
}

/** Baixa manual de cobrança (transferência/PIX recebido fora do provedor). */
export function registerManualPayment(entrada: {
  school_id: string;
  amount_cents: number;
  kind: string;
  due_date?: string;
  notes?: string;
  subscription_id?: string;
}) {
  return request<{ transacao: unknown }>("/owner/payments/manual", {
    method: "POST",
    body: entrada,
  });
}

export function updatePartnerStatus(partnerId: string, status: "approved" | "rejected" | "suspended", directoryPaidUntil?: string) {
  return request<{ parceiro: unknown }>(`/owner/partners/${encodeURIComponent(partnerId)}/status`, {
    method: "PUT",
    body: { status, directory_paid_until: directoryPaidUntil },
  });
}

export function updateLeadStatus(leadId: number, status: string) {
  return request<{ lead: unknown }>(`/owner/leads/${leadId}/status`, {
    method: "PUT",
    body: { status },
  });
}

// ---------------------------------------------------------------------------
// Área da instituição
// ---------------------------------------------------------------------------

export interface SchoolSubscriptionResponse {
  escola: { id: string; name: string; slug: string; is_founder: boolean };
  assinatura: any | null;
  acesso: { canRead: boolean; canWrite: boolean; reason: string | null; effectiveStatus: string };
  cobrancas: OwnerPayment[];
  historico: OwnerAuditEntry[];
}

export function fetchMySubscription() {
  return request<SchoolSubscriptionResponse>("/school/me");
}

/** Pede troca de plano. O servidor decide preço, desconto e data. */
export function requestPlanChange(novoPlanoId: string, ciclo: "monthly" | "annual") {
  return request<{ assinatura: unknown; mensagem: string }>("/school/change-plan", {
    method: "POST",
    body: { plan_id: novoPlanoId, billing_cycle: ciclo },
  });
}

/** Cancela no fim do período já pago — não apaga nada, não corta na hora. */
export function requestCancellation(motivo?: string) {
  return request<{ assinatura: unknown; mensagem: string }>("/school/cancel", {
    method: "POST",
    body: { motivo },
  });
}

/** Inicia pagamento de uma cobrança existente (PIX/boleto/cartão). */
export function startPayment(transactionId: string, method: "pix" | "boleto" | "credit_card") {
  return request<{ pagamento: { url: string | null; status: string; mensagem: string } }>("/school/pay", {
    method: "POST",
    body: { transaction_id: transactionId, method },
  });
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export function submitDemoLead(entrada: {
  name: string;
  email: string;
  phone?: string;
  school_name?: string;
  city?: string;
  state?: string;
  plan_interest?: string;
  notes?: string;
}) {
  return request<{ lead: { id: number } }>("/public/lead", {
    method: "POST",
    body: entrada,
    // Formulário público: quem preenche ainda não tem conta.
    publico: true,
  });
}
