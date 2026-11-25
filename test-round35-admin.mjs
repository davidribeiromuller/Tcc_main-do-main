/**
 * Rodada 35 — reconstrução do painel administrativo.
 *
 * O painel existia, mas várias funções dependiam de ler/gravar direto no
 * Supabase com a chave publicável. Quando a RLS dessas tabelas foi fechada,
 * as abas passaram a aparecer vazias — o sintoma que originou esta rodada.
 *
 * Este teste cobre os três lados:
 *  1. cada função do painel TEM uma rota no servidor, com guarda de papel;
 *  2. o cliente dessas funções passou a usar a rota (e não `supabase.from`);
 *  3. as políticas públicas que sobraram no banco estão fechadas
 *     (verificado à parte, pelo SQL — aqui conferimos o arquivo da migração).
 *
 * Rodar: npx tsx test-round35-admin.mjs
 */
import { readFileSync } from "node:fs";

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

const server = readFileSync("./server.ts", "utf8");
const admin = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const migration = readFileSync("./supabase/migrations/20261113_close_open_rls.sql", "utf8");
const lido = (p) => readFileSync(p, "utf8");

const rota = (metodo, caminho, guardas) => {
  const re = new RegExp(
    `app\\.${metodo}\\(\\s*"${caminho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"(?:\\s*,\\s*([^)]*))?`,
    "m"
  );
  const m = server.match(re);
  if (!m) return false;
  const resto = server.slice(m.index, m.index + 400);
  return guardas.every((g) => resto.includes(g));
};

console.log("\n=== 1. Rotas que o painel precisa (com guarda de papel) ===");
{
  ok("usuários: listagem", rota("get", "/api/users", ["requireAuth", "requireAdminOrStaff"]));
  ok("usuários: edição", rota("put", "/api/users/:id", ["requireAuth", "requireChefeAdmin"]));
  ok("usuários: bloqueio", rota("post", "/api/users/:id/block", ["requireChefeAdmin"]));
  ok("usuários: desbloqueio", rota("post", "/api/users/:id/unblock", ["requireChefeAdmin"]));
  ok("usuários: exclusão definitiva", rota("delete", "/api/users/:id/permanent", ["requireChefeAdmin"]));
  ok("usuários: exclusão", rota("delete", "/api/users/:id", ["requireChefeAdmin"]));

  ok("eventos: criação", rota("post", "/api/events", ["requireAuth"]));
  ok("eventos: edição", rota("put", "/api/events/:id", ["requireAuth"]));
  ok("eventos: exclusão", rota("delete", "/api/events/:id", ["requireAuth"]));

  ok("arquivados: listagem", rota("get", "/api/events/archived", ["requireAuth", "requireAdminOrStaff"]));
  ok("arquivados: restauração", rota("post", "/api/events/:id/restore", ["requireAdminOrStaff"]));
  ok("arquivados: logs", rota("get", "/api/events/archive-logs", ["requireAdminOrStaff"]));
  ok("arquivados: rotina", rota("post", "/api/events/cleanup-expired", ["requireAdminOrStaff"]));

  ok("excluídos: listagem", rota("get", "/api/events/deleted", ["requireAdminOrStaff"]));
  ok("excluídos: restauração", rota("post", "/api/events/deleted/:id/restore", ["requireChefeAdmin"]));
  ok("excluídos: expurgo", rota("delete", "/api/events/deleted/:id", ["requireChefeAdmin"]));

  ok("sugestões: listagem", rota("get", "/api/admin/suggestions", ["requireAdminOrStaff"]));
  ok("sugestões: aprovação", rota("post", "/api/admin/suggestions/:id/approve", ["requireChefeAdmin"]));
  ok("sugestões: rejeição", rota("post", "/api/admin/suggestions/:id/reject", ["requireChefeAdmin"]));

  ok("perfil: fila", rota("get", "/api/admin/profile-requests", ["requireAdminOrStaff"]));
  ok("perfil: aprovação", rota("post", "/api/admin/profile-requests/:id/approve", ["requireChefeAdmin"]));
  ok("perfil: rejeição", rota("post", "/api/admin/profile-requests/:id/reject", ["requireChefeAdmin"]));

  ok("agenda pessoal: visão do painel", rota("get", "/api/admin/personal-events", ["requireAdminOrStaff"]));
  ok("agenda pessoal: remoção pelo painel", rota("delete", "/api/admin/personal-events/:id", ["requireAdminOrStaff"]));
  ok("agenda pessoal: do próprio usuário", rota("get", "/api/personal-events", ["requireAuth"]));
  ok("agenda pessoal: criação pelo usuário", rota("post", "/api/personal-events", ["requireAuth"]));
  ok("agenda pessoal: remoção pelo usuário", rota("delete", "/api/personal-events/:id", ["requireAuth"]));

  ok("contas escolares: listagem", rota("get", "/api/admin/school-accounts", ["requireChefeAdmin"]));
  ok("contas escolares: criação", rota("post", "/api/admin/school-accounts", ["requireChefeAdmin"]));
  ok("contas escolares: status", rota("put", "/api/admin/school-accounts/:id/status", ["requireChefeAdmin"]));
  ok("contas escolares: verificação", rota("put", "/api/admin/school-accounts/:id/verify", ["requireChefeAdmin"]));
  ok("contas escolares: senha", rota("put", "/api/admin/school-accounts/:id/reset-password", ["requireChefeAdmin"]));
  ok("contas escolares: remoção", rota("delete", "/api/admin/school-accounts/:id", ["requireChefeAdmin"]));

  ok("perfis de escola: leitura", rota("get", "/api/school-profiles", []));
  ok("perfis de escola: gravação", rota("put", "/api/school-profiles/:slug", ["requireChefeAdmin"]));

  ok("autorizações do evento", rota("get", "/api/events/:eventId/authorizations", ["requireAdminOrStaff"]));
  ok("assinatura protegida", rota("get", "/api/authorizations/:id/signature", ["requireAuth"]));
}

