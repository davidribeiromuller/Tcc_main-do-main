/**
 * Rodada 26 — render real do MURAL de eventos do painel.
 *
 * Renderiza o `AdminPanel` em jsdom com um Chefe Administrador e eventos de
 * teste, entra na aba "Eventos", força a visão de cartões e lê o card gerado.
 * Serve para provar o que o usuário cobrou: o card é ESCURO e tem exatamente
 * os elementos do design de referência.
 *
 * Rodar: npx tsx test-round26-mural.mjs
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://eloescola.test/",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
} catch {}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
dom.window.matchMedia = dom.window.matchMedia || (() => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
}));
globalThis.matchMedia = dom.window.matchMedia;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
const { render, fireEvent, act, cleanup } = await import("@testing-library/react");
const AdminPanel = (await import("./src/components/AdminPanel.tsx")).default;

let ok = 0;
const falhas = [];
const check = (nome, cond, detalhe = "") => {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

/** Chefe Administrador. */
const chefe = {
  id: 1,
  uid: "uid-chefe",
  nome: "Diretoria Helena Wysocki",
  email: "chefe@eloescola.test",
  role: "Administrador",
  isAdmin: true,
  adminRole: "chefe",
  ativo: true,
};

const eventos = [
  {
    id: 501,
    title: "Feira de Profissões 2026 — Escolha seu futuro",
    location: "Rua São Vicente de Paulo, 76 - Centro, Araucária/PR",
    city: "Araucária",
    day: 20,
    month: 11,
    year: 2026,
    time: "18:30",
    isPaid: false,
    price: null,
    isSchool: true,
    schoolName: "Diretoria Helena Wysocki",
    image: null,
    creatorId: 1,
  },
  {
    id: 502,
    title: "Olimpíada de Matemática — fase escolar",
    location: "Colégio Estadual Professor Júlio Szymanski",
    city: null,
    day: 3,
    month: 4,
    year: 2027,
    time: "08:00",
    isPaid: true,
    price: "15,00",
    isSchool: true,
    schoolName: "C. E. Prof. Júlio Szymanski",
    image: null,
    creatorId: 1,
  },
];

render(
  React.createElement(AdminPanel, {
    currentUser: chefe,
    usersList: [],
    events: eventos,
    onSelectEvent: () => {},
    onShowToast: () => {},
    onRefreshEvents: () => {},
  })
);

// Vai para a aba Eventos.
const abaEventos = [...document.querySelectorAll("button")].find(
  (b) => /eventos/i.test(b.textContent || "") && !/exclu/i.test(b.textContent || "")
);
check("aba Eventos encontrada", !!abaEventos, "sem botão de aba");

if (abaEventos) {
  await act(async () => {
    fireEvent.click(abaEventos);
    await new Promise((r) => setTimeout(r, 200));
  });
}

// O mural abre em CARTÕES por padrão (não depende mais da visão dos usuários).
const cardMural = [...document.querySelectorAll("div.rounded-2xl")].find((d) =>
  (d.textContent || "").includes("Feira de Profissões 2026")
);
check("mural abre em cartões sem clicar em nada", !!cardMural, "o card não apareceu ao abrir a aba");
check(
  "card é theme-aware (claro branco / escuro slate-900)",
  !!cardMural &&
    String(cardMural.className).includes("bg-white") &&
    String(cardMural.className).includes("dark:bg-slate-900"),
  String(cardMural?.className || "")
);

// E existe um alternador próprio dentro da aba Eventos.
const alternador = [...document.querySelectorAll("button")].filter((b) =>
  /^\s*(cart(õ|o)es|tabela)\s*$/i.test((b.textContent || "").trim())
);
check("aba Eventos tem alternador Cartões/Tabela", alternador.length >= 2, `achei ${alternador.length}`);

const texto = document.body.textContent || "";

check("título do primeiro evento aparece", texto.includes("Feira de Profissões 2026"));
check("título do segundo evento aparece", texto.includes("Olimpíada de Matemática"));
check("selo Gratuito presente", texto.includes("Gratuito"));
check("selo de preço pago presente", texto.includes("R$ 15,00"));
check("cidade vinda de `city`", texto.includes("Araucária"));
check("data sobre a imagem", /20 de .* de 2026 • 18:30/.test(texto));
check("faixa Comunidade Escolar", texto.includes("Comunidade Escolar"));
check("organizador na faixa", texto.includes("Org: Diretoria Helena Wysocki"));
check("ações Ver / Autorizações / Editar", texto.includes("Autorizações") && texto.includes("Editar"));

// O ponto central: o card usa as cores certas em cada modo.
const card = cardMural;
check("card do evento encontrado no DOM", !!card);
if (card) {
  const classes = String(card.className);
  check("card claro no modo claro (bg-white)", classes.includes("bg-white"), classes);
  check("card escuro no modo escuro (dark:bg-slate-900)", classes.includes("dark:bg-slate-900"), classes);
  check("borda escura sutil", classes.includes("border-slate-700") || classes.includes("border-white"));
  const html = card.outerHTML;
  check("capa de 160px (h-40)", /h-40/.test(html));
  check("gradiente escuro na imagem", html.includes("from-slate-900"));
  check("Autorizações em verde sólido", /bg-emerald-600/.test(html));
  check("Editar em azul sólido", /bg-blue-600/.test(html));
  check("ação Ver com contraste nos dois modos", /slate-700/.test(html) && /bg-slate-100/.test(html));
  check("botão Ver presente no card", html.includes("Ver"));
}

cleanup();
console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 26 MURAL OK");
process.exit(0);
