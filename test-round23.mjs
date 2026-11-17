/**
 * Testes da rodada 23 — o padrão de rolagem aprovado, aplicado a TODAS as telas.
 *
 * Contexto: a rolagem do painel ADM passou a funcionar na rodada 22. O
 * usuário pediu "APLIQUE EM TODAS AS TELAS AGORA".
 *
 * O padrão aprovado, tela por tela:
 *   1. a tela NÃO monta scroller vertical próprio (`overflow-y-auto`/`h-full`);
 *   2. ela é filha de um wrapper `.app-screen` (bloco de conteúdo comum);
 *   3. todo scroller interno só existe em modais (`fixed inset-0`, `max-h-*`)
 *      ou em faixas horizontais;
 *   4. nenhuma camada declara `touch-action: none` fora do mapa;
 *   5. `overscroll-behavior` só é confinado no eixo X.
 *
 * Rodar: npx tsx test-round23.mjs
 */
import { readFileSync } from "node:fs";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const ler = (p) => readFileSync(p, "utf8");
const app = ler("./src/App.tsx");
const css = ler("./src/index.css");
const cssLimpo = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Telas renderizadas dentro do shell principal. */
const TELAS = {
  "Mural/Feed": "./src/components/Feed.tsx",
  "Agenda": "./src/components/CalendarView.tsx",
  "Ajustes": "./src/components/Settings.tsx",
  "Apoio": "./src/components/Contact.tsx",
  "Detalhe do evento": "./src/components/EventDetail.tsx",
  "Painel ADM": "./src/components/AdminPanel.tsx",
  "Portal escolar": "./src/components/SchoolPortal.tsx",
  "Catálogo de escolas": "./src/components/SchoolsCatalog.tsx",
  "Detalhe da escola": "./src/components/SchoolDetail.tsx",
  "Introdução": "./src/components/WelcomeScreen.tsx",
  "Login": "./src/components/Login.tsx",
  "Cadastro": "./src/components/Register.tsx",
  "Recuperação de senha": "./src/components/PasswordRecovery.tsx",
};

