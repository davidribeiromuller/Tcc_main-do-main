/**
 * RODADA 42 — o servidor devolve o ADM de verdade.
 *
 * PEDIDO:
 *   "volte com o servidor antigo onde funcionava, sem esse servidor ativo só
 *    para leitura, quero que funcione de verdade que nem estava"
 *   "crie uma página para essa opção no dashboard com a tabela de preços
 *    pré-estabelecidas anteriormente"
 *
 * O que este teste prova, contra um `server.ts` REAL e um PostgREST simulado:
 *
 *   1. POST /api/auth/local-login-password aceita e-mail + senha e devolve
 *      token de sessão assinado. (Era isto que a versão "somente leitura"
 *      bloqueava antes de tentar.)
 *   2. Sem token válido, o painel Master responde 401/403 — não 200 com dados
 *      vazios, que era o que fazia o ADM "aparecer" sem funcionar.
 *   3. GET /api/master/plans devolve os preços QUE ESTÃO NO BANCO
 *      (Comunidade 14900 / Escola 29900 / Rede 69900), não constantes.
 *   4. PUT /api/master/plans/:id grava a alteração de preço.
 *   5. Senha errada → 401; conta bloqueada → 403.
 */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { subirBancoSimulado } from "./test-helpers/mockPostgrest.mjs";

/*
  Portas escolhidas em tempo de execução, não fixas.

  Na bateria completa, uma suíte anterior pode deixar o processo de pé por
  alguns instantes e a porta fixa faz este teste falhar sem nenhum defeito no
  código — foi o que aconteceu na primeira execução. `porta: 0` deixa o SO
  escolher; aqui descobrimos qual foi antes de subir o servidor.
*/
import { createServer } from "node:net";

async function descobrirPorta() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "0.0.0.0", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

const PORTA_BANCO = await descobrirPorta();
const PORTA_APP = await descobrirPorta();
const BASE = `http://127.0.0.1:${PORTA_APP}`;

const PLANOS = [
  {
    id: "comunidade",
    name: "Comunidade",
    tagline: "Para uma escola que quer sair da planilha e publicar eventos com seguranca.",
    monthly_price_cents: 14900,
    annual_price_cents: 160920,
    setup_fee_cents: 39000,
    max_active_students: 300,
    max_units: 1,
    max_admins: 3,
    sort_order: 1,
    is_public: true,
    is_active: true,
    features: { events: true, reports: false },
  },
  {
    id: "escola",
    name: "Escola",
    tagline: "Operacao completa: autorizacoes digitais, relatorios e assistente com cota.",
    monthly_price_cents: 29900,
    annual_price_cents: 322920,
    setup_fee_cents: 69000,
    max_active_students: 800,
    max_units: 1,
    max_admins: 10,
    sort_order: 2,
    is_public: true,
    is_active: true,
    features: { events: true, reports: true },
  },
  {
    id: "rede",
    name: "Rede",
    tagline: "Para redes e mantenedoras: varias unidades, painel centralizado e 2.000 ativos.",
    monthly_price_cents: 69900,
    annual_price_cents: 754920,
    setup_fee_cents: 149000,
    max_active_students: 2000,
    max_units: 3,
    max_admins: 30,
    sort_order: 3,
    is_public: true,
    is_active: true,
    features: { events: true, reports: true },
  },
];

/** Usuário administrador — mesmo formato que `mapSupabaseUserToUser` espera. */
const ADMIN = {
  id: 759,
  uid: "uid-759",
  nome: "Professor Diretor",
  email: "professor@gmail.com",
  password: "1234", // texto claro: verifyPassword migra para hash no login
  role: "Diretor",
  ativo: true,
  is_admin: true,
  is_super_admin: true,
  cpf: null,
  phone: null,
  institution: "Escola Helena Wysocki",
  created_at: "2026-01-01",
};

const BLOQUEADO = {
  id: 760,
  uid: "uid-760",
  nome: "Diretoria Bloqueada",
  email: "diretoria@helenawysocki.com",
  password: "1234",
  role: "Diretor",
  ativo: false,
  is_admin: true,
  is_super_admin: false,
};

let passed = 0;
const falhas = [];
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    falhas.push({ nome, erro: e.message });
    console.log(`  ✗ ${nome}\n      ${e.message}`);
  }
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function esperarServidor(tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await esperar(500);
  }
  return false;
}

console.log("[preparo] banco simulado + server.ts real");

