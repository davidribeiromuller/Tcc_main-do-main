/**
 * billing-webhook — recebe a confirmação de pagamento do Mercado Pago.
 *
 * ESTE É O ÚNICO LUGAR DO SISTEMA QUE PODE MARCAR UMA COBRANÇA COMO PAGA.
 *
 * Nenhuma resposta HTTP devolvida ao navegador marca pagamento: a rota
 * `/school/pay` só cria a cobrança e devolve o link. Se a confirmação viesse do
 * navegador, bastaria abrir o devtools e chamar a função para ganhar acesso
 * grátis.
 *
 * ORDEM DAS VERIFICAÇÕES (todas obrigatórias, nesta ordem):
 *   1. Assinatura HMAC do provedor (`x-signature`) — sem isso, é POST de
 *      qualquer pessoa dizendo que pagou;
 *   2. Idempotência por `(provider, event_id)` — o Mercado Pago reenvia o mesmo
 *      evento várias vezes, e reenviar não pode duplicar receita;
 *   3. Busca do pagamento NO PROVEDOR — o corpo do webhook é uma notificação,
 *      não uma prova; o valor consultado é o da API oficial;
 *   4. Atualização transacional + registro de auditoria.
 *
 * Deploy: `supabase functions deploy billing-webhook --no-verify-jwt`
 * (a autenticação aqui é a assinatura do provedor, não o JWT do Supabase).
 * Variável obrigatória: `MERCADOPAGO_WEBHOOK_SECRET`.
 */
import { clienteAdmin, json, erro, auditar } from "../_shared/db.ts";
import * as mp from "../_shared/mercadopago.ts";
import { nextPeriodEnd } from "../_shared/subscription.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") return erro("Método não permitido.", 405);

  const admin = clienteAdmin();
  const url = new URL(req.url);

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo inválido.", 400);
  }

  /*
    O Mercado Pago manda o id de duas formas:
      · query string  ?data.id=123&type=payment   (webhook "topic")
      · corpo         { data: { id: "123" }, type: "payment" }
    Aceitamos as duas e preferimos a query, que é a que a assinatura cobre.
  */
  const dataId = String(url.searchParams.get("data.id") || corpo?.data?.id || "").trim();
  const tipo = String(url.searchParams.get("type") || corpo?.type || corpo?.topic || "").trim();

  if (!dataId) return erro("Notificação sem identificador de pagamento.", 400);

  // ---------- 1. Assinatura ----------
  const assinatura = await mp.validarAssinatura(req.headers, dataId);

  const { data: registro, error: erroInsert } = await admin
    .from("webhook_events")
    .insert([
      {
        provider: "mercadopago",
        event_id: `${tipo || "payment"}:${dataId}`,
        event_type: tipo || "payment",
        signature_valid: assinatura.valido,
        payload: corpo,
        status: "received",
      },
    ])
    .select("id, status")
    .single();

  /*
    Evento repetido: o índice único `(provider, event_id)` faz o INSERT acima
    falhar com 23505. Nesse caso a resposta é 200 — devolver erro faria o
    provedor reenviar para sempre.

    IMPORTANTE: só tratamos como duplicado o erro de chave única. Antes,
    qualquer falha no INSERT (banco fora, coluna errada) virava "já processado"
    e o pagamento era silenciosamente descartado.
  */
  if (!registro) {
    const codigo = (erroInsert as any)?.code;
    if (codigo === "23505") {
      return json({ recebido: true, duplicado: true, mensagem: "Evento já processado anteriormente." });
    }
    console.error("[webhook] falha ao registrar evento:", erroInsert);
    return erro(`Não foi possível registrar o evento: ${(erroInsert as any)?.message || "erro"}`, 500);
  }

  if (!assinatura.valido) {
    await admin
      .from("webhook_events")
      .update({ status: "ignored", error_message: `assinatura inválida: ${assinatura.motivo}`, processed_at: new Date().toISOString() })
      .eq("id", registro.id);

    console.warn("[webhook] assinatura inválida:", assinatura.motivo);
    // 200 porque não há o que o provedor corrija reenviando; o evento fica
    // registrado como ignored para auditoria.
    return json({ recebido: true, processado: false, motivo: assinatura.motivo });
  }

  // ---------- 2. Consulta a verdade no provedor ----------
  const consulta = await mp.consultarCobranca(dataId);
  if (consulta.erro || !consulta.status) {
    await admin
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: `não foi possível consultar o pagamento: ${consulta.erro}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", registro.id);
    return erro("Não foi possível confirmar o pagamento no provedor.", 502);
  }

  const mapeado = mp.mapearStatus(consulta.status);

  // Descobre a qual cobrança pertence. `external_reference` é o id da nossa
  // transação, gravado na criação.
  const referencia = String(
    consulta.externalReference || corpo?.data?.external_reference || ""
  ).trim();

  const { data: transacao } = referencia
    ? await admin.from("payment_transactions").select("*").eq("id", referencia).maybeSingle()
    : { data: null } as any;

  if (!transacao) {
    // Procura pelo id do provedor como segunda via (webhooks antigos sem ref).
    const { data: porProvedor } = await admin
      .from("payment_transactions")
      .select("*")
      .eq("provider_charge_id", dataId)
      .maybeSingle();

    if (!porProvedor) {
      await admin
        .from("webhook_events")
        .update({
          status: "ignored",
          error_message: "cobrança não encontrada no nosso banco",
          processed_at: new Date().toISOString(),
        })
        .eq("id", registro.id);
      return json({ recebido: true, processado: false, motivo: "cobrança desconhecida" });
    }
    return await aplicarPagamento(admin, registro.id, porProvedor, mapeado, dataId);
  }

  /*
    Conferência de valor: um pagamento aprovado de R$ 1,00 não pode quitar uma
    mensalidade de R$ 699,00. Se o provedor devolver valor diferente do que
    emitimos, o evento fica `failed` e NADA é ativado.
  */
  if (mapeado.pago && consulta.valorCents !== null && consulta.valorCents !== transacao.amount_cents) {
    await admin
      .from("webhook_events")
      .update({
        status: "failed",
        error_message: `valor divergente: esperado ${transacao.amount_cents}, recebido ${consulta.valorCents}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", registro.id);

    await auditar(admin, {
      actor_email: null,
      actor_role: "webhook",
      action: "pagamento.valor_divergente",
      target_type: "payment_transaction",
      target_id: transacao.id,
      metadata: { esperado_cents: transacao.amount_cents, recebido_cents: consulta.valorCents },
    });

    return json({ recebido: true, processado: false, motivo: "valor divergente" });
  }

  return await aplicarPagamento(admin, registro.id, transacao, mapeado, dataId);
});

