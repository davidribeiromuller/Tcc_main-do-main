/**
 * Testes da rodada 18 — responsividade mobile, rolagem por toque e remoção
 * da matrícula do cadastro.
 *
 * Relatos:
 *  - "reajuste a responsividade do mobile, o design está tudo amontoado e
 *    feio, AJUSTE TUDO"
 *  - "não consigo dar scroll com o dedo se o dedo estiver em cima de algo"
 *  - "remova a opção de matrícula do cadastro"
 *
 * Rodar: npx tsx test-round18.mjs
 */
import { readFileSync } from "node:fs";

let passou = 0;
let falhou = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) { passou++; console.log(`  ✓ ${nome}`); }
  else { falhou++; console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ""}`); }
}

const css = readFileSync("./src/index.css", "utf8");
const feed = readFileSync("./src/components/Feed.tsx", "utf8");
const admin = readFileSync("./src/components/AdminPanel.tsx", "utf8");
const calendario = readFileSync("./src/components/CalendarView.tsx", "utf8");
const cardMural = readFileSync("./src/components/EventCardMural.tsx", "utf8");
const registro = readFileSync("./src/components/Register.tsx", "utf8");
const validacao = readFileSync("./src/lib/schoolAccountValidation.ts", "utf8");
const login = readFileSync("./src/components/Login.tsx", "utf8");
const detalhe = readFileSync("./src/components/EventDetail.tsx", "utf8");

/** Remove comentários para não testar texto de documentação. */
const semComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\n=== 1. Rolagem por toque (a causa raiz) ===");
{
  const cssBody = semComentarios(css.slice(css.indexOf("body {"), css.indexOf("html.dark body")));
  ok("body não trava o gesto com `touch-action: pan-y`", !/touch-action:\s*pan-y/.test(cssBody));
  ok("body usa `manipulation` (pan livre + pinch-zoom)",
    /touch-action:\s*manipulation/.test(cssBody));

  const inicioScroll = css.indexOf(".overflow-y-auto, .overflow-x-auto, .scrollable-content");
  const blocoScroll = semComentarios(css.slice(inicioScroll, inicioScroll + 600));
  ok("contêineres de rolagem não usam `pan-y`", !/touch-action:\s*pan-y/.test(blocoScroll));
  ok("contêineres de rolagem usam `manipulation`", /touch-action:\s*manipulation/.test(blocoScroll));

  ok("existe classe `.touch-scroll` para rolagem confiável", /\.touch-scroll\s*\{/.test(css));
  ok(".touch-scroll não bloqueia o gesto", !/\.touch-scroll\s*\{[^}]*touch-action:\s*none/.test(css));
  ok("imagens não capturam o gesto (user-drag none)", /-webkit-user-drag:\s*none/.test(css));
  ok("faixa horizontal com snap e pan-x", /\.scroll-x-snap\s*\{[\s\S]{0,300}touch-action:\s*pan-x pan-y/.test(css));
  ok("mapa continua com gesto próprio, isolado", /\.touch-map[\s\S]{0,120}touch-action:\s*none/.test(css));
  ok("respiro inferior da barra de navegação", /\.pb-bottom-nav\s*\{/.test(css));
}

console.log("\n=== 2. Rolagem nas telas ===");
{
  ["feed", "calendario", "detalhe"].forEach((nome) => {
    const src = { feed, calendario, detalhe }[nome];
    ok(`${nome}: usa .touch-scroll`, /touch-scroll/.test(src));
  });
  ok("Feed não termina mais em pb-24 (usa classe de respiro)", !/overflow-y-auto pb-24/.test(semComentarios(feed)));
  ok("AdminPanel usa a classe de respiro inferior", /pb-bottom-nav/.test(admin));
  ok("AdminPanel não tem mais scroll-smooth (brigava com o dedo)", !/scroll-smooth/.test(semComentarios(admin)));
}

console.log("\n=== 3. Carrossel e faixas horizontais ===");
{
  const carrossel = readFileSync("./src/components/SchoolCarousel.tsx", "utf8");
  /*
    Rodada 24: o carrossel passou a ter rolagem CONTÍNUA (rAF) e retomada
    automática em 2,5 s. O que importa aqui (rodada 18) continua valendo:
    o gesto não pode "soltar" o autoplay no meio do arrasto e o trilho
    precisa aceitar pan horizontal.
  */
  ok("carrossel não solta o autoplay no meio do gesto",
    /RETOMADA_MS\s*=\s*\d+/.test(carrossel) && /pausarTemporariamente/.test(carrossel));
  ok("trilho do carrossel rola na horizontal",
    /overflow-x-auto/.test(carrossel) && /touch-scroll|scroll-x-snap/.test(carrossel));
  ok("filtros do Feed com snap horizontal", /scroll-x-snap/.test(feed));
  ok("agenda pessoal com snap horizontal", /scroll-x-snap/.test(feed));
  ok("filtros do painel com snap horizontal", /scroll-x-snap/.test(admin));
  ok("faixa do calendário com snap horizontal", /scroll-x-snap/.test(calendario));
}

console.log("\n=== 4. Densidade e respiro no mobile ===");
{
  ok("cabeçalho do Feed tem respiro vertical no mobile", /pt-3\.5 pb-2\.5 sm:pt-4/.test(feed));
  ok("título do Feed não usa mais 20px fixos", /text-\[1\.35rem\]/.test(feed));
  ok("botão de compromisso é 40×40 no mobile", /h-10 w-10 sm:w-auto/.test(feed));
  ok("grade do Feed tem gap de 16px no mobile", /gap-4 sm:gap-\[18px\]/.test(feed));
  // Rodada 27: o card do mural virou componente (EventCardMural) e o banner
  // passou a ser único (h-36) em todos os tamanhos — sem escala no toque.
  ok("card do mural sem scale no toque", !/active:scale/.test(cardMural));
  ok("banner do card com 160px (h-40)", /h-40 w-full/.test(cardMural));

  ok("abas do painel rolam na horizontal", /overflow-x-auto no-scrollbar scroll-x-snap/.test(admin));
  ok("abas do painel não quebram linha", /whitespace-nowrap shrink-0/.test(admin));
  ok("abas do painel têm altura de toque no mobile", /py-2 md:py-1\.5/.test(admin));
  ok("alternador tabela/cartões ocupa a linha no mobile", /w-full sm:w-auto/.test(admin));
  ok("resumo do painel respira (padding menor no mobile)", /p-3\.5 sm:p-4/.test(admin));

  ok("calendário: cabeçalho empilha no mobile", /flex flex-col sm:flex-row sm:justify-between/.test(calendario));
  ok("calendário: grade com gap menor no mobile", /grid-cols-7 gap-1 sm:gap-2\.5/.test(calendario));
  ok("calendário: dia sem escala no toque", !/isSelected[\s\S]{0,200}scale-105 z-10/.test(calendario));
  ok("calendário: conteúdo com padding menor no mobile", /p-3\.5 sm:p-6/.test(calendario));

  ok("detalhe do evento: banner menor no mobile", /h-48 sm:h-60/.test(detalhe));
  ok("detalhe do evento: título do banner responsivo", /text-xl sm:text-2xl/.test(detalhe));
  ok("login: cartão com padding compacto no mobile", /p-4 sm:p-8/.test(login));
}

console.log("\n=== 5. Modais não estouram a tela ===");
{
  const componentes = ["AdminPanel", "CalendarView", "EventDetail", "EventLocationModal",
    "EventNotificationModal", "GoogleAuthModal", "SchoolDetail", "SchoolPortal", "MapView"];
  const semRolagem = [];
  componentes.forEach((nome) => {
    const src = readFileSync(`./src/components/${nome}.tsx`, "utf8");
    const blocos = src.match(/className="fixed inset-0[^"]*"/g) || [];
    blocos.forEach((b) => {
      if (!/overflow-y-auto/.test(b)) semRolagem.push(`${nome}: ${b.slice(0, 70)}`);
    });
  });
  ok("todo modal com overlay permite rolagem", semRolagem.length === 0, semRolagem.join(" | "));
}

console.log("\n=== 6. Matrícula removida do cadastro ===");
{
  ok("campo de matrícula saiu do formulário", !/Matrícula \/ RA/.test(registro));
  ok("estado de matrícula não existe mais", !/const \[matricula, setMatricula\]/.test(registro));
  ok("ícone Hash não é mais importado", !/\bHash\b/.test(registro.split("\n")[2]));
  ok("cadastro envia matrícula vazia", /matricula: ""/.test(registro));
  ok("validação não exige mais matrícula", !/errors\.matricula/.test(validacao));
  ok("tipo aceita matrícula opcional", /matricula\?: string/.test(validacao));
  ok("CPF continua obrigatório", /errors\.cpf/.test(validacao));
  ok("e-mail institucional continua obrigatório", /errors\.email/.test(validacao));
  ok("data de nascimento continua validada", /errors\.birthdate/.test(validacao));
}

console.log(`\n${falhou === 0 ? "✅" : "❌"} ${passou} passaram, ${falhou} falharam\n`);
process.exit(falhou === 0 ? 0 : 1);
