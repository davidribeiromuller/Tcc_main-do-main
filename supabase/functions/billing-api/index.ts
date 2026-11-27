/**
 * billing-api — a única porta de escrita do módulo comercial.
 *
 * Rode com: `supabase functions deploy billing-api --no-verify-jwt`
 *
 * Por que `--no-verify-jwt`: o roteador trata três públicos diferentes e a
 * verificação é feita AQUI, por rota:
 *   · público   — vitrine de planos e formulário de demonstração (sem token);
 *   · instituição — exige JWT válido + vínculo `school_admin`/`school_staff`;
 *   · proprietário — exige JWT válido + e-mail em `PLATFORM_OWNER_EMAILS`.
 * Deixar a verificação padrão ligada bloquearia o público que precisa ver
 * preços antes de ter conta.
 *
 * REGRA QUE NUNCA MUDA: nenhum valor, desconto ou status chega pronto do
 * navegador. O cliente diz "quero o plano Rede, ciclo anual"; quem calcula
 * preço, desconto, data e status é este arquivo, lendo `plans` do banco.
 */
import {
  clienteAdmin,
  resolverUsuario,
  papelNaInstituicao,
  instituicaoDoUsuario,
  ehProprietario,
  proprietarios,
  auditar,
  json,
  erro,
  lerAmbiente,
} from "../_shared/db.ts";
import {
  resolveAccessState,
  effectivePriceCents,
  nextPeriodEnd,
  trialEndFrom,
  graceEndFrom,
  TRIAL_DAYS,
  FOUNDER_SLOTS,
} from "../_shared/subscription.ts";
import * as mp from "../_shared/mercadopago.ts";

const USUARIO_DO_TESTE_NAO_AUTENTICADO = {
  precisaLoginSupabase: true,
};

// ---------------------------------------------------------------------------
// Helpers de preço — SEMPRE a partir de `plans`
// ---------------------------------------------------------------------------

interface Plano {
  id: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  setup_fee_cents: number;
  max_active_students: number | null;
  max_units: number;
  features: Record<string, boolean>;
  is_active: boolean;
}

async function carregarPlano(admin: any, planId: string): Promise<Plano | null> {
  const { data } = await admin.from("plans").select("*").eq("id", planId).maybeSingle();
  return data ?? null;
}

/**
 * Valor do ciclo, em centavos, JÁ com desconto aplicado.
 *
 * O desconto vem de `subscriptions.discount_percent` (gravado pelo servidor
 * quando a escola fundadora entrou ou quando o proprietário concedeu). O
 * navegador nunca informa percentual.
 */
function valorDoCiclo(plano: Plano, ciclo: "monthly" | "annual", descontoPercent: number): number {
  const base = ciclo === "annual" ? plano.annual_price_cents : plano.monthly_price_cents;
  return effectivePriceCents({ discount_percent: descontoPercent, founder_discount: false }, base);
}