console.log("\n=== 1. Nenhuma tela monta scroller vertical próprio ===\n");
{
  for (const [nome, arq] of Object.entries(TELAS)) {
    const fonte = ler(arq);
    const raizes = [...fonte.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
    // raiz = primeira className com `pb-bottom-nav`, `min-h-[100dvh]` ou `app-screen`
    const raiz = raizes.find((c) => /pb-bottom-nav|min-h-\[100dvh\]/.test(c)) || "";
    ok(`${nome}: raiz encontrada`, raiz.length > 0);
    ok(`${nome}: sem \`overflow-y-auto\` na raiz`, !/overflow-y-auto/.test(raiz), raiz.slice(0, 90));
    ok(`${nome}: sem \`h-full\` na raiz`, !/\bh-full\b/.test(raiz));
    ok(`${nome}: sem \`h-screen\`/\`h-[100dvh]\` fixo na raiz`,
      !/(?<!min-)\bh-screen\b|(?<!min-)\bh-\[100dvh\]/.test(raiz));
  }
}

console.log("=== 2. Toda tela do shell usa o wrapper `.app-screen` ===\n");
{
  const telasShell = [
    "feed-tab", "schools-tab", "school-detail-tab", "calendar-tab", "admin-tab",
    "school-portal-tab", "settings-tab", "contact-view", "event-detail-view", "map-tab",
    "welcome-screen", "login-screen", "register-screen", "recovery-screen",
  ];
  for (const chave of telasShell) {
    const re = new RegExp(`key="${chave}"[\\s\\S]{0,400}?className="([^"]+)"`);
    const cls = app.match(re)?.[1] || "";
    const ehMapa = chave === "map-tab";
    ok(`tela ${chave}: wrapper sem \`absolute inset-0\``, !!cls && !/absolute inset-0/.test(cls), cls);
    ok(`tela ${chave}: wrapper sem \`h-full\`/scroller`,
      !!cls && !/\bh-full\b|overflow-y-auto|overflow-hidden/.test(cls), cls);
  }

  ok("mapa continua ocupando a viewport (gesto do Leaflet é intencional)",
    /h-\[calc\(100dvh-4\.5rem\)\]/.test(ler("./src/components/MapView.tsx")));
  ok("splash é overlay real (`fixed inset-0`)",
    /key="splash-screen"[\s\S]{0,200}?className="fixed inset-0 z-50"/.test(app));
}

console.log("=== 3. Scrollers internos só existem em modais e faixas ===\n");
{
  for (const [nome, arq] of Object.entries(TELAS)) {
    const fonte = ler(arq);
    // Cada ocorrência de overflow-y-auto precisa estar num bloco de modal
    // (perto de `fixed inset-0` ou `max-h-`) ou numa faixa que também rola X.
    const linhas = fonte.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).split("\n");
    const indevidas = [];
    linhas.forEach((linha, i) => {
      if (!/overflow-y-auto/.test(linha)) return;
      const ctx = linhas.slice(Math.max(0, i - 25), i + 3).join("\n");
      const ehModal = /fixed inset-0|max-h-\[9?\d*vh|max-h-\[92dvh|max-h-60|max-h-\[70dvh|Modal/.test(ctx);
      const ehFaixa = /overflow-x-auto|whitespace-nowrap/.test(linha);
      const ehChatOuMapa = /AIChatAssistant|MapView/.test(arq);
      if (!ehModal && !ehFaixa && !ehChatOuMapa) indevidas.push(`${i + 1}: ${linha.trim().slice(0, 70)}`);
    });
    ok(`${nome}: nenhum scroller vertical fora de modal/faixa`, indevidas.length === 0, indevidas.join(" | "));
  }
}

console.log("=== 4. Gesto vertical nunca é bloqueado fora do mapa ===\n");
{
  const arquivos = Object.values(TELAS).concat(["./src/components/MobileHeader.tsx", "./src/components/BottomNav.tsx"]);
  for (const arq of arquivos) {
    const fonte = ler(arq);
    ok(`${arq.split("/").pop()}: sem \`touch-action: none\`/\`touch-none\``,
      !/touch-none|touch-action:\s*none/.test(fonte));
  }
  ok("mapa é a única exceção (`touch-map`)",
    /touch-map/.test(ler("./src/components/MapView.tsx")));

  ok("CSS: `touch-action: none` só em `.touch-map`",
    !/touch-action:\s*none/.test(cssLimpo.replace(/\.touch-map[\s\S]{0,220}/g, "")));
  ok("CSS: overscroll nunca em dois eixos",
    !/(^|[;{\s])overscroll-behavior:\s*/m.test(cssLimpo));
}

console.log("=== 5. Raiz do documento limpa e barras fixas ===\n");
{
  const blocosRaiz = [...cssLimpo.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /^\s*(html|body)\s*(,|$)/.test(m[1].trim()));
  ok("há regras de html/body", blocosRaiz.length > 0);
  ok("html/body sem overflow",
    !blocosRaiz.some((m) => /(^|[;{\s])overflow/.test(m[2])),
    blocosRaiz.filter((m) => /overflow/.test(m[2])).map((m) => m[1].trim()).join(" | "));
  const pb = cssLimpo.match(/\.pb-bottom-nav\s*\{([^}]*)\}/)?.[1] || "";
  ok(".pb-bottom-nav reserva a barra inferior", /6\.5rem/.test(pb));

  const telasComBarra = ["Feed.tsx", "CalendarView.tsx", "Settings.tsx", "Contact.tsx",
    "EventDetail.tsx", "AdminPanel.tsx", "SchoolPortal.tsx"];
  for (const t of telasComBarra) {
    const fonte = ler(`./src/components/${t}`);
    ok(`${t}: reserva espaço para a barra`, /pb-bottom-nav/.test(fonte));
  }

  ok("MobileHeader acima dos headers internos (z-60)",
    /sticky top-0 z-\[60\]/.test(ler("./src/components/MobileHeader.tsx")));
  ok("headers internos começam abaixo da MobileHeader no mobile",
    /\.app-screen \.sticky\s*\{[^}]*top:\s*2\.75rem/.test(cssLimpo));
}

console.log("=== 6. Respiro inferior nas telas sem barra de navegação ===\n");
{
  ok("Login tem padding inferior", /pb-8/.test(ler("./src/components/Login.tsx")));
  ok("Recuperação tem padding inferior", /pb-8/.test(ler("./src/components/PasswordRecovery.tsx")));
  ok("Cadastro usa min-h de viewport", /min-h-\[100dvh\]/.test(ler("./src/components/Register.tsx")));
  ok("Catálogo de escolas reserva a barra",
    /pb-bottom-nav/.test(ler("./src/components/SchoolsCatalog.tsx")));
}

console.log("=== 7. Sem `overflow-x: hidden` convivendo com scroll vertical ===\n");
{
  const arquivos = Object.values(TELAS);
  for (const arq of arquivos) {
    const fonte = ler(arq);
    // Ignora comentários: o que importa é className, não a explicação.
    const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    ok(`${arq.split("/").pop()}: usa \`clip\` e não \`hidden\` no eixo X`,
      !/overflow-x-hidden/.test(semComentario));
  }
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
