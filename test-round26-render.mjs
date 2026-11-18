/**
 * Teste de renderização (jsdom) da rodada 26.
 *
 * Prova que o que foi adicionado na ficha da escola realmente aparece na tela
 * e responde ao clique — não é só texto no arquivo.
 *
 * Roda com: node test-round26-render.mjs
 * (precisa de `jsdom` + `@testing-library/react`: npm install --no-save jsdom @testing-library/react react-dom)
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
} catch {
  /* Node 22 já expõe um navigator somente-leitura; o do jsdom não é essencial. */
}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (!dom.window.matchMedia) {
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}
globalThis.matchMedia = dom.window.matchMedia;

const localStorageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (localStorageMap.has(k) ? localStorageMap.get(k) : null),
  setItem: (k, v) => localStorageMap.set(k, String(v)),
  removeItem: (k) => localStorageMap.delete(k),
  clear: () => localStorageMap.clear(),
  key: (i) => Array.from(localStorageMap.keys())[i] ?? null,
  get length() {
    return localStorageMap.size;
  },
};
try {
  Object.defineProperty(dom.window, "localStorage", {
    value: globalThis.localStorage,
    configurable: true,
  });
} catch {
  /* jsdom já tem localStorage próprio; o global é o que o app usa. */
}

const React = (await import("react")).default;
const { render, fireEvent, screen, cleanup, act } = await import("@testing-library/react");
const SchoolProfileModal = (await import("./src/components/SchoolProfileModal.tsx")).default;
const { ARAUCARIA_SCHOOLS } = await import("./src/lib/schoolsData.ts");

let ok = 0;
const falhas = [];
const check = (nome, cond, detalhe = "") => {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const escola = ARAUCARIA_SCHOOLS[0];

// ===========================================================================
// 1. Modo leitura (Ver perfil)
// ===========================================================================
const toasts = [];
let fechou = 0;
render(
  React.createElement(SchoolProfileModal, {
    escola,
    podeEditar: true,
    autor: "ADM Chefe",
    onClose: () => fechou++,
    onShowToast: (msg) => toasts.push(msg),
  })
);

check("mostra o nome curto da escola", !!screen.getByText(escola.shortName));
check("mostra o telefone", document.body.textContent.includes(escola.phone));
check("mostra o e-mail institucional", document.body.textContent.includes(escola.email));
check("mostra o endereço", document.body.textContent.includes(escola.address));
check("mostra as modalidades", document.body.textContent.includes(escola.modalities[0]));
check("mostra o histórico", document.body.textContent.includes("Histórico"));
check("mostra a fonte da verificação", document.body.textContent.includes(escola.verificationSource));
check("modo leitura NÃO mostra campos de input", document.querySelectorAll("input").length === 0);
check("tem botão Editar", !!screen.getByText("Editar"));
check("tem botão Fechar", !!screen.getByText("Fechar"));

fireEvent.click(screen.getByText("Fechar"));
check("Fechar chama onClose", fechou === 1);

// ===========================================================================
// 2. Modo edição
// ===========================================================================
cleanup();
render(
  React.createElement(SchoolProfileModal, {
    escola,
    podeEditar: true,
    autor: "ADM Chefe",
    onClose: () => {},
    onShowToast: (msg) => toasts.push(msg),
  })
);

await act(async () => {
  fireEvent.click(screen.getByText("Editar"));
  await new Promise((r) => setTimeout(r, 50));
});

check("modo edição abre com os campos", document.querySelectorAll("input").length >= 10);
check("campo de telefone pré-preenchido", [...document.querySelectorAll("input")].some((i) => i.value === escola.phone));
check("campo de e-mail pré-preenchido", [...document.querySelectorAll("input")].some((i) => i.value === escola.email));
check("textarea do histórico presente", !!document.querySelector("textarea"));
check("botão Salvar informações presente", !!screen.getByText("Salvar informações"));
check("botão Cancelar presente", !!screen.getByText("Cancelar"));

// Cancelar volta para leitura sem salvar
await act(async () => {
  fireEvent.click(screen.getByText("Cancelar"));
  await new Promise((r) => setTimeout(r, 30));
});
check("Cancelar volta ao modo leitura", document.querySelectorAll("input").length === 0);

// ===========================================================================
// 3. Permissão: funcionário sem ser Chefe só consulta
// ===========================================================================
cleanup();
render(
  React.createElement(SchoolProfileModal, {
    escola,
    podeEditar: false,
    autor: "Funcionário",
    onClose: () => {},
    onShowToast: (msg) => toasts.push(msg),
  })
);
check("sem permissão não há botão Editar", !screen.queryByText("Editar"));
check("aviso de que só o Chefe altera", document.body.textContent.includes("Somente o Chefe Administrador"));

// ===========================================================================
// 4. Abre direto em edição (botão Editar do card)
// ===========================================================================
cleanup();
render(
  React.createElement(SchoolProfileModal, {
    escola,
    podeEditar: true,
    autor: "ADM Chefe",
    iniciarEmEdicao: true,
    onClose: () => {},
    onShowToast: () => {},
  })
);
check("iniciarEmEdicao abre o formulário direto", document.querySelectorAll("input").length >= 10);

cleanup();
console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 26 RENDER OK");
// jsdom + testing-library deixam timers abertos: encerra explicitamente.
process.exit(0);
