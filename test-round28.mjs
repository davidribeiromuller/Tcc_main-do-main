/**
 * Rodada 28 — tamanho e proporção dos cards do mural.
 *
 * O usuário aprovou o design e pediu ajuste de tamanho: os cards do mural do
 * aluno estavam estreitos (~200 px) e altos, cortando o título e espremendo a
 * faixa de metadados.
 *
 * Roda com: npx tsx test-round28.mjs
 */
import { readFileSync } from "node:fs";

let ok = 0;
const falhas = [];
const check = (nome, cond, detalhe = "") => {
  if (cond) ok++;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const feed = semComentarios(readFileSync("src/components/Feed.tsx", "utf8"));
const card = semComentarios(readFileSync("src/components/EventCardMural.tsx", "utf8"));
const admin = semComentarios(readFileSync("src/components/AdminPanel.tsx", "utf8"));

// ===========================================================================
// 1. Grade do mural do aluno
// ===========================================================================
console.log("\n1) Grade do mural do aluno");

check("no máximo 3 colunas (card mais largo)", feed.includes("lg:grid-cols-3") && !feed.includes("xl:grid-cols-4"));
check("container mais estreito (max-w-5xl)", feed.includes("max-w-5xl mx-auto w-full px-4 sm:px-6 pt-4"));
check("colunas alinhadas no topo (items-stretch)", feed.includes("items-stretch"));
check("respiro entre cards mantido", feed.includes("gap-4 sm:gap-5"));
check("mobile continua 1 coluna / 2 no tablet", feed.includes("grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"));

// ===========================================================================
// 2. Card: proporção e alinhamento
// ===========================================================================
console.log("\n2) Card");

check("imagem de topo 144px no mobile e 160px no desktop", card.includes("h-36 sm:h-40"));
check("título em até 2 linhas com altura reservada (cards alinham)", card.includes("line-clamp-2") && card.includes("min-h-[2.6em]"));
check("título maior no desktop", card.includes("text-[13px] sm:text-sm"));
check("corpo mais compacto no mobile", card.includes("p-3.5 sm:p-4"));
check("ritmo vertical uniforme", card.includes("flex flex-col gap-1.5"));
check("card ocupa a altura da linha", card.includes("h-full"));
check("rodapé sempre no pé do card", card.includes("mt-auto pt-3"));

// ===========================================================================
// 3. Faixa de metadados: sem texto estourando
// ===========================================================================
console.log("\n3) Faixa de metadados");

check("suporta duas linhas (mural) e uma linha (painel)", card.includes('layoutFaixa?: "duplo" | "unico"'));
check("faixa dupla mostra origem e organizador empilhados", /layoutFaixa === "duplo"[\s\S]{0,600}truncate[\s\S]{0,400}Org: \{organizador\}/.test(card));
check("faixa com reticências nas duas linhas", (card.match(/truncate/g) || []).length >= 4);
check("orgulho do title (tooltip com o nome completo)", card.includes("title={organizador}"));
check("selos não quebram para outra linha", card.includes("flex-nowrap"));
check("categoria usa reticências", /min-w-0[\s\S]{0,120}\{event\.category\}/.test(card) || card.includes("title={event.category}"));
check("selo escolar/público continua visível", card.includes("Escolar") && card.includes("Público"));
check(
  "origem aparece uma vez em cada variante (dupla e única)",
  (card.match(/>\{origem\}</g) || []).length === 2,
  `${(card.match(/>\{origem\}</g) || []).length} renderizações de origem`
);

// ===========================================================================
// 4. Mural do aluno usa a faixa dupla; painel usa a simples
// ===========================================================================
console.log("\n4) Onde cada layout é usado");

check("mural do aluno pede faixa dupla", feed.includes('layoutFaixa="duplo"'));
check("painel usa o padrão de uma linha", !admin.includes('layoutFaixa="duplo"'));
check("painel com cards mais largos (19rem)", admin.includes("minmax(min(100%, 19rem), 1fr)"));

// ===========================================================================
// 5. Regras herdadas
// ===========================================================================
console.log("\n5) Regras herdadas");

const css = semComentarios(readFileSync("src/index.css", "utf8"));
const raiz = [...css.matchAll(/(^|\n)\s*(html|body|html[^{}]*body)\s*\{([^}]*)\}/g)];
check("CSS não define overflow em html/body", raiz.every((m) => !/(^|[;{\s])overflow(-[xy])?\s*:/.test(m[3])));
const links = readFileSync("src/lib/eventLinksService.ts", "utf8");
check(
  "regra do 'nunca inventar URL' segue no serviço de links",
  /nunca inventar URL/i.test(links) && links.includes("if (!melhor || melhor.pontos < 2) return semResultado;")
);

console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 28 OK");
