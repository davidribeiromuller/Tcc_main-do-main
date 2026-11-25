/**
 * Cliente do catálogo comercial.
 *
 * IMPORTANTE: nenhum preço é constante no frontend. Tudo vem de `/api/saas/plans`,
 * que lê a tabela `plans` do banco. Se o servidor não estiver disponível, a UI
 * mostra um estado explícito de indisponibilidade em vez de inventar valores.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import {
  TRIAL_DAYS,
  ANNUAL_DISCOUNT_PERCENT,
  FOUNDER_DISCOUNT_PERCENT,
} from "./subscription.ts";
import { mensagemPrecisaServidor } from "./mensagensServidor.ts";

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
    /*
      RODADA 40 — timeout obrigatório.

      Sem `signal`, um servidor que aceita a conexão e não responde deixa a
      promessa pendurada para sempre: a tela fica em "Carregando planos…" sem
      erro e sem conteúdo. 8 s é o limite em que o usuário ainda acredita que
      algo está acontecendo.
    */
    const res = await fetch("/api/saas/plans", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        catalog: null,
        error:
          data.error ||
          (res.status === 503
            ? mensagemPrecisaServidor(
                "O catálogo de preços",
                "Use o formulário de contato para receber a proposta."
              )
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

/**
 * Catálogo lido DIRETO do Supabase (rodada 40).
 *
 * POR QUE (o erro "Catálogo indisponível · HTTP 404" na tela de planos):
 *
 * `fetchPlansCatalog` só falava com `/api/saas/plans`. No GitHub Pages essa
 * rota não existe, o host devolve 404 e a página inteira de preços ficava
 * vazia — mesmo com o catálogo publicado e legível no banco.
 *
 * E ele É legível: `plans` e `plan_addons` têm política
 * `plans_public_read` / `plan_addons_public_read` para `anon` (verificado no
 * projeto: `is_public AND is_active` e `is_active`). Preço público de tabela
 * não é segredo — é justamente o que precisa aparecer para a escola decidir.
 *
 * A ordem é: servidor quando existe (ele calcula vagas de fundador e
 * diagnóstico de cobrança), depois leitura pública direta. Os valores
 * numéricos de trial/desconto vêm de `lib/subscription.ts`, que é a MESMA
 * constante usada pelo backend — não são números inventados para a tela.
 */
export async function fetchPlansCatalogDirect(): Promise<CatalogResult> {
  if (!isSupabaseConfigured()) {
    return { catalog: null, error: "Banco de dados não configurado neste build." };
  }

  const COLUNAS_PLANO =
    "id, name, tagline, monthly_price_cents, annual_price_cents, setup_fee_cents, " +
    "max_active_students, max_units, max_admins, features, sort_order, is_public, is_active";

  /*
    O cliente REST não tem timeout próprio. Corrida contra o relógio: se o
    banco não responder em 8 s, seguimos com erro claro em vez de deixar a
    tela girando "Carregando planos…" para sempre (foi o que aconteceu no
    primeiro teste desta rodada, com o fetch pendurado).

    `.then(ok, erro)` em vez de `try/catch` no `Promise.all`: o `supabase-js`
    às vezes REJEITA e às vezes RESOLVE com `{ error }`. Tratando no `.then`,
    os dois casos chegam no mesmo formato.
  */
  const comTimeout = <T,>(p: PromiseLike<T>, ms = 8000): Promise<T> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<T>((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("tempo esgotado ao consultar o banco")), ms)
      ),
    ]);

  const comoResultado = <T,>(p: PromiseLike<T>) =>
    p.then(
      (r) => r as T | { data: null; error: any },
      (e) => ({ data: null, error: e })
    );

  try {
    const supabase = getSupabaseClient();

    const [planosRes, addonsRes] = await Promise.all([
      comoResultado(
        comTimeout(
          supabase
            .from("plans")
            .select(COLUNAS_PLANO)
            .eq("is_public", true)
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
        )
      ),
      comoResultado(
        comTimeout(supabase.from("plan_addons").select("*").eq("is_active", true))
      ),
    ]);

    const erroPlanos = (planosRes as any).error;
    if (erroPlanos) {
      /*
        Mensagem para o USUÁRIO, não para o console. "TypeError: fetch failed"
        na tela de planos não ajuda ninguém — a pessoa precisa saber que o
        preço não pôde ser carregado e que existe um caminho (o formulário).
      */
      console.warn("[plansService] Falha ao ler o catálogo:", erroPlanos.message);
      return {
        catalog: null,
        error:
          "O catálogo de preços não pôde ser carregado agora. Use o formulário acima " +
          "para receber a proposta — os valores vêm do banco, não de uma lista fixa.",
      };
    }

    const plans = (((planosRes as any).data || []) as PlanView[]);
    if (plans.length === 0) {
      return { catalog: null, error: "Nenhum plano publicado ainda. Fale com o suporte." };
    }

    return {
      catalog: {
        plans,
        addons: (((addonsRes as any).data || []) as AddonView[]),
        /*
          As vagas de fundador dependem de quantas escolas já aderiram — dado
          que a RLS não abre para o navegador. Em vez de inventar um número
          ("3 vagas restantes" seria mentira se já houvesse 3), a tela usa o
          caminho do servidor para isso. Aqui vai zero disponível e a UI
          simplesmente não mostra o selo.
        */
        founders: {
          totalSlots: 0,
          takenSlots: 0,
          availableSlots: 0,
          discountPercent: FOUNDER_DISCOUNT_PERCENT,
          discountMonths: 12,
        },
        trialDays: TRIAL_DAYS,
        annualDiscountPercent: ANNUAL_DISCOUNT_PERCENT,
        billing: {
          provider: "indisponivel",
          configured: false,
          acceptsRealPayments: false,
          missing: [],
          note:
            "Cobrança não está disponível nesta versão publicada: fale com a equipe para contratar.",
        },
      },
      error: null,
    };
  } catch (err: any) {
    console.warn("[plansService] Exceção ao ler o catálogo:", err?.message || err);
    return {
      catalog: null,
      error:
        "Não foi possível falar com o banco para carregar os preços. " +
        "Use o formulário acima para receber a proposta.",
    };
  }
}

/**
 * Ponto de entrada da tela: tenta o servidor e, se não houver, vai ao banco.
 *
 * Sem o segundo caminho a página ficava vazia no endereço público — e a
 * mensagem culpava o servidor por algo que o banco resolve.
 */
export async function carregarCatalogoDePlanos(): Promise<CatalogResult> {
  const viaServidor = await fetchPlansCatalog();
  if (viaServidor.catalog) return viaServidor;

  const viaBanco = await fetchPlansCatalogDirect();
  if (viaBanco.catalog) return viaBanco;

  // Nenhum dos dois funcionou: devolve o erro mais informativo (o do banco,
  // porque é ele que decide se existe catálogo publicado).
  return viaBanco.error ? viaBanco : viaServidor;
}