/** MRR de UMA assinatura: anual converte para equivalente mensal. */
function mrrDaAssinatura(plano: Plano, ciclo: string, descontoPercent: number): number {
  const valor = valorDoCiclo(plano, ciclo === "annual" ? "annual" : "monthly", descontoPercent);
  return ciclo === "annual" ? Math.round(valor / 12) : valor;
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      },
    });
  }

  const ambiente = lerAmbiente();
  if (!ambiente.configurado) {
    return erro(
      "O módulo financeiro não está configurado: falta SUPABASE_SERVICE_ROLE_KEY nas variáveis da função.",
      503,
      { faltando: ["SUPABASE_SERVICE_ROLE_KEY"] }
    );
  }

  const admin = clienteAdmin();
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/billing-api/, "") || "/";
  const auth = req.headers.get("Authorization");
  const usuario = await resolverUsuario(admin, auth);

  try {
    // ---------------- Público ----------------
    if (rota === "/public/diagnostico" && req.method === "GET") {
      return json({
        ...mp.diagnostico(),
        // Só informa SE existe proprietário configurado — nunca quais e-mails.
        proprietarioConfigurado: proprietarios().length > 0,
      });
    }

    if (rota === "/public/lead" && req.method === "POST") {
      return await registrarLead(admin, req);
    }

    // ---------------- Instituição ----------------
    if (rota.startsWith("/school/")) {
      if (!usuario) {
        return erro("Entre com a conta da instituição para ver a assinatura.", 401, USUARIO_DO_TESTE_NAO_AUTENTICADO);
      }
      const vinculo = await instituicaoDoUsuario(admin, usuario.id);
      if (!vinculo) {
        return erro(
          "Sua conta não está vinculada como responsável de nenhuma instituição. Peça ao Chefe Administrador para liberar o acesso.",
          403
        );
      }
      if (rota === "/school/me" && req.method === "GET") return await minhaAssinatura(admin, vinculo.school_id, usuario);
      if (rota === "/school/change-plan" && req.method === "POST") return await trocarPlano(admin, vinculo.school_id, usuario, req);
      if (rota === "/school/cancel" && req.method === "POST") return await cancelar(admin, vinculo.school_id, usuario, req);
      if (rota === "/school/pay" && req.method === "POST") return await pagar(admin, vinculo.school_id, usuario, req);
      return erro("Rota da instituição não encontrada.", 404);
    }

    // ---------------- Proprietário ----------------
    if (rota.startsWith("/owner/")) {
      if (!usuario) {
        return erro("Entre com a conta do proprietário para abrir o painel financeiro.", 401, USUARIO_DO_TESTE_NAO_AUTENTICADO);
      }
      if (!ehProprietario(usuario.email)) {
        return erro(
          "Esta área é exclusiva do proprietário da plataforma. Seu e-mail não está na lista de proprietários.",
          403
        );
      }
      if (rota === "/owner/overview" && req.method === "GET") return await visaoGeral(admin);
      if (rota.startsWith("/owner/plans/") && req.method === "PUT") {
        return await editarPlano(admin, decodeURIComponent(rota.replace("/owner/plans/", "")), usuario, req);
      }
      if (rota.startsWith("/owner/subscriptions/") && req.method === "PUT") {
        return await editarAssinatura(admin, decodeURIComponent(rota.replace("/owner/subscriptions/", "")), usuario, req);
      }
      if (rota === "/owner/payments/manual" && req.method === "POST") return await baixaManual(admin, usuario, req);
      if (rota.startsWith("/owner/partners/") && rota.endsWith("/status") && req.method === "PUT") {
        const id = decodeURIComponent(rota.replace("/owner/partners/", "").replace("/status", ""));
        return await revisarParceiro(admin, id, usuario, req);
      }
      if (rota.startsWith("/owner/leads/") && rota.endsWith("/status") && req.method === "PUT") {
        const id = Number(rota.replace("/owner/leads/", "").replace("/status", ""));
        return await moverLead(admin, id, usuario, req);
      }
      return erro("Rota do painel financeiro não encontrada.", 404);
    }

    return erro(`Rota desconhecida: ${rota}`, 404);
  } catch (err: any) {
    console.error("[billing-api] exceção:", err);
    return erro(`Falha ao processar a operação: ${err?.message || "erro interno"}`, 500);
  }
});

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

async function registrarLead(admin: any, req: Request): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  if (!corpo) return erro("Dados do formulário não foram recebidos.");

  const nome = String(corpo.name || "").trim();
  const email = String(corpo.email || "").trim().toLowerCase();
  if (nome.length < 2) return erro("Informe seu nome.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro("Informe um e-mail válido.");

  /*
    Um lead por e-mail. Reenviar não duplica a linha nem apaga a anterior: só
    atualiza o interesse. Assim a lista comercial não vira um monte de repetidos
    e o pedido "evitar ativações duplicadas" vale também aqui.
  */
  const { data: existente } = await admin
    .from("sales_leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  const registro = {
    name: nome,
    email,
    phone: corpo.phone ? String(corpo.phone).trim() : null,
    school_name: corpo.school_name ? String(corpo.school_name).trim() : null,
    city: corpo.city ? String(corpo.city).trim() : null,
    state: corpo.state ? String(corpo.state).trim().toUpperCase().slice(0, 2) : null,
    plan_interest: corpo.plan_interest ? String(corpo.plan_interest).trim() : null,
    notes: corpo.notes ? String(corpo.notes).trim().slice(0, 2000) : null,
    source: "site",
  };

  if (existente?.id) {
    await admin.from("sales_leads").update(registro).eq("id", existente.id);
    return json({ lead: { id: existente.id }, mensagem: "Recebemos seu contato. Já vamos falar com você." });
  }

  const { data, error } = await admin.from("sales_leads").insert([registro]).select("id").single();
  if (error) return erro(`Não foi possível registrar o contato: ${error.message}`, 500);

  await auditar(admin, {
    actor_email: email,
    actor_role: "visitante",
    action: "lead.criado",
    target_type: "sales_lead",
    target_id: String(data.id),
    metadata: { plan_interest: registro.plan_interest },
  });

  return json({ lead: { id: data.id }, mensagem: "Recebemos seu contato. Já vamos falar com você." });
}

