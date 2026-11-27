/**
 * Adaptador Mercado Pago — PIX, boleto e cartão.
 *
 * POR QUE UM ADAPTADOR
 * --------------------
 * O resto do sistema fala apenas com as funções deste arquivo. Se amanhã o
 * provedor mudar, muda este arquivo e nada mais — `billing-api` continua
 * chamando `criarCobranca`, `consultarCobranca` e `interpretarWebhook`.
 *
 * ESTADO REAL (ler antes de prometer qualquer coisa)
 * --------------------------------------------------
 * Este código segue a API pública documentada do Mercado Pago
 * (`POST /v1/payments` para PIX/boleto/cartão e `POST /preapproval` para
 * assinatura recorrente). Ele NÃO foi executado contra a API real neste
 * ambiente: não há `MERCADOPAGO_ACCESS_TOKEN` aqui e o sandbox não tem saída
 * para `api.mercadopago.com`.
 *
 * O que isso significa na prática:
 *   · Sem credencial, `provedorConfigurado()` é `false`;
 *   · Nenhuma cobrança é criada como paga;
 *   · A tela mostra "aguardando confirmação do provedor" com o motivo;
 *   · Nada é simulado como aprovado.
 *
 * Variáveis necessárias (configurar em Supabase → Edge Functions → Secrets):
 *   MERCADOPAGO_ACCESS_TOKEN   — token de produção ou de teste (TEST-…)
 *   MERCADOPAGO_WEBHOOK_SECRET — assinatura secreta do webhook
 *   MERCADOPAGO_ENV            — "sandbox" ou "production" (informativo)
 *   APP_PUBLIC_URL             — URL pública do app (back_urls do checkout)
 */
import { createHmac } from "node:crypto";

const API = "https://api.mercadopago.com";

export type MetodoPagamento = "pix" | "boleto" | "credit_card";
export type AmbienteMp = "sandbox" | "production";

export interface ConfigMp {
  token: string;
  webhookSecret: string;
  ambiente: AmbienteMp;
  appUrl: string;
  configurado: boolean;
}

export function config(): ConfigMp {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
  const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "";
  const ambiente = (Deno.env.get("MERCADOPAGO_ENV") || "sandbox").toLowerCase() === "production"
    ? "production"
    : "sandbox";
  const appUrl = (Deno.env.get("APP_PUBLIC_URL") || "").replace(/\/$/, "");
  return {
    token,
    webhookSecret,
    ambiente,
    appUrl,
    // Webhook sem segredo é inútil: qualquer um poderia forjar "pagamento aprovado".
    configurado: Boolean(token),
  };
}

/** Diagnóstico para a UI — nunca devolve o token, só se existe. */
export function diagnostico() {
  const c = config();
  const faltando: string[] = [];
  if (!c.token) faltando.push("MERCADOPAGO_ACCESS_TOKEN");
  if (!c.webhookSecret) faltando.push("MERCADOPAGO_WEBHOOK_SECRET");
  if (!c.appUrl) faltando.push("APP_PUBLIC_URL");
  return {
    provedor: "mercadopago",
    configurado: faltando.length === 0,
    aceitaPagamentoReal: c.configurado,
    ambiente: c.ambiente,
    faltando,
    nota:
      faltando.length === 0
        ? "Credenciais presentes. Cobranças passam pelo Mercado Pago."
        : "Sem credenciais do Mercado Pago: as cobranças ficam registradas em modo " +
          "manual/sandbox, aguardando confirmação. Nenhum pagamento é dado como aprovado " +
          "sem confirmação do provedor.",
  };
}

export interface CobrancaCriada {
  /** `false` quando faltou credencial: a cobrança existe no banco, mas ninguém chamou a API. */
  chamouProvedor: boolean;
  providerChargeId: string | null;
  urlPagamento: string | null;
  statusProvedor: string | null;
  respostaBruta: unknown;
  erro: string | null;
}