const banco = await subirBancoSimulado(PORTA_BANCO, {
  tabelasExtras: {
    users: [ADMIN, BLOQUEADO],
    plans: PLANOS,
    plan_addons: [
      { id: "a1", name: "Unidade extra", description: "Mais uma escola no mesmo painel", price_cents: 9900, billing_period: "/mês", is_active: true },
    ],
    sales_leads: [],
  },
});

const servidor = spawn("npx", ["tsx", "server.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORTA_APP),
    SUPABASE_URL: `http://127.0.0.1:${PORTA_BANCO}`,
    SUPABASE_SECRET_KEY: "chave-de-teste-nao-secreta",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    /*
      `professor@gmail.com` é o proprietário da plataforma neste projeto: é a
      conta administrativa do TCC. No deploy, isso é o que habilita o painel
      Master (e a aba de preços). Sem a variável, o servidor responde 503
      MASTER_NOT_CONFIGURED — de propósito, para não abrir a operação comercial
      para qualquer admin de escola.
    */
    PLATFORM_OWNER_EMAILS: "professor@gmail.com",
    NODE_ENV: "development",
    ELOESCOLA_FORCE_STATIC: "",
  },
  stdio: "pipe",
});

let logServidor = "";
servidor.stdout.on("data", (d) => (logServidor += d.toString()));
servidor.stderr.on("data", (d) => (logServidor += d.toString()));

const pronto = await esperarServidor();
if (!pronto) {
  console.error("Servidor não subiu. Log:", logServidor.slice(-1500));
  banco.fechar();
  servidor.kill("SIGKILL");
  process.exit(1);
}

let token = "";
let tokenBloqueado = "";