// ---------------------------------------------------------------------------
// Instituição
// ---------------------------------------------------------------------------

async function carregarInscricao(admin: any, schoolId: string) {
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("school_id", schoolId)
    .in("status", ["trialing", "active", "past_due", "suspended"])
    .maybeSingle();
  return data;
}

async function minhaAssinatura(admin: any, schoolId: string, usuario: { id: string; email: string }): Promise<Response> {
  const { data: escola } = await admin
    .from("schools")
    .select("id, name, slug, is_founder")
    .eq("id", schoolId)
    .maybeSingle();

  const assinatura = await carregarInscricao(admin, schoolId);
  const acesso = resolveAccessState(assinatura as any);

  const [cobrancas, historico] = await Promise.all([
    admin
      .from("payment_transactions")
      .select("id, amount_cents, currency, kind, status, method, due_date, paid_at, created_at, provider")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("subscription_events")
      .select("id, event_type, from_status, to_status, actor_email, created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "school_admin",
    action: "assinatura.consultada",
    target_type: "school",
    target_id: schoolId,
  });

  return json({
    escola,
    assinatura,
    acesso,
    cobrancas: cobrancas.data ?? [],
    historico: historico.data ?? [],
  });
}

async function registrarEvento(
  admin: any,
  entrada: {
    subscription_id: string | null;
    school_id: string;
    event_type: string;
    de?: string | null;
    para?: string | null;
    payload?: Record<string, unknown>;
    actor_email: string;
  }
) {
  await admin.from("subscription_events").insert([
    {
      subscription_id: entrada.subscription_id,
      school_id: entrada.school_id,
      event_type: entrada.event_type,
      from_status: entrada.de ?? null,
      to_status: entrada.para ?? null,
      payload: entrada.payload ?? {},
      actor_email: entrada.actor_email,
    },
  ]);
}

async function trocarPlano(
  admin: any,
  schoolId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const papel = await papelNaInstituicao(admin, usuario.id, schoolId);
  // Troca de plano é decisão de contrato: só o administrador da escola.
  if (papel !== "school_admin") {
    return erro("Apenas o responsável administrativo da instituição pode alterar o plano.", 403);
  }

  const corpo = await req.json().catch(() => null);
  const planId = String(corpo?.plan_id || "").trim();
  const ciclo = corpo?.billing_cycle === "annual" ? "annual" : "monthly";
  if (!planId) return erro("Informe o plano desejado.");

  const plano = await carregarPlano(admin, planId);
  if (!plano || !plano.is_active) return erro("Este plano não está disponível.", 404);

  const atual = await carregarInscricao(admin, schoolId);

  // Unidades contratadas: o plano Rede permite 3, os outros 1. Recusar aqui
  // evita vender um plano que a instituição não consegue usar.
  const { count: unidades } = await admin
    .from("school_units")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "active");
  if ((unidades ?? 0) > plano.max_units) {
    return erro(
      `Sua instituição tem ${unidades} unidades ativas e o plano ${plano.name} cobre ${plano.max_units}. ` +
        `Escolha um plano maior ou encerre unidades.`
    );
  }

  if (!atual) {
    /*
      Primeira contratação: nasce em `trialing` (30 dias). O pedido diz que o
      teste é "até 30 dias" e que conversão é um evento separado — então trocar
      de plano durante o teste NÃO cobra nada ainda.
    */
    const agora = new Date();
    const { data, error } = await admin
      .from("subscriptions")
      .insert([
        {
          school_id: schoolId,
          plan_id: plano.id,
          status: "trialing",
          billing_cycle: ciclo,
          trial_started_at: agora.toISOString(),
          trial_ends_at: trialEndFrom(agora).toISOString(),
          current_period_start: agora.toISOString(),
          current_period_end: nextPeriodEnd(agora, ciclo).toISOString(),
          provider: mp.config().configurado ? "mercadopago" : "sandbox",
        },
      ])
      .select()
      .single();

    if (error) return erro(`Não foi possível criar a assinatura: ${error.message}`, 500);

    await registrarEvento(admin, {
      subscription_id: data.id,
      school_id: schoolId,
      event_type: "assinatura.criada",
      para: "trialing",
      payload: { plano: plano.id, ciclo, teste_dias: TRIAL_DAYS },
      actor_email: usuario.email,
    });
    await auditar(admin, {
      actor_email: usuario.email,
      actor_role: "school_admin",
      action: "assinatura.criada",
      target_type: "subscription",
      target_id: data.id,
      metadata: { plano: plano.id, ciclo },
    });

    return json({
      assinatura: data,
      mensagem: `Teste de ${TRIAL_DAYS} dias iniciado no plano ${plano.name}. Nenhuma cobrança foi feita.`,
    });
  }

  const desconto = Number(atual.discount_percent) || 0;
  const valor = valorDoCiclo(plano, ciclo, desconto);

  /*
    Mudança de plano entra em vigor imediatamente para o CONTRATO, mas a
    cobrança da diferença é decisão comercial. Aqui só registramos a cobrança
    do novo ciclo como `pending` — nada é marcado como pago.
  */
  const { data, error } = await admin
    .from("subscriptions")
    .update({
      plan_id: plano.id,
      billing_cycle: ciclo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", atual.id)
    .select()
    .single();

  if (error) return erro(`Não foi possível alterar o plano: ${error.message}`, 500);

  const agora = new Date();
  const { data: transacao } = await admin
    .from("payment_transactions")
    .insert([
      {
        school_id: schoolId,
        subscription_id: atual.id,
        provider: "sandbox",
        kind: "subscription",
        amount_cents: valor,
        status: "pending",
        due_date: agora.toISOString().slice(0, 10),
        idempotency_key: `plan-${atual.id}-${plano.id}-${ciclo}-${agora.toISOString().slice(0, 10)}`,
        metadata: { motivo: "troca_de_plano", plano_anterior: atual.plan_id, desconto_percent: desconto },
      },
    ])
    .select()
    .single();

  await registrarEvento(admin, {
    subscription_id: atual.id,
    school_id: schoolId,
    event_type: "plano.alterado",
    de: atual.plan_id,
    para: plano.id,
    payload: { ciclo, valor_cents: valor, cobranca: transacao?.id ?? null },
    actor_email: usuario.email,
  });
  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "school_admin",
    action: "plano.alterado",
    target_type: "subscription",
    target_id: atual.id,
    metadata: { de: atual.plan_id, para: plano.id, valor_cents: valor },
  });

  return json({
    assinatura: data,
    mensagem:
      `Plano alterado para ${plano.name} (${ciclo === "annual" ? "anual" : "mensal"}). ` +
      `A cobrança de ${(valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ` +
      `aguarda pagamento — o acesso não muda até a confirmação.`,
  });
}

