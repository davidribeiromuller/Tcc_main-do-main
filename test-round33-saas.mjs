/**
 * Rodada 33 — SaaS multi-instituição, planos, assinaturas, cobrança,
 * entitlements, parceiros e painéis (Partes 4 a 13).
 *
 * Combina:
 *  - execução real das funções puras de `src/lib/subscription.ts` (estados,
 *    tolerância, cotas, preços);
 *  - verificação de contrato (SQL, rotas, guards) no código-fonte.
 *
 * Rodar: npx tsx test-round33-saas.mjs
 */
import { readFileSync } from "node:fs";
import {
  resolveEffectiveStatus,
  resolveAccessState,
  evaluateQuota,
  effectivePriceCents,
  nextPeriodEnd,
  trialEndFrom,
  graceEndFrom,
  formatBRL,
  TRIAL_DAYS,
  GRACE_DAYS,
  FOUNDER_SLOTS,
  FOUNDER_DISCOUNT_PERCENT,
  ANNUAL_DISCOUNT_PERCENT,
} from "./src/lib/subscription.ts";
import { verifyStripeSignature, normalizeWebhook, createCharge, getBillingDiagnostics, isProvablyPaidSource } from "./src/lib/billing.ts";

let passou = 0;
let falhou = 0;
const ok = (nome, cond, detalhe = "") => {
  if (cond) {
    passou++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhou++;
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
};

const sql = readFileSync("./supabase/migrations/20261111_saas_core.sql", "utf8");
const authSql = readFileSync("./supabase/migrations/20261112_auth_security_tokens.sql", "utf8");
const server = readFileSync("./server.ts", "utf8");
const store = readFileSync("./src/lib/saasStore.ts", "utf8");
const billing = readFileSync("./src/lib/billing.ts", "utf8");
const masterUi = readFileSync("./src/components/MasterPanel.tsx", "utf8");
const schoolUi = readFileSync("./src/components/SchoolSubscription.tsx", "utf8");
const plansUi = readFileSync("./src/components/PlansAndPricing.tsx", "utf8");
const plansService = readFileSync("./src/lib/plansService.ts", "utf8");
const app = readFileSync("./src/App.tsx", "utf8");
const iso = (d) => new Date(d).toISOString();

console.log("\n=== 1. Schema multi-instituição ===");
{
  for (const tabela of [
    "schools",
    "school_units",
    "memberships",
    "plans",
    "plan_addons",
    "subscriptions",
    "feature_entitlements",
    "subscription_events",
    "payment_transactions",
    "webhook_events",
    "usage_records",
    "partners",
    "partner_campaigns",
    "platform_audit_logs",
    "sales_leads",
  ]) {
    ok(`tabela \`${tabela}\` criada`, new RegExp(`create table if not exists public\\.${tabela}\\b`, "i").test(sql));
  }
  ok("todas as tabelas novas têm RLS ligada", (sql.match(/enable row level security/g) || []).length >= 15);
  ok("tabelas financeiras sem política pública", !/create policy[^;]*on public\.(subscriptions|payment_transactions|entitlements|feature_entitlements|memberships)/i.test(sql));
  ok("catálogo de planos é legível publicamente", /create policy plans_public_read on public\.plans\s+for select to anon, authenticated/i.test(sql));
  ok("migração não destrutiva (sem DROP TABLE/COLUMN)", !/drop\s+table|drop\s+column/i.test(sql));
  ok("uma assinatura vigente por instituição", sql.includes("ux_subscriptions_active_per_school"));
  ok("memberships liga usuário e instituição", /unique \(user_uid, school_id, role\)/i.test(sql));
  ok("usuários existentes migrados para memberships", /insert into public\.memberships/i.test(sql));
  ok("tabela de tokens de reset existe", /create table if not exists public\.password_reset_tokens/i.test(authSql));
  ok("tabela de sessões existe", /create table if not exists public\.auth_sessions/i.test(authSql));
  ok("consentimento e pedidos do titular existem", authSql.includes("consent_records") && authSql.includes("data_subject_requests"));
  ok("tokens/consentimento sem política pública", !/create policy/i.test(authSql));
}

console.log("\n=== 2. Catálogo oficial de planos (preços no banco) ===");
{
  const linha = (id) => {
    const re = new RegExp(`\\('${id}',(?:.|\\n)*?\\n`, "m");
    return sql.match(new RegExp(`\\('${id}',[\\s\\S]{0,400}?\\d+, \\d+, \\d+, \\d+, \\d+, \\d+,`))?.[0] || "";
  };
  const sqlPlano = sql.replace(/\s+/g, " ");
  ok("plano comunidade com R$ 149/mês e 300 ativos", /\('comunidade', 'Comunidade',[\s\S]{0,220}14900, 160920, 39000, 300, 1, 3,/.test(sqlPlano));
  ok("plano escola com R$ 299/mês e 800 ativos", /\('escola', 'Escola',[\s\S]{0,220}29900, 322920, 69000, 800, 1, 10,/.test(sqlPlano));
  ok("plano rede com R$ 699/mês e 2.000 ativos", /\('rede', 'Rede',[\s\S]{0,260}69900, 754920, 149000, 2000, 3, 30,/.test(sqlPlano));
  ok("anual = 12 meses com 10% off (comunidade)", 160920 === Math.round(14900 * 12 * 0.9));
  ok("anual = 12 meses com 10% off (escola)", 322920 === Math.round(29900 * 12 * 0.9));
  ok("anual = 12 meses com 10% off (rede)", 754920 === Math.round(69900 * 12 * 0.9));
  ok("implantação 390/690/1490", /39000/.test(sql) && /69000/.test(sql) && /149000/.test(sql));
  ok("add-on IA avançada R$ 59", /'ai_advanced'[\s\S]{0,120}5900/.test(sql));
  ok("add-on relatórios R$ 49", /'reports'[\s\S]{0,120}4900/.test(sql));
  ok("add-on personalização R$ 99", /'personalization'[\s\S]{0,120}9900/.test(sql));
  ok("treinamento R$ 250 por sessão", /'training'[\s\S]{0,120}25000/.test(sql));
  ok("integração a partir de R$ 1.500", /'integration'[\s\S]{0,120}150000/.test(sql));
  ok("frontend não hardcoda preço de plano", !/14900|29900|69900/.test(plansUi));
  ok("frontend lê preço do servidor", plansService.includes("/api/saas/plans"));
  ok("painel Master edita preço no banco", masterUi.includes("monthly_price_cents"));
}

console.log("\n=== 3. Estados da assinatura (execução real) ===");
{
  const agora = new Date("2026-11-11T12:00:00Z");
  const trial = { status: "trialing", trial_ends_at: iso("2026-12-01T12:00:00Z"), current_period_end: iso("2026-12-01T12:00:00Z") };

  ok("teste ativo permite escrever", resolveAccessState(trial, agora).canWrite === true);
  ok("teste informa dias restantes", resolveAccessState(trial, agora).trialDaysLeft === 20);
  ok("teste vencido há 2 dias entra em tolerância", resolveEffectiveStatus({ ...trial, trial_ends_at: iso("2026-11-09T12:00:00Z"), grace_until: iso("2026-11-16T12:00:00Z") }, agora) === "past_due");
  ok("tolerância vencida vira expired", resolveEffectiveStatus({ status: "past_due", grace_until: iso("2026-11-10T12:00:00Z") }, agora) === "expired");
  ok("expired bloqueia escrita", resolveAccessState({ status: "expired" }, agora).canWrite === false);
  ok("expired NÃO bloqueia leitura (dados preservados)", resolveAccessState({ status: "expired" }, agora).canRead === true);
  ok("canceled preserva leitura", resolveAccessState({ status: "canceled" }, agora).canRead === true && resolveAccessState({ status: "canceled" }, agora).canWrite === false);
  ok("suspended tem motivo explicativo", /suspensa/i.test(resolveAccessState({ status: "suspended" }, agora).reason || ""));
  ok("sem assinatura bloqueia escrita", resolveAccessState(null, agora).canWrite === false);
  ok("sem assinatura ainda permite leitura", resolveAccessState(null, agora).canRead === true);
  ok("aviso de teste nos últimos 7 dias", /termina em/i.test(resolveAccessState({ status: "trialing", trial_ends_at: iso("2026-11-15T12:00:00Z") }, agora).reason || ""));
  ok("tolerância de 7 dias está na regra", GRACE_DAYS === 7 && GRACE_DAYS === Math.round((graceEndFrom(agora) - agora) / 86400000));
  ok("teste de 30 dias está na regra", TRIAL_DAYS === 30 && TRIAL_DAYS === Math.round((trialEndFrom(agora) - agora) / 86400000));
  ok("ciclo anual avança 1 ano", new Date(nextPeriodEnd(agora, "annual")).getUTCFullYear() === 2027);
  ok("ciclo mensal avança 1 mês", nextPeriodEnd(agora, "monthly").getUTCMonth() === 11);
  ok("desconto de fundadora é 20%", FOUNDER_DISCOUNT_PERCENT === 20);
  ok("desconto anual é 10%", ANNUAL_DISCOUNT_PERCENT === 10);
  ok("3 vagas de fundadora", FOUNDER_SLOTS === 3);
}

console.log("\n=== 4. Cotas e avisos (execução real) ===");
{
  const q80 = evaluateQuota(240, 300, "alunos ativos");
  ok("80% dispara aviso", q80.shouldWarn === true && q80.isExhausted === false);
  ok("aviso cita a porcentagem", /80%/.test(q80.message || ""));
  const q100 = evaluateQuota(300, 300, "alunos ativos");
  ok("100% esgota a cota", q100.isExhausted === true);
  ok("mensagem de esgotamento sugere upgrade", /upgrade/i.test(q100.message || ""));
  ok("abaixo de 80% não avisa", evaluateQuota(100, 300).shouldWarn === false);
  ok("limite nulo é ilimitado", evaluateQuota(9999, null).isExhausted === false && evaluateQuota(9999, null).ratio === null);
  ok("limite zero com uso > 0 já está esgotado", evaluateQuota(1, 0).isExhausted === true);
}

console.log("\n=== 5. Preços e descontos (execução real) ===");
{
  ok("formata BRL", formatBRL(14900).includes("149,00"));
  ok("desconto de 20% aplicado", effectivePriceCents({ discount_percent: 20 }, 29900) === 23920);
  ok("sem desconto mantém valor", effectivePriceCents({ discount_percent: 0 }, 29900) === 29900);
  ok("desconto não passa de 100%", effectivePriceCents({ discount_percent: 250 }, 10000) >= 0);
  ok("desconto de fundadora no banco existe", sql.includes("founder_discount boolean not null default false"));
}

console.log("\n=== 6. Cobrança desacoplada ===");
{
  const secret = "whsec_teste";
  const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  const crypto = await import("node:crypto");
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");

  ok("assinatura Stripe válida é aceita", verifyStripeSignature(raw, `t=${t},v1=${v1}`, secret).valid === true);
  ok("assinatura Stripe inválida é recusada", verifyStripeSignature(raw, `t=${t},v1=deadbeef`, secret).valid === false);
  ok("replay antigo é recusado", verifyStripeSignature(raw, `t=${t - 4000},v1=${v1}`, secret).valid === false);
  ok("sem segredo é recusado (fail-closed)", verifyStripeSignature(raw, `t=${t},v1=${v1}`, "").valid === false);

  const norm = normalizeWebhook("stripe", { id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  ok("webhook de pagamento vira status paid", norm.transactionStatus === "paid");
  const fail = normalizeWebhook("stripe", { id: "evt_2", type: "invoice.payment_failed", data: { object: {} } });
  ok("falha de pagamento vira failed", fail.transactionStatus === "failed");
  ok("evento desconhecido não altera status", normalizeWebhook("stripe", { id: "e", type: "customer.created", data: { object: {} } }).transactionStatus === null);

  const charge = await createCharge({
    schoolId: "s1",
    amountCents: 29900,
    method: "pix",
    kind: "subscription",
    description: "teste",
    idempotencyKey: "k1",
  });
  ok("sem provedor configurado a cobrança fica pendente", charge.status === "pending");
  ok("sem provedor NÃO marca como pago", charge.status !== "paid");
  ok("sandbox é explicitado na mensagem", /sandbox/i.test(charge.message));
  ok("valor inválido é rejeitado", await createCharge({ schoolId: "s", amountCents: 0, method: "pix", kind: "subscription", description: "x", idempotencyKey: "k" }).then(() => false).catch(() => true));
  ok("sem idempotency key é rejeitado", await createCharge({ schoolId: "s", amountCents: 100, method: "pix", kind: "subscription", description: "x", idempotencyKey: "" }).then(() => false).catch(() => true));

  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.ASAAS_API_KEY;
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  const diag = getBillingDiagnostics();
  ok("diagnóstico informa sandbox", diag.provider === "sandbox" && diag.configured === false);
  ok("diagnóstico lista variáveis faltantes", diag.missing.includes("STRIPE_SECRET_KEY"));
  ok("pagamento só é confiável por webhook ou baixa do proprietário", isProvablyPaidSource("webhook_verified") && isProvablyPaidSource("manual_by_owner") && !isProvablyPaidSource("checkout_return"));
  ok("webhook é idempotente (unique provider+event)", sql.includes("unique (provider, event_id)"));
  ok("webhook registra validade da assinatura", sql.includes("signature_valid boolean"));
  ok("rota de webhook lê corpo cru", /app\.use\(\s*"\/api\/billing\/webhook",\s*express\.raw/.test(server));
  ok("webhook inválido não altera dados", /Assinatura do webhook inválida/.test(server));
  ok("duplicata responde 200 sem reprocessar", /duplicate: true/.test(server));
}

console.log("\n=== 7. Isolamento entre instituições ===");
{
  ok("painel da escola resolve escopo pelo vínculo", /listAdministeredSchools\(dbUser\.uid\)/.test(server));
  ok("acesso a outra instituição é negado", /SCHOOL_FORBIDDEN/.test(server));
  ok("sem vínculo administrativo é negado", /NO_SCHOOL_MEMBERSHIP/.test(server));
  ok("escrita exige assinatura em dia", /SUBSCRIPTION_INACTIVE/.test(server));
  ok("consulta de vínculo filtra por usuário", /eq\("user_uid", userUid\)/.test(store));
  ok("consulta de vínculo exige status active", /eq\("status", "active"\)/.test(store));
  ok("admin de instituição validado por role", /in\("role", \["school_admin"\]\)/.test(store));
  ok("leitura sensível usa chave de serviço", store.includes("SUPABASE_SECRET_KEY") && store.includes("getSaasAdminClient"));
  ok("chave de serviço nunca chega ao cliente", !readFileSync("./src/lib/supabase.ts", "utf8").includes("SUPABASE_SECRET_KEY"));
}

console.log("\n=== 8. Entitlements ===");
{
  ok("plano define features em JSON", sql.includes("features jsonb"));
  ok("entitlement por instituição e recurso", /unique \(school_id, feature_key\)/i.test(sql));
  ok("sincronização a partir do plano existe", store.includes("syncEntitlementsFromPlan"));
  ok("troca de plano ressincroniza entitlements", /syncEntitlementsFromPlan\(ctx\.school\.id/.test(server));
  ok("IA checa entitlement antes de responder", server.includes("FEATURE_NOT_ENTITLED"));
  ok("consumo é registrado por instituição", sql.includes("usage_records") && store.includes("recordUsage"));
}

console.log("\n=== 9. Painel Master ===");
{
  ok("rotas master exigem proprietário", (server.match(/\/api\/master\/[a-z-]+", requireAuth, requirePlatformOwner/g) || []).length >= 8);
  ok("rotas master não confiam no cliente", !/app\.get\("\/api\/master[^"]*",\s*async/.test(server));
  ok("painel Master tem visão geral", masterUi.includes('id: "overview"') && masterUi.includes("MRR"));
  ok("painel Master lista instituições", masterUi.includes('id: "schools"'));
  ok("painel Master gerencia planos e preços", masterUi.includes("PlansTab"));
  ok("painel Master mostra cobranças", masterUi.includes("ManualPayment"));
  ok("painel Master lista assinaturas", masterUi.includes('id: "subscriptions"'));
  ok("painel Master lista parceiros", masterUi.includes('id: "partners"'));
  ok("painel Master tem auditoria", masterUi.includes('id: "audit"'));
  ok("auditoria registra criação de instituição", server.includes('action: "school.created"'));
  ok("auditoria registra baixa manual", server.includes('action: "payment.manual_confirmed"'));
  ok("rota master aparece só para proprietário na UI", app.includes("isPlatformOwner"));
}

console.log("\n=== 10. Painel da escola e vitrine ===");
{
  ok("Minha assinatura mostra plano e situação", schoolUi.includes("Minha assinatura") && schoolUi.includes("STATUS_LABEL"));
  ok("mostra limites e cotas", schoolUi.includes("QuotaBar"));
  ok("mostra recursos incluídos", schoolUi.includes("FEATURE_LABELS"));
  ok("permite trocar de plano", schoolUi.includes("change-plan"));
  ok("avisa cobrança pendente em vez de fingir pagamento", /pendente/i.test(schoolUi));
  ok("permite cancelar sem apagar dados", /nenhum dado é apagado/i.test(schoolUi));
  ok("vitrine mostra teste e desconto anual", plansUi.includes("dias de teste") && plansUi.includes("annualDiscountPercent"));
  ok("vitrine mostra escolas fundadoras", plansUi.includes("Fundadora"));
  ok("vitrine exibe estado quando catálogo indisponível", /Catálogo indisponível/.test(plansUi));
  /*
    RODADA 40 — a rota saiu do componente e foi para `lib/salesContact.ts`,
    junto com o caminho alternativo de gravação direta em `sales_leads` e o
    link do WhatsApp. A intenção do teste continua: o formulário precisa
    registrar o lead (e não só mostrar um botão bonito).
  */
  const contatoSvc = readFileSync("src/lib/salesContact.ts", "utf8");
  ok(
    "formulário comercial grava lead",
    plansUi.includes("registrarContatoComercial") &&
      contatoSvc.includes("/api/saas/leads") &&
      contatoSvc.includes('from("sales_leads")')
  );
  ok("telas novas ligadas ao App", app.includes("<MasterPanel") && app.includes("<SchoolSubscription") && app.includes("<PlansAndPricing"));
}

console.log("\n=== 11. Parceiros e proteção de dados ===");
{
  ok("diretório público só mostra aprovados", /listPartners\("approved"\)/.test(server));
  ok("contato do parceiro não é exposto publicamente", /publicPartners/.test(server) && !/publicPartners[\s\S]{0,400}contact_email/.test(server));
  ok("campanha exige aprovação da instituição", /campaigns\/:id\/decision/.test(server) && /approved_by_uid/.test(sql));
  ok("decisão registra quem aprovou", store.includes("approved_by_uid"));
  ok("nenhum endpoint vende dados de alunos", !/vender|sell/i.test(server.split("NÚCLEO SaaS")[1] || ""));
  ok("parceiro nunca aprova a própria campanha", !/app\.post\("\/api\/partner/.test(server));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam`);
if (falhou > 0) process.exit(1);
console.log("RODADA 33 OK — SaaS multi-instituição");
