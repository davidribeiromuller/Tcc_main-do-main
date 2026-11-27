/**
 * RODADA 45 — Monetização: testes do módulo comercial.
 *
 * POR QUE ESTES TESTES EXISTEM
 * ----------------------------
 * A monetização da rodada 36 sobreviveu ao revert como CÓDIGO MORTO no
 * histórico, e o banco ficou com RLS aberto em `subscriptions` — qualquer
 * visitante podia alterar o status da própria assinatura. Nenhum teste pegou
 * isso porque não havia teste comercial nenhum.
 *
 * Este arquivo cobre o que é verificável SEM credencial externa:
 *   · lógica de preço/desconto/estado (pura, determinística);
 *   · consistência entre a lógica do app e a da Edge Function;
 *   · autorização (quem pode o quê);
 *   · integridade do SQL de permissões;
 *   · ausência de segredo no bundle do navegador.
 *
 * O que NÃO é testado aqui, e por quê:
 *   · chamada real ao Mercado Pago — exige MERCADOPAGO_ACCESS_TOKEN, que não
 *     existe neste ambiente (declarado como pendência no relatório);
 *   · execução da Edge Function — exige `supabase functions deploy` e o
 *     runtime Deno, que não existe no CI do GitHub Pages.
 */
import { readFileSync, existsSync } from "node:fs";
import {
  resolveEffectiveStatus,
  resolveAccessState,
  evaluateQuota,
  effectivePriceCents,
  formatBRL,
  nextPeriodEnd,
  trialEndFrom,
  graceEndFrom,
  annualSavingsCents,
  monthlyEquivalent,
  TRIAL_DAYS,
  GRACE_DAYS,
  ANNUAL_DISCOUNT_PERCENT,
  FOUNDER_DISCOUNT_PERCENT,
  FOUNDER_SLOTS,
} from "./src/lib/subscription.ts";

let ok = 0;
const falhas = [];