async function cancelar(
  admin: any,
  schoolId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const papel = await papelNaInstituicao(admin, usuario.id, schoolId);
  if (papel !== "school_admin") {
    return erro("Apenas o responsável administrativo da instituição pode cancelar a assinatura.", 403);
  }

  const corpo = await req.json().catch(() => ({}));
  const atual = await carregarInscricao(admin, schoolId);
  if (!atual) return erro("Não há assinatura vigente para cancelar.", 404);
  if (atual.cancel_at_period_end) {
    return json({ assinatura: atual, mensagem: "A assinatura já estava marcada para encerrar no fim do período." });
  }

  /*
    Cancelamento NÃO corta o acesso agora e NÃO apaga dado nenhum: marca
    `cancel_at_period_end`. A instituição usa até o fim do que já contratou —
    exigência explícita do pedido. `status` só vira `canceled` quando o período
    terminar (rotina `billing-lifecycle`).
  */
  const { data, error } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      notes: corpo?.motivo ? String(corpo.motivo).slice(0, 1000) : atual.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", atual.id)
    .select()
    .single();

  if (error) return erro(`Não foi possível solicitar o cancelamento: ${error.message}`, 500);

  await registrarEvento(admin, {
    subscription_id: atual.id,
    school_id: schoolId,
    event_type: "cancelamento.solicitado",
    de: atual.status,
    para: atual.status,
    payload: { encerra_em: atual.current_period_end, motivo: corpo?.motivo ?? null },
    actor_email: usuario.email,
  });
  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "school_admin",
    action: "cancelamento.solicitado",
    target_type: "subscription",
    target_id: atual.id,
    metadata: { encerra_em: atual.current_period_end },
  });

  return json({
    assinatura: data,
    mensagem:
      "Cancelamento registrado. Sua instituição continua com acesso até o fim do período já contratado, " +
      "e nenhum dado escolar será apagado.",
  });
}

