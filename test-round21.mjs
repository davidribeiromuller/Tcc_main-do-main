/**
 * Testes da rodada 21 — rolagem normal de aplicativo.
 *
 * Relato: "agora não consigo nem scrollar a tela, refaça novamente, coloque
 * um scroll normal de aplicativo onde rola a tela inteira".
 *
 * Arquitetura adotada (definitiva):
 *   - UM scroller: o documento (`html`).
 *   - Nenhuma tela monta scroller próprio (`overflow-y: auto` interno).
 *   - Cabeçalho e barra inferior são fixos; o conteúdo desliza por baixo.
 *
 * Rodar: npx tsx test-round21.mjs
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
const feed = readFileSync("./src/components/Feed.tsx", "utf8");
const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cssLimpo = semComentarios(css);

console.log("\n=== 1. O documento é o scroller (sem `overflow` na raiz) ===\n");
{
  // Rodada 22: `overflow` no html/body é PROIBIDO — inclusive `clip`,
  // que no Safari do iOS propaga para a viewport e mata a rolagem.
  // Junta TODOS os blocos `html { }` / `body { }` do CSS (há vários,
  // progressivos) e valida o conjunto.
  const blocosDe = (sel) =>
    [...cssLimpo.matchAll(new RegExp(`(^|\\n)\\s*${sel}\\s*\\{([^}]*)\\}`, "g"))]
      .map((m) => m[2])
      .join("\n");
  const htmlBloco = blocosDe("html") + blocosDe("html,\\s*body");
  const bodyBloco = blocosDe("body") + blocosDe("html,\\s*body");
  const semOverflowDecl = (t) => !/(^|[;{\s])overflow(-[xy])?\s*:/.test(t);

  ok("nenhum bloco de html declara overflow", semOverflowDecl(htmlBloco), htmlBloco.trim().slice(0, 160));
  ok("nenhum bloco de body declara overflow", semOverflowDecl(bodyBloco), bodyBloco.trim().slice(0, 160));
  ok("html/body não travam altura (sem height: 100%)",
    !/(^|[;{\s])height:\s*100%/.test(htmlBloco) && !/(^|[;{\s])height:\s*100%/.test(bodyBloco));
  ok("html/body liberam o gesto vertical (touch-action pan-y)",
    /touch-action:\s*pan-y/.test(htmlBloco) && /touch-action:\s*pan-y/.test(bodyBloco));
}

console.log("=== 2. A raiz do app cresce com o conteúdo ===\n");
{
  const raiz = app.match(/id="app-root-container"[\s\S]{0,400}?className="([^"]+)"/);
  ok("raiz renderiza", raiz !== null);
  const cls = raiz?.[1] || "";
  ok("raiz NÃO trava em `h-[100dvh]`", !/(^|\s)h-\[100dvh\]|(^|\s)h-dvh(\s|$)/.test(cls), cls);
  ok("raiz NÃO tem `overflow-hidden`", !/overflow-hidden/.test(cls));
  ok("raiz tem altura mínima de viewport", /min-h-\[100dvh\]/.test(cls));

  ok(".app-viewport não tem `height: 100dvh` fixo",
    !/\.app-viewport\s*\{[^}]*[^-]height:\s*100dvh/.test(cssLimpo));
  ok(".app-viewport não tem `overflow: hidden`",
    !/\.app-viewport\s*\{[^}]*overflow:\s*hidden/.test(cssLimpo));
  ok(".app-viewport usa min-height: 100dvh",
    /\.app-viewport\s*\{[^}]*min-height:\s*100dvh/.test(cssLimpo));

  const root = cssLimpo.match(/#root\s*\{([^}]*)\}/)?.[1] || "";
  ok("#root não tem height: 100%", !/height:\s*100%/.test(root));
}

console.log("=== 3. Nenhuma tela monta scroller próprio ===\n");
{
  ok("App.tsx não usa mais `absolute inset-0` nas telas",
    !/className="absolute inset-0/.test(app));
  ok("App.tsx usa `.app-screen` nas telas", (app.match(/app-screen/g) || []).length >= 10);
  ok("telas não têm `overflow-y-auto` no wrapper", !/className="app-screen[^"]*overflow-y-auto/.test(app));
  ok("wrapper do shell não é `h-full overflow-hidden`",
    !/className="w-full h-full relative overflow-hidden flex flex-col"/.test(app));
  ok("conteúdo do shell não é `overflow-hidden`",
    !/className="flex-1 w-full overflow-hidden relative"/.test(app));

  ok("Feed não tem scroller próprio", !/h-full overflow-y-auto/.test(feed));
  ok("Painel não tem scroller próprio",
    !/className="admin-page[^"]*overflow-y-auto/.test(painel));
  ok("Painel não depende de `flex-1 min-h-0` para rolar",
    !/className="admin-page[^"]*min-h-0/.test(painel));
}

console.log("=== 4. Rolagem horizontal só em tabelas/faixas ===\n");
{
  const adminPage = cssLimpo.match(/\.admin-page\s*\{([^}]*)\}/)?.[1] || "";
  ok(".admin-page não cria scroller vertical", !/overflow-y:\s*auto/.test(adminPage));
  ok(".admin-page corta o excesso horizontal", /overflow-x:\s*clip/.test(adminPage));
  ok("blocos de tabela continuam isolados", (painel.match(/admin-table-scroll/g) || []).length >= 3);
  ok(".admin-table-scroll existe no CSS", /\.admin-table-scroll\s*\{/.test(cssLimpo));
}

console.log("=== 5. Nada fica escondido atrás da barra inferior ===\n");
{
  const pb = cssLimpo.match(/\.pb-bottom-nav\s*\{([^}]*)\}/)?.[1] || "";
  ok(".pb-bottom-nav reserva espaço", /padding-bottom:/.test(pb));
  ok(".pb-bottom-nav reserva ao menos 6rem", /6\.5rem/.test(pb));
  ok("painel usa a reserva", /admin-page[^"]*pb-bottom-nav/.test(painel));
  ok("feed usa a reserva", /pb-bottom-nav/.test(feed));
  ok("html tem scroll-padding-bottom no mobile", /scroll-padding-bottom/.test(cssLimpo));
}

console.log("=== 6. Troca de tela volta ao topo ===\n");
{
  ok("há reset de scroll por tela",
    /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,200}?scrollTo\(\{\s*top:\s*0[\s\S]{0,120}?\},\s*\[activeScreen\]\)/.test(app));
}

console.log("=== 7. Barra inferior continua fixa e sem sobreposição ===\n");
{
  const nav = readFileSync("./src/components/BottomNav.tsx", "utf8");
  ok("BottomNav é `fixed bottom-0`", /fixed bottom-0 left-0 right-0/.test(nav));
  const header = readFileSync("./src/components/MobileHeader.tsx", "utf8");
  ok("MobileHeader continua fixo/sticky no topo", /sticky top-0/.test(header));
  ok("MobileHeader fica acima dos headers internos (z-60)",
    /sticky top-0 z-\[60\]/.test(header));
  ok("headers internos não sobem por baixo da MobileHeader no mobile",
    /\.app-screen \.sticky\s*\{[^}]*top:\s*2\.75rem/.test(cssLimpo));
  ok("rolagem respeita a altura da MobileHeader",
    /scroll-padding-top:\s*2\.75rem/.test(cssLimpo));
}

// ---------------------------------------------------------------------------
console.log("=== 8. Render real: painel é conteúdo, não scroller ===\n");
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
  ok("não é scroller (sem overflow-y-auto)", !raiz?.className.includes("overflow-y-auto"));
  ok("não corta na horizontal com hidden", !raiz?.className.includes("overflow-x-hidden"));
  ok("tem reserva da barra inferior", raiz?.className.includes("pb-bottom-nav"));
  ok("renderiza o cabeçalho do painel", /Painel de Controle/.test(container.innerHTML));
  ok("tabelas continuam com rolagem própria isolada",
    container.querySelectorAll(".admin-table-scroll").length >= 1);

  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
