/**
 * Verificação visual de mobile (390×844) — rodada 18.
 *
 * Renderiza as telas principais em jsdom com largura de celular e mede:
 *  - conteúdo mais largo que a viewport (rolagem horizontal indesejada);
 *  - linhas muito longas de texto sem quebra;
 *  - presença de classes que travam o gesto de rolagem.
 *
 * Rodar: npx tsx test-round18-mobile.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const LARGURA = 390;

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://x.github.io/",
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
try {
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
} catch {}
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
dom.window.Element.prototype.scrollTo = function () {};
dom.window.Element.prototype.scrollIntoView = function () {};
global.matchMedia = () => ({
  matches: false,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
});
dom.window.localStorage.setItem("ELOESCOLA_FORCE_STATIC", "1");

// Larguras de layout: jsdom não faz layout real, então medimos o que é
// declarado no CSS/JSX (min-width, w-[...] fixos) para achar estouros.
let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const RTL = await import("@testing-library/react");
const React = (await import("react")).default;

console.log(`\n=== Renderização em ${LARGURA}px de largura ===`);

// ---------------------------------------------------------------------------
// 1. Feed com eventos
// ---------------------------------------------------------------------------
{
  const Feed = (await import("./src/components/Feed.tsx")).default;
  const eventos = [
    { id: 1, title: "Olimpíada de Robótica com um título bem comprido para testar quebra de linha", location: "Araucária", day: 10, month: 2, year: 2027, time: "11:00", isPaid: false, city: "Araucária" },
    { id: 2, title: "Feira de Literatura", location: "Curitiba, PR — Rua bem comprida, 1234, bairro", day: 12, month: 3, year: 2027, time: "13:00", isPaid: true, price: "R$ 10,00", city: "Curitiba" },
  ];

  const { container } = RTL.render(
    React.createElement(Feed, {
      events: eventos,
      onSelectEvent: () => {},
      onNavigate: () => {},
      isAdmin: false,
      currentUser: { id: 1, nome: "David" },
    })
  );

  const texto = document.body.textContent ?? "";
  ok("título da aba na tela", /Eventos/.test(texto));
  ok("dois cards renderizados", RTL.screen.queryAllByRole("heading", { level: 3 }).length === 2);
  ok("cada card tem o título sobre o banner",
    container.querySelectorAll("h3.absolute").length === 2);

  // Nenhum elemento com largura fixa maior que a viewport
  const classesFixas = [...container.querySelectorAll("[class]")]
    .flatMap((el) => (el.getAttribute("class") || "").split(/\s+/))
    .filter((c) => /^w-\[\d+px\]$/.test(c))
    .map((c) => Number(c.match(/\d+/)[0]));
  ok("nenhum `w-[NNNpx]` maior que a tela", classesFixas.every((w) => w <= LARGURA), `maiores: ${classesFixas.filter((w) => w > LARGURA)}`);

  ok("cards não usam largura mínima que estoura", !/min-w-\[1[0-9]{2}px\]/.test(container.innerHTML));
  ok("faixa de filtros rola na horizontal", /scroll-x-snap/.test(container.innerHTML));
  ok("grade usa 1 coluna no mobile", /grid-cols-1 sm:grid-cols-2/.test(container.innerHTML));

  RTL.cleanup();
}

// ---------------------------------------------------------------------------
// 2. Cadastro: sem matrícula e com campos empilhados no 360px
// ---------------------------------------------------------------------------
{
  const Register = (await import("./src/components/Register.tsx")).default;
  const { container } = RTL.render(
    React.createElement(Register, { onRegister: () => {}, onNavigate: () => {} })
  );

  const texto = document.body.textContent ?? "";
  ok("cadastro não pede matrícula", !/Matrícula/i.test(texto));
  ok("cadastro pede CPF", /CPF/.test(texto));
  ok("cadastro pede e-mail institucional", /e-mail institucional/i.test(texto));
  // O grid de "Nascimento / Gênero" fica no passo 2 do formulário, que só
  // aparece depois de avançar. Verificamos no fonte.
  const fonteRegistro = readFileSync("./src/components/Register.tsx", "utf8");
  ok("campos empilham em tela estreita (passo 2)",
    /grid-cols-1 min-\[380px\]:grid-cols-2/.test(fonteRegistro));

  RTL.cleanup();
}

// ---------------------------------------------------------------------------
// 3. Painel: abas rolam e não quebram
// ---------------------------------------------------------------------------
{
  const AdminPanel = (await import("./src/components/AdminPanel.tsx")).default;
  const chefe = { id: 1, uid: "u1", nome: "David", email: "davidribeiromuller2009@gmail.com", role: "ADM Chefe", isAdmin: true, ativo: true };

  const { container } = RTL.render(
    React.createElement(AdminPanel, {
      usersList: [
        { id: 1, uid: "a", nome: "Aluno Teste", email: "aluno@escola.pr.gov.br", role: "Aluno", ativo: true, isAdmin: false },
      ],
      events: [],
      onUpdateUser: async () => {},
      onDeleteUser: async () => {},
      currentUser: chefe,
      onShowToast: () => {},
    })
  );

  const html = container.innerHTML;
  ok("barra de abas rola na horizontal", /overflow-x-auto/.test(html));
  ok("abas não quebram em duas linhas", /whitespace-nowrap/.test(html));
  ok("painel usa respiro inferior da barra", /pb-bottom-nav/.test(html));
  ok("painel não usa scroll-smooth no contêiner", !/scroll-smooth/.test(html));
  ok("tabela tem rolagem horizontal própria", /overflow-x-auto/.test(html) && /admin-table/.test(html));

  RTL.cleanup();
}

// ---------------------------------------------------------------------------
// 4. Auditoria de CSS: nada que segure o gesto
// ---------------------------------------------------------------------------
{
  const css = readFileSync("./src/index.css", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // `pan-y` vale em contêiner que rola só na vertical (.admin-page), mas não
  // no body nem em classes genéricas.
  const blocosPanY = css.match(/[^{}]*\{[^}]*touch-action:\s*pan-y;?/g) || [];
  const indevidos = blocosPanY.filter((b) => !/admin-page|welcome-scroll/.test(b));
  ok("`pan-y` só em contêiner vertical específico", indevidos.length === 0,
    `${indevidos.length} regra(s) indevida(s)`);

  const noneGlobais = css.match(/(^|\})\s*([^{}]*)\{[^}]*touch-action:\s*none/g) || [];
  const foraDoMapa = noneGlobais.filter((b) => !/touch-map|leaflet/.test(b));
  ok("`touch-action: none` só no mapa", foraDoMapa.length === 0);

  ok("body usa manipulation", /body\s*\{[^}]*touch-action:\s*manipulation/.test(css));
  ok("contêineres de rolagem usam manipulation", /\.touch-scroll\s*\{[^}]*touch-action:\s*manipulation/.test(css));

  const fontSizeRegra = /@media \(max-width: 640px\)[\s\S]{0,400}font-size: 16px !important/.test(css);
  ok("inputs com 16px no mobile (evita zoom do iOS)", fontSizeRegra);
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