async function pagar(
  admin: any,
  schoolId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  const transacaoId = String(corpo?.transaction_id || "");
  const metodo = corpo?.method === "boleto" ? "boleto" : corpo?.method === "credit_card" ? "credit_card" : "pix";
  if (!transacaoId) return erro("Informe a cobrança a pagar.");

  const { data: transacao } = await admin
    .from("payment_transactions")
    .select("*")
    .eq("id", transacaoId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!transacao) return erro("Cobrança não encontrada para esta instituição.", 404);
  if (transacao.status === "paid") return json({ pagamento: { url: null, status: "paid", mensagem: "Esta cobrança já está paga." } });

  const cobranca = await mp.criarCobranca({
    valorCents: transacao.amount_cents,
    descricao: `eloEscola — ${transacao.kind} (${transacao.id.slice(0, 8)})`,
    metodo,
    emailPagador: usuario.email,
    referenciaExterna: transacao.id,
    tipo: transacao.kind,
  });

  // A transação só ganha link/status do provedor. Status `paid` continua vindo
  // exclusivamente do webhook — nunca desta resposta.
  await admin
    .from("payment_transactions")
    .update({
      provider: cobranca.chamouProvedor ? "mercadopago" : transacao.provider,
      provider_charge_id: cobranca.providerChargeId ?? transacao.provider_charge_id,
      method: metodo,
      status: cobranca.chamouProvedor ? "processing" : "pending",
      updated_at: new Date().toISOString(),
      metadata: {
        ...(transacao.metadata || {}),
        ultima_tentativa: new Date().toISOString(),
        erro_provedor: cobranca.erro,
      },
    })
    .eq("id", transacao.id);

  if (!cobranca.chamouProvedor) {
    return json({
      pagamento: {
        url: null,
        status: "pending",
        mensagem:
          "Cobrança registrada. O provedor de pagamento ainda não está configurado neste ambiente, " +
          "então não há link de pagamento — a equipe do eloEscola vai combinar a forma de pagamento com você.",
      },
    });
  }

  if (cobranca.erro) {
    return erro(`O provedor recusou a cobrança: ${cobranca.erro}`, 502);
  }

  return json({
    pagamento: {
      url: cobranca.urlPagamento,
      status: "processing",
      mensagem: "Cobrança criada no provedor. O acesso é liberado quando o pagamento for confirmado.",
    },
  });
}

// ---------------------------------------------------------------------------
// Proprietário
// ---------------------------------------------------------------------------

