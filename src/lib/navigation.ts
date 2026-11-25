/**
 * Resolução de rotas e histórico — sem React, para poder testar.
 *
 * ## Por que a navegação era frágil
 *
 * Três coisas se misturavam no `App.tsx`:
 *  1. ler a tela inicial a partir da URL;
 *  2. reagir ao botão "voltar" do navegador/celular (`popstate`);
 *  3. decidir o destino quando a URL não corresponde a nada.
 *
 * Em produção (GitHub Pages) o app é publicado em `/Tcc_main-do-main/`, então
 * `location.pathname` vem com o prefixo do repositório. Comparar
 * `path === "/admin"` nunca casava e o app caía em "welcome"/"feed" — daí a
 * sensação de "voltar para o início sozinho".
 *
 * Aqui essas regras ficam em funções puras, testáveis e usadas nos dois
 * lugares (boot e popstate), para não divergirem com o tempo.
 */

/** Telas que o app conhece. */
export const TELAS_CONHECIDAS = [
  "splash", "welcome", "login", "register", "recovery", "codeSent",
  "feed", "schools", "schoolDetail", "eventDetail", "calendar", "map",
  "settings", "admin", "contact", "schoolPortal",
] as const;

export type Tela = (typeof TELAS_CONHECIDAS)[number];

/** Telas de entrada: onde não faz sentido "voltar" (não há o que desempilhar). */
export const TELAS_DE_ENTRADA = ["splash", "welcome", "login", "register", "recovery", "codeSent"];

/** URL → tela. */
const ROTAS: Record<string, string> = {
  "/escolas": "schools",
  "/map": "map",
  "/mapa": "map",
  "/calendar": "calendar",
  "/calendario": "calendar",
  "/feed": "feed",
  "/eventos": "feed",
  "/login": "login",
  "/settings": "settings",
  "/configuracoes": "settings",
  "/admin": "admin",
  "/contato": "contact",
  "/contact": "contact",
  "/portal": "schoolPortal",
};

/** Rota canônica de cada tela (o inverso do mapa acima). */
export const ROTAS_POR_TELA: Record<string, string> = {
  welcome: "/",
  login: "/login",
  register: "/register",
  recovery: "/recovery",
  feed: "/feed",
  schools: "/escolas",
  calendar: "/calendar",
  map: "/map",
  settings: "/settings",
  admin: "/admin",
  contact: "/contato",
  schoolPortal: "/portal",
};

/**
 * Remove o prefixo de publicação (`/Tcc_main-do-main`) do caminho.
 *
 * Aceita também base relativa vinda de `import.meta.env.BASE_URL`.
 */
export function removerBase(pathname: string, base: string): string {
  const path = (pathname || "/").toLowerCase();
  const prefixo = (base || "/").toLowerCase();

  if (prefixo.length > 1 && path.startsWith(prefixo)) {
    const semBase = path.slice(prefixo.length - 1); // mantém a barra inicial
    return semBase === "" ? "/" : semBase;
  }

  return path;
}

/** Traduz um caminho já sem base para a tela correspondente. */
export function telaDoCaminho(caminhoSemBase: string): string | null {
  const caminho = (caminhoSemBase || "/").toLowerCase();

  if (caminho.startsWith("/escolas/") && caminho.length > 9) return "schoolDetail";
  if (ROTAS[caminho]) return ROTAS[caminho];
  if (caminho === "/" || caminho === "") return "welcome";

  return null;
}

/**
 * Decide a tela no primeiro carregamento.
 *
 * Ordem: rota conhecida → última tela da sessão → `splash`.
 */
export function resolverTelaInicial(params: {
  pathname: string;
  base: string;
  ultimaTela: string | null;
  logado: boolean;
}): string {
  const caminho = removerBase(params.pathname, params.base);
  const daRota = telaDoCaminho(caminho);

  // Rota explícita ganha. "/" → welcome, que é o comportamento correto para
  // quem abre o endereço raiz sem intenção de ir a uma tela específica.
  //
  // Exceção: painel e configurações exigem sessão. Sem login, a URL direta
  // cairia numa tela que não tem o que mostrar (e o usuário veria um painel
  // vazio, sem entender que precisa entrar).
  if (daRota && caminho !== "/") {
    if ((daRota === "admin" || daRota === "settings") && !params.logado) return "welcome";
    return daRota;
  }

  // Última tela conhecida nesta sessão de navegação.
  const ultima = params.ultimaTela;
  if (ultima && TELAS_CONHECIDAS.includes(ultima as Tela)) {
    // Telas que dependem de contexto não são restauradas por conta própria.
    if (ultima === "schoolDetail" || ultima === "eventDetail") return "splash";
    // Painel só faz sentido para quem tem permissão.
    if (ultima === "admin" && !params.logado) return "welcome";
    if (ultima === "settings" && !params.logado) return "welcome";
    return ultima;
  }

  return "splash";
}

/**
 * Decide a tela ao receber um evento `popstate` (botão voltar do navegador ou
 * do celular).
 *
 * Esta é a parte que estava quebrada: quando o histórico não tinha `state`
 * (porque a tela foi trocada direto por `setActiveScreen`, sem passar pelo
 * `pushState`), o código antigo caía no caminho da URL e, no GitHub Pages, não
 * reconhecia nada — devolvendo o usuário ao mural. Agora existe um caminho de
 * recuperação explícito, e a última tela da sessão é usada antes de desistir.
 */
export function resolverTelaDoPopState(params: {
  state: { screen?: string } | null;
  pathname: string;
  base: string;
  ultimaTela: string | null;
  logado: boolean;
}): string {
  /** Telas que não fazem sentido sem sessão. */
  const exigeSessao = (tela: string) => tela === "admin" || tela === "settings";

  // 1. O histórico tem a tela? Confia nele: é a fonte mais precisa.
  //    Mas não devolve o usuário a uma tela restrita depois do logout.
  const doEstado = params.state?.screen;
  if (doEstado && TELAS_CONHECIDAS.includes(doEstado as Tela)) {
    if (exigeSessao(doEstado) && !params.logado) return "welcome";
    return doEstado;
  }

  // 2. Sem state: tenta a URL.
  const caminho = removerBase(params.pathname, params.base);
  const daRota = telaDoCaminho(caminho);
  if (daRota) {
    if (exigeSessao(daRota) && !params.logado) return "welcome";
    return daRota;
  }

  // 3. Sem URL reconhecível: última tela da sessão (se ainda fizer sentido).
  const ultima = params.ultimaTela;
  if (ultima && TELAS_CONHECIDAS.includes(ultima as Tela)) {
    if (exigeSessao(ultima) && !params.logado) return "welcome";
    return ultima;
  }

  // 4. Desistiu: vai para o lugar natural.
  return params.logado ? "feed" : "welcome";
}

/**
 * Destino do botão "voltar ao dashboard" na tela de introdução.
 *
 * Se o usuário veio do painel, volta para o painel. Se não se sabe de onde
 * veio, o dashboard é o destino padrão (é o que ele pediu). Sem permissão de
 * administração não existe dashboard, então vai para o mural.
 */
export function destinoDoBotaoVoltar(params: {
  telaAnterior: string | null;
  podeVerDashboard: boolean;
  logado: boolean;
}): string {
  if (params.telaAnterior && params.telaAnterior !== "welcome") {
    if (params.telaAnterior === "admin" && !params.podeVerDashboard) {
      return params.logado ? "feed" : "welcome";
    }
    return params.telaAnterior;
  }

  if (params.podeVerDashboard) return "admin";
  return params.logado ? "feed" : "welcome";
}
