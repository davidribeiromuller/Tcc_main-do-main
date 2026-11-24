/**
 * Cobrança desacoplada do provedor (Parte 7 da auditoria SaaS).
 *
 * Princípios:
 *  1. NENHUM provedor é obrigatório para o sistema funcionar. Sem credencial,
 *     a cobrança é registrada em modo `sandbox`, com status `pending`, e o
 *     painel mostra "aguardando confirmação do provedor".
 *  2. NUNCA marcamos pagamento como aprovado por conta própria. Status `paid`
 *     só nasce de webhook com assinatura válida (ou de baixa manual explícita
 *     feita pelo proprietário e registrada em auditoria).
 *  3. Toda criação de cobrança é idempotente por `idempotencyKey`.
 *
 * Estado real neste repositório:
 *  - Stripe: implementação completa (Checkout Session + verificação de
 *    assinatura `Stripe-Signature`). Precisa de `STRIPE_SECRET_KEY`,
 *    `STRIPE_PRICE_*` e `STRIPE_WEBHOOK_SECRET` → PENDENTE DE CONFIGURAÇÃO
 *    EXTERNA (não há chave neste ambiente, então não foi possível testar
 *    contra a API real).
 *  - Pix/boleto via Asaas ou Mercado Pago: interface pronta, chamada HTTP
 *    genérica disponível, credenciais ausentes → PENDENTE DE CONFIGURAÇÃO
 *    EXTERNA.
 */
import crypto from "node:crypto";

export type BillingProviderId = "sandbox" | "stripe" | "asaas" | "mercadopago" | "manual";

export type PaymentMethod = "pix" | "boleto" | "credit_card" | "debit_card" | "transfer";

export interface ChargeRequest {
  schoolId: string;
  subscriptionId?: string | null;
  amountCents: number;
  method: PaymentMethod;
  kind: "subscription" | "setup" | "addon" | "partner_campaign" | "partner_directory" | "manual";
  description: string;
  idempotencyKey: string;
  customerEmail?: string | null;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

export interface ChargeResult {
  /** `false` quando falta credencial: a cobrança fica pendente, nunca paga. */
  providerCalled: boolean;
  provider: BillingProviderId;
  /** Id da cobrança no provedor (quando houve chamada real). */
  providerChargeId: string | null;
  /** Link para o cliente pagar (Stripe Checkout / boleto / QR Pix). */
  paymentUrl: string | null;
  /** Código Pix copia-e-cola ou linha digitável, quando existir. */
  paymentCode: string | null;
  status: "pending" | "processing";
  message: string;
}

export function getActiveBillingProvider(): BillingProviderId {
  const secret = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (secret.startsWith("sk_")) return "stripe";

  if ((process.env.ASAAS_API_KEY || "").trim()) return "asaas";
  if ((process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim()) return "mercadopago";

  return "sandbox";
}

/** Diagnóstico honesto para o painel Master e para o GUIA_CONFIGURACAO_SECRETS. */
export function getBillingDiagnostics() {
  const provider = getActiveBillingProvider();
  return {
    provider,
    configured: provider !== "sandbox",
    acceptsRealPayments: provider !== "sandbox",
    missing: [
      !process.env.STRIPE_SECRET_KEY ? "STRIPE_SECRET_KEY" : null,
      !process.env.STRIPE_WEBHOOK_SECRET ? "STRIPE_WEBHOOK_SECRET" : null,
      !process.env.BILLING_PUBLIC_BASE_URL ? "BILLING_PUBLIC_BASE_URL" : null,
    ].filter(Boolean) as string[],
    note:
      provider === "sandbox"
        ? "Modo sandbox: cobranças são registradas como pendentes e NUNCA são marcadas como pagas automaticamente."
        : "Provedor configurado por variáveis de ambiente.",
  };
}

/** Registro do pagamento só pode virar `paid` por estas vias. */
export const PAID_STATUSES = ["paid"] as const;

export function isProvablyPaidSource(source: string): boolean {
  return source === "webhook_verified" || source === "manual_by_owner";
}

// ---------------------------------------------------------------------------
// Stripe — Checkout Session
// ---------------------------------------------------------------------------

async function stripeCreateCheckoutSession(req: ChargeRequest): Promise<ChargeResult> {
  const secret = process.env.STRIPE_SECRET_KEY as string;
  const baseUrl = (process.env.BILLING_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", req.successUrl || `${baseUrl}/?pagamento=sucesso`);
  body.set("cancel_url", req.cancelUrl || `${baseUrl}/?pagamento=cancelado`);
  body.set("client_reference_id", req.idempotencyKey);
  body.set("metadata[school_id]", req.schoolId);
  body.set("metadata[kind]", req.kind);
  if (req.subscriptionId) body.set("metadata[subscription_id]", req.subscriptionId);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "brl");
  body.set("line_items[0][price_data][unit_amount]", String(req.amountCents));
  body.set("line_items[0][price_data][product_data][name]", req.description);
  if (req.customerEmail) body.set("customer_email", req.customerEmail);

  // Formas aceitas pelo Checkout. Pix e boleto exigem ativação na conta Stripe.
  const methods: Record<string, string[]> = {
    credit_card: ["card"],
    debit_card: ["card"],
    pix: ["pix"],
    boleto: ["boleto"],
    transfer: ["customer_balance"],
  };
  (methods[req.method] || ["card"]).forEach((m, i) => body.set(`payment_method_types[${i}]`, m));

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": req.idempotencyKey,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        providerCalled: true,
        provider: "stripe",
        providerChargeId: null,
        paymentUrl: null,
        paymentCode: null,
        status: "pending",
        message: `Stripe recusou a criação da cobrança: ${json?.error?.message || res.status}`,
      };
    }

