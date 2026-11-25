/**
 * Rodada 39 — teste de INTEGRAÇÃO do login do ADM existente.
 *
 * Não é teste de arquivo: sobe de verdade o `server.ts` (via tsx) e um
 * PostgREST simulado que devolve as MESMAS linhas de `public.users` do projeto
 * jaoheenjltzzglfncgfq. Assim o caminho completo — rota → `getUserByEmail` →
 * consulta REST → sessão assinada — é exercitado, e não só o texto do código.
 *
 * Por que um simulador: o sandbox não tem saída de rede para
 * `*.supabase.co` (curl devolve 000). Sem isso o caminho feliz nunca rodaria
 * aqui e o teste viraria uma afirmação sem prova.
 *
 * Prova o que o usuário relatou:
 *   "entre com conta adm, e não apareceu [o painel]"
 *
 * Roda com: npx tsx test-round39-login-adm-banco.mjs
 */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";

const PORTA_BANCO = 9931;
const PORTA_APP = 3091;

/* ---------------------------------------------------------------------------
   Banco simulado — linhas reais de public.users / school_accounts
   --------------------------------------------------------------------------- */
const usuarios = [
  { id: 2, uid: "fallback-admin-uid", nome: "Diretoria Helena Wysocki", email: "diretoria@helenawysocki.com", role: "Diretor", is_admin: true, ativo: false, password: "senha123", provider: "local" },
  { id: 117, uid: "u-117", nome: "davidribeiromuller", email: "davidribeiromuller@gmail.com", role: "Aluno", is_admin: false, ativo: true, password: "123456", provider: "local" },
  { id: 200, uid: "u-200", nome: "David Ribeiro Muller", email: "davidribeiromuller2009@gmail.com", role: "Diretor", is_admin: true, ativo: true, password: "senha123", provider: "local" },
  { id: 759, uid: "u-759", nome: "professor", email: "professor@gmail.com", role: "Diretor", is_admin: true, ativo: true, password: "1234", provider: "local" },
  { id: 819, uid: "u-819", nome: "JOAO FELIPE LIMA DOS SANTOS", email: "joao.lima.santos12@escola.pr.gov.br", role: "Diretor", is_admin: true, ativo: true, password: null, provider: "local" },
];

const contasEscolares = [
  {
    id: 1,
    school_id: 1,
    school_slug: "helena-wysocki",
    school_name: "Colégio Estadual Professora Helena Wysocki",
    login_identifier: "helena.wysocki",
    institutional_email: "helena.wysocki@escola.pr.gov.br",
    password: "helenawysocki",
    must_change_password: false,
    responsible_name: "Elder",
    responsible_role: "Diretor(a)",
    account_status: "active",
    verification_status: "verified",
  },
];

function filtrar(linhas, url) {
  let out = linhas;
  for (const [chave, valorBruto] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(chave)) continue;
    const valor = String(valorBruto);
    if (valor.startsWith("ilike.")) {
      const alvo = valor.replace("ilike.", "").toLowerCase();
      out = out.filter((l) => String(l[chave] ?? "").toLowerCase() === alvo);
    } else if (valor.startsWith("eq.")) {
      const alvo = valor.slice(3);
      out = out.filter((l) => String(l[chave] ?? "") === alvo);
    }
  }
  return out;
}

function subirBanco() {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const partes = url.pathname.split("/").filter(Boolean); // rest / v1 / <tabela>
    const tabela = partes[2];
    const responder = (status, corpo) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(corpo));
    };

    if (req.method === "GET" && partes[0] === "rest" && partes[1] === "v1") {
      const fonte = tabela === "users" ? usuarios : tabela === "school_accounts" ? contasEscolares : null;
      if (!fonte) return responder(404, { message: `relação ${tabela} não existe` });
      let linhas = filtrar(fonte, url).map((l) => ({ ...l }));
      if ((url.searchParams.get("order") || "").startsWith("id")) linhas.sort((a, b) => a.id - b.id);
      const limite = Number(url.searchParams.get("limit"));
      if (Number.isFinite(limite) && limite > 0) linhas = linhas.slice(0, limite);
      return responder(200, linhas);
    }

    if (req.method === "PATCH" && partes[0] === "rest" && tabela === "users") {
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        const patch = JSON.parse(corpo || "{}");
        const alvos = filtrar(usuarios, url);
        alvos.forEach((l) => Object.assign(l, patch));
        responder(200, alvos);
      });
      return;
    }

    responder(404, { message: "rota não simulada" });
  });
  return new Promise((resolve) => servidor.listen(PORTA_BANCO, "127.0.0.1", () => resolve(servidor)));
}

/* ---------------------------------------------------------------------------
   Aplicação real
   --------------------------------------------------------------------------- */
