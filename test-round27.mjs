/**
 * Rodada 27 — card do mural unificado (claro + escuro) nos dois murais.
 *
 * Roda com: npx tsx test-round27.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dataDoEvento, cidadeDoEvento, organizadorDoEvento, faixaDeMetadados } from "./src/components/EventCardMural.tsx";

let ok = 0;
const falhas = [];
const check = (nome, cond, detalhe = "") => {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// ===========================================================================
// 1. Componente único
// ===========================================================================
console.log("\n1) Componente do card");

check("EventCardMural existe", existsSync("src/components/EventCardMural.tsx"));
const card = readFileSync("src/components/EventCardMural.tsx", "utf8");
const cardSemComentarios = semComentarios(card);

check("exporta o componente padrão", card.includes("export default function EventCardMural"));
check("helpers exportados (data/cidade/organizador/faixa)", ["dataDoEvento", "cidadeDoEvento", "organizadorDoEvento", "faixaDeMetadados"].every((f) => card.includes(`export function ${f}`)));

// Modo claro
check(
  "modo claro: card branco com borda suave",
  cardSemComentarios.includes("bg-white") && cardSemComentarios.includes("border-slate-200")
);
check("modo claro: sombra discreta", /bg-white border-slate-200 shadow-sm/.test(cardSemComentarios));
check("modo claro: faixa de metadados cinza", /bg-slate-100 text-slate-600 border-slate-200/.test(cardSemComentarios));
check("modo claro: data com fundo escuro translúcido sobre a imagem", cardSemComentarios.includes("bg-black/45"));
check("modo claro: título em slate-900", cardSemComentarios.includes("text-slate-900 dark:text-white"));

// Modo escuro (print)
const blocoDark = cardSemComentarios.slice(cardSemComentarios.indexOf("dark:bg-slate-900"));
check("modo escuro: card slate-900", cardSemComentarios.includes("dark:bg-slate-900"));
check("modo escuro: borda slate-700", cardSemComentarios.includes("dark:border-slate-700/60"));
check("modo escuro: faixa slate-800", cardSemComentarios.includes("dark:bg-slate-800/80"));
check("modo escuro: data sem pílula (como no print)", cardSemComentarios.includes("dark:bg-transparent"));
check("modo escuro: ação Ver slate-700", cardSemComentarios.includes("dark:bg-slate-700/70"));
check("modo escuro: lixeira slate-800", cardSemComentarios.includes("dark:bg-slate-800 dark:text-slate-300"));
check("bloco dark presente", blocoDark.length > 0);

// Elementos do design
check("selo Gratuito verde no topo esquerdo", /top-2\.5 left-2\.5[^]{0,400}bg-emerald-600[^]{0,200}Gratuito/.test(cardSemComentarios));
check("pago em âmbar com o preço", cardSemComentarios.includes("bg-amber-500") && cardSemComentarios.includes("R$"));
check("capa de 160px (h-40)", cardSemComentarios.includes("h-40 w-full"));
check("data sobre a imagem com Calendar", /bottom-2\.5[^]{0,400}Calendar/.test(cardSemComentarios));
check("título em até 2 linhas com altura reservada", cardSemComentarios.includes("line-clamp-2") && cardSemComentarios.includes("min-h-[2.6em]"));
check("cidade com MapPin", /MapPin[^]{0,400}cidadeDoEvento/.test(cardSemComentarios));
check("faixa com Building2 e Org:", cardSemComentarios.includes("Building2") && cardSemComentarios.includes("Org:"));
check("Autorizações em verde sólido", /bg-emerald-600 text-white[^]{0,200}Autoriza/.test(cardSemComentarios));
check("Editar em azul sólido", /bg-blue-600 text-white[^]{0,200}<span>Editar<\/span>/.test(cardSemComentarios));
check("cadeado para outro admin", cardSemComentarios.includes("bloqueadoParaEditar") && cardSemComentarios.includes("Outro admin"));
check("botão Mapa opcional", cardSemComentarios.includes("onAbrirMapa") && cardSemComentarios.includes("<span>Mapa</span>"));
check("selo escolar/público", cardSemComentarios.includes("Escolar") && cardSemComentarios.includes("Público"));

// ===========================================================================
// 2. Faixa duplicada (defeito visível no print)
// ===========================================================================
console.log("\n2) Requisitos duplicados");

const ev = {
  id: 1,
  title: "Feira de Profissões",
  location: "Rua X, 100 - Centro, Araucária/PR",
  day: 20,
  month: 11,
  year: 2026,
  time: "18:30",
  isPaid: false,
  isSchool: true,
  schoolName: "Diretoria Helena Wysocki",
};
check("data formatada em português", dataDoEvento(ev) === "20 de Dezembro de 2026 • 18:30", dataDoEvento(ev));
check("data sem hora cai em 14:00", dataDoEvento({ ...ev, time: "" }) === "20 de Dezembro de 2026 • 14:00");
check("cidade vem de `city`", cidadeDoEvento({ ...ev, city: "Curitiba" }) === "Curitiba");
check(
  "cidade inferida do endereço (classificação oficial)",
  cidadeDoEvento(ev) === "Araucária",
  cidadeDoEvento(ev)
);
check(
  "cidade sem classificação cai para o fim do endereço",
  cidadeDoEvento({ ...ev, location: "Rua Sem Cidade, 10 - Bairro X" }) === "Bairro X"
);
check("organizador é a escola", organizadorDoEvento(ev) === "Diretoria Helena Wysocki");
check("organizador cai para o cargo", organizadorDoEvento({ ...ev, schoolName: null, creatorRole: "Coordenação" }) === "Coordenação");
check("organizador tem fallback", organizadorDoEvento({ ...ev, schoolName: null, creatorRole: null }) === "Diretoria Regional");
check("faixa: comunidade escolar", faixaDeMetadados(ev).origem === "Comunidade Escolar");
check("faixa: aberto ao público", faixaDeMetadados({ ...ev, isSchool: false }).origem === "Aberto ao público");

// O card esconde `requirements` quando ele repete a faixa.
check(
  "card detecta requirements repetido e não duplica",
  cardSemComentarios.includes("mostrarRequisitos") &&
    cardSemComentarios.includes("comunidade escolar") &&
    cardSemComentarios.includes("org:")
);

// ===========================================================================
// 3. Os dois murais usam o mesmo card
// ===========================================================================
console.log("\n3) Painel e mural do aluno");

const admin = readFileSync("src/components/AdminPanel.tsx", "utf8");
const adminSemComentarios = semComentarios(admin);
const feed = readFileSync("src/components/Feed.tsx", "utf8");
const feedSemComentarios = semComentarios(feed);

check("painel importa EventCardMural", admin.includes('import EventCardMural from "./EventCardMural.tsx"'));
check("mural do aluno importa EventCardMural", feed.includes('import EventCardMural from "./EventCardMural.tsx"'));
check("painel usa o card", /filteredEvents\.map[^]{0,400}<EventCardMural/.test(adminSemComentarios));
check("mural do aluno usa o card", /filteredEvents\.map[^]{0,400}<EventCardMural/.test(feedSemComentarios));

const trechoPainel = adminSemComentarios.slice(
  adminSemComentarios.indexOf('activeTab === "events" && ('),
  adminSemComentarios.indexOf("{/* TAB: Sugestões de eventos geradas pela IA */}")
);
check("painel passa autorizações/editar/excluir", ["onAutorizacoes", "onEditar", "onExcluir"].every((p) => trechoPainel.includes(p)));
check("painel marca 'Seu Evento'", trechoPainel.includes("seuEvento="));
check("painel bloqueia edição de outro admin", trechoPainel.includes("bloqueadoParaEditar="));
check("painel abre pela aba em cartões", trechoPainel.includes('eventViewMode === "table" ?'));

const trechoFeed = feedSemComentarios.slice(feedSemComentarios.indexOf("filteredEvents.map"));
check("mural do aluno passa onOpen (abre detalhe)", /onOpen=\{\(\) => handleCardClick\(event\)\}/.test(trechoFeed));
check("mural do aluno passa mapa", trechoFeed.includes("onAbrirMapa"));
check("mural do aluno tem rótulo próprio", trechoFeed.includes('rotuloVer="Ver evento"'));

// O card antigo do Feed (imagem com título por cima) não deve mais existir.
check(
  "card antigo do mural do aluno removido",
  !feedSemComentarios.includes("Title Overlay in Banner")
);

// Regra herdada: nada de overflow em html/body.
const css = semComentarios(readFileSync("src/index.css", "utf8"));
const seletoresRaiz = [...css.matchAll(/(^|\n)\s*(html|body|html[^{}]*body)\s*\{([^}]*)\}/g)];
check("CSS não define overflow em html/body", seletoresRaiz.every((m) => !/(^|[;{\s])overflow(-[xy])?\s*:/.test(m[3])));

console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 27 OK");
