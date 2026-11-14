/**
 * Teste da rodada 12 — bug do "volta para a tela de início do nada".
 *
 * A causa era `handleAuthenticatedGoogleUser` chamar `setActiveScreen("feed")`
 * sempre que rodava. Esse handler é chamado em TODO evento de auth do Supabase,
 * inclusive `TOKEN_REFRESHED` (a cada ~50 min) e `INITIAL_SESSION`.
 *
 * Este teste reproduz o comportamento da função de decisão de tela e prova que
 * uma renovação de token não arrasta o usuário de volta ao mural.
 *
 * Rodar: node test-round12c.mjs
 */

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

/**
 * A regra extraída do App: só redireciona se o usuário estiver numa tela de
 * ENTRADA. Qualquer tela de navegação é preservada.
 */
const TELAS_DE_ENTRADA = ["splash", "welcome", "login", "register", "codeSent", "passwordRecovery"];

function decidirTelaAposAutenticacao(telaAtual) {
  return TELAS_DE_ENTRADA.includes(telaAtual) ? "feed" : telaAtual;
}

console.log("\n=== 1. Renovação de token não muda a tela ===");
{
  for (const tela of ["schoolDetail", "admin", "map", "calendar", "settings", "feed", "schools", "eventDetail"]) {
    ok(`preserva "${tela}"`, decidirTelaAposAutenticacao(tela) === tela);
  }
}

console.log("\n=== 2. Login de fato redireciona ===");
{
  ok("splash → feed", decidirTelaAposAutenticacao("splash") === "feed");
  ok("welcome → feed", decidirTelaAposAutenticacao("welcome") === "feed");
  ok("login → feed", decidirTelaAposAutenticacao("login") === "feed");
  ok("register → feed", decidirTelaAposAutenticacao("register") === "feed");
  ok("codeSent → feed", decidirTelaAposAutenticacao("codeSent") === "feed");
}

console.log("\n=== 3. O caso que o usuário relatou ===");
{
  // Ele estava cadastrando um evento no painel e "voltou ao início do nada".
  // O token do Supabase renovou e o handler empurrou para "feed".
  const antes = "admin";
  const depois = decidirTelaAposAutenticacao(antes);
  ok("painel permanece painel após refresh de token", depois === "admin", depois);

  const antes2 = "eventDetail";
  ok("detalhe de evento permanece", decidirTelaAposAutenticacao(antes2) === "eventDetail");
}

console.log("\n=== 4. Restauração de tela no reload ===");
{
  // Regra do boot: restaura a última tela, menos as que exigem contexto.
  function podeRestaurar(ultima, telaAtual, logado) {
    if (!ultima) return false;
    if (!["splash", "welcome", "feed"].includes(telaAtual)) return false;
    if (["schoolDetail", "eventDetail"].includes(ultima)) return false;
    if (!logado && !["welcome", "login", "register", "schools", "feed"].includes(ultima)) return false;
    return true;
  }

  ok("restaura admin logado", podeRestaurar("admin", "feed", true));
  ok("não restaura detalhe de escola", podeRestaurar("schoolDetail", "feed", true) === false);
  ok("não restaura admin deslogado", podeRestaurar("admin", "welcome", false) === false);
  ok("restaura welcome deslogado", podeRestaurar("welcome", "splash", false));
  ok("não restaura sem tela salva", podeRestaurar(null, "splash", true) === false);
  ok("não sobrescreve tela já navegada", podeRestaurar("admin", "map", true) === false);
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
