/**
 * Testes da rodada 22 — rolagem do painel ADM no mobile (3ª tentativa).
 *
 * Relato: "ainda nao funciona o scroll da tela do painel de adm mobile".
 *
 * Rodada 21 trocou o modelo (documento é o scroller), mas manteve duas
 * armadilhas reais de navegador mobile:
 *
 *  1. `overflow-x: clip` no `html`/`body`. No Safari do iOS o `overflow`
 *     da raiz PROPAGA para a viewport; com `clip` o documento perde a
 *     rolagem vertical. Na raiz, `overflow` tem que ficar ausente.
 *  2. `overscroll-behavior` + `touch-action` declarados de forma ampla
 *     (`.overflow-x-auto`, `.admin-table-scroll` com `contain` nos dois
 *     eixos) engoliam o arrasto vertical feito em cima das faixas.
 *
 * Rodar: npx tsx test-round22.mjs
 */
import { readFileSync } from "node:fs";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const css = readFileSync("./src/index.css", "utf8");
const painel = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const cssLimpo = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Todos os blocos cujo seletor é exatamente `html`, `body` ou ambos. */
function blocosRaiz() {
  const out = [];
  for (const m of cssLimpo.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim();
    if (/^(html|body|html,|body,|:root)/.test(sel) && /\b(html|body)\b/.test(sel)) {
      if (!/^html\.|^\.|^#|^@/.test(sel)) out.push({ sel, corpo: m[2] });
    }
  }
  return out;
}

console.log("\n=== 1. A raiz do documento não declara `overflow` ===\n");
{
  const raiz = blocosRaiz();
  ok("há regras de html/body no CSS", raiz.length > 0);
  const comOverflow = raiz.filter((b) => /(^|[;{\s])overflow(-[xy])?\s*:/.test(b.corpo));
  ok("nenhuma regra de html/body declara overflow",
    comOverflow.length === 0,
    comOverflow.map((b) => b.sel).join(" | "));
  ok("`clip` não aparece na raiz (bug do Safari iOS)",
    !raiz.some((b) => /overflow[^;]*clip/.test(b.corpo)));
  ok("nenhuma regra de html/body trava altura",
    !raiz.some((b) => /(^|[;{\s])height:\s*(100%|100dvh|100vh)/.test(b.corpo)));
}

console.log("=== 2. Gesto vertical liberado na raiz ===\n");
{
  const raiz = blocosRaiz();
  const temPanY = raiz.some((b) => /touch-action:\s*pan-y/.test(b.corpo));
  ok("html/body liberam pan vertical", temPanY);
  ok("nada de `touch-action: none` na raiz",
    !raiz.some((b) => /touch-action:\s*none/.test(b.corpo)));
}

console.log("=== 3. `overscroll-behavior` não engole o arrasto vertical ===\n");
{
  const generico = cssLimpo.match(/\.overflow-y-auto,\s*\.overflow-x-auto,\s*\.scrollable-content\s*\{([^}]*)\}/)?.[1] || "";
  ok("regra genérica das classes `.overflow-*` existe", generico.length > 0);
  ok("ela NÃO declara overscroll-behavior-y",
    !/overscroll-behavior(-y)?:\s*contain/.test(generico));

  const tabela = cssLimpo.match(/\.admin-table-scroll\s*\{([^}]*)\}/)?.[1] || "";
  ok("tabela confina só o eixo X", /overscroll-behavior-x:\s*contain/.test(tabela));
  ok("tabela NÃO usa `overscroll-behavior: contain` (dois eixos)",
    !/overscroll-behavior:\s*contain/.test(tabela));

  const faixa = cssLimpo.match(/\.scroll-x-snap\s*\{([^}]*)\}/)?.[1] || "";
  ok("faixa horizontal confina só o eixo X",
    /overscroll-behavior-x:\s*contain/.test(faixa) && !/overscroll-behavior:\s*contain/.test(faixa));
}

console.log("=== 4. Painel: conteúdo comum, sem scroller aninhado ===\n");
{
  const raiz = painel.match(/className="admin-page[^"]*"/)?.[0] || "";
  ok("raiz usa `.admin-page`", raiz.length > 0);
  ok("sem `overflow-y-auto` (quem rola é a página)", !/overflow-y-auto/.test(raiz));
  ok("sem `h-full`/`flex-1`/`min-h-0` (não se estica nem cria contexto)",
    !/h-full|flex-1|min-h-0/.test(raiz));
  ok("corta excesso horizontal", /overflow-x-clip/.test(raiz));
  ok("reserva a barra inferior", /pb-bottom-nav/.test(raiz));

  const classe = cssLimpo.match(/\.admin-page\s*\{([^}]*)\}/)?.[1] || "";
  ok("`.admin-page` não cria scroller vertical", !/overflow-y:\s*(auto|scroll)/.test(classe));
  ok("`.admin-page` limita a largura à viewport", /max-width:\s*100vw/.test(classe));
  ok("`.admin-page` aceita pan vertical", /touch-action:\s*pan-y/.test(classe));
  ok("`.admin-page` não engole o overscroll vertical",
    !/overscroll-behavior(-y)?:\s*(contain|none)/.test(classe));
}

console.log("=== 5. Nenhum scroller vertical sobra no app ===\n");
{
  const suspeitos = [
    ["Feed", "./src/components/Feed.tsx"],
    ["Agenda", "./src/components/CalendarView.tsx"],
    ["Ajustes", "./src/components/Settings.tsx"],
    ["Apoio", "./src/components/Contact.tsx"],
    ["Detalhe do evento", "./src/components/EventDetail.tsx"],
    ["Cadastro", "./src/components/Register.tsx"],
  ];
  for (const [nome, arquivo] of suspeitos) {
    const fonte = readFileSync(arquivo, "utf8");
    const raiz = fonte.match(/className="([^"]*min-h-\[100dvh\][^"]*)"/)?.[0]
      || fonte.match(/className="([^"]*pb-bottom-nav[^"]*)"/)?.[0]
      || "";
    ok(`${nome}: raiz não tem scroller próprio`, raiz.length > 0 && !/overflow-y-auto/.test(raiz));
  }
}

console.log("=== 6. Rodapé do arquivo não re-introduz overflow na raiz ===\n");
{
  // O bloco final (rodada 21/22) é o último a falar de viewport. Nenhuma
  // regra `html`/`body` com `overflow` pode aparecer DEPOIS das regras de
  // `touch-action` da raiz.
  const posTouch = cssLimpo.search(/(html|body)[^{}]*\{[^}]*touch-action:\s*pan-y/);
  const cauda = posTouch === -1 ? "" : cssLimpo.slice(posTouch);
  const htmlBodyComOverflow = [...cauda.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => /(^|,)\s*(html|body)\s*(,|$)/.test(m[1].trim()))
    .filter((m) => /(^|[;{\s])overflow/.test(m[2]));
  ok("nenhum bloco html/body posterior declara overflow",
    htmlBodyComOverflow.length === 0,
    htmlBodyComOverflow.map((m) => m[1].trim()).join(" | "));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
