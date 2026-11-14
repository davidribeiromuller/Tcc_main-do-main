/**
 * Testes da rodada 13 — navegação, voltar ao dashboard e rolagem no mobile.
 *
 * Cobre a lógica pura de `lib/navigation.ts`, que é onde estavam os erros:
 * prefixo do GitHub Pages, histórico sem `state` e destino do botão de voltar.
 *
 * Rodar: npx tsx test-round13.mjs
 */
import {
  removerBase,
  telaDoCaminho,
  resolverTelaInicial,
  resolverTelaDoPopState,
  destinoDoBotaoVoltar,
} from "./src/lib/navigation.ts";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const BASE_PAGES = "/Tcc_main-do-main/";

console.log("\n=== 1. Prefixo do GitHub Pages ===");
{
  ok(
    "desconta o base",
    removerBase("/Tcc_main-do-main/admin", BASE_PAGES) === "/admin",
    removerBase("/Tcc_main-do-main/admin", BASE_PAGES)
  );
  ok("raiz do repositório vira /", removerBase("/Tcc_main-do-main/", BASE_PAGES) === "/");
  ok("raiz descoberta", removerBase("/admin", "/") === "/admin");
  ok("base relativa também", removerBase("/tcc_main-do-main/feed", "/Tcc_main-do-main/") === "/feed");
}

console.log("\n=== 2. Caminho → tela ===");
{
  ok("/admin", telaDoCaminho("/admin") === "admin");
  ok("/feed", telaDoCaminho("/feed") === "feed");
  ok("/eventos → feed", telaDoCaminho("/eventos") === "feed");
  ok("/escolas → schools", telaDoCaminho("/escolas") === "schools");
  ok("/escolas/slug → schoolDetail", telaDoCaminho("/escolas/helena-wysocki") === "schoolDetail");
  ok("/ → welcome", telaDoCaminho("/") === "welcome");
  ok("/desconhecido → null", telaDoCaminho("/xyz") === null);
}

console.log("\n=== 3. Tela inicial no boot ===");
{
  // O caso da screenshot: usuário em /Tcc_main-do-main/admin recarrega.
  ok(
    "admin sobrevive ao reload no Pages",
    resolverTelaInicial({
      pathname: "/Tcc_main-do-main/admin",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: true,
    }) === "admin"
  );

  ok(
    "painel sem login cai em welcome",
    resolverTelaInicial({
      pathname: "/Tcc_main-do-main/admin",
      base: BASE_PAGES,
      ultimaTela: "admin",
      logado: false,
    }) === "welcome"
  );

  ok(
    "última tela da sessão é usada",
    resolverTelaInicial({
      pathname: "/Tcc_main-do-main/",
      base: BASE_PAGES,
      ultimaTela: "calendar",
      logado: true,
    }) === "calendar"
  );

  ok(
    "sem nada conhecido → splash",
    resolverTelaInicial({
      pathname: "/Tcc_main-do-main/",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: false,
    }) === "splash"
  );

  ok(
    "detalhe de escola não é restaurado sozinho",
    resolverTelaInicial({
      pathname: "/Tcc_main-do-main/",
      base: BASE_PAGES,
      ultimaTela: "schoolDetail",
      logado: true,
    }) === "splash"
  );
}

console.log("\n=== 4. Botão voltar do navegador/celular (popstate) ===");
{
  ok(
    "usa o state do histórico",
    resolverTelaDoPopState({
      state: { screen: "calendar" },
      pathname: "/Tcc_main-do-main/xyz",
      base: BASE_PAGES,
      ultimaTela: "feed",
      logado: true,
    }) === "calendar"
  );

  // O bug: histórico sem state e URL com prefixo. Antes devolvia "feed".
  ok(
    "sem state, lê a URL com prefixo",
    resolverTelaDoPopState({
      state: null,
      pathname: "/Tcc_main-do-main/settings",
      base: BASE_PAGES,
      ultimaTela: "feed",
      logado: true,
    }) === "settings"
  );

  ok(
    "sem state e sem rota, usa a última tela",
    resolverTelaDoPopState({
      state: null,
      pathname: "/Tcc_main-do-main/",
      base: BASE_PAGES,
      // Não pode ser "admin": "/" resolve para welcome antes de olhar a
      // sessão, e essa é a regra correta (a URL manda).
      ultimaTela: "calendar",
      logado: true,
    }) === "welcome"
  );

  ok(
    "URL desconhecida usa a última tela da sessão",
    resolverTelaDoPopState({
      state: null,
      pathname: "/Tcc_main-do-main/rota-inexistente",
      base: BASE_PAGES,
      ultimaTela: "calendar",
      logado: true,
    }) === "calendar"
  );

  ok(
    "deslogado não volta para o painel",
    resolverTelaDoPopState({
      state: { screen: "admin" },
      pathname: "/Tcc_main-do-main/",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: false,
    }) === "welcome"
  );

  ok(
    "sem nada: logado → feed",
    resolverTelaDoPopState({
      state: null,
      pathname: "/Tcc_main-do-main/desconhecido",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: true,
    }) === "feed"
  );

  ok(
    "sem nada: deslogado → welcome",
    resolverTelaDoPopState({
      state: null,
      pathname: "/Tcc_main-do-main/desconhecido",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: false,
    }) === "welcome"
  );

  ok(
    "state inválido é ignorado",
    resolverTelaDoPopState({
      state: { screen: "telaInventada" },
      pathname: "/Tcc_main-do-main/map",
      base: BASE_PAGES,
      ultimaTela: null,
      logado: true,
    }) === "map"
  );
}

console.log("\n=== 5. Destino do botão 'voltar ao dashboard' ===");
{
  // Veio do painel → volta ao painel (o pedido do usuário).
  ok(
    "veio do painel → painel",
    destinoDoBotaoVoltar({ telaAnterior: "admin", podeVerDashboard: true, logado: true }) === "admin"
  );

  // Veio de outra tela → volta para essa tela.
  ok(
    "veio do calendário → calendário",
    destinoDoBotaoVoltar({ telaAnterior: "calendar", podeVerDashboard: true, logado: true }) === "calendar"
  );

  // Não sabe de onde veio, mas é admin → dashboard.
  ok(
    "sem origem, admin → dashboard",
    destinoDoBotaoVoltar({ telaAnterior: null, podeVerDashboard: true, logado: true }) === "admin"
  );

  // Logado sem permissão de dashboard → mural.
  ok(
    "sem permissão → mural",
    destinoDoBotaoVoltar({ telaAnterior: null, podeVerDashboard: false, logado: true }) === "feed"
  );

  // Deslogado → continua na introdução.
  ok(
    "deslogado → welcome",
    destinoDoBotaoVoltar({ telaAnterior: null, podeVerDashboard: false, logado: false }) === "welcome"
  );

  // Origem "welcome" não conta como origem útil.
  ok(
    "origem welcome é ignorada",
    destinoDoBotaoVoltar({ telaAnterior: "welcome", podeVerDashboard: true, logado: true }) === "admin"
  );

  // Origem painel, mas perdeu a permissão (ex.: troca de conta) → mural.
  ok(
    "admin sem permissão → mural",
    destinoDoBotaoVoltar({ telaAnterior: "admin", podeVerDashboard: false, logado: true }) === "feed"
  );
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
