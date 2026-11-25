/**
 * Testes da rodada 19 — rolagem do painel de administração no mobile.
 *
 * Relato: "no painel de adm o scroll ainda ta bugado, faca oq eu te pedi,
 * reajuste para que tela role nao apenas a tabela".
 *
 * Causa: o contêiner raiz declarava `admin-scroll-x` (`overflow-x: hidden`)
 * + `overflow-y-auto`. O par hidden/auto é promovido pelo navegador para
 * auto/auto, então a PÁGINA virou um scroller horizontal de 736px (largura
 * mínima das tabelas) e o gesto vertical só funcionava sobre a tabela.
 *
 * Rodar: npx tsx test-round19.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const painel = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const css = readFileSync("./src/index.css", "utf8");
const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const painelLimpo = semComentarios(painel);
const cssLimpo = semComentarios(css);

/** Extrai o bloco de uma classe no CSS. */
function bloco(seletor) {
  const i = cssLimpo.indexOf(seletor);
  if (i === -1) return "";
  const ini = cssLimpo.indexOf("{", i);
  const fim = cssLimpo.indexOf("}", ini);
  return cssLimpo.slice(ini + 1, fim);
}

console.log("\n=== 1. A página rola; a tabela não é a única área ===\n");
{
  const raiz = painelLimpo.match(/className="[^"]*admin-page[^"]*"/);
  ok("contêiner raiz não usa mais `admin-scroll-x`", !/admin-scroll-x/.test(painelLimpo));
  ok("contêiner raiz não usa `overflow-x-hidden`", !/overflow-x-hidden/.test(painelLimpo));
  ok("contêiner raiz usa `overflow-x-clip` (não cria scroller)", !!raiz && /overflow-x-clip/.test(raiz[0]));
  ok("quem rola é o documento — a raiz não monta scroller", !!raiz && !/overflow-y-auto/.test(raiz[0]));
  ok("classe `.admin-page` existe no CSS", /\.admin-page\s*\{/.test(cssLimpo));
}

console.log("=== 2. Nada de hidden+auto no mesmo eixo ===\n");
{
  const adminPage = bloco(".admin-page");
  ok(".admin-page usa overflow-x: clip", /overflow-x:\s*clip/.test(adminPage));
  ok(".admin-page NÃO usa overflow-x: hidden", !/overflow-x:\s*hidden/.test(adminPage));
  ok(".admin-page não força overflow-y com !important", !/overflow-y:.*!important/.test(adminPage));

  // A regra antiga que causava a promoção hidden→auto não existe mais.
  ok("regra `.admin-scroll-x` conflitante foi removida", !/\.admin-scroll-x\s*\{/.test(cssLimpo));
  ok("nenhuma classe aplicada mistura hidden+auto", !/admin-scroll-x/.test(painelLimpo));
}

console.log("=== 3. Rolagem horizontal isolada nas tabelas ===\n");
{
  const tabela = bloco(".admin-table-scroll");
  ok("existe `.admin-table-scroll`", tabela.length > 0);
  ok("rola na horizontal", /overflow-x:\s*auto/.test(tabela));
  ok("não rola na vertical (deixa com a página)", /overflow-y:\s*hidden/.test(tabela));
  ok("aceita pan nos dois eixos", /touch-action:\s*pan-x pan-y/.test(tabela));
  ok("contém o overscroll no eixo X (gesto vertical sobe para a página)",
    /overscroll-behavior(-x)?:\s*contain/.test(tabela));

  const wrappers = painelLimpo.match(/admin-table-scroll/g) || [];
  // 3 tabelas de usuários + mural de eventos (rodada 26) + auditoria (rodada 36).
  // O requisito é "nenhuma tabela fica sem a classe"; o número acompanha o
  // painel — atualizado aqui porque a aba de auditoria acrescentou a 5ª tabela.
  ok("as tabelas usam a classe", wrappers.length === 5, `${wrappers.length} uso(s)`);
  ok("nenhum wrapper de tabela usa overflow-x-auto solto",
    !/<div className="overflow-x-auto">/.test(painelLimpo));
}

console.log("=== 4. Escala no toque não cancela o gesto ===\n");
{
  ok("painel não usa mais `active:scale-95`", !/active:scale-95/.test(painelLimpo));
  ok("painel não usa mais `active:scale-98`", !/active:scale-98/.test(painelLimpo));
  ok("usa a classe `.hover-only-scale`", /hover-only-scale/.test(painelLimpo));
  ok("escala só com mouse (`hover: hover` + `pointer: fine`)",
    /@media \(hover: hover\) and \(pointer: fine\)[\s\S]{0,120}\.hover-only-scale:active/.test(cssLimpo));
}

console.log("=== 5. Botão flutuante não rouba o toque ===\n");
{
  const assistente = readFileSync("./src/components/AIChatAssistant.tsx", "utf8");
  ok("botão subiu no mobile (bottom-24)", /bottom-24 right-3/.test(assistente));
  ok("botão é menor no mobile (44px)", /w-11 h-11/.test(assistente));
  ok("botão declara touch-manipulation", /touch-manipulation/.test(assistente));
}

console.log("=== 6. Regras de rolagem globais continuam corretas ===\n");
{
  ok("body usa `manipulation`", /body\s*\{[^}]*touch-action:\s*manipulation/.test(cssLimpo));
  /*
    Rodada 22: `pan-y` é legítimo em contêineres que rolam SÓ na vertical
    (`.admin-page`, `.welcome-scroll`) e AGORA também na raiz do documento
    (`html`/`body`) — lá ele é intencional: garante que o gesto vertical
    pertença à página e o horizontal fique com as faixas internas.
  */
  const panY = cssLimpo.match(/[^{}]*\{[^}]*touch-action:\s*pan-y;?/g) || [];
  const panYIndevido = panY.filter((b) => !/admin-page|welcome-scroll|(^|\})?\s*(html|body)[\s,{[]/.test(b) && !/\b(html|body)\b/.test(b));
  ok("`touch-action: pan-y` só em contêiner vertical específico", panYIndevido.length === 0,
    panYIndevido.join(" | ").slice(0, 120));
  ok("`touch-action: none` só no mapa", !/touch-action:\s*none/.test(cssLimpo.replace(/\.touch-map[\s\S]{0,200}/, "")));
}

// ---------------------------------------------------------------------------
// 7. Comportamento em jsdom: a raiz renderiza com a classe certa
// ---------------------------------------------------------------------------
console.log("=== 7. Render real do painel ===\n");
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://x.github.io/admin",
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
        { id: 1, uid: "a", nome: "Aluno Um", email: "a@escola.pr.gov.br", role: "Aluno", ativo: true, isAdmin: false },
      ],
      events: [],
      onUpdateUser: async () => {},
      onDeleteUser: async () => {},
      currentUser: chefe,
      onShowToast: () => {},
    })
  );

  const raiz = container.querySelector(".admin-page");
  ok("raiz renderiza com `.admin-page`", raiz !== null);
  ok("raiz tem `overflow-x-clip`", raiz?.className.includes("overflow-x-clip"));
  ok("raiz não tem `admin-scroll-x`", !raiz?.className.includes("admin-scroll-x"));
  ok("tabela dentro de `.admin-table-scroll`",
    container.querySelectorAll(".admin-table-scroll table").length >= 1);
  ok("cabeçalho do painel está fora do bloco de tabela",
    container.querySelector(".admin-table-scroll h1") === null);

  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
