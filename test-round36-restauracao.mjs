/**
 * Rodada 36 — RESTAURAÇÃO INTEGRAL (painel, banco, monetização, SaaS)
 *
 * Estes testes cobrem as correções feitas na rodada de restauração. Diferente
 * das suítes antigas (que leem strings), aqui executamos o comportamento
 * sempre que possível: subimos o servidor de verdade e batemos nas rotas.
 *
 * O que NÃO é testável neste ambiente: as rotas que dependem de rede até o
 * Supabase (sandbox não alcança *.supabase.co). Elas são verificadas por
 * contrato/estrutura e marcadas como tal — sem fingir que passaram.
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

let ok = 0;
let fail = 0;
const falhas = [];

function check(nome, cond, detalhe = "") {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    fail++;
    falhas.push(nome);
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const ler = (p) => readFileSync(p, "utf8");
const server = ler("server.ts");
const painel = ler("src/components/AdminPanel.tsx");
const usersService = ler("src/lib/usersService.ts");
const fallback = ler("src/db/fallbackStore.ts");
const schema = ler("src/db/schema.ts");
const particService = ler("src/lib/participationsService.ts");

// ===========================================================================
console.log("=== 1. Auditoria do painel (/admin) — §3.10 ===");
// ===========================================================================
{
  check("rota GET /api/admin/audit existe", /"\/api\/admin\/audit"/.test(server));
  check(
    "auditoria exige autenticação + cargo administrativo",
    /"\/api\/admin\/audit",[\s\S]{0,120}requireAuth,[\s\S]{0,120}requireAdminOrStaff/.test(server)
  );
  check(
    "funcionário recebe e-mail do autor mascarado",
    /adminRole === "chefe" \? linha\.actor_email : mascararEmail/.test(server)
  );
  check(
    "IP só é exposto ao Chefe",
    /ip: adminRole === "chefe" \? linha\.ip : null/.test(server)
  );
  check(
    "metadata remove senha/token/assinatura",
    /senha\|password\|token\|secret\|signature\|assinatura/i.test(server)
  );
  check("aba 'audit' existe no painel", /"audit"/.test(painel) && /activeTab === "audit"/.test(painel));
  check("painel trata erro de leitura separado de lista vazia", /auditError/.test(painel));
  check(
    "painel diz explicitamente que falha != nenhum registro",
    /falha de leitura, não/.test(painel)
  );
  check("botão 'Auditoria' na navegação de abas", /<History size=\{14\} \/>/.test(painel));

  // Ações administrativas de usuário precisam entrar no log
  for (const acao of [
    "user.updated",
    "user.blocked",
    "user.unblocked",
    "user.deleted_permanently",
    "user.soft_deleted",
  ]) {
    check(`ação "${acao}" é registrada`, new RegExp(`action: "${acao}"`).test(server));
  }
  check(
    "auditoria de usuário nunca grava a senha",
    /metadata: \{ campos: Object\.keys\(updateData\)\.filter\(\(k\) => k !== "password"\)/.test(server)
  );
}

// ===========================================================================
console.log("\n=== 2. Senha em texto claro no painel — CORRIGIDO ===");
// ===========================================================================
{
  const blocoPut = server.slice(server.indexOf('app.put("/api/users/:id"'));
  const trecho = blocoPut.slice(0, 3000);
  check("PUT /api/users/:id NÃO grava senha crua", !/updateData\.password = String\(password\)/.test(server));
  check("PUT /api/users/:id usa hashPassword", /updateData\.password = hashPassword\(senhaCrua\)/.test(trecho));
  check("PUT valida força da senha antes de gravar", /validatePasswordStrength\(senhaCrua\)/.test(trecho));
  check(
    "senha trocada pelo painel exige troca no próximo acesso",
    /must_change_password = true/.test(trecho)
  );
}

// ===========================================================================
console.log("\n=== 3. Corrida na aprovação de sugestão — §3.6 ===");
// ===========================================================================
{
  const bloco = server.slice(server.indexOf('"/api/admin/suggestions/:id/approve"'));
  const fim = bloco.indexOf('"/api/admin/suggestions/:id/reject"');
  const trecho = bloco.slice(0, fim > 0 ? fim : 4000);

  const posClaim = trecho.indexOf('.eq("status", "pending")');
  const posInsert = trecho.indexOf('.insert(novoEvento)');
  check("existe update condicional em status=pending", posClaim > -1);
  check(
    "reivindica a sugestão ANTES de criar o evento",
    posClaim > -1 && posInsert > -1 && posClaim < posInsert,
    `claim@${posClaim} insert@${posInsert}`
  );
  check("responde 409 quando outra requisição já pegou", /já está sendo revisada/.test(trecho));
  check(
    "devolve a sugestão para a fila se a publicação falhar",
    /status: "pending", reviewed_at: null, reviewed_by: null/.test(trecho)
  );
}

// ===========================================================================
console.log("\n=== 4. Participações: rota fantasma e escopo de dono ===");
// ===========================================================================
{
  check(
    "rota DELETE de participação existe (antes dava 404)",
    /app\.delete\("\/api\/users\/:userId\/participations\/:eventId"/.test(server)
  );
  check(
    "remoção devolve 404 quando não há registro (não finge sucesso)",
    /removeParticipationFallback\(userId, eventId\)[\s\S]{0,200}404/.test(server)
  );
  check("helper removeParticipationFallback existe", /export function removeParticipationFallback/.test(fallback));
  check("serviço do frontend chama a rota que existe", /participations\/\$\{eventId\}`/.test(particService));

  check(
    "GET participações checa dono ou cargo administrativo",
    /podeAgirSobreParticipacoes/.test(server)
  );
  check("403 quando não é o dono", /só pode consultar as suas próprias participações/.test(server));
  check("403 ao confirmar presença em nome de outro", /só pode confirmar presença para você mesmo/.test(server));
  check("403 ao cancelar presença de outro", /só pode cancelar as suas próprias participações/.test(server));
  check(
    "cargo conferido no BANCO, não no token",
    /checkIsChefe\(dbUser, req\.user\)/.test(server)
  );
}

// ===========================================================================
console.log("\n=== 5. Diretório de usuários lido pelo servidor ===");
// ===========================================================================
{
  check(
    "usersService usa /api/users fora do modo estático",
    /if \(!isStaticHosting\(\)\)[\s\S]{0,400}\/api\/users/.test(usersService)
  );
  check(
    "falha do diretório vira erro, não lista vazia",
    /if \(!res\.ok\)[\s\S]{0,200}error: new Error/.test(usersService)
  );
  check(
    "resposta inesperada também vira erro",
    /Resposta inesperada do servidor ao carregar usuários/.test(usersService)
  );
  check(
    "caminho estático (GitHub Pages) preservado",
    /isSupabaseConfigured\(\)/.test(usersService)
  );
}

// ===========================================================================
console.log("\n=== 6. Paginação do diretório — §3.2 ===");
// ===========================================================================
{
  check("rota aceita ?page", /req\.query\.page !== undefined/.test(server));
  check("rota aceita ?pageSize com limite", /Math\.min\(Math\.max\(Math\.trunc\(pageSizeBruto\), 1\), 500\)/.test(server));
  check("resposta informa total e totalPages", /totalPages/.test(server));
  check("busca por nome/e-mail feita no servidor", /String\(u\.nome \|\| ""\)\.toLowerCase\(\)\.includes\(busca\)/.test(server));
  check("filtro por cargo", /filtroRole/.test(server));
  check("filtro por status (ativos/bloqueados)", /filtroStatus === "bloqueados"/.test(server));
  check(
    "compatibilidade: sem ?page devolve lista completa",
    /recorte: pediuPagina \? lista\.slice/.test(server)
  );
}

// ===========================================================================
console.log("\n=== 7. Schema do Drizzle alinhado ao banco real ===");
// ===========================================================================
{
  check("users.must_change_password existe no schema", /mustChangePassword: boolean\('must_change_password'\)/.test(schema));
  check("users.matricula existe no schema", /matricula: text\('matricula'\)/.test(schema));
  check("users.personal_email existe no schema", /personalEmail: text\('personal_email'\)/.test(schema));
  check("users.link_verified_at existe no schema", /linkVerifiedAt: timestamp\('link_verified_at'\)/.test(schema));
}

// ===========================================================================
console.log("\n=== 8. Diagnóstico de banco (§2.4) ===");
// ===========================================================================
{
  check("/api/db-status informa saasConfigured", /saasConfigured/.test(server));
  check("distingue banco em cache offline", /cachedOffline/.test(server));
  check("expõe estatísticas de saúde", /health: getDbHealthStats\(\)/.test(server));
  check(
    "reconexão automática com backoff exponencial (não fica offline para sempre)",
    /export function getOfflineRetryMs[\s\S]{0,200}Math\.pow\(2, factor\)/.test(ler("src/db/index.ts"))
  );
  check(
    "volta a online quando a consulta funciona",
    /export function markDbOnline/.test(ler("src/db/index.ts"))
  );
  check(
    "fallback local só quando não há banco configurado OU após falha registrada",
    /isDbCachedOffline/.test(ler("src/db/index.ts"))
  );
  for (const codigo of ["SAAS_NOT_CONFIGURED", "SAAS_UNREACHABLE"]) {
    check(`código padronizado ${codigo}`, new RegExp(codigo).test(server));
  }
}

// ===========================================================================
console.log("\n=== 9. Monetização: preços vêm do banco ===");
// ===========================================================================
{
  check(
    "catálogo de planos semeado na migration (não no React)",
    /insert into public\.plans/.test(ler("supabase/migrations/20261111_saas_core.sql"))
  );
  const precoNoReact = /14900|29900|69900/.test(painel);
  check("nenhum preço fixo no AdminPanel", !precoNoReact);

  const plansPricing = ler("src/components/PlansAndPricing.tsx");
  check(
    "página pública lê os planos da API (não de constante local)",
    /fetchPlansCatalog/.test(plansPricing) && /\/api\/saas\/plans/.test(ler("src/lib/plansService.ts"))
  );

  check("Master permite editar preço do plano", /"\/api\/master\/plans\/:id"/.test(server));
  check("master/plans só para proprietário da plataforma", /"\/api\/master\/plans"[\s\S]{0,120}requirePlatformOwner/.test(server));
  check("valores editáveis incluem mensal e anual", /monthly_price_cents/.test(server) && /annual_price_cents/.test(server));
  check("adicionais também são editáveis/consultáveis", /plan_addons/.test(ler("supabase/migrations/20261111_saas_core.sql")));
}

// ===========================================================================
console.log("\n=== 10. Webhook de pagamento: assinatura + idempotência ===");
// ===========================================================================
{
  // `indexOf` casa primeiro a lista de rotas comentada no topo do arquivo;
  // ancoramos na DECLARAÇÃO real da rota.
  const bloco = server.slice(server.indexOf('app.post("/api/billing/webhook"'));
  // O handler é longo (valida assinatura, registra, aplica pagamento, responde).
  const trecho = bloco.slice(0, 12000);
  check("webhook valida assinatura Stripe", /verifyStripeSignature/.test(trecho));
  check("webhook valida assinatura genérica (HMAC)", /verifyGenericSignature/.test(trecho));
  check(
    "webhook registra o evento (idempotência)",
    /registerWebhookEvent/.test(trecho) && /registered\.duplicate/.test(trecho)
  );
  check("webhook recusa quando a assinatura é inválida", /signatureValid/.test(trecho));
  check(
    "assinatura inválida é auditada, não ignorada",
    /webhook\.signature_invalid/.test(server)
  );
  check(
    "cobrança usa idempotencyKey",
    /idempotencyKey/.test(ler("src/lib/billing.ts"))
  );
}

// ===========================================================================
console.log("\n=== 11. Servidor sem rede: degrade honesto ===");
// ===========================================================================
{
  check(
    "rotas do painel respondem 503 tipado quando o banco não responde",
    /responderIndisponivel/.test(server)
  );
  check(
    "503 inclui hint acionável",
    /hint:/.test(server)
  );
  check(
    "auditoria não devolve lista vazia em falha de rede",
    /Falha ao ler auditoria[\s\S]{0,300}responderIndisponivel/.test(server)
  );
}

// ===========================================================================
console.log("\n=== 12. Migrations versionadas e idempotentes ===");
// ===========================================================================
{
  const migracoes = [
    "supabase/migrations/20261111_saas_core.sql",
    "supabase/migrations/20261112_auth_security_tokens.sql",
    "supabase/migrations/20261113_close_open_rls.sql",
    "supabase/migrations/20261118_profile_change_requests.sql",
    "supabase/migrations/20261119_school_profiles.sql",
  ];
  for (const m of migracoes) {
    check(`migration presente: ${m.split("/").pop()}`, existsSync(m));
  }
  check(
    "nenhuma migration apaga dados (drop table/database)",
    migracoes.every((m) => !/drop\s+(table|database)/i.test(ler(m)))
  );
  check(
    "RLS fecha escrita pública (política de leitura continua)",
    /drop policy if exists/.test(ler("supabase/migrations/20261113_close_open_rls.sql"))
  );

  /*
    ARMADILHA DE ORDEM — o bug que quase passou.

    A 20261113 fecha as policies públicas. Mas as migrations 20261118 e
    20261119 rodam DEPOIS dela e, na versão original, CRIavam policies
    permissivas (`insert/update with check (true)`). Num ambiente novo, o
    fechamento era desfeito e a escrita pública voltava.

    Este teste percorre as migrations em ORDEM cronológica e falha se qualquer
    uma posterior à 20261113 criar escrita pública.
  */
  const escritasPermitidas = [];
  for (const m of migracoes.sort()) {
    if (m <= "supabase/migrations/20261113_close_open_rls.sql") continue;
    const sql = ler(m);
    const linhas = sql.split("\n");
    linhas.forEach((linha, i) => {
      // Só conta CREATE POLICY real, não comentário explicando o problema.
      if (/^\s*--/.test(linha)) return;
      if (!/create policy/i.test(linha)) return;
      if (/with check \(true\)/i.test(linha) || /using \(true\)/i.test(linha)) {
        escritasPermitidas.push(`${m.split("/").pop()} (linha ${i + 1})`);
      }
    });
  }
  check(
    "nenhuma migration POSTERIOR à 20261113 recria escrita pública",
    escritasPermitidas.length === 0,
    escritasPermitidas.join(", ")
  );

  check(
    "20261118 remove as policies permissivas antigas (idempotente)",
    /drop policy if exists allow_insert_profile_requests/.test(
      ler("supabase/migrations/20261118_profile_change_requests.sql")
    )
  );
  check(
    "20261119 remove a escrita pública da ficha da escola",
    /drop policy if exists allow_update_school_profiles/.test(
      ler("supabase/migrations/20261119_school_profiles.sql")
    )
  );
  check(
    "leitura pública da ficha da escola preservada (é conteúdo do mural)",
    /create policy allow_read_school_profiles[\s\S]{0,80}for select/.test(
      ler("supabase/migrations/20261119_school_profiles.sql")
    )
  );
}