interface EntradaCobranca {
  valorCents: number;
  descricao: string;
  metodo: MetodoPagamento;
  emailPagador?: string | null;
  referenciaExterna: string;
  /** `subscription` gera cobrança avulsa recorrente; `setup`/`addon` são únicas. */
  tipo: string;
  primeiroVencimento?: string;
}

function corpoPagamento(e: EntradaCobranca) {
  const valor = Math.max(0, Math.round(e.valorCents)) / 100;
  const base: Record<string, unknown> = {
    transaction_amount: valor,
    description: e.descricao.slice(0, 250),
    external_reference: e.referenciaExterna,
    notification_url: `${config().appUrl}/functions/v1/billing-webhook`,
    metadata: { tipo: e.tipo, referencia: e.referenciaExterna },
  };

  if (e.emailPagador) base.payer = { email: e.emailPagador };

  if (e.metodo === "pix") {
    base.payment_method_id = "pix";
    base.payment_type_id = "bank_transfer";
  } else if (e.metodo === "boleto") {
    base.payment_method_id = "bolbradesco";
    base.payment_type_id = "ticket";
  } else {
    base.payment_method_id = "visa";
    base.payment_type_id = "credit_card";
    // Cartão exige token gerado no navegador pelo SDK do MP. Sem esse token a
    // API recusa — por isso a UI não oferece cartão direto sem o SDK.
    base.installments = 1;
  }

  return base;
}

/**
 * Cria uma cobrança.
 *
 * Falha de credencial NÃO é tratada como erro fatal: a transação já foi gravada
 * como `pending` no banco e a instituição vê "aguardando pagamento". O que não
 * acontece em hipótese alguma é marcar `paid` sem confirmação.
 */
export async function criarCobranca(e: EntradaCobranca): Promise<CobrancaCriada> {
  const c = config();
  if (!c.configurado) {
    return {
      chamouProvedor: false,
      providerChargeId: null,
      urlPagamento: null,
      statusProvedor: null,
      respostaBruta: null,
      erro: null,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${API}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "Content-Type": "application/json",
        // Evita cobrança duplicada se a função for reexecutada.
        "X-Idempotency-Key": e.referenciaExterna,
      },
      body: JSON.stringify(corpoPagamento(e)),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const bruto: any = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        chamouProvedor: true,
        providerChargeId: bruto?.id ? String(bruto.id) : null,
        urlPagamento: null,
        statusProvedor: null,
        respostaBruta: bruto,
        erro: bruto?.message || `Mercado Pago respondeu ${res.status}.`,
      };
    }

    /*
      Onde está o link para o pagador:
        PIX    → point_of_interaction.transaction_data.ticket_url (QR + copia e cola)
        Boleto → transaction_details.external_resource_url (PDF)
        Cartão → não há link; o status vem na resposta.
    */
    const urlPagamento =
      bruto?.point_of_interaction?.transaction_data?.ticket_url ||
      bruto?.transaction_details?.external_resource_url ||
      bruto?.init_point ||
      null;

    return {
      chamouProvedor: true,
      providerChargeId: bruto?.id ? String(bruto.id) : null,
      urlPagamento,
      statusProvedor: bruto?.status || null,
      respostaBruta: bruto,
      erro: null,
    };
  } catch (err: any) {
    return {
      chamouProvedor: true,
      providerChargeId: null,
      urlPagamento: null,
      statusProvedor: null,
      respostaBruta: null,
      erro:
        err?.name === "AbortError"
          ? "O Mercado Pago não respondeu a tempo."
          : `Falha de rede ao falar com o Mercado Pago: ${err?.message || "desconhecida"}.`,
    };
  }
}

/**
 * Consulta o status atual de uma cobrança no provedor.
 *
 * Devolve também `external_reference` (o id da NOSSA transação) e o valor —
 * sem eles o webhook não consegue saber a qual cobrança o pagamento pertence e
 * cairia no fallback por `provider_charge_id`, que só funciona depois da
 * primeira cobrança criada com sucesso.
 */
