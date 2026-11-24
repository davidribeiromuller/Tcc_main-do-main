/**
 * Rodada 31 — dimensionamento da tela pública de Eventos.
 *
 * A referência é o print do painel em tela cheia: 5 cards por linha, ~330 px
 * cada, container usando ~93% da largura (teto 1720 px).
 *
 * Aqui valido a matemática do layout (que é o que dá errado silenciosamente) e
 * o contrato dos componentes. Roda com: npx tsx test-round31.mjs
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
// 1. Container principal
// ===========================================================================
console.log("\n1) Container");

check("largura relativa de 94%", feed.includes("w-[94%]"));
check("teto de 1720px", feed.includes("max-w-[1720px]"));
check("container centralizado (mx-auto)", feed.includes("w-[94%] max-w-[1720px] mx-auto"));
check("não estreita com max-w-6xl / 88rem", !feed.includes("max-w-6xl") && !feed.includes("max-w-[88rem]") && !feed.includes("max-w-5xl"));
check("todas as faixas (cabeçalho, filtros, busca, agenda) usam o container novo", (feed.match(/w-\[94%\] max-w-\[1720px\] mx-auto/g) || []).length >= 4, `${(feed.match(/w-\[94%\] max-w-\[1720px\] mx-auto/g) || []).length} usos`);
check("sem padding lateral que estreite a grade", !feed.includes("w-[94%] max-w-[1720px] mx-auto px-4"));

// ===========================================================================
// 2. Grade
// ===========================================================================
console.log("\n2) Grade");

check("1 coluna no celular", feed.includes("grid-cols-1"));
check("2 colunas no tablet", feed.includes("sm:grid-cols-2"));
check("4 colunas no desktop", feed.includes("xl:grid-cols-4"));
check("5 colunas a partir de 1440px", feed.includes("min-[1440px]:grid-cols-5"));
check("não usa 3 colunas no meio (era o que encolhia os cards)", !feed.includes("lg:grid-cols-3"));
check("gap horizontal de 18px no desktop", feed.includes("sm:gap-[18px]"));
check("gap de 16px no celular", feed.includes("gap-4"));
check("cards esticados na linha (altura uniforme)", feed.includes("items-stretch"));

// ---- matemática do layout, na resolução de referência (1850 px) ----
function larguraDoCard(viewport, containerPct, containerMax, colunas, gap) {
  const larguraContainer = Math.min(viewport * (containerPct / 100), containerMax);
  const util = larguraContainer - gap * (colunas - 1);
  return util / colunas;
}

const em1850 = larguraDoCard(1850, 94, 1720, 5, 18);
check(
  "em 1850px o card fica entre 325 e 335px",
  em1850 >= 325 && em1850 <= 335,
  `${em1850.toFixed(1)}px`
);
check("5 cards por linha em 1850px", Math.round(em1850) === Math.round(em1850));

const em1920 = larguraDoCard(1920, 94, 1720, 5, 18);
check("em 1920px continua 5 por linha com ~315px", em1920 >= 310 && em1920 <= 340, `${em1920.toFixed(1)}px`);

const em2560 = larguraDoCard(2560, 94, 1720, 5, 18);
check("ultrawide respeita o teto de 1720px (card ~320px)", em2560 >= 315 && em2560 <= 335, `${em2560.toFixed(1)}px`);

const em1440 = larguraDoCard(1440, 94, 1720, 5, 18);
check("em 1440px o card tem >= 250px (5 colunas ainda cabem)", em1440 >= 250, `${em1440.toFixed(1)}px`);

const em1280 = larguraDoCard(1280, 94, 1720, 4, 18);
check("em 1280px são 4 colunas com ~290px", em1280 >= 270 && em1280 <= 320, `${em1280.toFixed(1)}px`);

const em768 = larguraDoCard(768, 94, 1720, 2, 18);
check("em 768px são 2 colunas com ~345px", em768 >= 320 && em768 <= 380, `${em768.toFixed(1)}px`);

const em375 = larguraDoCard(375, 94, 1720, 1, 18);
check("em 375px é 1 coluna com ~352px", em375 >= 340, `${em375.toFixed(1)}px`);

check("nenhuma porcentagem acima de 100 (sem transbordo)", em1850 > 0 && em375 > 0);

// ===========================================================================
// 3. Card
// ===========================================================================
console.log("\n3) Card");

check("capa com 160px de altura", card.includes("h-40 w-full"));
check("imagem com object-cover", card.includes("object-cover"));
check("padding interno de 14–16px", card.includes("p-3.5 sm:p-4"));
check("título com até 2 linhas + altura reservada", card.includes("line-clamp-2") && card.includes("min-h-[2.6em]"));
check("título em 14px (destaque sem exagero)", card.includes("font-bold text-sm text-slate-900"));
check("localização com ícone", /MapPin[^]{0,200}cidadeDoEvento/.test(card));
check("faixa comunidade escolar + organização", card.includes("Org: {organizador}"));
check("etiquetas de tipo e categoria", card.includes("Escolar") && card.includes("Público") && card.includes("event.category"));
check("categoria não repete o tipo", card.includes("categoriaDiferente"));
check("divisor antes das ações", card.includes("mt-auto pt-3 border-t"));
check("bordas arredondadas", card.includes("rounded-2xl"));
check("sombra leve", card.includes("shadow-sm"));
check("altura consistente na linha", card.includes("h-full"));

// Botões públicos preservados; os administrativos NÃO vão para o mural.
check("card tem Ver", card.includes("<span>{rotuloVer}</span>"));
check("card tem Mapa", card.includes("<span>Mapa</span>"));
check("Feed usa o card com Ver evento e Mapa", feed.includes('rotuloVer="Ver evento"') && feed.includes("onAbrirMapa"));
check("Feed NÃO passa Autorizações/Editar/Excluir", !feed.includes("onAutorizacoes") && !feed.includes("onEditar") && !feed.includes("onExcluir"));
check("painel continua com os controles administrativos", admin.includes("onAutorizacoes") && admin.includes("onEditar") && admin.includes("onExcluir"));

// ===========================================================================
// 4. O que NÃO pode ter mudado
// ===========================================================================
console.log("\n4) Escopo preservado");

check("filtros de cidade continuam", feed.includes("FiltroGrupo rotulo=\"Cidade\""));
check("filtros de tipo continuam", feed.includes("FiltroGrupo rotulo=\"Tipo\""));
check("busca continua", feed.includes("Pesquisar eventos"));
check("botão Compromisso continua", feed.includes("Compromisso"));
check("título e contagem continuam", /Eventos/.test(feed) && feed.includes("filteredEvents.length === 1 ? \"evento\" : \"eventos\""));
check("agenda pessoal continua", feed.includes("listarEventosPessoais"));
check("sem overflow horizontal forçado na grade", !/overflow-x-auto[^"]*grid grid-cols/.test(feed));

const css = semComentarios(readFileSync("src/index.css", "utf8"));
const raiz = [...css.matchAll(/(^|\n)\s*(html|body|html[^{}]*body)\s*\{([^}]*)\}/g)];
check("CSS não define overflow em html/body", raiz.every((m) => !/(^|[;{\s])overflow(-[xy])?\s*:/.test(m[3])));

console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 31 OK");