function subirApp(env) {
  const proc = spawn("npx", ["tsx", "server.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true, // sem isso o `npx` não é morto no fim
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  return proc;
}

async function esperarHttp(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function encerrar(proc) {
  if (!proc) return;
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try { proc.kill("SIGKILL"); } catch { /* já morreu */ }
  }
}

let passou = 0;
const falhas = [];
function ok(nome, fn) {
  try {
    fn();
    passou++;
    console.log(`  ✓ ${nome}`);
  } catch (erro) {
    falhas.push({ nome, erro });
    console.log(`  ✗ ${nome}\n      ${erro.message}`);
  }
}

async function main() {
  console.log("\nSubindo banco simulado + servidor real…");
  const banco = await subirBanco();
  const app = subirApp({
    SUPABASE_URL: `http://127.0.0.1:${PORTA_BANCO}`,
    SUPABASE_SECRET_KEY: "chave-de-teste-nao-e-segredo",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    PORT: String(PORTA_APP),
    NODE_ENV: "development",
  });

  const noAr = await esperarHttp(`http://127.0.0.1:${PORTA_APP}/api/health`);
  if (!noAr) {
    console.error("O servidor não subiu — abortando.");
    await encerrar(app);
    banco.close();
    process.exit(1);
  }

  const base = `http://127.0.0.1:${PORTA_APP}`;
  const login = (email, password) =>
    fetch(`${base}/api/auth/local-login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

  console.log("\n[1] Login do ADM que JÁ EXISTE no banco");
  let token = "";
  {
    const r = await login("professor@gmail.com", "1234");
    const corpo = await r.json();
    token = corpo.token || "";

    ok("devolve 200 (antes o painel não aparecia)", () => assert.equal(r.status, 200));
    ok("usa a linha do BANCO (id 759), não o JSON de demonstração (9901)", () =>
      assert.equal(corpo.user?.id, 759));
    ok("reconhece o cargo administrativo", () => {
      assert.equal(corpo.user?.role, "Diretor");
      assert.equal(corpo.user?.isAdmin, true);
    });
    ok("emite sessão assinada", () => assert.ok(token.length > 100));
  }

  console.log("\n[2] O painel recebe o diretório REAL");
  {
    const r = await fetch(`${base}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
    const corpo = await r.json();
    const ids = (corpo.users || []).map((u) => u.id);

    ok("/api/users responde 200", () => assert.equal(r.status, 200));
    ok("lista os ids do banco", () => assert.deepEqual(ids, [2, 117, 200, 759, 819]));
    ok("não há mais conta fictícia 9901", () => assert.ok(!ids.includes(9901)));
    ok("adminRole do chefe é reconhecido", () => assert.equal(corpo.adminRole, "chefe"));
    ok("nome vem do banco", () =>
      assert.equal((corpo.users || []).find((u) => u.id === 759)?.nome, "professor"));
  }

  console.log("\n[3] Conta desativada no banco continua bloqueada");
  {
    const r = await login("diretoria@helenawysocki.com", "senha123");
    const corpo = await r.json();
    ok("devolve 403 com o motivo", () => {
      assert.equal(r.status, 403);
      assert.match(corpo.error, /bloqueada ou desativada/i);
    });
  }

  console.log("\n[4] Senha errada continua 401 (não vira 503)");
  {
    const r = await login("professor@gmail.com", "senha-errada");
    ok("401 de credencial", () => assert.equal(r.status, 401));
  }

  console.log("\n[5] Acesso institucional pela tabela real (school_accounts)");
  {
    const r = await fetch(`${base}/api/auth/institutional-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identificador: "helena.wysocki", password: "helenawysocki" }),
    });
    const corpo = await r.json();
    ok("autentica com a chave de serviço e devolve 200", () => assert.equal(r.status, 200));
    ok("papel Escola com a escola correta", () => {
      assert.equal(corpo.user?.role, "Escola");
      assert.match(corpo.user?.escolaNome || "", /Helena Wysocki/);
    });
  }

  await encerrar(app);

  console.log("\n[6] Banco fora de alcance → 503 explicativo, nunca 500");
  {
    // Mesmo servidor, agora apontando para uma porta onde nada escuta.
    const appRuim = subirApp({
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_SECRET_KEY: "chave-de-teste-nao-e-segredo",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      PORT: String(PORTA_APP + 1),
      NODE_ENV: "development",
    });
    const subiu = await esperarHttp(`http://127.0.0.1:${PORTA_APP + 1}/api/health`);
    try {
      if (!subiu) throw new Error("servidor de teste não subiu");
      const r = await fetch(`http://127.0.0.1:${PORTA_APP + 1}/api/auth/local-login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "professor@gmail.com", password: "1234" }),
      });
      const corpo = await r.json();
      ok("status 503, não 500", () => assert.equal(r.status, 503));
      ok("código SAAS_UNREACHABLE", () => assert.equal(corpo.code, "SAAS_UNREACHABLE"));
      ok("diz que a conta não foi apagada", () => assert.match(corpo.hint || "", /não foi apagada/i));
    } catch (erro) {
      falhas.push({ nome: "banco fora de alcance", erro });
      console.log(`  ✗ banco fora de alcance\n      ${erro.message}`);
    } finally {
      await encerrar(appRuim);
    }
  }

  banco.close();

  const total = passou + falhas.length;
  console.log(`\n${passou}/${total} verificações passaram`);
  if (falhas.length > 0) {
    console.log("\nFALHAS:");
    for (const f of falhas) console.log(` - ${f.nome}: ${f.erro.message}`);
    process.exit(1);
  }
}

main().catch((erro) => {
  console.error("Erro inesperado na suíte:", erro);
  process.exit(1);
});