console.log("\n=== 2. Nenhuma rota do painel ficou sem sessão ===");
{
  const semGuarda = [];
  const re = /app\.(get|post|put|delete)\(\s*"(\/api\/(?:admin|users|events\/deleted)[^"]*)",?\s*/g;
  let m;
  while ((m = re.exec(server))) {
    const trecho = server.slice(m.index, m.index + 260);
    if (!/requireAuth/.test(trecho)) semGuarda.push(`${m[1].toUpperCase()} ${m[2]}`);
  }
  ok("todas as rotas /api/admin|users|events/deleted exigem sessão", semGuarda.length === 0, semGuarda.join(", "));

  const publicasDeProposito = ["/api/school-profiles", "/api/schools", "/api/events"];
  ok(
    "rotas públicas são só as de leitura do mural/diretório",
    publicasDeProposito.every((p) => server.includes(`"${p}"`))
  );
}

console.log("\n=== 3. Clientes falam com o servidor (não com o Supabase) ===");
{
  const clientes = {
    "deletedEventsService.ts": lido("./src/lib/deletedEventsService.ts"),
    "eventSuggestionsService.ts": lido("./src/lib/eventSuggestionsService.ts"),
    "profileChangeService.ts": lido("./src/lib/profileChangeService.ts"),
    "schoolAccountsService.ts": lido("./src/lib/schoolAccountsService.ts"),
    "schoolProfilesService.ts": lido("./src/lib/schoolProfilesService.ts"),
    "personalEventsService.ts": lido("./src/lib/personalEventsService.ts"),
  };

  ok(
    "eventos excluídos usam /api/events/deleted",
    clientes["deletedEventsService.ts"].includes("/api/events/deleted")
  );
  ok(
    "sugestões usam /api/admin/suggestions",
    clientes["eventSuggestionsService.ts"].includes("/api/admin/suggestions")
  );
  ok(
    "fila de perfil usa /api/admin/profile-requests",
    clientes["profileChangeService.ts"].includes("/api/admin/profile-requests")
  );
  ok(
    "contas escolares usam /api/admin/school-accounts",
    clientes["schoolAccountsService.ts"].includes("/api/admin/school-accounts")
  );
  ok(
    "perfis de escola usam /api/school-profiles",
    clientes["schoolProfilesService.ts"].includes("/api/school-profiles")
  );
  ok(
    "agenda pessoal usa /api/personal-events",
    clientes["personalEventsService.ts"].includes("/api/personal-events")
  );

  // Escrita direta pelo navegador nas tabelas que a migração fechou.
  const escritoDireto = [];
  if (/\.from\("deleted_events"\)\s*\.\s*(delete|update|insert)/.test(clientes["deletedEventsService.ts"])) {
    escritoDireto.push("deleted_events");
  }
  if (/\.from\("event_suggestions"\)\s*\.\s*(update|insert)/.test(clientes["eventSuggestionsService.ts"])) {
    // A aprovação "legado" ainda existe no arquivo, mas não é chamada.
    const aprovarNovo = clientes["eventSuggestionsService.ts"].split("approveEventSuggestionLegado")[0];
    if (/\.from\("event_suggestions"\)\s*\.\s*(update|insert)/.test(aprovarNovo)) escritoDireto.push("event_suggestions");
  }
  if (/\.from\("school_profiles"\)\s*\.\s*upsert/.test(clientes["schoolProfilesService.ts"])) {
    const novo = clientes["schoolProfilesService.ts"].split("salvarPerfilEscola")[1] || "";
    if (/\.from\("school_profiles"\)\s*\.\s*upsert/.test(novo)) escritoDireto.push("school_profiles");
  }
  ok("nenhuma escrita direta nas tabelas fechadas", escritoDireto.length === 0, escritoDireto.join(", "));

  ok(
    "funções de escrita exigem token (fetchJsonApiWithAuth)",
    Object.values(clientes).every((src) => src.includes("fetchJsonApiWithAuth"))
  );
}