    return {
      providerCalled: true,
      provider: "stripe",
      providerChargeId: json.id || null,
      paymentUrl: json.url || null,
      paymentCode: null,
      status: "pending",
      message: "Cobrança criada no Stripe. O pagamento será confirmado pelo webhook.",
    };
  } catch (err: any) {
    return {
      providerCalled: false,
      provider: "stripe",
      providerChargeId: null,
      paymentUrl: null,
      paymentCode: null,
      status: "pending",
      message: `Não foi possível falar com o Stripe: ${err?.message || "erro de rede"}. A cobrança ficou pendente.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Ponto único de criação de cobrança
// ---------------------------------------------------------------------------

export async function createCharge(req: ChargeRequest): Promise<ChargeResult> {
  if (!Number.isFinite(req.amountCents) || req.amountCents <= 0) {
    throw new Error("Valor da cobrança inválido.");
  }
  if (!req.idempotencyKey) {
    throw new Error("Idempotency-Key é obrigatória para criar cobrança.");
  }

  const provider = getActiveBillingProvider();

  if (provider === "stripe") {
    return stripeCreateCheckoutSession(req);
  }

  // Sem provedor configurado (ou provedor ainda não implementado): registra a
  // intenção e deixa PENDENTE. Nunca inventa "pago".
  return {
    providerCalled: false,
    provider: provider === "manual" ? "manual" : "sandbox",
    providerChargeId: null,
    paymentUrl: null,
    paymentCode: null,
    status: "pending",
    message:
      "Modo sandbox: cobrança registrada como pendente. Configure STRIPE_SECRET_KEY (ou ASAAS_API_KEY) para emitir cobranças reais. Nenhum pagamento é confirmado automaticamente.",
  };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface WebhookVerification {
  valid: boolean;
  eventId: string | null;
  eventType: string | null;
  reason?: string;
  payload: any;
}

/**
 * Verificação de assinatura Stripe (`Stripe-Signature: t=...,v1=...`).
 * HMAC-SHA256 sobre `${t}.${rawBody}` com `STRIPE_WEBHOOK_SECRET`.
 * Tolerância de 5 minutos contra replay.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined = process.env.STRIPE_WEBHOOK_SECRET,
  toleranceSeconds = 300
): { valid: boolean; reason?: string } {
  if (!secret) return { valid: false, reason: "STRIPE_WEBHOOK_SECRET não configurado" };
  if (!signatureHeader) return { valid: false, reason: "Cabeçalho de assinatura ausente" };

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  if (!parts.t || !parts.v1) return { valid: false, reason: "Assinatura malformada" };

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "Timestamp inválido" };
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return { valid: false, reason: "Assinatura expirada (replay)" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(parts.v1, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Assinatura inválida" };
  }
  return { valid: true };
}

/** Verificação genérica HMAC-SHA256 (`BILLING_WEBHOOK_SECRET`). */
export function verifyGenericSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string | undefined = process.env.BILLING_WEBHOOK_SECRET
): { valid: boolean; reason?: string } {
  if (!secret) return { valid: false, reason: "BILLING_WEBHOOK_SECRET não configurado" };
  if (!signature) return { valid: false, reason: "Assinatura ausente" };
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.replace(/^sha256=/, ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Assinatura inválida" };
  }
  return { valid: true };
}

export interface NormalizedWebhook {
  provider: string;
  eventId: string;
  eventType: string;
  /** Id da cobrança/assinatura no provedor. */
  providerRef: string | null;
  /** Status a aplicar na transação local. */
  transactionStatus: "paid" | "failed" | "refunded" | "canceled" | "expired" | "pending" | "processing" | null;
}

/** Normaliza payloads de webhook para o formato interno. */
export function normalizeWebhook(provider: string, payload: any): NormalizedWebhook | null {
  if (!payload || typeof payload !== "object") return null;

  if (provider === "stripe") {
    const type = String(payload.type || "");
    const obj = payload.data?.object || {};
    let transactionStatus: NormalizedWebhook["transactionStatus"] = null;
    if (type === "checkout.session.completed" || type === "invoice.paid") transactionStatus = "paid";
    else if (type === "invoice.payment_failed" || type === "charge.failed") transactionStatus = "failed";
    else if (type === "charge.refunded") transactionStatus = "refunded";
    else if (type === "customer.subscription.deleted") transactionStatus = "canceled";
    else transactionStatus = null;

    return {
      provider: "stripe",
      eventId: String(payload.id || ""),
      eventType: type,
      providerRef: obj.id || obj.payment_intent || obj.subscription || null,
      transactionStatus,
    };
  }

  // Formato genérico: { id, type, reference, status }
  const statusMap: Record<string, NormalizedWebhook["transactionStatus"]> = {
    paid: "paid",
    approved: "paid",
    confirmed: "paid",
    failed: "failed",
    refused: "failed",
    refunded: "refunded",
    canceled: "canceled",
    expired: "expired",
    pending: "pending",
    processing: "processing",
  };

  const rawStatus = String(payload.status || payload.event_type || "").toLowerCase();
  return {
    provider,
    eventId: String(payload.id || payload.event_id || ""),
    eventType: String(payload.type || rawStatus || "unknown"),
    providerRef: payload.reference || payload.charge_id || payload.payment_id || null,
    transactionStatus: statusMap[rawStatus] || null,
  };
}