try {
  console.log("\n[1] Login por senha volta a funcionar (é o que o ADM precisa)");

  const loginRes = await fetch(`${BASE}/api/auth/local-login-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "professor@gmail.com", password: "1234" }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  token = loginBody.token || "";

  check("responde 200", () => assert.equal(loginRes.status, 200, JSON.stringify(loginBody).slice(0, 300)));
  check("devolve o usuário do banco (id 759, Diretor)", () => {
    assert.equal(loginBody.user?.id, 759);
    assert.equal(loginBody.user?.role, "Diretor");
    assert.equal(loginBody.user?.email, "professor@gmail.com");
  });
  check("devolve token de sessão (sem ele o painel não carrega)", () => {
    assert.ok(token.length > 20, `token curto demais: "${token}"`);
  });
  check("o token NÃO é a senha nem contém a senha", () => {
    assert.ok(!token.includes("1234"));
    assert.notEqual(token, "1234");
  });
  check("marca o usuário como administrador", () => {
    assert.ok(loginBody.user?.isAdmin === true || loginBody.user?.is_admin === true);
  });

  console.log("\n[2] Senha errada e conta bloqueada continuam barradas");

  const senhaErrada = await fetch(`${BASE}/api/auth/local-login-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "professor@gmail.com", password: "senha-errada" }),
  });
  check("senha errada → 401", () => assert.equal(senhaErrada.status, 401));

  const bloqueada = await fetch(`${BASE}/api/auth/local-login-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "diretoria@helenawysocki.com", password: "1234" }),
  });
  const bloqueadaBody = await bloqueada.json().catch(() => ({}));
  check("conta com ativo=false → 403 (não é bug, é bloqueio)", () => {
    assert.equal(bloqueada.status, 403);
    assert.match(String(bloqueadaBody.error || ""), /desativada|bloqueada/i);
  });

  console.log("\n[3] Painel Master exige sessão de verdade");

  const semToken = await fetch(`${BASE}/api/master/plans`);
  check("sem token → 401 (antes o painel 'abria' com dados vazios)", () => {
    assert.ok([401, 403].includes(semToken.status), `status ${semToken.status}`);
  });

  const comTokenFalso = await fetch(`${BASE}/api/master/plans`, {
    headers: { Authorization: "Bearer token-inventado" },
  });
  check("token inventado → 401/403", () => {
    assert.ok([401, 403].includes(comTokenFalso.status), `status ${comTokenFalso.status}`);
  });

  console.log("\n[4] Tabela de preços vem do BANCO, não de constante");

  const planosRes = await fetch(`${BASE}/api/master/plans`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const planosBody = await planosRes.json().catch(() => ({}));
  const planos = planosBody.plans || [];

  check("responde 200 com o token válido", () => assert.equal(planosRes.status, 200, JSON.stringify(planosBody).slice(0, 300)));
  check("traz os 3 planos pré-estabelecidos", () => {
    assert.equal(planos.length, 3, `veio ${planos.length}`);
    assert.deepEqual(
      planos.map((p) => p.id).sort(),
      ["comunidade", "escola", "rede"]
    );
  });
  check("preços mensais exatos: 149 / 299 / 699", () => {
    const porId = Object.fromEntries(planos.map((p) => [p.id, p.monthly_price_cents]));
    assert.equal(porId.comunidade, 14900);
    assert.equal(porId.escola, 29900);
    assert.equal(porId.rede, 69900);
  });
  check("anuidade preserva os 10% já configurados", () => {
    const escola = planos.find((p) => p.id === "escola");
    // 29900 * 12 = 358800 com 10% off = 322920
    assert.equal(escola.annual_price_cents, 322920);
  });
  check("taxa de implantação vem junto", () => {
    assert.equal(planos.find((p) => p.id === "escola").setup_fee_cents, 69000);
  });
  check("add-ons também vêm do banco", () => {
    assert.ok(Array.isArray(planosBody.addons));
    assert.equal(planosBody.addons.length, 1);
  });

  console.log("\n[5] Editar o preço grava no banco");

  const antes = banco.escritas.length;
  const put = await fetch(`${BASE}/api/master/plans/escola`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ monthly_price_cents: 34900 }),
  });
  check("PUT responde 200", () => assert.equal(put.status, 200));

  const gravacao = banco.escritas
    .slice(antes)
    .find((e) => e.tabela === "plans" && e.metodo === "PATCH");

  check("gravou em plans (UPDATE, não INSERT de plano novo)", () => {
    assert.ok(gravacao, `escritas: ${JSON.stringify(banco.escritas.slice(antes)).slice(0, 400)}`);
    assert.equal(gravacao.metodo, "PATCH");
  });
  check("gravou o valor em centavos, como inteiro", () => {
    const dados = Array.isArray(gravacao.dados) ? gravacao.dados[0] : gravacao.dados;
    assert.equal(dados.monthly_price_cents, 34900);
  });
  check("não gravou campo proibido (id, features)", () => {
    const dados = Array.isArray(gravacao.dados) ? gravacao.dados[0] : gravacao.dados;
    assert.equal(dados.id, undefined);
    assert.equal(dados.features, undefined);
  });

  console.log("\n[6] Sem servidor, a tela diz a verdade");

  const fs = await import("node:fs");
  const tab = fs.readFileSync("src/components/PlansManagementTab.tsx", "utf8");

  check("a aba lê de /api/master/plans (não de constante local)", () => {
    assert.match(tab, /\/api\/master\/plans/);
  });
  check("a aba NÃO tem preço fixo no código", () => {
    // 14900, 29900 e 69900 são os valores do banco; se aparecessem aqui,
    // editar no painel não mudaria a página pública.
    assert.doesNotMatch(tab, /14900|29900|69900/);
  });
  check("a aba explica o que fazer quando não há servidor", () => {
    assert.match(tab, /precisa do servidor/);
    assert.match(tab, /DEPLOY_SERVIDOR|npm run dev/);
  });
  check("o painel Master tem a aba Planos e preços", () => {
    const master = fs.readFileSync("src/components/MasterPanel.tsx", "utf8");
    assert.match(master, /PlansManagementTab/);
    assert.match(master, /Planos e preços/);
  });
} finally {
  /*
    Encerramento explícito. O processo do servidor é o último handle pendente:
    sem esperar a saída dele, o `tsx` do teste terminava o relatório e ficava
    vivo até o timeout da bateria (foi o que aconteceu: 23/23 e exit 124).
  */
  const saiu = new Promise((r) => servidor.once("exit", r));
  servidor.kill("SIGKILL");
  await Promise.race([saiu, new Promise((r) => setTimeout(r, 3000))]);
  await banco.fechar();
}

console.log(`\n${passed}/${passed + falhas.length} verificações passaram`);
if (falhas.length) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(`  - ${f.nome}:\n      ${f.erro}`);
  process.exit(1);
}
console.log("RODADA 42 OK — servidor devolve login e tabela de preços do banco");
// Nada mais a esperar: sai com código 0 em vez de ficar pendurado em handles.
process.exit(0);
