/**
 * Rodada 32 — SEGURANÇA (Parte 2 da auditoria SaaS).
 *
 * Cada verificação corresponde a uma falha REAL encontrada no código antes da
 * correção. O teste roda contra o código-fonte e contra as funções puras de
 * `src/lib/security.ts` / `src/middleware/*`.
 *
 * Rodar: npx tsx test-round32-security.mjs
 */
import { readFileSync } from "node:fs";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, validatePasswordStrength, isLegacyPassword } from "./src/lib/security.ts";
import { checkIsChefe, isPlatformOwnerEmail } from "./src/middleware/admin.ts";

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

const semComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const server = readFileSync("./server.ts", "utf8");
const serverLimpo = semComentarios(server);
const authMw = readFileSync("./src/middleware/auth.ts", "utf8");
const adminMw = readFileSync("./src/middleware/admin.ts", "utf8");
const securityLib = readFileSync("./src/lib/security.ts", "utf8");
const authTokens = readFileSync("./src/lib/authTokens.ts", "utf8");
const perms = readFileSync("./src/lib/permissions.ts", "utf8");
const usersService = readFileSync("./src/lib/usersService.ts", "utf8");
const schoolAccounts = readFileSync("./src/lib/schoolAccountsService.ts", "utf8");
const app = readFileSync("./src/App.tsx", "utf8");
const recovery = readFileSync("./src/components/PasswordRecovery.tsx", "utf8");
const fallback = readFileSync("./src/db/fallbackStore.ts", "utf8");
const dbIndex = readFileSync("./src/db/index.ts", "utf8");
const securityMw = readFileSync("./src/middleware/security.ts", "utf8");
const signature = readFileSync("./src/lib/signatureStorage.ts", "utf8");

console.log("\n=== 1. Tokens forjados no navegador ===");
{
  ok("o cliente não monta mais token `local-...|role|...`", !/`local-\$\{currentUser\.uid\}/.test(app));
  ok("o cliente não monta mais token `google-...|role|...`", !/`google-\$\{currentUser\.uid\}/.test(app));
  ok("cliente guarda sessão assinada em chave própria", app.includes('SESSION_TOKEN_KEY = "elo_session_token"'));
  ok("getAuthToken devolve null quando não há sessão válida", /return null;\s*\};\s*\n\s*\n\s*const persistSessionToken/.test(app));
  ok("middleware não aceita mais prefixo `local-`", !authMw.includes("token.startsWith('local-')"));
  ok("middleware não decodifica token `google-` sem verificar", !/isGoogle \) \{/.test(authMw) && !authMw.includes("parts[4] ? decodeURIComponent"));
  ok("middleware não faz 'decodificação segura' de JWT sem verificar", !authMw.includes("safe JWT decoding fallback"));
  ok("middleware valida assinatura HMAC do token próprio", authMw.includes("verifySessionToken"));
  ok("middleware valida JWT do provedor contra JWKS", authMw.includes("verifyProviderJwt"));
  ok("middleware rejeita usuário bloqueado", authMw.includes("ativo === false"));
  ok("papel do token não é confiado (usa dbUser)", /role: dbUser\?\.role \|\| 'Aluno'/.test(authMw));
}

console.log("\n=== 2. Funções criptográficas (execução real) ===");
{
  const hash = hashPassword("SenhaForte123");
  ok("hash não contém a senha em claro", !hash.includes("SenhaForte123"));
  ok("hash usa prefixo scrypt com parâmetros", /^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(hash));
  ok("verificação aceita a senha correta", verifyPassword("SenhaForte123", hash).ok === true);
  ok("verificação rejeita senha errada", verifyPassword("SenhaForte124", hash).ok === false);
  ok("hashes são diferentes para a mesma senha (salt)", hashPassword("abc12345") !== hashPassword("abc12345"));
  ok("hash legado sinaliza migração", verifyPassword("texto", "texto").needsUpgrade === true);
  ok("isLegacyPassword identifica texto claro", isLegacyPassword("senha123") === true && isLegacyPassword(hash) === false);
  ok("senha curta é recusada", validatePasswordStrength("abc1") !== null);
  ok("senha sem número é recusada", validatePasswordStrength("abcdefgh") !== null);
  ok("senha previsível é recusada", validatePasswordStrength("senha123456") !== null);
  ok("senha forte é aceita", validatePasswordStrength("Escola2026#elo") === null);
}

