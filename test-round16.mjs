/**
 * Testes da rodada 16 — redesenho da ABA de eventos.
 *
 * A rodada anterior mexeu nos cards; esta mexe na aba inteira (cabeçalho,
 * filtros, grade e estados vazios) e **devolve os cards ao formato anterior**.
 * Os testes abaixo travam as duas coisas.
 *
 * Rodar: npx tsx test-round16.mjs
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const fonte = readFileSync("./src/components/Feed.tsx", "utf8");

console.log("\n=== 1. Cards voltaram ao design anterior ===");
{
  // Rodada 27: o card do mural passou para `EventCardMural`; a imagem do evento
  // continua sendo o visual (sem camada por área do conhecimento).
  const cardFonte = readFileSync("./src/components/EventCardMural.tsx", "utf8");
  ok("usa a imagem (sem camada de área do conhecimento)",
    /event\.image[\s\S]{0,120}images\.unsplash\.com/.test(cardFonte));
  ok("não importa mais o módulo de visuais por área",
    !/eventVisuals/.test(cardFonte) && !/eventVisuals/.test(fonte));
  // O título continua sobreposto ao banner; na rodada 18 o respiro passou a
  // ser responsivo (menor no mobile), então validamos a posição, não o literal.
  // Rodada 27: a DATA fica sobre o banner (padrão do print) e o título no
  // corpo do card, em uma linha.
  ok("data sobre o banner, em branco",
    /absolute bottom-2\.5[^]{0,400}text-white/.test(cardFonte));
  ok("cartão arredondado (rounded-2xl) no componente",
    /rounded-2xl border flex flex-col/.test(cardFonte));
  ok("data por extenso a partir de day/month/year",
    /\{ev\.day\} de \$\{mes\} de \$\{ev\.year\}/.test(cardFonte) ||
    /dataDoEvento/.test(cardFonte));
  ok("não existe mais bloco de data destacado",
    !/Bloco de data/.test(fonte));
}

console.log("\n=== 2. Cabeçalho da aba ===");
{
  ok("título Eventos", />\s*Eventos\s*</.test(fonte));
  ok("subtítulo mostra a contagem", /filteredEvents\.length === 1 \? "evento" : "eventos"/.test(fonte));
  ok("subtítulo reage ao filtro de cidade", /cityFilter !== "todas" \? ` · \$\{cityFilter\}`/.test(fonte));
  ok("lupa com rótulo alternável", /"Fechar busca" : "Pesquisar eventos"/.test(fonte));
  ok("botão de compromisso pessoal", /Adicionar compromisso pessoal/.test(fonte));
  ok("cabeçalho é sticky", /sticky top-0 z-30/.test(fonte));
}

console.log("\n=== 3. Filtros ===");
{
  ok("componente de grupo (FiltroGrupo)", /function FiltroGrupo\(/.test(fonte));
  ok("componente de chip (ChipFiltro)", /function ChipFiltro\(/.test(fonte));
  ok("grupos com aria-label", /aria-label=\{`Filtrar por \$\{rotulo\.toLowerCase\(\)\}`\}/.test(fonte));
  ok("chips com aria-pressed", /aria-pressed=\{ativo\}/.test(fonte));
  ok("rolagem horizontal dos filtros", /overflow-x-auto no-scrollbar/.test(fonte));
  ok("rótulo curto do tipo público", /label: "Aberto"/.test(fonte));
  ok("botão de limpar filtros", /<X size=\{11\} \/> Limpar/.test(fonte));
}

console.log("\n=== 4. Grade e estados ===");
{
  // Rodada 28: no máximo 3 colunas (cards largos o suficiente para o título
  // e a faixa de metadados não serem cortados).
  // Rodada 28: no máximo 3 colunas (cards largos para o título e a faixa de
  // metadados). O comentário que cita o grid antigo não conta.
  const fonteSemComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  // Rodada 31: 1/2/4/5 — sem coluna intermediária de 3, 5 a partir de 1440px.
  ok(
    "grade responsiva 1/2/4/5",
    /grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 min-\[1440px\]:grid-cols-5/.test(fonteSemComentarios)
  );
  // Rodada 18 aumentou o respiro no mobile (gap-4) mantendo o do desktop.
  ok("espaçamento regular entre cards", /gap-4 sm:gap-\[18px\]/.test(fonte));
  ok("estado vazio explica quando não há eventos", /Nenhum evento na agenda ainda/.test(fonte));
  ok("estado vazio oferece limpar filtros", /Nada com esses filtros/.test(fonte));
  ok("estado vazio oferece criar compromisso", /Criar compromisso/.test(fonte));
  ok("skeleton mantido", /animate-pulse/.test(fonte));
}

console.log("\n=== 5. Nada foi perdido ===");
{
  ok("agenda pessoal continua", /Minha agenda/.test(fonte));
  ok("modal de compromisso continua", /PersonalEventModal/.test(fonte));
  ok("modal de localização continua", /EventLocationModal/.test(fonte));
  ok("busca com limpar", /Limpar pesquisa/.test(fonte));
  ok("filtros usados no resultado", /filteredEvents\.length/.test(fonte));
}

console.log("\n=== 6. Renderização real (jsdom) ===");
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://x.github.io/feed" });
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
  const Feed = (await import("./src/components/Feed.tsx")).default;

  const eventos = [
    { id: 1, title: "Olimpíada de Robótica", location: "Araucária", day: 10, month: 2, year: 2027, time: "11:00", isPaid: false, city: "Araucária" },
    { id: 2, title: "Feira de Literatura", location: "Curitiba", day: 12, month: 3, year: 2027, time: "13:00", isPaid: true, price: "R$ 10", city: "Curitiba" },
  ];

  RTL.render(React.createElement(Feed, { events: eventos, onSelectEvent: () => {}, onNavigate: () => {}, isAdmin: false, currentUser: { id: 1, nome: "David" } }));

  ok("título da aba na tela", RTL.screen.queryByText("Eventos") !== null);
  ok("contagem aparece na tela", /2 eventos/.test(document.body.textContent ?? ""));
  ok("dois cards renderizados", RTL.screen.queryAllByRole("heading", { level: 4 }).length === 2);
  ok("grupo cidade acessível", RTL.screen.queryByRole("group", { name: /cidade/i }) !== null);
  ok("grupo tipo acessível", RTL.screen.queryByRole("group", { name: /tipo/i }) !== null);
  ok("chips marcam estado", RTL.screen.getAllByRole("button", { pressed: true }).length >= 2);
  ok("preço aparece no card pago", /R\$ 10/.test(document.body.textContent ?? ""));

  RTL.cleanup();

  RTL.render(React.createElement(Feed, { events: [], onSelectEvent: () => {}, onNavigate: () => {}, isAdmin: false, currentUser: { id: 1, nome: "David" } }));
  ok("estado vazio renderiza", /Nenhum evento na agenda ainda/.test(document.body.textContent ?? ""));
  ok("estado vazio tem ação", RTL.screen.queryByText(/Criar compromisso/i) !== null);
  RTL.cleanup();
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