async function visaoGeral(admin: any): Promise<Response> {
  const [escolas, assinaturas, transacoes, planos, adicionais, parceiros, auditoria, leads] = await Promise.all([
    admin.from("schools").select("id, slug, name, status, is_founder"),
    admin.from("subscriptions").select("*"),
    admin.from("payment_transactions").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("plans").select("*").order("sort_order"),
    admin.from("plan_addons").select("*").order("sort_order"),
    admin.from("partners").select("*").order("created_at", { ascending: false }),
    admin.from("platform_audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("sales_leads").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const mapaPlanos = new Map<string, Plano>((planos.data ?? []).map((p: any) => [p.id, p as Plano]));
  const mapaEscolas = new Map<string, any>((escolas.data ?? []).map((e: any) => [e.id, e]));

  const subs = (assinaturas.data ?? []) as any[];
  const statusContagem = (s: string) => subs.filter((x) => x.status === s).length;

  /*
    MRR — receita recorrente CONTRATADA, não caixa recebido.
    Só assinaturas `active` entram. Anual é convertido para equivalente mensal.
    Não entra: taxa de implantação (única), treinamento (avulso), cobrança não
    paga (não é receita), teste (ainda não é contrato).
  */
  let mrr = 0;
  const assinaturasComPlano: any[] = [];
  for (const sub of subs) {
    const plano = mapaPlanos.get(sub.plan_id);
    const escola = mapaEscolas.get(sub.school_id);
    const desconto = Number(sub.discount_percent) || 0;
    const mensal = plano ? mrrDaAssinatura(plano, sub.billing_cycle, desconto) : 0;

    if (sub.status === "active" && plano) mrr += mensal;

    assinaturasComPlano.push({
      ...sub,
      school_name: escola?.name ?? null,
      school_slug: escola?.slug ?? null,
      plan_name: plano?.name ?? null,
      monthly_cents: mensal,
    });
  }

  const tx = (transacoes.data ?? []) as any[];
  const somaPor = (filtro: (t: any) => boolean) => tx.filter(filtro).reduce((acc, t) => acc + (t.amount_cents || 0), 0);

  const recebidos = somaPor((t) => t.status === "paid");
  const pendentes = somaPor((t) => t.status === "pending" || t.status === "processing");

  return json({
    indicadores: {
      instituicoesContratantes: new Set(subs.map((s) => s.school_id)).size,
      assinaturasAtivas: statusContagem("active"),
      assinaturasEmTeste: statusContagem("trialing"),
      assinaturasVencidas: statusContagem("past_due") + statusContagem("expired"),
      assinaturasCanceladas: statusContagem("canceled"),
      receitaRecorrenteMensalCents: mrr,
      receitaRecorrenteAnualizadaCents: mrr * 12,
      pagamentosRecebidosCents: recebidos,
      pagamentosPendentesCents: pendentes,
      taxasImplantacaoRecebidasCents: somaPor((t) => t.status === "paid" && t.kind === "setup"),
      adicionaisVendidosCents: somaPor((t) => t.status === "paid" && t.kind === "addon"),
    },
    assinaturas: assinaturasComPlano,
    cobrancas: tx.map((t) => ({ ...t, school_name: mapaEscolas.get(t.school_id)?.name ?? null })),
    planos: planos.data ?? [],
    adicionais: adicionais.data ?? [],
    parceiros: parceiros.data ?? [],
    auditoria: auditoria.data ?? [],
    leads: leads.data ?? [],
    cobranca: mp.diagnostico(),
  });
}

async function editarPlano(
  admin: any,
  planId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  if (!corpo) return erro("Dados do plano não foram recebidos.");

  const { data: anterior } = await admin.from("plans").select("*").eq("id", planId).maybeSingle();
  if (!anterior) return erro("Plano não encontrado.", 404);

  /*
    Preço em centavos, inteiro e não negativo. O `annual_price_cents` NÃO é
    recalculado automaticamente: o desconto anual é decisão comercial e o
    proprietário pode querer outro percentual. A UI mostra a economia.
  */
  const mudancas: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const inteiroNaoNegativo = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

  if (corpo.monthly_price_cents !== undefined) {
    if (!inteiroNaoNegativo(corpo.monthly_price_cents)) return erro("Preço mensal deve ser um número inteiro de centavos.");
    mudancas.monthly_price_cents = corpo.monthly_price_cents;
  }
  if (corpo.annual_price_cents !== undefined) {
    if (!inteiroNaoNegativo(corpo.annual_price_cents)) return erro("Preço anual deve ser um número inteiro de centavos.");
    mudancas.annual_price_cents = corpo.annual_price_cents;
  }
  if (corpo.setup_fee_cents !== undefined) {
    if (!inteiroNaoNegativo(corpo.setup_fee_cents)) return erro("Taxa de implantação inválida.");
    mudancas.setup_fee_cents = corpo.setup_fee_cents;
  }
  if (corpo.max_active_students !== undefined) {
    mudancas.max_active_students = corpo.max_active_students === null ? null : Number(corpo.max_active_students);
  }
  if (corpo.max_units !== undefined) mudancas.max_units = Number(corpo.max_units);
  if (corpo.is_active !== undefined) mudancas.is_active = Boolean(corpo.is_active);
  if (corpo.is_public !== undefined) mudancas.is_public = Boolean(corpo.is_public);
  if (corpo.tagline !== undefined) mudancas.tagline = String(corpo.tagline).slice(0, 200);

  const { data, error } = await admin.from("plans").update(mudancas).eq("id", planId).select().single();
  if (error) return erro(`Não foi possível salvar o plano: ${error.message}`, 500);

  /*
    Registro obrigatório da mudança: alterar preço mexe em contrato futuro e
    possivelmente em contrato vigente. O pedido exige "não modificar
    retroativamente contratos vigentes sem registro", e é exatamente isto.
  */
  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "proprietario",
    action: "plano.atualizado",
    target_type: "plan",
    target_id: planId,
    metadata: { antes: anterior, depois: mudancas },
  });

  return json({ plan: data });
}

async function editarAssinatura(
  admin: any,
  subscriptionId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  const { data: anterior } = await admin.from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
  if (!anterior) return erro("Assinatura não encontrada.", 404);

  const mudancas: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const STATUS = ["trialing", "active", "past_due", "suspended", "canceled", "expired"];

  if (corpo.status !== undefined) {
    if (!STATUS.includes(corpo.status)) return erro("Status de assinatura inválido.");
    mudancas.status = corpo.status;
    // Reativar zera a marca de cancelamento — senão a rotina encerraria de novo.
    if (corpo.status === "active") {
      mudancas.cancel_at_period_end = false;
      mudancas.canceled_at = null;
      mudancas.grace_until = null;
      const agora = new Date();
      mudancas.current_period_start = agora.toISOString();
      mudancas.current_period_end = nextPeriodEnd(agora, (anterior.billing_cycle || "monthly") as any).toISOString();
    }
    if (corpo.status === "past_due" && !anterior.grace_until) {
      const venc = anterior.current_period_end ? new Date(anterior.current_period_end) : new Date();
      mudancas.grace_until = graceEndFrom(venc).toISOString();
    }
  }
  if (corpo.plan_id !== undefined) {
    const plano = await carregarPlano(admin, String(corpo.plan_id));
    if (!plano) return erro("Plano informado não existe.", 404);
    mudancas.plan_id = plano.id;
  }
  if (corpo.billing_cycle !== undefined) {
    mudancas.billing_cycle = corpo.billing_cycle === "annual" ? "annual" : "monthly";
  }
  if (corpo.discount_percent !== undefined) {
    const pct = Number(corpo.discount_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return erro("Desconto deve ficar entre 0 e 100%.");
    mudancas.discount_percent = pct;
    // Desconto sem prazo é desconto eterno — quase sempre um erro de digitação.
    if (pct > 0 && !anterior.discount_until && !anterior.founder_discount) {
      const fim = new Date();
      fim.setUTCFullYear(fim.getUTCFullYear() + 1);
      mudancas.discount_until = fim.toISOString();
    }
  }
  if (corpo.notes !== undefined) mudancas.notes = String(corpo.notes).slice(0, 2000);

  const { data, error } = await admin.from("subscriptions").update(mudancas).eq("id", subscriptionId).select().single();
  if (error) return erro(`Não foi possível salvar a assinatura: ${error.message}`, 500);

  await registrarEvento(admin, {
    subscription_id: subscriptionId,
    school_id: anterior.school_id,
    event_type: "assinatura.ajustada_pelo_proprietario",
    de: anterior.status,
    para: (mudancas.status as string) ?? anterior.status,
    payload: mudancas,
    actor_email: usuario.email,
  });
  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "proprietario",
    action: "assinatura.atualizada",
    target_type: "subscription",
    target_id: subscriptionId,
    metadata: { antes: anterior, depois: mudancas },
  });

  return json({ inscricao: data });
}