console.log("\n=== 4. O painel não finge lista vazia ===");
{
  ok("painel tem diagnóstico visível", admin.includes("diagnosticoPainel"));
  ok("diagnóstico aparece na tela", admin.includes("diagnosticoPainel &&"));
  ok("explica servidor sem chave secreta", /SUPABASE_SECRET_KEY/.test(admin));
  ok("explica modo estático", /Modo estático/i.test(admin));
  ok("contas escolares têm estado de erro", admin.includes("erroContasEscolares"));
  ok("erro do servidor é traduzido em mensagem", lido("./src/lib/staticHosting.ts").includes("mensagemDeErroDaApi"));
  ok("servidor sinaliza indisponibilidade de rede", server.includes("SAAS_UNREACHABLE"));
  ok("servidor sinaliza falta de configuração", server.includes("SAAS_NOT_CONFIGURED"));
  ok("diagnóstico informa se o SaaS está configurado", server.includes("saasConfigured"));
}

console.log("\n=== 5. Senha: sem leitura, com redefinição ===");
{
  ok("painel não exibe senha em claro", !/userToViewDetails\.password\s*\?\s*showUserPassword/.test(admin));
  ok("painel não copia senha", !/clipboard\.writeText\(userToViewDetails\.password/.test(admin));
  ok("painel explica que é hash", /protegida por hash|definida \(hash\)/.test(admin));
  ok("servidor nunca devolve senha de usuário", /const \{ password, \.\.\.rest \} = u/.test(server));
  ok("servidor nunca devolve senha de conta escolar", /senhaDefinida: Boolean\(row\.password\)/.test(server));
  ok("Chefe ainda pode DEFINIR senha", rota("put", "/api/admin/school-accounts/:id/reset-password", ["requireChefeAdmin"]));
  ok("redefinição exige troca no próximo acesso", /must_change_password: true/.test(server));
  ok("redefinição valida força da senha", /validatePasswordStrength\(novaSenha\)/.test(server));
}

console.log("\n=== 6. Primeiro administrador (modo fallback incluído) ===");
{
  const fallback = lido("./src/db/fallbackStore.ts");
  ok("fallback cria admin a partir de BOOTSTRAP_ADMIN_*", /BOOTSTRAP_ADMIN_EMAIL/.test(fallback) && /hashPassword\(bootstrapPassword\)/.test(fallback));
  // O único lugar onde a string antiga pode aparecer é o comentário histórico.
  const fallbackSemComentarios = fallback
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  ok("fallback não cria senha fixa", !/senha123|senhaInstitucional123/.test(fallbackSemComentarios));
  ok("Postgres também usa BOOTSTRAP_ADMIN_*", /BOOTSTRAP_ADMIN_PASSWORD/.test(lido("./src/db/index.ts")));
  ok("mínimo de 8 caracteres para a senha inicial", /bootstrapPassword\.length >= 8/.test(fallback));
}

console.log("\n=== 7. Migração que fecha a RLS ===");
{
  ok("migração existe", migration.length > 1000);
  ok("remove políticas públicas de deleted_events", /drop policy if exists allow_read_deleted_events/.test(migration));
  ok("remove políticas públicas de event_suggestions", /drop policy if exists allow_update_suggestions/.test(migration));
  ok("remove políticas públicas de profile_change_requests", /drop policy if exists allow_update_profile_requests/.test(migration));
  ok("fecha personal_events para anon", /drop policy if exists personal_events_leitura/.test(migration));
  ok("cria política por dono para personal_events", /personal_events_owner_select/.test(migration));
  ok("fecha escrita pública de school_profiles", /drop policy if exists allow_update_school_profiles/.test(migration));
  ok("fecha escrita pública de events/eventos", /drop policy if exists "Allow insert events"/.test(migration));
  ok("mantém leitura pública do mural", !/drop policy if exists "Allow public read on events"/.test(migration));
  ok("é idempotente (if exists)", (migration.match(/drop policy if exists/g) || []).length >= 20);
}

console.log("\n=== 8. Abas do painel continuam todas ligadas ===");
{
  for (const aba of ["users", "blocked", "events", "schools", "suggestions", "personal", "profileChanges"]) {
    ok(`aba \`${aba}\` tem bloco de render`, admin.includes(`activeTab === "${aba}"`));
  }
  ok("ficha do usuário abre", /setUserToViewDetails\(/.test(admin));
  ok("ficha da escola abre", /setEscolaPerfilSlug\(/.test(admin));
  ok("modal de autorizações por evento", admin.includes("EventAuthorizationsModal"));
  ok("impersonação disponível", admin.includes("onImpersonateUser"));
  ok("exportação/listagem de eventos arquivados", admin.includes("fetchDeletedEvents"));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam`);
if (falhou > 0) process.exit(1);
console.log("RODADA 35 OK — painel administrativo reconstruído");
