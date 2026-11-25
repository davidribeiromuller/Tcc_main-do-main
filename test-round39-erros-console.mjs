/**
 * Rodada 39 — suíte de regressão dos erros relatados no console.
 *
 * Cada bloco corresponde a uma mensagem que o usuário viu (com print):
 *
 *  1. `Du.randomBytes is not a function` no cadastro
 *  2. `Failed to load resource: 404 /api/db-status` e `/api/users` no painel
 *  3. `401` em `school_accounts` no acesso institucional
 *  4. `Erro: sem backend local (hospedagem estática)` repetido
 *  5. o painel do ADM existente listando dados que NÃO são do banco (9901)
 *  6. conta administrativa desativada no banco sendo barrada sem explicação
 *
 * Roda com: npx tsx test-round39-erros-console.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

const raiz = process.cwd();
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

console.log("\n[1] crypto no navegador (Du.randomBytes is not a function)");
{
  const security = ler("src/lib/security.ts");
  const shim = ler("src/lib/nodeCryptoShim.ts");
  const vite = ler("vite.config.ts");

  ok("security.ts importa funções nomeadas, não o default do node:crypto", () => {
    assert.match(security, /import \{[^}]*randomBytes[^}]*\} from "node:crypto"/s);
    assert.doesNotMatch(security, /^import crypto from "node:crypto"/m);
  });

  ok("ninguém chama mais crypto.<fn> (o default some no bundle)", () => {
    // `crypto.KeyObject` como tipo também é proibido: não existe no navegador.
    assert.doesNotMatch(security, /\bcrypto\.(randomBytes|scryptSync|createHmac|createHash|timingSafeEqual|verify|createPublicKey|randomInt)/);
  });

  ok("vite.config.ts redireciona node:crypto para o substituto", () => {
    assert.match(vite, /['"]node:crypto['"]\s*:\s*path\.resolve/);
    assert.match(vite, /nodeCryptoShim\.ts/);
  });

  ok("o substituto lança erro explicativo em português", () => {
    assert.match(shim, /precisa de criptografia do servidor/i);
    assert.match(shim, /export function randomBytes/);
    assert.match(shim, /export function scryptSync/);
  });
}

console.log("\n[2] fetches crus para /api (404 no GitHub Pages)");
{
  const adminPanel = ler("src/components/AdminPanel.tsx");

  ok("AdminPanel não faz fetch cru para /api/admin/audit", () => {
    assert.doesNotMatch(adminPanel, /fetch\("\/api\/admin\/audit/);
    assert.match(adminPanel, /fetchJsonApiWithAuth\("\/api\/admin\/audit/);
  });

  ok("AdminPanel não faz fetch cru para /api/saas/plans", () => {
    assert.doesNotMatch(adminPanel, /await fetch\("\/api\/saas\/plans"/);
    assert.match(adminPanel, /fetchJsonApi\("\/api\/saas\/plans"/);
  });

  ok("sem servidor, a auditoria explica em vez de listar vazio", () => {
    assert.match(adminPanel, /histórico de auditoria é gravado pelo servidor/);
  });
}

console.log("\n[3] acesso institucional (401 em school_accounts)");
{
  const svc = ler("src/lib/schoolAccountsService.ts");
  const server = ler("server.ts");

  ok("autenticarContaEscolar exige servidor antes de consultar", () => {
    assert.match(svc, /if \(!\(await isServerAvailable\(\)\)\)/);
  });

  ok("o servidor autentica school_accounts com a chave de serviço", () => {
    assert.match(server, /getSaasAdminClient\(\)/);
    const trecho = server.slice(server.indexOf('app.post("/api/auth/institutional-login"'));
    assert.match(trecho.slice(0, 3000), /from\("school_accounts"\)/);
  });

  ok("fallback de demonstração não vale quando há banco configurado", () => {
    const trecho = server.slice(server.indexOf('app.post("/api/auth/institutional-login"'));
    assert.match(trecho.slice(0, 5000), /if \(isSaasBackendConfigured\(\)\) \{\s*return res\.status\(401\)/);
  });
}

console.log("\n[4 e 5] fonte de dados do painel (JSON de demonstração x banco)");
{
  const users = ler("src/db/users.ts");
  const supabaseUsers = ler("src/db/supabaseUsers.ts");

  ok("listAllUsers consulta o Supabase quando há chave de serviço", () => {
    assert.match(users, /usaSupabaseComoFonte\(\)/);
    assert.match(users, /listarUsuariosDoSupabase/);
  });

  ok("getUserByEmail também prioriza o Supabase", () => {
    const trecho = users.slice(users.indexOf("export async function getUserByEmail"));
    assert.match(trecho.slice(0, 1200), /usaSupabaseComoFonte\(\)/);
  });

  ok("users.ts mapeia is_admin para isAdmin (nome da coluna real)", () => {
    assert.match(supabaseUsers, /is_admin === true/);
  });

  ok("mapeamento preserva ativo=false (conta bloqueada não vira ativa)", () => {
    assert.match(supabaseUsers, /ativo: row\.ativo !== false/);
  });

  ok("atualização não envia campos de interface para o PostgREST", () => {
    assert.match(supabaseUsers, /const mapa: Record<string, string>/);
  });

  ok("falha de leitura NÃO é convertida em lista vazia", () => {
    assert.match(supabaseUsers, /throw erroDeConsulta/);
    assert.doesNotMatch(supabaseUsers, /return \[\]/);
  });
}

console.log("\n[6] mensagens honestas: infraestrutura x permissão");
{
  const server = ler("server.ts");
  const supabaseUsers = ler("src/db/supabaseUsers.ts");

  ok("erro de rede vira 503 SAAS_UNREACHABLE, não 500", () => {
    assert.match(supabaseUsers, /code = "SAAS_UNREACHABLE"/);
    const login = server.slice(server.indexOf('app.post("/api/auth/local-login-password"'));
    assert.match(login.slice(0, 2500), /status\(503\)/);
  });

  ok("a mensagem diz que a conta não foi apagada", () => {
    assert.match(server, /A conta não foi apagada/);
  });

  ok("/api/users devolve 503 em vez de lista vazia quando o banco cai", () => {
    const trecho = server.slice(server.indexOf('app.get("/api/users"'));
    assert.match(trecho.slice(0, 1200), /status\(503\)/);
  });

  ok("routing de login não engole mais o erro do banco", () => {
    const login = server.slice(server.indexOf('app.post("/api/auth/local-login-password"'));
    assert.match(login.slice(0, 2500), /SAAS_UNREACHABLE/);
  });
}

console.log("\n[7] painel: guarda de entrada para quem não é administrador");
{
  const app = ler("src/App.tsx");
  const trecho = app.slice(app.indexOf('{activeScreen === "admin" && ('));

  ok("monta o AdminPanel só para Chefe/Funcionário", () => {
    assert.match(trecho.slice(0, 3000), /canAccessAdminPanel\(currentUser\)/);
  });

  ok("explica o motivo em vez de mostrar painel quebrado", () => {
    assert.match(trecho.slice(0, 3000), /Acesso restrito/);
    assert.match(trecho.slice(0, 3000), /Peça a promoção a um Chefe Administrador/);
  });
}

console.log("\n[8] cadastro: erro de build não pode virar 'verifique sua conexão'");
{
  const usersService = ler("src/lib/usersService.ts");
  const trecho = usersService.slice(usersService.indexOf("export async function registerUserDirectInSupabase"));

  ok("cadastro exige servidor antes de tentar hashear a senha", () => {
    assert.match(trecho.slice(0, 1600), /if \(!\(await isServerAvailable\(\)\)\)/);
  });

  ok("mensagem diz que a senha precisa do servidor", () => {
    assert.match(trecho.slice(0, 1600), /criptografia que só existe no servidor/);
  });
}

const total = passou + falhas.length;
console.log(`\n${passou}/${total} verificações passaram`);
if (falhas.length > 0) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(` - ${f.nome}: ${f.erro.message}`);
  process.exit(1);
}