export async function consultarCobranca(chargeId: string): Promise<{
  status: string | null;
  externalReference: string | null;
  valorCents: number | null;
  erro: string | null;
}> {
  const c = config();
  if (!c.configurado || !chargeId) {
    return { status: null, externalReference: null, valorCents: null, erro: "Provedor não configurado." };
  }

  try {
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(chargeId)}`, {
      headers: { Authorization: `Bearer ${c.token}` },
    });
    if (!res.ok) {
      return { status: null, externalReference: null, valorCents: null, erro: `Mercado Pago respondeu ${res.status}.` };
    }
    const bruto: any = await res.json();
    return {
      status: bruto?.status || null,
      externalReference: bruto?.external_reference ? String(bruto.external_reference) : null,
      valorCents:
        typeof bruto?.transaction_amount === "number"
          ? Math.round(bruto.transaction_amount * 100)
          : null,
      erro: null,
    };
  } catch (err: any) {
    return {
      status: null,
      externalReference: null,
      valorCents: null,
      erro: err?.message || "falha de rede",
    };
  }
}

/** Cancela/estorna. Usado quando o proprietário cancela uma cobrança pendente. */
export async function cancelarCobranca(chargeId: string): Promise<{ ok: boolean; erro: string | null }> {
  const c = config();
  if (!c.configurado || !chargeId) return { ok: false, erro: "Provedor não configurado." };

  try {
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(chargeId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      const bruto: any = await res.json().catch(() => null);
      return { ok: false, erro: bruto?.message || `Mercado Pago respondeu ${res.status}.` };
    }
    return { ok: true, erro: null };
  } catch (err: any) {
    return { ok: false, erro: err?.message || "falha de rede" };
  }
}

/**
 * Valida a assinatura do webhook.
 *
 * O Mercado Pago envia `x-signature: ts=<timestamp>,v1=<hash>` e
 * `x-request-id`. O hash é HMAC-SHA256 de
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com o segredo do webhook.
 *
 * Sem segredo configurado, retorna `false` — e o webhook é registrado como
 * `signature_valid = false`, nunca processado. É a diferença entre "aceitar
 * qualquer POST dizendo que pagou" e aceitar só o que veio do provedor.
 */
export async function validarAssinatura(
  headers: Headers,
  dataId: string
): Promise<{ valido: boolean; motivo: string }> {
  const c = config();
  if (!c.webhookSecret) {
    return { valido: false, motivo: "MERCADOPAGO_WEBHOOK_SECRET não configurado" };
  }

  const assinatura = headers.get("x-signature") || "";
  const requestId = headers.get("x-request-id") || "";

  if (!assinatura) return { valido: false, motivo: "cabeçalho x-signature ausente" };

  const partes = Object.fromEntries(
    assinatura.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim(), v?.trim()];
    })
  ) as Record<string, string>;

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return { valido: false, motivo: "x-signature sem ts ou v1" };

  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const esperado = createHmac("sha256", c.webhookSecret).update(manifesto).digest("hex");

  // Comparação em tempo constante: comparação com `===` vaza o tamanho do
  // prefixo correto e permite descobrir a assinatura byte a byte.
  if (esperado.length !== v1.length) return { valido: false, motivo: "assinatura com tamanho inesperado" };
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) {
    diff |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0
    ? { valido: true, motivo: "ok" }
    : { valido: false, motivo: "assinatura não confere" };
}

/** Traduz o status do Mercado Pago para o vocabulário do nosso banco. */
export function mapearStatus(mpStatus: string | null | undefined): {
  transacao: "pending" | "processing" | "paid" | "failed" | "refunded" | "canceled" | "expired";
  pago: boolean;
} {
  switch ((mpStatus || "").toLowerCase()) {
    case "approved":
    case "authorized":
      return { transacao: "paid", pago: true };
    case "in_process":
    case "pending":
      return { transacao: "processing", pago: false };
    case "rejected":
      return { transacao: "failed", pago: false };
    case "refunded":
    case "charged_back":
      return { transacao: "refunded", pago: false };
    case "cancelled":
      return { transacao: "canceled", pago: false };
    case "expired":
      return { transacao: "expired", pago: false };
    default:
      return { transacao: "pending", pago: false };
  }
}
