/**
 * Suíte da rodada 26.
 *
 * Cobre os três pedidos:
 *  1. mural de eventos do painel com o design de referência;
 *  2. busca de links das sugestões da IA (a correção de acento/normalização);
 *  3. ver perfil e editar as informações da escola nas contas escolares.
 *
 * Roda com `npx tsx test-round26.mjs`.
 */
import { readFileSync, existsSync } from "node:fs";
import { buscarLinkInscricao, limparCacheLinks, termoDeBusca } from "./src/lib/eventLinksService.ts";
import {
  mesclarPerfil,
  paraEditavel,
  CAMPOS_ESCOLA,
  CAMPOS_LISTA_ESCOLA,
  aplicarPerfisEditados,
} from "./src/lib/schoolProfilesService.ts";
import { ARAUCARIA_SCHOOLS } from "./src/lib/schoolsData.ts";

let ok = 0;
const falhas = [];

function check(nome, condicao, detalhe = "") {
  if (condicao) {
    ok++;
  } else {
    falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const blocoExcluidos = ((arquivo, inicio, fim) => {
  const s = readFileSync(arquivo, "utf8");
  const i = s.indexOf(inicio);
  if (i < 0) return "";
  const f = fim ? s.indexOf(fim, i) : -1;
  return f > i ? s.slice(i, f) : s.slice(i);
})("src/components/AdminPanel.tsx", "{eventViewFilter === \"excluded\" ? (", "                filteredEvents.map((ev) => {");

/** Remove comentários (o teste textual não deve passar por causa deles). */
function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const admin = readFileSync("src/components/AdminPanel.tsx", "utf8");
const adminSemComentarios = semComentarios(admin);

// ===========================================================================
// 1. MURAL DE EVENTOS — design de referência
// ===========================================================================
console.log("\n1) Mural de eventos no painel");

const indiceMural = admin.indexOf('className="grid gap-3.5 sm:gap-4"', admin.indexOf('{activeTab === "events" && ('));
const trechoMural = indiceMural >= 0 ? admin.slice(indiceMural, admin.indexOf("{/* TAB: Sugestões de eventos geradas pela IA */}", indiceMural)) : "";
const trechoMuralCode = semComentarios(trechoMural);

check("trecho do mural encontrado", trechoMural.length > 2000, `len=${trechoMural.length}`);
check(
  "colunas elásticas (auto-fill) em vez de grid fixo 1/2/3/4",
  trechoMuralCode.includes("auto-fill") && trechoMuralCode.includes("minmax(min(100%,"),
  "o grid antigo espremia os cards"
);
check(
  "sem o grid fixo antigo",
  !trechoMuralCode.includes("grid-cols-1 md:grid-cols-2 lg:grid-cols-3")
);
check("imagem de topo h-36 no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("h-40 w-full"));
check("gradiente escuro no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("bg-gradient-to-t from-slate-900/85"));
check(
  "selo de preço na aba Eventos (componente)",
  readFileSync("src/components/EventCardMural.tsx", "utf8").includes("top-2.5 left-2.5"),
  "badge de preço sobre a imagem"
);
check(
  "data sobre a imagem (componente)",
  readFileSync("src/components/EventCardMural.tsx", "utf8").includes("dataDoEvento(event)")
);
check("cidade com MapPin no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("cidadeDoEvento(event)"));
check(
  "faixa de metadados no componente",
  readFileSync("src/components/EventCardMural.tsx", "utf8").includes("Org: {organizador}")
);
check("Autorizações com ShieldCheck no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("ShieldCheck"));
check("Editar em azul no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("bg-blue-600 text-white"));
check("lixeira no componente", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("Trash2"));
check("título em até 2 linhas com altura reservada", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("line-clamp-2") && readFileSync("src/components/EventCardMural.tsx", "utf8").includes("min-h-[2.6em]"));
check("card ocupa a altura toda", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("h-full"));
// O mural tem visão própria: antes ele herdava o viewMode da lista de usuários
// e quem usava "Tabela" nunca via os cards escuros.
check("mural tem estado próprio (eventViewMode)", admin.includes("const [eventViewMode, setEventViewMode]"));
check("mural abre em cartões por padrão", /useState<"table" \| "cards">\("cards"\)/.test(admin));
check("mural renderiza cards em eventViewMode", admin.includes('eventViewMode === "table" ?'));
check("aba Eventos tem alternador próprio", /setEventViewMode\("cards"\)/.test(adminSemComentarios) && /setEventViewMode\("table"\)/.test(adminSemComentarios));
// O ponto que o usuário cobrou: o card precisa ser ESCURO, não claro.
check("mural usa o componente EventCardMural", trechoMuralCode.includes("<EventCardMural"));
check("card do mural é theme-aware (claro/escuro)", readFileSync("src/components/EventCardMural.tsx", "utf8").includes("dark:bg-slate-900"));
const excluidos = blocoExcluidos;
check(
  "card de evento excluído segue o mesmo fundo escuro",
  excluidos.includes("bg-slate-900") && excluidos.includes("text-white")
);

// ===========================================================================
// 2. BUSCA DE LINKS DAS SUGESTÕES DA IA
// ===========================================================================
console.log("\n2) Busca de links de inscrição");

const servico = readFileSync("src/lib/eventLinksService.ts", "utf8");

check("normalizar remove acento e pontuação", /normalize\("NFD"\)/.test(servico) && /\[\\u0300-\\u036f\]/.test(servico));
check("catálogo comparado por casarPadrao", servico.includes("casarPadrao(entrada.padrao, titulo)"));
check(
  "não usa mais a regex crua contra o título acentuado",
  !servico.includes("if (entrada.padrao.test(titulo))")
);
check("pontuação de relevância dos candidatos", servico.includes("pontuarCandidato"));
check("relevância mínima exigida", /melhor\.pontos < 2/.test(servico));
check("fallback traz termoBusca (nunca URL inventada)", servico.includes("termoBusca: termo"));
check("termoDeBusca exportado", servico.includes("export function termoDeBusca"));
check("enriquecerComLinks mantém a regra de não inventar URL", servico.includes("if (!resultado.url)"));
check("cache limpo disponível para testes", servico.includes("export function limparCacheLinks"));

// Casos reais: a comparação sem acento precisa achar TODOS estes.
const casos = [
  ["Olimpíada Brasileira de Matemática das Escolas Públicas (OBMEP)", "obmep.org.br"],
  ["Olimpíada Brasileira de Astronomia e Astronáutica", "oba.org.br"],
  ["Mostra Brasileira de Foguetes", "mobfog.com.br"],
  ["Olimpíada Brasileira de Física", "sbfisica.org.br"],
  ["Olimpíada Brasileira de Informática", "olimpiada.ic.unicamp.br"],
  ["Olimpíada Nacional em História do Brasil", "olimpiadadehistoria.com.br"],
  ["Olimpíada Brasileira de Química", "obquimica.org"],
  ["Feira de Profissões da UFPR", "ufpr.br"],
  ["Vestibular UFPR 2027", "ufpr.br"],
  ["Olimpíada de Língua Portuguesa", "escrevendoofuturo.org.br"],
  ["Jogos Escolares do Paraná (JEPS)", "educacao.pr.gov.br"],
  ["Feira de Ciências Municipal", null],
  ["Semana Cultural da Escola", null],
];

let acertosCatalogo = 0;
for (const [titulo, esperado] of casos) {
  limparCacheLinks();
  const r = await buscarLinkInscricao(titulo, { cidade: "Araucária" });
  if (esperado) {
    const bateu = !!r.url && r.url.includes(esperado) && r.fonte === "catalogo";
    if (bateu) acertosCatalogo++;
    check(`catálogo: "${titulo}"`, bateu, `obtido=${r.url} fonte=${r.fonte}`);
  } else {
    // Sem catálogo e sem rede no sandbox: precisa devolver null + termo de busca.
    check(
      `sem palpite: "${titulo}"`,
      r.url === null && typeof r.termoBusca === "string" && r.termoBusca.length > 0,
      `obtido=${r.url} termo=${r.termoBusca}`
    );
  }
}
check(
  "catálogo resolve a maioria dos títulos reais (>=10/11)",
  acertosCatalogo >= 10,
  `${acertosCatalogo}/11`
);

limparCacheLinks();
const comAcento = await buscarLinkInscricao("Olimpíada Brasileira de Física");
limparCacheLinks();
const semAcento = await buscarLinkInscricao("Olimpiada Brasileira de Fisica");
check(
  "título com e sem acento devolvem o mesmo link",
  comAcento.url === semAcento.url && !!comAcento.url
);

limparCacheLinks();
const r1 = await buscarLinkInscricao("Festival de Robótica de Araucária");
const r2 = await buscarLinkInscricao("Festival de Robótica de Araucária");
check("cache evita recomputar", r1.url === r2.url);

const termo = termoDeBusca("Feira de Ciências Municipal", { cidade: "Araucária" });
check("termo de busca contém título e cidade", termo.includes("Feira de Ciências Municipal") && termo.includes("Araucária"));
check("termo pede site oficial", termo.includes("site oficial"));

const tab = readFileSync("src/components/EventSuggestionsTab.tsx", "utf8");
check("botão 'Procurar na web' quando não há link", tab.includes("Procurar na web"));
check("busca na web é uma BUSCA (google), não URL de evento", /google\.com\/search\?q=\$\{encodeURIComponent/.test(tab));
check("usa o termoBusca vindo do serviço", tab.includes("info?.termoBusca"));

// ===========================================================================
// 3. CONTAS ESCOLARES — ver perfil e editar a escola
// ===========================================================================
console.log("\n3) Ver perfil e editar a escola");

check("modal SchoolProfileModal existe", existsSync("src/components/SchoolProfileModal.tsx"));
const modal = readFileSync("src/components/SchoolProfileModal.tsx", "utf8");
check("modal tem modo leitura e modo edição", modal.includes("editando ?") && modal.includes("MODO EDIÇÃO"));
check("modal chama salvarPerfilEscola", modal.includes("salvarPerfilEscola(dados, autor)"));
check("somente Chefe edita", modal.includes("podeEditar") && modal.includes("Apenas o Chefe Administrador"));
check("campos de texto do formulário são renderizados", modal.includes("CAMPOS_ESCOLA.map"));
check("listas editem item a item", modal.includes("CAMPOS_LISTA_ESCOLA.map") && modal.includes("adicionarItem"));
check("modal lista telefone, e-mail, endereço", modal.includes("Telefone") && modal.includes("E-mail") && modal.includes("Endereço"));
check("modal usa a ficha (shortName/name)", modal.includes("escola.shortName") && modal.includes("escola.name"));
check("rolagem: corpo com overflow-y-auto e teto de altura", modal.includes("max-h-[92dvh]") && modal.includes("overflow-y-auto"));

check("serviço schoolProfilesService existe", existsSync("src/lib/schoolProfilesService.ts"));
const perfis = readFileSync("src/lib/schoolProfilesService.ts", "utf8");
check("salvarPerfilEscola exportado", perfis.includes("export async function salvarPerfilEscola"));
// Rodada 35: o upsert (com onConflict por slug) passou a rodar no servidor;
// o serviço do navegador só chama a API.
const servidorPerfis = readFileSync("server.ts", "utf8");
check("upsert por slug",
  perfis.includes("/api/school-profiles") && servidorPerfis.includes('onConflict: "slug"'));
check("carregarEscolas exportado", perfis.includes("export async function carregarEscolas"));
check("erro de tabela ausente não quebra o app", perfis.includes("42P01"));
check("mescla não apaga dado estático", perfis.includes("mesclarPerfil") && perfis.includes("return n ? n : antigo"));
check("grava updated_by para auditoria", servidorPerfis.includes("updated_by"));

const escolaBase = ARAUCARIA_SCHOOLS[0];
const mesclado = mesclarPerfil(escolaBase, { slug: escolaBase.slug, phone: "(41) 99999-0000" });
check("mescla aplica telefone novo", mesclado.phone === "(41) 99999-0000");
check("mescla preserva o nome estático quando o campo vem vazio", mesclado.name === escolaBase.name);
check("mescla preserva listas quando vazias", mesclarPerfil(escolaBase, { slug: escolaBase.slug, modalities: [] }).modalities.length === escolaBase.modalities.length);
check("mescla troca coordenadas quando informadas", mesclarPerfil(escolaBase, { slug: escolaBase.slug, latitude: -25.5, longitude: -49.3 }).coordinates.lat === -25.5);
check("sem override devolve o próprio perfil", mesclarPerfil(escolaBase, null) === escolaBase);
check("paraEditavel traz todos os campos", Object.keys(paraEditavel(escolaBase)).length >= 20);
check("lista estática aplicada sem overrides", aplicarPerfisEditados({}).length === ARAUCARIA_SCHOOLS.length);
check("campos do formulário cobrem telefone, e-mail e endereço", CAMPOS_ESCOLA.some((c) => c.campo === "phone") && CAMPOS_ESCOLA.some((c) => c.campo === "email") && CAMPOS_ESCOLA.some((c) => c.campo === "address"));
check("três campos de lista", CAMPOS_LISTA_ESCOLA.length === 3);

check("painel importa o modal", admin.includes('import SchoolProfileModal from "./SchoolProfileModal.tsx"'));
check("painel importa carregarEscolas", admin.includes('import { carregarEscolas } from "../lib/schoolProfilesService.ts"'));
check("botão Ver perfil na ficha da conta", adminSemComentarios.includes("Ver perfil"));
check("botão Editar na ficha da conta", /handleAbrirPerfilEscola\(acc, true\)/.test(adminSemComentarios));
check("handler abre a ficha pelo slug", admin.includes("const slugDaConta"));
check("ficha resolvida pela lista mesclada", admin.includes("escolasPerfil.find((e) => e.slug === escolaPerfilSlug)"));
check("salvar recarrega a lista", admin.includes("await recarregarPerfisEscolas()"));
check("modal recebe iniciarEmEdicao", admin.includes("iniciarEmEdicao={escolaPerfilEdicao}"));

// A edição feita no painel chega ao catálogo público do aluno.
const app = readFileSync("src/App.tsx", "utf8");
check("App carrega as escolas editadas", app.includes("carregarEscolas()") && app.includes("setSchoolsList(escolas)"));
check("App passa a lista mesclada para o catálogo", app.includes("schools={schoolsList}"));
check("detalhe da escola usa a lista mesclada", app.includes("schoolsList.find((e) => e.slug === selectedSchoolSlug)"));
const catalogo = readFileSync("src/components/SchoolsCatalog.tsx", "utf8");
check("catálogo aceita lista por prop", catalogo.includes("schools = ARAUCARIA_SCHOOLS") && catalogo.includes("schools.filter("));

// Nada de overflow no html/body (regra herdada das rodadas 22/23).
const css = semComentarios(readFileSync("src/index.css", "utf8"));
// Regra herdada: nada de overflow em `html`/`body` (mata a rolagem no iOS).
// Só valem os seletores que começam na raiz — `.leaflet-control-zoom` etc. não.
const seletoresRaiz = [...css.matchAll(/(^|\n)\s*(html|body|html[^{}]*body)\s*\{([^}]*)\}/g)];
check(
  "CSS não define overflow em html/body",
  seletoresRaiz.every((m) => !/(^|[;{\s])overflow(-[xy])?\s*:/.test(m[3])),
  seletoresRaiz.filter((m) => /(^|[;{\s])overflow(-[xy])?\s*:/.test(m[3])).map((m) => m[2].trim()).join(", ")
);
check("#root usa overflow-x: clip (e não hidden)", /#root\s*\{[^}]*overflow-x:\s*clip/.test(css));

// ===========================================================================
console.log(`\n${ok} verificações OK, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("RODADA 26 OK");