// ===========================================================================
console.log("\n=== 13. Execução real: servidor + permissões ===");
// ===========================================================================
const PORT = 3999;
const env = {
  ...process.env,
  PORT: String(PORT),
  SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef",
  SUPABASE_SECRET_KEY: "fake-para-teste",
  BOOTSTRAP_ADMIN_EMAIL: "chefe.r36@teste.local",
  BOOTSTRAP_ADMIN_PASSWORD: "TesteR36Seguro",
};

const proc = spawn("npx", ["tsx", "server.ts"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // permite matar o grupo todo no finally
});
let log = "";
proc.stdout.on("data", (d) => (log += d.toString()));
proc.stderr.on("data", (d) => (log += d.toString()));

const base = `http://127.0.0.1:${PORT}`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await dormir(500);
  }
  return false;
}

try {
  const subiu = await esperarServidor();
  check("servidor sobe", subiu, log.slice(-300));

  if (subiu) {
    const login = await fetch(`${base}/api/auth/local-login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.BOOTSTRAP_ADMIN_EMAIL, password: env.BOOTSTRAP_ADMIN_PASSWORD }),
    }).then((r) => r.json());
    const token = login.token;
    check("login do Chefe funciona", typeof token === "string" && token.length > 50);
    const auth = { Authorization: `Bearer ${token}` };

    // --- paginação ---
    const semPage = await fetch(`${base}/api/users`, { headers: auth }).then((r) => r.json());
    check("GET /api/users sem ?page mantém compatibilidade", Array.isArray(semPage.users));

    const p1 = await fetch(`${base}/api/users?page=1&pageSize=2`, { headers: auth }).then((r) => r.json());
    check("paginação devolve no máximo pageSize", p1.users.length <= 2);
    check("paginação informa total", typeof p1.total === "number");
    check("paginação informa totalPages", typeof p1.totalPages === "number");

    // --- auditoria sem rede: 503 tipado, nunca lista vazia ---
    const aud = await fetch(`${base}/api/admin/audit`, { headers: auth });
    const audBody = await aud.json();
    check(
      "auditoria sem banco responde 503 tipado (não [] silencioso)",
      aud.status === 503 &&
        ["SAAS_NOT_CONFIGURED", "SAAS_UNREACHABLE"].includes(audBody.code),
      `status=${aud.status} code=${audBody.code}`
    );

    // --- escopo de dono nas participações ---
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: "Aluno R36",
        // Único por execução: o fallback persiste em JSON e um e-mail fixo
        // faria a segunda rodada falhar com "já cadastrado".
        email: `aluno.r36.${Date.now()}@teste.local`,
        password: "Xyz9Kq2mPl",
        role: "Estudante",
        institution: "Escola R36",
      }),
    }).then((r) => r.json());
    const alunoToken = reg?.user ? reg.token : null;
    check("registro de aluno comum funciona", Boolean(alunoToken), JSON.stringify(reg).slice(0, 160));

    if (!alunoToken) {
      // Sem aluno não há como validar escopo de dono; avisamos em vez de
      // estourar um TypeError que esconde o motivo real.
      console.log("  ! registro falhou — pulando verificações de dono");
    }

    if (alunoToken) {
      const alunoAuth = { Authorization: `Bearer ${alunoToken}` };
      const alheio = await fetch(`${base}/api/users/1/participations`, { headers: alunoAuth });
      check("aluno não lê participações de terceiro (403)", alheio.status === 403, `status=${alheio.status}`);

      const proprio = await fetch(`${base}/api/users/${reg.user.id}/participations`, { headers: alunoAuth });
      check("aluno lê as próprias participações (200)", proprio.status === 200, `status=${proprio.status}`);

      const tentarCancelar = await fetch(`${base}/api/users/1/participations/1`, {
        method: "DELETE",
        headers: alunoAuth,
      });
      check("aluno não cancela participação de terceiro (403)", tentarCancelar.status === 403, `status=${tentarCancelar.status}`);
    }

    // --- Chefe consegue operar sobre outro usuário ---
    const chefeLe = await fetch(`${base}/api/users/1/participations`, { headers: auth });
    check("Chefe lê participações de terceiro (200)", chefeLe.status === 200, `status=${chefeLe.status}`);

    const chefeDel = await fetch(`${base}/api/users/1/participations/999`, { method: "DELETE", headers: auth });
    check(
      "DELETE de participação existe e devolve 404 quando não há registro",
      chefeDel.status === 404,
      `status=${chefeDel.status}`
    );

    // --- senha do painel vira hash ---
    const alvoId = reg.user.id;
    const putSenha = await fetch(`${base}/api/users/${alvoId}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NovaSenhaR36" }),
    });
    check("PUT com senha forte é aceito", putSenha.status === 200, `status=${putSenha.status}`);

    const fraca = await fetch(`${base}/api/users/${alvoId}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ password: "123" }),
    });
    check("PUT com senha fraca é recusado (400)", fraca.status === 400, `status=${fraca.status}`);

    const disco = JSON.parse(readFileSync("src/db/fallback_users.json", "utf8"));
    const lista = Array.isArray(disco) ? disco : disco.users || [];
    const alvo = lista.find((u) => String(u.id) === String(alvoId));
    check(
      "senha gravada no banco é hash scrypt (não texto claro)",
      Boolean(alvo) && String(alvo.password).startsWith("scrypt$"),
      alvo ? `início=${String(alvo.password).slice(0, 12)}` : "usuário não encontrado"
    );

    // --- hierarquia: Chefe NÃO é dono da plataforma ---
    const master = await fetch(`${base}/api/master/overview`, { headers: auth });
    check(
      "Chefe da instituição não entra no /master sem allowlist",
      master.status === 403 || master.status === 503,
      `status=${master.status}`
    );

    // --- sem token em rotas sensíveis ---
    for (const rota of ["/api/users", "/api/admin/audit", "/api/admin/school-accounts"]) {
      const r = await fetch(`${base}${rota}`);
      check(`${rota} sem token → 401`, r.status === 401, `status=${r.status}`);
    }
  }
} finally {
  // `spawn` não é dono do grupo de processos: matar só o `npm exec` deixava o
  // servidor de verdade vivo, segurando a porta e o event loop do teste.
  // Por isso o detached + kill do grupo inteiro.
  try {
    if (proc.pid) process.kill(-proc.pid, "SIGTERM");
  } catch {
    /* grupo já encerrado */
  }
  await dormir(800);
  try {
    if (proc.pid) process.kill(-proc.pid, "SIGKILL");
  } catch {
    /* já morreu */
  }
  proc.kill("SIGKILL");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} passaram, ${fail} falharam`);
if (fail > 0) {
  console.log("\nFalhas:");
  for (const f of falhas) console.log("  -", f);
  process.exit(1);
}
console.log("RODADA 36 OK — restauração verificada");
