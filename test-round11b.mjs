/**
 * Teste da rodada 11 — botão de tema na tela de introdução (jsdom).
 *
 * Verifica a FIAÇÃO, não a aparência: o botão existe, o rótulo reflete o tema
 * atual, o clique chega no `onToggleTheme` e a tela não quebra sem as props.
 *
 * Requer: npm install jsdom @testing-library/react
 * Rodar:  npx tsx test-round11b.mjs
 */
// Verifica, por jsdom, que o botão de tema existe na tela de introdução e
// alterna quando recebe as props. Não é teste de aparência: é de fiação.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://exemplo.test/" });
global.window = dom.window; global.document = dom.window.document;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;

// jsdom não implementa scrollTo/scrollIntoView; o carrossel da welcome usa.
dom.window.Element.prototype.scrollTo = function () {};
dom.window.Element.prototype.scrollIntoView = function () {};

const { render, fireEvent, screen, cleanup } = await import("@testing-library/react");
const React = (await import("react")).default;
const WelcomeScreen = (await import("./src/components/WelcomeScreen.tsx")).default;

let tema = "light";
let cliques = 0;
const toggle = () => { cliques++; tema = tema === "dark" ? "light" : "dark"; };

const { rerender } = render(
  React.createElement(WelcomeScreen, {
    onNavigate: () => {},
    currentUser: null,
    theme: tema,
    onToggleTheme: toggle,
  })
);

const botaoEscuro = screen.queryByLabelText(/ativar modo escuro/i);
console.log(botaoEscuro ? "PASS botão 'Ativar modo escuro' presente" : "FAIL botão ausente");
fireEvent.click(botaoEscuro);
console.log(cliques === 1 ? "PASS clique chama onToggleTheme" : "FAIL não chamou");

rerender(
  React.createElement(WelcomeScreen, {
    onNavigate: () => {},
    currentUser: null,
    theme: "dark",
    onToggleTheme: toggle,
  })
);
const botaoClaro = screen.queryByLabelText(/ativar modo claro/i);
console.log(botaoClaro ? "PASS com tema escuro o rótulo vira 'Ativar modo claro'" : "FAIL rótulo não mudou");
console.log(botaoClaro?.getAttribute("title") === "Modo claro" ? "PASS title em português" : "FAIL title");

// Sem as props, a tela não deve quebrar (degradação)
cleanup();
render(React.createElement(WelcomeScreen, { onNavigate: () => {}, currentUser: null }));
const semBotao = screen.queryByLabelText(/ativar modo (escuro|claro)/i);
console.log(semBotao === null ? "PASS sem props não renderiza botão (não quebra)" : "FAIL botão fantasma");
cleanup();
process.exit(0);