async function baixaManual(admin: any, usuario: { id: string; email: string }, req: Request): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  const schoolId = String(corpo?.school_id || "");
  const valor = Number(corpo?.amount_cents);
  const tipo = ["subscription", "setup", "addon", "partner_campaign", "partner_directory", "manual"].includes(corpo?.kind)
    ? corpo.kind
    : "manual";

  if (!schoolId) return erro("Informe a instituição.");
  if (!Number.isInteger(valor) || valor <= 0) return erro("Valor deve ser um inteiro de centavos maior que zero.");

  const { data: escola } = await admin.from("schools").select("id, name").eq("id", schoolId).maybeSingle();
  if (!escola) return erro("Instituição não encontrada.", 404);

  const inscricao = await carregarInscricao(admin, schoolId);

  const { data, error } = await admin
    .from("payment_transactions")
    .insert([
      {
        school_id: schoolId,
        subscription_id: inscricao?.id ?? null,
        provider: "manual",
        kind: tipo,
        amount_cents: valor,
        status: "paid",
        paid_at: new Date().toISOString(),
        due_date: corpo?.due_date || new Date().toISOString().slice(0, 10),
        idempotency_key: `manual-${schoolId}-${Date.now()}`,
        metadata: { registrado_por: usuario.email, observacao: corpo?.notes ?? null },
      },
    ])
    .select()
    .single();

  if (error) return erro(`Não foi possível registrar o pagamento: ${error.message}`, 500);

  // Baixa manual de mensalidade coloca a assinatura em dia.
  if (inscricao && tipo === "subscription" && inscricao.status !== "active") {
    const agora = new Date();
    await admin
      .from("subscriptions")
      .update({
        status: "active",
        last_payment_at: agora.toISOString(),
        grace_until: null,
        current_period_start: agora.toISOString(),
        current_period_end: nextPeriodEnd(agora, (inscricao.billing_cycle || "monthly") as any).toISOString(),
        updated_at: agora.toISOString(),
      })
      .eq("id", inscricao.id);

    await registrarEvento(admin, {
      subscription_id: inscricao.id,
      school_id: schoolId,
      event_type: "pagamento.manual",
      de: inscricao.status,
      para: "active",
      payload: { valor_cents: valor },
      actor_email: usuario.email,
    });
  }

  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "proprietario",
    action: "pagamento.manual",
    target_type: "payment_transaction",
    target_id: data.id,
    metadata: { school_id: schoolId, valor_cents: valor, kind: tipo },
  });

  return json({ transacao: data });
}