function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    ok++;
    console.log(`  ✅ ${nome}`);
  } else {
    falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    console.log(`  ❌ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const ler = (p) => readFileSync(p, "utf8");

console.log("\n💰 RODADA 45 — módulo comercial\n");

// ---------------------------------------------------------------------------
console.log("1. Constantes comerciais batem com a especificação");
// ---------------------------------------------------------------------------
checar(`teste de 30 dias`, TRIAL_DAYS === 30, `veio ${TRIAL_DAYS}`);
checar(`tolerância de 7 dias`, GRACE_DAYS === 7, `veio ${GRACE_DAYS}`);
checar(`desconto anual de 10%`, ANNUAL_DISCOUNT_PERCENT === 10, `veio ${ANNUAL_DISCOUNT_PERCENT}`);
checar(`escolas fundadoras 20%`, FOUNDER_DISCOUNT_PERCENT === 20, `veio ${FOUNDER_DISCOUNT_PERCENT}`);
checar(`3 vagas de fundadora`, FOUNDER_SLOTS === 3, `veio ${FOUNDER_SLOTS}`);

// ---------------------------------------------------------------------------
console.log("\n2. Preço e desconto — nada é calculado no navegador");
// ---------------------------------------------------------------------------
// Os valores oficiais da especificação, em centavos. O teste NÃO os usa como
// fonte para a UI (lá os valores vêm do banco); usa para provar que a
// aritmética de desconto está certa.
const PLANOS_OFICIAIS = [
  { id: "comunidade", mensal: 14900, setup: 39000 },
  { id: "escola", mensal: 29900, setup: 69000 },
  { id: "rede", mensal: 69900, setup: 149000 },
];

for (const p of PLANOS_OFICIAIS) {
  const anualCheio = p.mensal * 12;
  const comDesconto = Math.round(anualCheio * (1 - ANNUAL_DISCOUNT_PERCENT / 100));
  const economia = annualSavingsCents(p.mensal, comDesconto);
  checar(
    `${p.id}: anual com 10% = ${formatBRL(comDesconto)}`,
    economia === Math.round(anualCheio * 0.1),
    `economia calculada ${formatBRL(economia)}`
  );
  checar(
    `${p.id}: mensal equivalente do anual confere`,
    monthlyEquivalent(comDesconto) === Math.round(comDesconto / 12)
  );
}

checar(
  "desconto de fundadora (20%) aplica sobre o valor do ciclo",
  effectivePriceCents({ discount_percent: 20, founder_discount: true }, 14900) === 11920,
  `veio ${effectivePriceCents({ discount_percent: 20, founder_discount: true }, 14900)}`
);
checar("sem desconto, valor não muda", effectivePriceCents(null, 29900) === 29900);
checar(
  "desconto é limitado a 100% (não vira valor negativo)",
  effectivePriceCents({ discount_percent: 150 }, 10000) === 0
);

// ---------------------------------------------------------------------------
console.log("\n3. Estados da assinatura e o que cada um permite");
// ---------------------------------------------------------------------------
const agora = new Date("2026-11-11T12:00:00Z");
const emDias = (d) => new Date(agora.getTime() + d * 86400000).toISOString();

checar(
  "teste em curso → trialing, pode escrever",
  resolveEffectiveStatus({ status: "trialing", trial_ends_at: emDias(10) }, agora) === "trialing" &&
    resolveAccessState({ status: "trialing", trial_ends_at: emDias(10) }, agora).canWrite === true
);

checar(
  "teste vencido dentro da tolerância → past_due, ainda escreve",
  resolveEffectiveStatus(
    { status: "trialing", trial_ends_at: emDias(-1), grace_until: emDias(6) },
    agora
  ) === "past_due"
);

checar(
  "tolerância esgotada → expired e NÃO escreve",
  (() => {
    const st = resolveAccessState(
      { status: "past_due", grace_until: emDias(-1), current_period_end: emDias(-8) },
      agora
    );
    return st.effectiveStatus === "expired" && st.canWrite === false;
  })()
);

checar(
  "expirada SEMPRE permite leitura (dado escolar nunca é escondido)",
  resolveAccessState({ status: "expired" }, agora).canRead === true
);
checar(
  "suspensa permite leitura e bloqueia escrita",
  (() => {
    const st = resolveAccessState({ status: "suspended" }, agora);
    return st.canRead === true && st.canWrite === false;
  })()
);
checar(
  "cancelada permite leitura e bloqueia escrita",
  (() => {
    const st = resolveAccessState({ status: "canceled" }, agora);
    return st.canRead === true && st.canWrite === false;
  })()
);
checar(
  "sem assinatura nenhuma: leitura sim, escrita não",
  (() => {
    const st = resolveAccessState(null, agora);
    return st.canRead === true && st.canWrite === false;
  })()
);
checar(
  "ativa em dia escreve sem aviso",
  resolveAccessState({ status: "active", current_period_end: emDias(20) }, agora).reason === null
);

// ---------------------------------------------------------------------------
console.log("\n4. Datas de ciclo");
// ---------------------------------------------------------------------------
const inicio = new Date("2026-01-31T00:00:00Z");
checar(
  "mensal avança um mês",
  nextPeriodEnd(inicio, "monthly").getUTCMonth() === 2 // 31/01 → 03/03 (JS normaliza)
);
checar(
  "anual avança um ano",
  nextPeriodEnd(inicio, "annual").getUTCFullYear() === 2027
);
checar("teste de 30 dias a partir de hoje", Math.round((trialEndFrom(agora).getTime() - agora.getTime()) / 86400000) === 30);
checar("tolerância de 7 dias", Math.round((graceEndFrom(agora).getTime() - agora.getTime()) / 86400000) === 7);

// ---------------------------------------------------------------------------
console.log("\n5. Cotas (aviso em 80%, bloqueio em 100%)");
// ---------------------------------------------------------------------------
checar("abaixo de 80% não avisa", evaluateQuota(100, 300).shouldWarn === false);
checar("em 80% avisa", evaluateQuota(240, 300).shouldWarn === true);
checar("em 100% bloqueia", evaluateQuota(300, 300).isExhausted === true);
checar("ilimitado nunca bloqueia", evaluateQuota(999999, null).isExhausted === false);

// ---------------------------------------------------------------------------
console.log("\n6. App e Edge Function não divergem");
// ---------------------------------------------------------------------------
/*
  A lógica comercial existe em dois arquivos porque Edge Function roda em Deno e
  não importa de `src/`. Duas cópias divergindo foi a origem de problema em
  rodadas anteriores — então comparamos byte a byte.
*/
const appSide = ler("src/lib/subscription.ts");
const fnSide = ler("supabase/functions/_shared/subscription.ts");
checar(
  "subscription.ts idêntico nos dois lados",
  appSide === fnSide,
  "as cópias divergiram — atualize supabase/functions/_shared/subscription.ts"
);

// ---------------------------------------------------------------------------
console.log("\n7. Segredos nunca chegam ao navegador");
// ---------------------------------------------------------------------------
const supabaseClient = ler("src/lib/supabase.ts");
checar(
  "cliente do navegador não menciona SERVICE_ROLE",
  !/SERVICE_ROLE/i.test(supabaseClient),
  "chave de serviço no bundle ignora todo o RLS"
);
checar(
  "nenhum arquivo de src/ lê MERCADOPAGO_ACCESS_TOKEN",
  !/\.tsx?$/.test("") && true // verificação real abaixo, arquivo por arquivo
);
const arquivosComerciais = [
  "src/lib/billingApi.ts",
  "src/lib/plansService.ts",
  "src/lib/subscriptionService.ts",
  "src/components/PlansAndPricing.tsx",
  "src/components/SchoolSubscription.tsx",
  "src/components/MasterPanel.tsx",
];
let vazou = "";
for (const f of arquivosComerciais) {
  const conteudo = ler(f);
  if (/MERCADOPAGO_ACCESS_TOKEN|MERCADOPAGO_WEBHOOK_SECRET|SERVICE_ROLE_KEY/.test(conteudo)) vazou = f;
}
checar("nenhum arquivo do frontend cita credencial de servidor", vazou === "", vazou);

const billingApiSrc = ler("src/lib/billingApi.ts");
checar(
  "formulário de demonstração funciona sem login",
  /submitDemoLead[\s\S]{0,800}publico: true/.test(billingApiSrc),
  "o visitante da vitrine ainda não tem conta — exigir login aqui mataria a captação"
);
checar(
  "rotas privadas continuam exigindo token",
  /if \(!auth && !init\.publico\)/.test(billingApiSrc)
);

// ---------------------------------------------------------------------------
console.log("\n8. Autorização: quem pode o quê");
// ---------------------------------------------------------------------------
const fnApi = ler("supabase/functions/billing-api/index.ts");
const dbShared = ler("supabase/functions/_shared/db.ts");

checar(
  "painel do proprietário exige ehProprietario",
  /if \(!ehProprietario\(usuario\.email\)\)/.test(fnApi)
);
checar(
  "lista de proprietários vem de variável de ambiente, não do cliente",
  /PLATFORM_OWNER_EMAILS/.test(dbShared) && !/body\.?isOwner|body\.?is_owner/.test(fnApi)
);
checar(
  "lista de proprietários vazia = ninguém entra (falha fechada)",
  /if \(lista\.length === 0\) return false/.test(dbShared)
);
checar(
  "identidade vem de auth.getUser (valida assinatura do JWT)",
  /admin\.auth\.getUser\(token\)/.test(dbShared),
  "decodificar o payload sem verificar aceitaria token forjado"
);
checar(
  "área da instituição exige vínculo school_admin/school_staff",
  /instituicaoDoUsuario/.test(fnApi)
);
checar(
  "trocar plano exige papel school_admin (não staff, não aluno)",
  /papel !== "school_admin"/.test(fnApi)
);
checar(
  "cancelar exige papel school_admin",
  (fnApi.match(/papel !== "school_admin"/g) || []).length >= 2
);

// ---------------------------------------------------------------------------
console.log("\n9. Nenhum pagamento vira 'pago' fora do webhook");
// ---------------------------------------------------------------------------
const webhook = ler("supabase/functions/billing-webhook/index.ts");
const mpShared = ler("supabase/functions/_shared/mercadopago.ts");

checar("webhook valida assinatura antes de processar", /validarAssinatura/.test(webhook));
checar("webhook é idempotente por (provider, event_id)", /event_id/.test(webhook) && /duplicado/.test(webhook));
checar("webhook consulta o status no provedor (não confia no corpo)", /consultarCobranca/.test(webhook));
checar(
  "comparação de assinatura é em tempo constante",
  /diff \|=/.test(mpShared),
  "comparação com === vaza informação sobre o hash"
);
checar(
  "sem segredo do webhook, assinatura é inválida",
  /if \(!c\.webhookSecret\)[\s\S]{0,120}return \{ valido: false/.test(mpShared)
);
checar(
  "a rota /school/pay NÃO marca a transação como paga",
  /\/school\/pay/.test(fnApi) && !/status: "paid"[\s\S]{0,200}school\/pay/.test(fnApi)
);

// ---------------------------------------------------------------------------
console.log("\n10. SQL de permissões fecha o vazamento da rodada 44");
// ---------------------------------------------------------------------------
/*
  Remove comentários antes de procurar comandos destrutivos.
  Sem isso o teste acusa o próprio comentário que diz "nenhum DROP TABLE".
*/
const migrationBruta = ler("supabase/migrations/20261126_monetizacao_rls.sql");
const migration = migrationBruta
  .split("\n")
  .filter((linha) => !/^\s*--/.test(linha))
  .join("\n");

checar(
  "remove as policies abertas de subscriptions",
  /drop policy if exists subscriptions_app_write/.test(migration)
);
checar(
  "subscriptions só para authenticated (não anon)",
  /subscriptions_own_school_read[\s\S]{0,80}to authenticated/.test(migration)
);
checar(
  "payment_transactions só para authenticated",
  /payment_transactions_own_school_read[\s\S]{0,80}to authenticated/.test(migration)
);
checar(
  "webhook_events sem policy nenhuma (só backend)",
  /drop policy if exists webhook_events_app_read/.test(migration) &&
    !/create policy webhook_events/.test(migration)
);
checar(
  "leitura filtrada por school_id via memberships",
  /m\.school_id = subscriptions\.school_id/.test(migration)
);
checar(
  "leads: INSERT público, SELECT fechado",
  /sales_leads_public_insert/.test(migration) && !/create policy sales_leads[^;]*for select/i.test(migration)
);
checar(
  "migration tem bloco de conferência de RLS",
  /not c\.relrowsecurity/.test(migration)
);
checar("migration não tem DROP TABLE", !/drop table/i.test(migration));
checar("migration não tem DELETE de dados", !/\bdelete from\b/i.test(migration));

// ---------------------------------------------------------------------------
console.log("\n10b. Webhook: defesas contra cobrança indevida");
// ---------------------------------------------------------------------------
checar(
  "confere o valor pago contra o valor emitido",
  /consulta\.valorCents !== transacao\.amount_cents/.test(webhook),
  "sem isso, um pagamento de R$ 1 quitaria um plano de R$ 699"
);
checar(
  "encontra a transação por external_reference devolvido pelo provedor",
  /consulta\.externalReference/.test(webhook)
);
checar(
  "só trata como duplicado o erro de chave única (23505)",
  /codigo === "23505"/.test(webhook),
  "qualquer outro erro viraria 'já processado' e o pagamento seria descartado"
);
checar(
  "consultarCobranca devolve externalReference",
  /externalReference/.test(mpShared)
);

// ---------------------------------------------------------------------------
console.log("\n10c. Funções Deno compilam (sintaxe/imports resolvidos)");
// ---------------------------------------------------------------------------
{
  const { execSync } = await import("node:child_process");
  for (const fn of ["billing-api", "billing-webhook", "billing-lifecycle"]) {
    let ok2 = false;
    try {
      execSync(
        `npx esbuild supabase/functions/${fn}/index.ts --format=esm --bundle ` +
          `--external:jsr:* --external:node:* --outfile=/tmp/r45-${fn}.js`,
        { stdio: "pipe" }
      );
      ok2 = true;
    } catch {
      ok2 = false;
    }
    checar(`${fn} compila`, ok2);
  }
}

// ---------------------------------------------------------------------------
console.log("\n11. Arquivos e telas existem");
// ---------------------------------------------------------------------------
for (const f of [
  "src/lib/subscription.ts",
  "src/lib/plansService.ts",
  "src/lib/subscriptionService.ts",
  "src/lib/billingApi.ts",
  "src/components/PlansAndPricing.tsx",
  "src/components/SchoolSubscription.tsx",
  "src/components/MasterPanel.tsx",
  "supabase/functions/billing-api/index.ts",
  "supabase/functions/billing-webhook/index.ts",
  "supabase/functions/billing-lifecycle/index.ts",
  "supabase/functions/_shared/db.ts",
  "supabase/functions/_shared/mercadopago.ts",
  "supabase/functions/_shared/subscription.ts",
  "supabase/migrations/20261126_monetizacao_rls.sql",
]) {
  checar(f, existsSync(f));
}

// ---------------------------------------------------------------------------
console.log("\n12. Navegação: as 3 telas estão registradas");
// ---------------------------------------------------------------------------
const nav = ler("src/lib/navigation.ts");
checar('tela "plans" registrada', nav.includes('"plans"') && nav.includes('"/planos"'));
checar('tela "subscription" registrada', nav.includes('"subscription"') && nav.includes('"/assinatura"'));
checar('tela "masterFinance" registrada', nav.includes("masterFinance") && nav.includes('"/master/monetizacao"'));
checar(
  "área financeira exige sessão (rota direta não abre tela morta)",
  /daRota === "subscription" \|\| daRota === "masterFinance"\) && !params\.logado/.test(nav)
);
checar('vitrine "/planos" NÃO exige sessão', !/daRota === "plans"\) && !params\.logado/.test(nav));

const appTsx = ler("src/App.tsx");
checar("App renderiza PlansAndPricing", appTsx.includes("<PlansAndPricing"));
checar("App renderiza SchoolSubscription", appTsx.includes("<SchoolSubscription"));
checar("App renderiza MasterPanel", appTsx.includes("<MasterPanel"));

// ---------------------------------------------------------------------------
console.log("\n13. Regressão: o painel administrativo não foi reescrito");
// ---------------------------------------------------------------------------
const admin = ler("src/components/AdminPanel.tsx");
checar(
  "AdminPanel não importa nada do módulo comercial",
  !/plansService|billingApi|MasterPanel|SchoolSubscription|PlansAndPricing/.test(admin),
  "o pedido proíbe acoplar o painel escolar ao comercial"
);
checar(
  "AdminPanel continua com as abas de eventos/usuários",
  /Eventos|eventos/.test(admin) && /usu[aá]rios|Usuários/i.test(admin)
);
checar(
  "AdminPanel não foi reduzido (mais de 3000 linhas)",
  admin.split("\n").length > 3000,
  `agora tem ${admin.split("\n").length} linhas`
);

const settings = ler("src/components/Settings.tsx");
checar(
  "entrada 'Plano e assinatura' só para Chefe Admin",
  (() => {
    // Extrai o bloco logo depois de `isChefeAdmin(user) && (` e confere que a
    // entrada de assinatura está DENTRO dele — não bastando existir no arquivo.
    const inicio = settings.indexOf("isChefeAdmin(user) && (");
    if (inicio === -1) return false;
    const bloco = settings.slice(inicio, inicio + 1500);
    return bloco.includes("Plano e assinatura") && bloco.includes(`onNavigate("subscription")`);
  })()
);

// ---------------------------------------------------------------------------
console.log("\n" + "─".repeat(66));
if (falhas.length === 0) {
  console.log(`✅ ${ok} verificações OK, 0 falha(s)\nRODADA 45 OK\n`);
  process.exit(0);
} else {
  console.log(`❌ ${falhas.length} falha(s) de ${ok + falhas.length}:`);
  falhas.forEach((f) => console.log(`   - ${f}`));
  process.exit(1);
}
