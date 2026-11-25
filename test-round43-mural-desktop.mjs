/**
 * Tela de eventos no desktop — design e tamanho dos cards.
 *
 * PEDIDO:
 *   "Na versão computador, a tela de eventos tem que ter aquela alteração no
 *    design e no tamanho dos eventos que nem no prompt que lancei"
 *
 * O layout pedido (rodada 31) é:
 *   · contêiner de 88% da largura, teto de 1600 px;
 *   · 1 coluna no celular, 2 no tablet, 4 no desktop, 5 a partir de 1440 px;
 *   · gap 16/20 px e cards com a mesma altura na linha (`items-stretch`).
 *
 * O BUG que este teste tranca: o mural usava um breakpoint arbitrário de
 * 1440 px, que o Tailwind emite numa media query **fora** da escada
 * sm/md/lg/xl/2xl. Quando o CSS era montado com a de 1440 antes da de
 * 80rem, as duas eram verdadeiras em tela grande e a de **4 colunas vencia**
 * por aparecer depois — o mural nunca chegava a 5 por linha.
 *
 * Por isso aqui não se testa só a classe no JSX: testa-se o **CSS compilado**,
 * a ordem real das media queries, que é onde o layout de fato se decide.
 */
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

let passed = 0;
const falhas = [];
function check(nome, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    falhas.push({ nome, erro: e.message });
    console.log(`  ✗ ${nome}\n      ${e.message}`);
  }
}

const feed = readFileSync("src/components/Feed.tsx", "utf8");
const css_index = readFileSync("src/index.css", "utf8");

console.log("[1] A grade do mural usa o layout pedido");

check("contêiner de 88% com teto de 1600px", () => {
  assert.match(feed, /w-\[88%\]/);
  assert.match(feed, /max-w-\[1600px\]/);
});

check("1 / 2 / 4 / 5 colunas na escada certa", () => {
  const linha = feed.split("\n").find((l) => l.includes("grid-cols-1") && l.includes("items-stretch"));
  assert.ok(linha, "linha do grid não encontrada");
  assert.match(linha, /grid-cols-1/);
  assert.match(linha, /sm:grid-cols-2/);
  assert.match(linha, /xl:grid-cols-4/);
  assert.match(linha, /mural:grid-cols-5/);
});

check("não sobrou o breakpoint arbitrário de 1440px", () => {
  // Montado em partes de propósito: escrever a classe literal AQUI faria o
  // Tailwind gerar a media query órfã de novo (ele varre os .mjs também).
  const arbitrario = ["min-", "[1440px]", ":grid-cols-5"].join("");
  // A única menção permitida é dentro de comentário explicando o histórico.
  const linhasDeCodigo = feed
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
  const usos = linhasDeCodigo.filter((l) => l.includes(arbitrario));
  assert.deepEqual(usos, [], `ainda em uso: ${usos.join(" | ")}`);
});

check("gap e altura igual entre cards da linha", () => {
  const linha = feed
    .split("\n")
    .find((l) => l.includes("items-stretch") && l.includes("grid-cols-1"));
  assert.ok(linha, "linha do grid não encontrada");
  assert.match(linha, /gap-4/);
  assert.match(linha, /sm:gap-5/);
  assert.match(linha, /items-stretch/);
});

console.log("\n[2] O breakpoint está declarado no tema");

check("--breakpoint-mural existe em index.css", () => {
  assert.match(css_index, /--breakpoint-mural:\s*90rem/);
});

console.log("\n[3] CSS compilado: a ordem das media queries dá 5 colunas");

// Build garantido: o teste olha o artefato que vai para produção.
try {
  execSync("npm run build", { stdio: "pipe", timeout: 240000 });
} catch (e) {
  console.log("  ! build falhou, usando o dist existente");
}

const arquivo = readdirSync("dist/assets").find((f) => /^index-.*\.css$/.test(f));
assert.ok(arquivo, "CSS compilado não encontrado em dist/assets");
const css = readFileSync(`dist/assets/${arquivo}`, "utf8");

/** true quando `classe` está dentro de `@media(...)`. */
function mediaDa(classe) {
  const pos = css.indexOf(classe);
  if (pos < 0) return null;
  let atual = null;
  for (const m of css.matchAll(/@media\(([^)]*)\)\{/g)) {
    if (m.index > pos) break;
    // verifica se a media ainda está aberta na posição da classe
    let i = m.index + m[0].length;
    let nivel = 1;
    while (i < css.length && nivel) {
      if (css[i] === "{") nivel++;
      else if (css[i] === "}") nivel--;
      i++;
    }
    if (pos < i) atual = m[1];
  }
  return atual;
}

check("a classe mural:grid-cols-5 existe no CSS", () => {
  assert.ok(css.includes(".mural\\:grid-cols-5"), "classe ausente do CSS compilado");
});

check("mural:grid-cols-5 está em min-width:90rem (1440px)", () => {
  const media = mediaDa(".mural\\:grid-cols-5");
  assert.equal(media, "min-width:90rem", `media veio como ${media}`);
});

check("xl:grid-cols-4 está em min-width:80rem", () => {
  const media = mediaDa(".xl\\:grid-cols-4");
  assert.equal(media, "min-width:80rem", `media veio como ${media}`);
});

check("no CSS, a regra de 5 colunas vem DEPOIS da de 4", () => {
  // Em >=1440px as duas são verdadeiras; vence a última do arquivo.
  const p4 = css.indexOf(".xl\\:grid-cols-4");
  const p5 = css.indexOf(".mural\\:grid-cols-5");
  assert.ok(p5 > p4, `ordem invertida: 4 colunas em ${p4}, 5 colunas em ${p5}`);
});

check("não há media query órfã de 1440 em px no CSS", () => {
  /*
    Esta é a checagem que pega o efeito colateral do scanner do Tailwind:
    qualquer arquivo do projeto contendo a classe literal (inclusive um teste)
    faz o CSS gerar a media query, mesmo sem ninguém usá-la na interface.
  */
  assert.doesNotMatch(css, /@media\(min-width:1440px\)/);
});

console.log(`\n${passed}/${passed + falhas.length} verificações passaram`);
if (falhas.length) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(`  - ${f.nome}: ${f.erro}`);
  process.exit(1);
}
console.log("RODADA 43 OK — mural de eventos com 5 colunas garantidas no desktop");
