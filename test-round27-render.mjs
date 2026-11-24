/**
 * Rodada 27 — render do card unificado.
 *
 * Renderiza o `EventCardMural` em jsdom e confere:
 *  - modo CLARO: card branco, faixa cinza, textos escuros;
 *  - modo ESCURO: card slate-900, textos brancos, faixa slate-800 (o print);
 *  - sem duplicar a faixa "Comunidade Escolar • Org: ..." quando o evento traz
 *    o mesmo texto em `requirements`;
 *  - ações (Ver / Mapa / Autorizações / Editar / lixeira) chamam os callbacks.
 *
 * Rodar: npx tsx test-round27-render.mjs
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://eloescola.test/",
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
try {
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
} catch {}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.matchMedia = dom.window.matchMedia;

const mapa = new Map();
globalThis.localStorage = {
  getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
  setItem: (k, v) => mapa.set(k, String(v)),
  removeItem: (k) => mapa.delete(k),
  clear: () => mapa.clear(),
  key: (i) => Array.from(mapa.keys())[i] ?? null,
  get length() {
    return mapa.size;
  },
};

const React = (await import("react")).default;
const { render, fireEvent, cleanup, act } = await import("@testing-library/react");
const EventCardMural = (await import("./src/components/EventCardMural.tsx")).default;

let ok = 0;
const falhas = [];
const check = (nome, cond, detalhe = "") => {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const evento = {
  id: 7,
  title: "Olimpíada Brasileira de Física (OBF) — fase escolar",
  location: "Rua São Vicente de Paulo, 76 - Centro, Araucária/PR",
  city: "Araucária",
  day: 20,
  month: 11,
  year: 2026,
  time: "18:30",
  isPaid: false,
  isSchool: true,
  schoolName: "Diretoria Helena Wysocki",
  category: "Olimpíada",
  // Texto que costumava ser impresso duas vezes no card.
  requirements: "Comunidade Escolar • Org: Diretoria Helena Wysocki",
  creatorId: 1,
};

// ---------------------------------------------------------------------------
// 1. Modo claro
// ---------------------------------------------------------------------------
const cliques = { abrir: 0, mapa: 0, auth: 0, editar: 0, excluir: 0 };
const renderizar = (props = {}) =>
  render(
    React.createElement(EventCardMural, {
      event: evento,
      onOpen: () => cliques.abrir++,
      onAbrirMapa: () => cliques.mapa++,
      onAutorizacoes: () => cliques.auth++,
      onEditar: () => cliques.editar++,
      onExcluir: () => cliques.excluir++,
      ...props,
    })
  );

renderizar();
const raiz = document.querySelector("div.rounded-2xl");
check("card renderizou", !!raiz);
const classesClaro = String(raiz?.className || "");
check("modo claro: fundo branco", classesClaro.includes("bg-white"), classesClaro);
check("modo claro: borda suave", classesClaro.includes("border-slate-200"));
check("modo claro: sombra discreta", classesClaro.includes("shadow-sm"));
check("modo escuro preparado (dark:bg-slate-900)", classesClaro.includes("dark:bg-slate-900"));

const texto = document.body.textContent;
check("título do evento", texto.includes("Olimpíada Brasileira de Física (OBF)"));
check("selo Gratuito", texto.includes("Gratuito"));
check("data por extenso", texto.includes("20 de Dezembro de 2026 • 18:30"));
check("cidade", texto.includes("Araucária"));
check("faixa uma única vez", (texto.match(/Org: Diretoria Helena Wysocki/g) || []).length === 1, `${(texto.match(/Org:/g) || []).length} ocorrência(s)`);
check("selo Escolar", texto.includes("Escolar"));
check("categoria", texto.includes("Olimpíada"));
check("botões Ver/Mapa/Autorizações/Editar", ["Ver", "Mapa", "Autorizações", "Editar"].every((t) => texto.includes(t)));

// Cliques disparam os callbacks certos.
const botao = (rotulo) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === rotulo);
act(() => fireEvent.click(botao("Ver")));
act(() => fireEvent.click(botao("Mapa")));
act(() => fireEvent.click(botao("Autorizações")));
act(() => fireEvent.click(botao("Editar")));
const lixeira = document.querySelector('button[title="Excluir evento"]');
act(() => fireEvent.click(lixeira));
check("Ver aciona onOpen", cliques.abrir === 1);
check("Mapa aciona onAbrirMapa", cliques.mapa === 1);
check("Autorizações aciona o callback", cliques.auth === 1);
check("Editar aciona o callback", cliques.editar === 1);
check("lixeira aciona onExcluir", cliques.excluir === 1);

// As classes de cor existem para os dois modos no mesmo elemento.
const htmlClaro = raiz.outerHTML;
check("modo claro: faixa cinza", /bg-slate-100 text-slate-600 border-slate-200/.test(htmlClaro));
check("modo escuro: faixa slate-800", /dark:bg-slate-800\/80/.test(htmlClaro));
check("modo claro: data com fundo translúcido", /bg-black\/45/.test(htmlClaro));
check("modo escuro: data sem pílula", /dark:bg-transparent/.test(htmlClaro));
check("Autorizações verde sólido nos dois modos", /bg-emerald-600 text-white/.test(htmlClaro));
check("Editar azul sólido nos dois modos", /bg-blue-600 text-white/.test(htmlClaro));
check("lixeira escura no modo escuro", /dark:bg-slate-800/.test(htmlClaro));
check("capa de 160px (h-40)", /h-40/.test(htmlClaro));

// Simula o modo escuro: a classe `dark` é o que o Tailwind usa.
document.documentElement.classList.add("dark");
check("classe dark aplicada na raiz", document.documentElement.classList.contains("dark"));
check("card continua com o fundo escuro declarado no dark:", String(raiz.className).includes("dark:bg-slate-900"));
document.documentElement.classList.remove("dark");

// ---------------------------------------------------------------------------
// 2. Variações
// ---------------------------------------------------------------------------
cleanup();
renderizar({
  event: { ...evento, isPaid: true, price: "15,00", requirements: "Levar documento com foto" },
  seuEvento: true,
  bloqueadoParaEditar: true,
  onEditar: undefined,
  onExcluir: undefined,
  rotuloVer: "Ver evento",
});
const texto2 = document.body.textContent;
check("pago mostra o valor", texto2.includes("R$ 15,00"));
check("selo Seu Evento", texto2.includes("Seu Evento"));
check("requirements diferente é mostrado", texto2.includes("Levar documento com foto"));
check("requirements repetido não aparece quando é igual", (texto2.match(/Org: Diretoria Helena Wysocki/g) || []).length === 1);
check("rótulo customizado do botão", texto2.includes("Ver evento"));
check("sem permissão mostra cadeado", texto2.includes("Outro admin"));

cleanup();
renderizar({ event: { ...evento, isSchool: false, schoolName: null, creatorRole: null, requirements: null } });
const texto3 = document.body.textContent;
check("evento público mostra 'Aberto ao público'", texto3.includes("Aberto ao público"));
check("organizador com fallback", texto3.includes("Org: Diretoria Regional"));
check("sem requirements não cria caixa extra", !texto3.includes("Comunidade Escolar • Org"));

cleanup();
console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 27 RENDER OK");
process.exit(0);
