/**
 * Testes da rodada 24 — carrossel de escolas com rolagem CONTÍNUA.
 *
 * Pedido: "reajuste a rolagem automatica, para um pouco mais rapida, e ela
 * nao vai de escola em escola, e uma barra continua, mas pode ser
 * controlada de escola em escola pela flechinha, apos 2-3 segundos faca
 * voltar a rolar automaticamente".
 *
 * Aceite:
 *  1. o trilho anda continuamente (rAF), sem saltos — nada de trocar
 *     `currentIndex` a cada N segundos;
 *  2. sem `scroll-snap` no trilho (o snap faria voltar a pular card a card);
 *  3. mais rápido que os 4,5 s/card anteriores;
 *  4. flechas (e pontinhos) continuam andando de escola em escola;
 *  5. a rolagem retoma sozinha 2–3 s depois de qualquer interação;
 *  6. laço invisível (lista duplicada, sem "pulo" no fim).
 *
 * Rodar: npx tsx test-round24.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const fonte = readFileSync("./src/components/SchoolCarousel.tsx", "utf8");
const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

console.log("\n=== 1. Rolagem contínua (rAF), não de card em card ===\n");
{
  ok("usa requestAnimationFrame", /requestAnimationFrame/.test(semComentarios));
  ok("cancela o frame no cleanup", /cancelAnimationFrame/.test(semComentarios));
  ok("NÃO usa setInterval para trocar de card", !/setInterval/.test(semComentarios));
  ok("NÃO faz `setCurrentIndex((prev) => (prev + 1) …)` por timer",
    !/setCurrentIndex\(\(prev\)\s*=>\s*\(prev \+ 1\)/.test(semComentarios));
  ok("incrementa o scrollLeft a cada frame", /scrollLeft \+= /.test(semComentarios));
  ok("limita o delta do frame (aba em background)", /Math\.min\([\s\S]{0,80}?0\.05\)/.test(semComentarios));
  ok("acumula fração de pixel (movimento suave)", /acumuladoRef\.current \+=/.test(semComentarios));
}

console.log("=== 2. Trilho sem scroll-snap ===\n");
{
  ok("sem classe `snap-x`", !/snap-x/.test(semComentarios));
  ok("sem `snap-mandatory`", !/snap-mandatory/.test(semComentarios));
  ok("sem `snap-start` nos cards", !/snap-start/.test(semComentarios));
  ok("sem a classe `.scroll-x-snap`", !/scroll-x-snap/.test(semComentarios));
  ok("força `scrollSnapType: none` inline", /scrollSnapType:\s*"none"/.test(semComentarios));
}

console.log("=== 3. Mais rápido ===\n");
{
  const m = semComentarios.match(/VELOCIDADE_PX_POR_SEGUNDO\s*=\s*(\d+)/);
  ok("velocidade declarada em px/s", m !== null);
  const velocidade = Number(m?.[1] || 0);
  ok("velocidade entre 40 e 120 px/s (contínua e visível)", velocidade >= 40 && velocidade <= 120, String(velocidade));
  // card de ~340px: tempo por card = (340+gap)/velocidade
  const segundosPorCard = 356 / Math.max(velocidade, 1);
  ok("menos de 4,5 s por card (mais rápido que antes)", segundosPorCard < 4.5, segundosPorCard.toFixed(2) + "s");
}

console.log("=== 4. Flechas andam de escola em escola ===\n");
{
  ok("há função `irParaIndice`", /const irParaIndice = useCallback/.test(semComentarios));
  ok("scroll suave no salto por flecha", /behavior:\s*suave \? "smooth"/.test(semComentarios));
  ok("flecha anterior chama `currentIndex - 1`", /irParaIndice\(currentIndex - 1\)/.test(semComentarios));
  ok("flecha próxima chama `currentIndex + 1`", /irParaIndice\(currentIndex \+ 1\)/.test(semComentarios));
  ok("pontinhos também navegam", /onClick=\{\(\) => irParaIndice\(idx\)\}/.test(semComentarios));
}

console.log("=== 5. Retomada automática em 2–3 s ===\n");
{
  const m = semComentarios.match(/RETOMADA_MS\s*=\s*(\d+)/);
  ok("tempo de retomada declarado", m !== null);
  const ms = Number(m?.[1] || 0);
  ok("entre 2000 e 3000 ms", ms >= 2000 && ms <= 3000, String(ms));
  ok("`pausarTemporariamente` agenda a volta", /setTimeout\(\(\) => \{[\s\S]{0,160}?setIsPaused\(false\)/.test(semComentarios));
  ok("gesto no trilho pausa", /onPointerDown=\{aoInteragir\}|onTouchStart=\{aoInteragir\}/.test(semComentarios));
  ok("flecha também pausa (via irParaIndice)",
    /irParaIndice[\s\S]{0,900}?pausarTemporariamente\(\)/.test(semComentarios));
  ok("sair do hover devolve o movimento", /onMouseLeave=\{aoSairDoHover\}/.test(semComentarios));
  ok("respeita `prefers-reduced-motion`", /prefers-reduced-motion/.test(semComentarios));
}

console.log("=== 6. Laço invisível ===\n");
{
  ok("lista duplicada para o laço", /\[0,\s*1\]\.map\(\(copia\)/.test(semComentarios));
  ok("mede a largura de uma volta", /scrollWidth \/ 2/.test(semComentarios));
  ok("volta ao início sem salto visual", /scrollLeft -= volta/.test(semComentarios));
  ok("cópia marcada como decorativa", /aria-hidden=\{copia === 1/.test(semComentarios));
}

// ---------------------------------------------------------------------------
console.log("=== 7. Render real: trilho duplicado e navegação ===\n");
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://x.github.io/",
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  dom.window.Element.prototype.scrollTo = function (opts) {
    if (opts && typeof opts === "object") this.scrollLeft = opts.left ?? this.scrollLeft;
  };

  const RTL = await import("@testing-library/react");
  const React = (await import("react")).default;
  const { ARAUCARIA_SCHOOLS } = await import("./src/lib/schoolsData.ts");
  const Carrossel = (await import("./src/components/SchoolCarousel.tsx")).default;

  const selecionadas = [];
  const { container, unmount } = RTL.render(
    React.createElement(Carrossel, { onSelectSchool: (s) => selecionadas.push(s) })
  );

  const trilho = container.querySelector(".overflow-x-auto");
  ok("trilho renderizado", trilho !== null);
  const total = ARAUCARIA_SCHOOLS.length;
  ok(`trilho tem ${total * 2} cards (lista duplicada)`,
    trilho.children.length === total * 2, String(trilho?.children.length));
  ok("trilho não tem snap", !trilho.className.includes("snap"));

  // jsdom não faz layout: simulamos offsetLeft para a rolagem ser observável.
  Array.from(trilho.children).forEach((card, i) => {
    Object.defineProperty(card, "offsetLeft", { value: i * 356, configurable: true });
  });

  const botoes = [...container.querySelectorAll("button[aria-label]")];
  const proxima = botoes.find((b) => b.getAttribute("aria-label") === "Próxima escola");
  const anterior = botoes.find((b) => b.getAttribute("aria-label") === "Escola anterior");
  ok("botão de próxima escola existe", Boolean(proxima));
  ok("botão de escola anterior existe", Boolean(anterior));

  if (proxima) {
    RTL.act(() => { proxima.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    ok("clicar em próxima move o trilho", Number(trilho.scrollLeft) > 0, String(trilho.scrollLeft));
    ok("salto é de exatamente um card", Number(trilho.scrollLeft) === 356, String(trilho.scrollLeft));
  }

  const pontinhos = [...container.querySelectorAll("button[aria-label^='Ir para escola']")];
  ok(`há ${total} indicadores`, pontinhos.length === total);

  ok("nenhum card selecionado dispara navegação sem clique",
    selecionadas.length === 0);

  unmount();
  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