console.log("\n=== 3. Sessão assinada (HMAC) ===");
{
  process.env.SESSION_SECRET = "x".repeat(48);
  const token = createSessionToken({ sub: "uid-123", via: "password" });
  ok("token tem formato elo1.<payload>.<hmac>", /^elo1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token || ""));
  const payload = verifySessionToken(token);
  ok("token válido é aceito", !!payload && payload.sub === "uid-123");
  const partes = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: 9999999999, v: 1, iat: 1, sid: "x" })).toString("base64url");
  ok("payload alterado é rejeitado", verifySessionToken(`elo1.${forgedPayload}.${partes[2]}`) === null);
  ok("assinatura trocada é rejeitada", verifySessionToken(`elo1.${partes[1]}.AAAA`) === null);
  const expired = createSessionToken({ sub: "uid-1", ttlSeconds: -10 });
  ok("token expirado é rejeitado", verifySessionToken(expired) === null);
  delete process.env.SESSION_SECRET;
  process.env.NODE_ENV = "production";
  ok("sem SESSION_SECRET em produção não emite token (fail-closed)", createSessionToken({ sub: "u" }) === null);
  process.env.NODE_ENV = "development";
}

console.log("\n=== 4. Privilégio de administrador ===");
{
  delete process.env.PLATFORM_OWNER_EMAILS;
  ok("e-mail hardcoded não dá chefe", checkIsChefe({ email: "diretoria@helenawysocki.com" }) === false);
  ok("e-mail hardcoded não dá chefe (2)", checkIsChefe({ email: "davidribeiromuller2009@gmail.com" }) === false);
  ok("role do banco dá chefe", checkIsChefe({ email: "x@y.com", role: "Diretor" }) === true);
  ok("isAdmin do banco dá chefe", checkIsChefe({ email: "x@y.com", isAdmin: true }) === true);
  ok("token sozinho não dá chefe", checkIsChefe(undefined, { isAdmin: true, email: "attacker@x.com" }) === false);
  ok("sem PLATFORM_OWNER_EMAILS ninguém é proprietário", isPlatformOwnerEmail("qualquer@x.com") === false);
  process.env.PLATFORM_OWNER_EMAILS = "owner@elo.com";
  ok("allowlist do ambiente reconhece proprietário", isPlatformOwnerEmail("OWNER@elo.com") === true);
  ok("allowlist não reconhece outro e-mail", isPlatformOwnerEmail("outro@elo.com") === false);
  delete process.env.PLATFORM_OWNER_EMAILS;
  ok("server exige requirePlatformOwner nas rotas master", (server.match(/\/api\/master\//g) || []).length > 0 && /requirePlatformOwner/.test(server));
  ok("admin middleware não tem e-mail fixo", !semComentarios(adminMw).includes("diretoria@helenawysocki.com") && !semComentarios(adminMw).includes("davidribeiromuller2009"));
  ok("permissions.ts não tem e-mail fixo", !semComentarios(perms).includes("davidribeiromuller2009"));
  ok("usersService não promove por e-mail", !semComentarios(usersService).includes("cleanEmail === \"diretoria@helenawysocki.com\""));
  ok("fallbackStore não promove por e-mail", !semComentarios(fallback).includes("cleanEmail === 'diretoria@helenawysocki.com'"));
}

console.log("\n=== 5. Senhas em texto claro ===");
{
  ok("server grava hash no cadastro", /hashPassword\(password\)/.test(server));
  ok("server migra senha legada no login", /needsUpgrade/.test(server));
  // Rodada 35: a gravação da senha saiu do navegador e foi para o servidor.
  ok("contas escolares gravam hash",
    /from\("school_accounts"\)[\s\S]{0,700}password: hashPassword\(/.test(server) &&
    /\/api\/admin\/school-accounts/.test(schoolAccounts));
  ok("redefinição de conta escolar grava hash",
    /password: hashPassword\(novaSenha\)/.test(server) &&
    /redefinirSenhaContaEscolar/.test(schoolAccounts));
  ok("autenticação escolar usa verifyPassword", /verifyPassword\(password, conta\.password\)/.test(schoolAccounts));
  ok("seed do banco não cria senha fixa", !semComentarios(dbIndex).includes("senha123") && dbIndex.includes("BOOTSTRAP_ADMIN_PASSWORD"));
  ok("seed exige admin inexistente antes de criar", /is_admin = true/.test(dbIndex) && /adminCount/.test(dbIndex));
  ok("defaultData não versiona senha utilizável", !semComentarios(readFileSync("./src/data/defaultData.ts", "utf8")).includes('password: "senha123"'));
  ok("fallback não versiona senha utilizável", !fallback.includes('password: "senhaInstitucional123"'));
  ok("URL de recuperação não é devolvida ao cliente", !/resetUrl:\s*resetUrl/.test(server) && !/token:\s*resetToken/.test(server));
  ok("código SMS não é devolvido ao cliente", !/testCode/.test(server));
  // O único token aceito pelo cliente é o emitido APÓS provar posse do SMS
  // (`verify-phone-code`). O pedido por e-mail não devolve token algum.
  ok("pedido por e-mail não devolve token ao cliente", !/setActiveToken\(data\.token\)/.test(recovery));
  ok("token de reset não vem do pedido por e-mail", !/emailSuccess[\s\S]{0,80}token/.test(recovery));
  ok("tela de recuperação não cria token local", !recovery.includes("sb-token-") && !recovery.includes("phone-token-"));
  ok("tela de recuperação não redefines senha direto no Supabase", !recovery.includes("resetUserPasswordDirectInSupabase"));
  ok("reset direto no cliente foi desativado", !usersService.includes("export async function resetUserPasswordDirectInSupabase"));
  ok("tokens de recuperação são persistidos com hash", authTokens.includes("hashOpaqueToken(token)") && authTokens.includes("password_reset_tokens"));
  ok("OTP é gravado como hash", authTokens.includes("code_hash") && authTokens.includes("hashOpaqueToken(`${code}:${email}`)"));
  ok("resposta de recuperação é neutra (anti-enumeração)", server.includes("genericRecoveryMessage"));
}

console.log("\n=== 6. Headers, CORS e rate limit ===");
{
  ok("helmet é usado", securityMw.includes("helmet("));
  ok("CSP explícita definida", securityMw.includes("contentSecurityPolicy"));
  ok("HSTS habilitado em produção", /hsts:\s*isProduction/.test(securityMw));
  ok("CORS por allowlist", securityMw.includes("ALLOWED_ORIGINS") && securityMw.includes("Access-Control-Allow-Origin"));
  ok("rate limit global em /api", securityMw.includes('app.use("/api/", globalLimiter)'));
  ok("rate limit específico de auth", /authLimiter/.test(server));
  ok("rate limit específico de IA", /aiLimiter/.test(server));
  ok("x-powered-by desativado", securityMw.includes('app.disable("x-powered-by")'));
  ok("server aplica applyHttpSecurity", server.includes("applyHttpSecurity(app"));
  ok("helmet e express-rate-limit são dependências", /"helmet"/.test(readFileSync("./package.json", "utf8")) && /"express-rate-limit"/.test(readFileSync("./package.json", "utf8")));
}

console.log("\n=== 7. Assinaturas (dado sensível) ===");
{
  ok("bucket de assinaturas é privado", signature.includes('SIGNATURE_BUCKET = "signatures"') && signature.includes("createSignedUrl"));
  ok("URL assinada tem validade curta", signature.includes("SIGNED_URL_TTL_SECONDS = 300"));
  ok("endpoint de assinatura exige autenticação", /app\.get\("\/api\/authorizations\/:id\/signature", requireAuth/.test(server));
  ok("endpoint valida permissão antes de servir", /requesterIsStaff/.test(server));
  ok("fallback em disco não é público (no-store)", /Cache-Control", "private, no-store"/.test(server));
  ok("receipt usa URL assinada", readFileSync("./src/components/AuthorizationReceiptModal.tsx", "utf8").includes("Authorization: `Bearer ${token}`"));
}

console.log("\n=== 7b. Autorizações de menores e arquivamento ===");
{
  ok("criar autorização exige sessão", /app\.post\("\/api\/events\/:eventId\/authorizations", requireAuth/.test(server));
  ok("estudante só assina para si", /isAlunoAssinandoParaSi/.test(server));
  ok("equipe administrativa é identificada por papel", /isEquipeAdmin/.test(server));
  ok("vínculo do estudante vem do token", /String\(dbUser\?\.uid \|\| req\.user!\.uid\)/.test(server));
  ok("bloqueado não cria autorização", /dbUser\.ativo === false[\s\S]{0,200}blocked: true/.test(server));
  ok("consulta de situação exige sessão", /authorizations\/check", requireAuth/.test(server));
  ok("consulta alheia é negada", /ownIdentityCandidates\(req, dbUser\)\.includes\(studentUserId\)/.test(server));
  ok("listar autorizações do evento exige administração", /authorizations",\s*\n\s*requireAuth,\s*\n\s*requireAdminOrStaff/.test(server));
  ok("listar autorizações por usuário exige sessão", /users\/:userId\/authorizations", requireAuth/.test(server));
  ok("recusa não revela se o id existe", /AUTHORIZATION_FORBIDDEN/.test(server) && !/Autorização não encontrada[\s\S]{0,40}403/.test(server));
  ok("cliente envia Bearer ao listar autorizações", /fetchJsonApiWithAuth\(`\/api\/events\/\$\{eventId\}\/authorizations`/.test(readFileSync("./src/components/EventAuthorizationsModal.tsx", "utf8")));
  ok("cliente envia Bearer ao criar autorização", /Authorization: `Bearer \$\{token\}`/.test(readFileSync("./src/components/ParentalAuthorizationModal.tsx", "utf8")));
  ok("eventos arquivados exigem administração", /\/api\/events\/archived", requireAuth, requireAdminOrStaff/.test(server));
  ok("restaurar evento exige administração", /\/api\/events\/:id\/restore", requireAuth, requireAdminOrStaff/.test(server));
  ok("logs de arquivamento exigem administração", /archive-logs", requireAuth, requireAdminOrStaff/.test(server));
  ok("cleanup não pode ser disparado por anônimo", /cleanup-expired", requireAuth, requireAdminOrStaff/.test(server));
  ok("catálogo público de escolas não lê dados de aluno", /ARAUCARIA_SCHOOLS/.test(server));
}

console.log("\n=== 8. IA protegida ===");
{
  ok("endpoint de IA exige autenticação", /app\.post\("\/api\/ai\/chat", aiLimiter\(\), requireAuth/.test(server));
  ok("cota por instituição verificada", server.includes("AI_QUOTA_EXHAUSTED"));
  ok("entitlement de IA verificado", server.includes("FEATURE_NOT_ENTITLED"));
  ok("consumo registrado após chamada real", server.includes("recordUsage(") && server.includes('featureKey: "ai_assistant"'));
  ok("fallback local não consome cota", /source: "local_fallback"/.test(server));
  // O token agora sai de `getStoredSessionToken()` (fonte única), não de uma
  // string literal repetida em cada componente.
  ok(
    "cliente envia token na chamada da IA",
    /getStoredSessionToken\(\)[\s\S]{0,400}Authorization: `Bearer \$\{token\}`/.test(
      readFileSync("./src/components/AIChatAssistant.tsx", "utf8")
    )
  );
  ok("GEMINI_API_KEY nunca vai ao cliente", !app.includes("GEMINI_API_KEY"));
}

console.log("\n=== 8b. Telas novas realmente renderizáveis ===");
{
  const appSrc = readFileSync("./src/App.tsx", "utf8");
  const nav = readFileSync("./src/lib/navigation.ts", "utf8");

  // Regressão real encontrada na rodada 34: os blocos de `plans`, `subscription`,
  // `master` e `privacy` estavam dentro da casca de navegação, mas a lista de
  // telas da casca não os incluía — as telas existiam e nunca abriam.
  const listaDaCasca = (appSrc.split("LOGGED IN & GUEST NAVIGATION SHELLS")[1] || "")
    .split("].includes(activeScreen)")[0];
  for (const tela of ["plans", "subscription", "master", "privacy"]) {
    ok(`tela \`${tela}\` está na casca de navegação`, listaDaCasca.includes(`"${tela}"`));
  }

  for (const rota of ["/planos", "/assinatura", "/master", "/privacidade"]) {
    ok(`rota \`${rota}\` é reconhecida`, nav.includes(`"${rota}"`));
  }
  ok("planos e privacidade são públicas", !/TELAS_RESTRITAS = \[[^\]]*"plans"/.test(nav) && !/TELAS_RESTRITAS = \[[^\]]*"privacy"/.test(nav));
  ok("assinatura e master exigem sessão", /TELAS_RESTRITAS = \[[^\]]*"subscription"[^\]]*"master"/.test(nav));
  ok("URL de navegação usa a tabela canônica", /ROTAS_POR_TELA\[screen\]/.test(appSrc));
  ok("home tem entrada para a vitrine", /Veja planos e preços/.test(appSrc));
  ok("rodapé da home tem link para planos", /Planos para escolas/.test(readFileSync("./src/components/WelcomeScreen.tsx", "utf8")));
  ok("rodapé da home tem LGPD", /Privacidade e dados \(LGPD\)/.test(readFileSync("./src/components/WelcomeScreen.tsx", "utf8")));
  ok("painel Master tem guarda de tela", /isPlatformOwner\(currentUser\) \?/.test(appSrc));
  ok("assinatura tem guarda de tela", /canAccessAdminPanel\(currentUser\) \?/.test(appSrc));
}

console.log("\n=== 9. LGPD ===");
{
  ok("canal do titular implementado", server.includes("/api/privacy/request"));
  ok("consentimento registrado", server.includes("/api/privacy/consent") && authTokens.includes("consent_records"));
  ok("política de privacidade existe e tem versão", readFileSync("./src/components/PrivacyPolicy.tsx", "utf8").includes("POLICY_VERSION"));
  ok("tela de configurações oferece pedido do titular", readFileSync("./src/components/Settings.tsx", "utf8").includes("PrivacyRequestForm"));
  ok("política afirma que não vende dados de alunos", /não vendemos dados de alunos/i.test(readFileSync("./src/components/PrivacyPolicy.tsx", "utf8")));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam`);
if (falhou > 0) process.exit(1);
console.log("RODADA 32 OK — segurança");