async function aplicarPagamento(
  admin: any,
  webhookRowId: number,
  transacao: any,
  mapeado: { transacao: string; pago: boolean },
  chargeId: string
): Promise<Response> {
  // Já estava pago: nada a fazer. Idempotência de verdade.
  if (transacao.status === "paid" && mapeado.pago) {
    await admin
      .from("webhook_events")
      .update({ status: "duplicate", processed_at: new Date().toISOString() })
      .eq("id", webhookRowId);
    return json({ recebido: true, processado: false, motivo: "cobrança já estava paga" });
  }

  const agora = new Date();

  await admin
    .from("payment_transactions")
    .update({
      status: mapeado.transacao,
      provider: "mercadopago",
      provider_charge_id: chargeId,
      paid_at: mapeado.pago ? agora.toISOString() : transacao.paid_at,
      updated_at: agora.toISOString(),
    })
    .eq("id", transacao.id);

  /*
    Efeito na assinatura. Regra: só ativa com pagamento CONFIRMADO no provedor.
    O período novo começa agora, não na data do vencimento antigo — isso evita
    "ganhar" dias pagando atrasado.
  */
  if (mapeado.pago && transacao.subscription_id) {
    const { data: inscricao } = await admin
      .from("subscriptions")
      .select("*")
      .eq("id", transacao.subscription_id)
      .maybeSingle();

    if (inscricao) {
      const ciclo = (inscricao.billing_cycle || "monthly") as "monthly" | "annual";
      const atualizacao: Record<string, unknown> = {
        last_payment_at: agora.toISOString(),
        updated_at: agora.toISOString(),
      };

      // Cobrança de `subscription` (mensalidade) mantém a assinatura em dia.
      if (transacao.kind === "subscription") {
        atualizacao.status = "active";
        atualizacao.grace_until = null;
        atualizacao.current_period_start = agora.toISOString();
        atualizacao.current_period_end = nextPeriodEnd(agora, ciclo).toISOString();
        atualizacao.next_due_at = nextPeriodEnd(agora, ciclo).toISOString();
      }

      await admin.from("subscriptions").update(atualizacao).eq("id", inscricao.id);

      await admin.from("subscription_events").insert([
        {
          subscription_id: inscricao.id,
          school_id: inscricao.school_id,
          event_type: mapeado.pago ? "pagamento.confirmado" : `pagamento.${mapeado.transacao}`,
          from_status: inscricao.status,
          to_status: (atualizacao.status as string) || inscricao.status,
          payload: {
            transacao_id: transacao.id,
            valor_cents: transacao.amount_cents,
            kind: transacao.kind,
            provider_charge_id: chargeId,
          },
          actor_email: null,
        },
      ]);
    }
  }

  /* Falha de pagamento em mensalidade: entra em atraso e ganha a tolerância de
     7 dias. Nunca suspende na hora nem apaga dado. */
  if (!mapeado.pago && ["failed", "canceled", "expired"].includes(mapeado.transacao) && transacao.kind === "subscription" && transacao.subscription_id) {
    const { data: inscricao } = await admin
      .from("subscriptions")
      .select("id, school_id, status, grace_until")
      .eq("id", transacao.subscription_id)
      .maybeSingle();

    if (inscricao && inscricao.status !== "trialing") {
      const tolerancia = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
      await admin
        .from("subscriptions")
        .update({ status: "past_due", grace_until: tolerancia.toISOString(), updated_at: agora.toISOString() })
        .eq("id", inscricao.id);

      await admin.from("subscription_events").insert([
        {
          subscription_id: inscricao.id,
          school_id: inscricao.school_id,
          event_type: `pagamento.${mapeado.transacao}`,
          from_status: inscricao.status,
          to_status: "past_due",
          payload: { tolerancia_ate: tolerancia.toISOString(), transacao_id: transacao.id },
          actor_email: null,
        },
      ]);
    }
  }

  await admin
    .from("webhook_events")
    .update({ status: "processed", processed_at: agora.toISOString() })
    .eq("id", webhookRowId);

  await auditar(admin, {
    actor_email: null,
    actor_role: "webhook",
    action: `pagamento.${mapeado.transacao}`,
    target_type: "payment_transaction",
    target_id: transacao.id,
    metadata: { charge_id: chargeId, valor_cents: transacao.amount_cents },
  });

  return json({ recebido: true, processado: true, status: mapeado.transacao });
}
