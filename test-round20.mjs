/**
 * Testes da rodada 20 — scroll do painel no mobile (a tela precisa rolar,
 * não só a tabela) + organização do cabeçalho.
 *
 * Relato: "ainda não funciona, organize isso como eu já havia pedido e
 * adicione o scroll solicitado", com print mostrando o conteúdo CORTADO
 * atrás da barra inferior.
 *
 * Causa real: o painel estava dentro de `absolute inset-0` de um wrapper
 * `overflow-hidden`, e a raiz do app dependia de `height: 100%` de um pai
 * sem altura resolvida. Sem altura definida, `overflow-y: auto` não tem o
 * que rolar: o conteúdo simplesmente transborda (e some atrás da barra).
 *
 * Rodar: npx tsx test-round20.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const css = readFileSync("./src/index.css", "utf8");
const app = readFileSync("./src/App.tsx", "utf8");
const painel = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cssLimpo = semComentarios(css);

function bloco(seletor) {
  const i = cssLimpo.indexOf(seletor);
  if (i === -1) return "";
  const ini = cssLimpo.indexOf("{", i);
  const fim = cssLimpo.indexOf("}", ini);
  return cssLimpo.slice(ini + 1, fim);
}

console.log("\n=== 1. Altura resolvida na raiz (a causa do corte) ===\n");
{
  const raiz = app.match(/id="app-root-container"[\s\S]{0,400}?className="([^"]+)"/);
  ok("raiz do app renderiza", raiz !== null);
  ok("raiz usa altura de viewport dinâmica", !!raiz && /h-\[100dvh\]|h-dvh/.test(raiz[1]));
  ok("raiz tem `min-h-0` (permite o filho rolar)", !!raiz && /min-h-0/.test(raiz[1]));
  ok("raiz não deixa o conteúdo escapar", !!raiz && /overflow-hidden/.test(raiz[1]));

  // `.app-viewport` aparece mais de uma vez (progressivo); vale o conjunto.
  ok(".app-viewport define height: 100dvh",
    /\.app-viewport\s*\{[^}]*height:\s*100dvh/.test(cssLimpo));
  ok(".app-viewport limita max-height",
    /\.app-viewport\s*\{[^}]*max-height:\s*100dvh/.test(cssLimpo));
  ok("há fallback para navegador sem dvh", /@supports not \(height: 100dvh\)/.test(cssLimpo));
}

console.log("=== 2. O painel é filho do flex, não `absolute` ===\n");
{
  const blocoPainel = app.match(/activeScreen === "admin" && \(([\s\S]{0,700}?)<AdminPanel/);
  ok("wrapper do painel encontrado", blocoPainel !== null);
  const cls = blocoPainel?.[1] || "";
  ok("wrapper não usa `absolute inset-0`", !/absolute inset-0/.test(cls));
  ok("wrapper usa `flex-1 min-h-0`", /flex-1/.test(cls) && /min-h-0/.test(cls));
}

console.log("=== 3. Raiz do painel rola de verdade ===\n");
{
  const raiz = painel.match(/className="admin-page[^"]*"/);
  ok("raiz do painel usa `.admin-page`", raiz !== null);
  ok("tem `overflow-y-auto`", !!raiz && /overflow-y-auto/.test(raiz[0]));
  ok("tem `overflow-x-clip` (não cria scroller lateral)", !!raiz && /overflow-x-clip/.test(raiz[0]));
  ok("tem `flex-1 min-h-0` (encolhe e rola dentro do flex)", !!raiz && /flex-1/.test(raiz[0]) && /min-h-0/.test(raiz[0]));
  ok("não usa `h-full` junto de `flex-1`", !!raiz && !/h-full/.test(raiz[0]));
  ok("não usa a classe `admin-scrollable` (!important em overflow-y)",
    !!raiz && !/admin-scrollable/.test(raiz[0]));

  const adminPage = bloco(".admin-page");
  ok(".admin-page tem min-height: 0", /min-height:\s*0/.test(adminPage));
  ok(".admin-page tem touch-action: pan-y", /touch-action:\s*pan-y/.test(adminPage));
  ok(".admin-page usa overflow-x: clip", /overflow-x:\s*clip/.test(adminPage));
}

console.log("=== 4. Cabeçalho não consome a tela ===\n");
{
  ok("cabeçalho não é mais `sticky` no painel", !/sticky top-0 z-30/.test(painel));
  ok("cabeçalho tem `shrink-0` (não colapsa)", /shrink-0 border-b border-brand-primary/.test(painel));
  ok("subtítulo do painel oculto no mobile", /hidden sm:block text-\[11px\][^"]*truncate/.test(painel));
  ok("título trunca em vez de quebrar", /<span className="truncate">Painel de Controle<\/span>/.test(painel));
}

console.log("=== 5. KPIs em faixa única rolável ===\n");
{
  ok("KPIs usam faixa horizontal rolável",
    /flex items-center gap-1\.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-x-snap/.test(painel));
  ok("KPIs não usam mais flex-wrap no mobile",
    !/mt-3 flex flex-wrap items-center gap-2/.test(painel));
  ok("pílulas de KPI não encolhem", /shrink-0 rounded-xl border pl-2/.test(painel));
}

console.log("=== 6. Cards de usuário organizados ===\n");
{
  ok("badges de estatística em faixa única",
    /Stats Badges[\s\S]{0,300}className="flex items-center gap-1\.5[^"]*overflow-x-auto no-scrollbar"/.test(painel));
  ok("badge não quebra linha", /whitespace-nowrap/.test(painel));
  ok("nome/e-mail com min-w-0 (truncate funciona)",
    /className="min-w-0 flex-1"[\s\S]{0,200}truncate/.test(painel));
  ok("rótulo de status não é empurrado", /shrink-0 text-slate-500 dark:text-slate-400 text-\[11px\] font-medium">Status:/.test(painel));
}

console.log("=== 7. Nada fica escondido atrás da barra inferior ===\n");
{
  const pb = bloco(".pb-bottom-nav");
  ok(".pb-bottom-nav existe", pb.length > 0);
  ok("reserva ao menos 6rem", /6\.5rem/.test(pb));
  ok("painel usa a classe", /pb-bottom-nav/.test(painel));
  ok("scroll-padding garante o último item visível",
    /scroll-padding-bottom/.test(cssLimpo));
}

// ---------------------------------------------------------------------------
console.log("=== 8. Render real: cadeia de rolagem montada ===\n");
{
  const dom = new JSDOM("<!doctype html><html><body><div id='app-root-container'></div></body></html>", {
    url: "https://beirodmuller.github.io/Tcc_main-do-main/",
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  dom.window.Element.prototype.scrollTo = function () {};
  dom.window.Element.prototype.scrollIntoView = function () {};
  global.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });

  const RTL = await import("@testing-library/react");
  const React = (await import("react")).default;
  const AdminPanel = (await import("./src/components/AdminPanel.tsx")).default;

  const chefe = { id: 1, uid: "u1", nome: "David", email: "davidribeiromuller2009@gmail.com", role: "ADM Chefe", isAdmin: true, ativo: true };
  const { container } = RTL.render(
    React.createElement(AdminPanel, {
      usersList: [
        { id: 1, uid: "a", nome: "Aluno Um", email: "aluno.um@escola.pr.gov.br", role: "Aluno", ativo: true, isAdmin: false },
        { id: 2, uid: "b", nome: "Aluno Dois", email: "aluno.dois@escola.pr.gov.br", role: "Aluno", ativo: true, isAdmin: false },
      ],
      events: [],
      onUpdateUser: async () => {},
      onDeleteUser: async () => {},
      currentUser: chefe,
      onShowToast: () => {},
    })
  );

  const raiz = container.querySelector(".admin-page");
  ok("`.admin-page` montado", raiz !== null);
  ok("é o elemento que rola (overflow-y-auto)", raiz?.className.includes("overflow-y-auto"));
  ok("não corta na horizontal com hidden", !raiz?.className.includes("overflow-x-hidden"));

  const cabecalho = raiz?.firstElementChild;
  ok("cabeçalho é o primeiro filho e não é sticky", cabecalho !== null && !cabecalho?.className.includes("sticky"));

  const tabelas = container.querySelectorAll(".admin-table-scroll");
  ok("blocos de tabela isolados", tabelas.length >= 1);
  ok("tabela não é o único ponto rolável",
    raiz !== null && container.querySelector(".admin-table-scroll") !== raiz);

  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