async function revisarParceiro(
  admin: any,
  partnerId: string,
  usuario: { id: string; email: string },
  req: Request
): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  const status = String(corpo?.status || "");
  if (!["approved", "rejected", "suspended"].includes(status)) return erro("Status de parceiro inválido.");

  const { data: anterior } = await admin.from("partners").select("*").eq("id", partnerId).maybeSingle();
  if (!anterior) return erro("Parceiro não encontrado.", 404);

  const mudancas: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (corpo?.directory_paid_until !== undefined) mudancas.directory_paid_until = corpo.directory_paid_until || null;

  const { data, error } = await admin.from("partners").update(mudancas).eq("id", partnerId).select().single();
  if (error) return erro(`Não foi possível atualizar o parceiro: ${error.message}`, 500);

  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "proprietario",
    action: `parceiro.${status}`,
    target_type: "partner",
    target_id: partnerId,
    metadata: { antes: anterior.status, depois: status },
  });

  return json({ parceiro: data });
}

async function moverLead(admin: any, leadId: number, usuario: { id: string; email: string }, req: Request): Promise<Response> {
  const corpo = await req.json().catch(() => null);
  const status = String(corpo?.status || "");
  if (!["novo", "contatado", "negociando", "convertido", "descartado"].includes(status)) {
    return erro("Status de lead inválido.");
  }

  const { data, error } = await admin.from("sales_leads").update({ status }).eq("id", leadId).select().single();
  if (error) return erro(`Não foi possível atualizar o lead: ${error.message}`, 500);

  await auditar(admin, {
    actor_email: usuario.email,
    actor_role: "proprietario",
    action: "lead.status",
    target_type: "sales_lead",
    target_id: String(leadId),
    metadata: { status },
  });

  return json({ lead: data });
}
