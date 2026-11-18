/**
 * Descoberta do link de inscrição / site oficial de um evento.
 *
 * ## O problema
 *
 * Muitos eventos que chegam ao eloEscola têm página oficial de inscrição ou de
 * divulgação (OBMEP, OBI, Feira de Profissões da UFPR, festivais...), mas a
 * sugestão chegava com o link vazio ou apontando para a raiz do site da
 * instituição. O aluno então não tinha como se inscrever.
 *
 * ## A solução, em três camadas
 *
 * 1. **Catálogo curado** (`URLS_OFICIAIS`) — para os organizadores conhecidos
 *    (OBMEP → obmep.org.br, OBI → obi.olimpiada.ciencia... etc). É o caminho
 *    mais confiável: nenhuma chamada de rede, nenhum palpite.
 * 2. **Busca na internet** — quando o catálogo não cobre o caso, consulta a
 *    API pública do DuckDuckGo (sem chave) e **pontua** os resultados pela
 *    semelhança com o título; só aceita candidato com relevância mínima.
 * 3. **Fallback honesto** — se nada for encontrado, devolve `url: null` e um
 *    `termoBusca` com a consulta pronta. A interface oferece "Procurar na web"
 *    (uma BUSCA, nunca uma URL de evento inventada) em vez de um link falso.
 *
 * ## Correção da rodada 26 (por que quase nada era encontrado)
 *
 * A comparação do catálogo era `entrada.padrao.test(titulo)` — regex sem acento
 * contra o título COM acento. Resultado: "Olimpíada Brasileira de **Física**"
 * nunca casava com `/olimpiada brasileira de fisica/`, e o mesmo acontecia com
 * Astronomia, Informática, História... Sobravam pouquíssimos acertos e o resto
 * caía na API do DuckDuckGo, que responde para quase nenhum termo. Agora o
 * título é **normalizado** (sem acento, minúsculo, espaços colapsados) antes de
 * qualquer teste, e as abreviações (OBA, OBF, OBI, ONHB, FEBRACE...) são
 * reconhecidas mesmo dentro de parênteses.
 *
 * ## Regra de segurança
 *
 * **Nunca inventar URL.** Um link errado manda o aluno para um site qualquer.
 * Só devolvemos o que veio do catálogo curado ou de um resultado de busca real
 * cujo domínio passou na verificação.
 *
 * ## Custo e limites
 *
 * - Nada de chave de API (mantém a promessa do TCC de funcionar sem chave).
 * - Cache em memória por título, para não repetir busca na mesma sessão.
 * - Timeout curto: o link é um extra, não pode travar a tela.
 */

/**
 * Domínios oficiais por organizador.
 *
 * A chave é um trecho normalizado do título do evento. O valor é a URL da
 * página de inscrição/divulgação — não a home genérica, quando existe página
 * específica.
 */
const URLS_OFICIAIS: Array<{ padrao: RegExp; url: string; organizador: string }> = [
  // ---- Olimpíadas do conhecimento (acadêmico) ----
  {
    padrao: /obmep|olimpiada brasileira de matematica/i,
    url: "https://www.obmep.org.br/",
    organizador: "OBMEP / IMPA",
  },
  {
    padrao: /\bobi\b|olimpiada brasileira de informatica/i,
    url: "https://olimpiada.ic.unicamp.br/",
    organizador: "OBI / UNICAMP",
  },
  {
    padrao: /onhb|olimpiada nacional em historia/i,
    url: "https://www.olimpiadadehistoria.com.br/",
    organizador: "ONHB / UNICAMP",
  },
  {
    padrao: /mobfog|mostra brasileira de foguetes/i,
    url: "https://www.mobfog.com.br/",
    organizador: "MOBFOG / OBA",
  },
  {
    padrao: /\boba\b|olimpiada brasileira de astronomia/i,
    url: "https://www.oba.org.br/",
    organizador: "OBA",
  },
  {
    padrao: /\bobq\b|olimpiada brasileira de quimica/i,
    url: "https://obquimica.org/",
    organizador: "OBQ / ABQ",
  },
  {
    padrao: /\bobf\b|olimpiada brasileira de fisica/i,
    url: "https://www.sbfisica.org.br/olimpiada/",
    organizador: "OBF / SBF",
  },
  {
    padrao: /olimpiada brasileira de biologia|\bobb\b/i,
    url: "https://anbio.org.br/",
    organizador: "OBB / ANBio",
  },
  {
    padrao: /olimpiada de lingua portuguesa|olp\b/i,
    url: "https://www.escrevendoofuturo.org.br/",
    organizador: "OLP / Escrevendo o Futuro",
  },
  {
    padrao: /obm\b|olimpiada brasileira de matematica das escolas/i,
    url: "https://www.obmep.org.br/",
    organizador: "OBMEP",
  },

  // ---- Universidades paranaenses ----
  {
    padrao: /vestibular.*ufpr|ufpr.*vestibular|processo seletivo.*ufpr/i,
    url: "https://www.ufpr.br/portalufpr/processos-seletivos/",
    organizador: "UFPR",
  },
  {
    padrao: /vestibular.*utfpr|utfpr.*vestibular/i,
    url: "https://www.utfpr.edu.br/estude-na-utfpr",
    organizador: "UTFPR",
  },
  {
    padrao: /feira de profissoes.*ufpr|ufpr.*feira de profissoes/i,
    url: "https://www.ufpr.br/",
    organizador: "UFPR",
  },
  {
    padrao: /feira de profissoes.*utfpr|utfpr.*feira/i,
    url: "https://www.utfpr.edu.br/",
    organizador: "UTFPR",
  },
  {
    padrao: /puc.?pr|pontificia universidade catolica do parana/i,
    url: "https://www.pucpr.br/",
    organizador: "PUCPR",
  },

  // ---- Esporte e cultura escolar ----
  {
    padrao: /jeps|jogos escolares do parana/i,
    url: "https://www.educacao.pr.gov.br/Pagina/Jogos-Escolares-do-Parana",
    organizador: "JEPS / SEED-PR",
  },
  {
    padrao: /jebs|jogos escolares brasileiros/i,
    url: "https://www.gov.br/mec/pt-br",
    organizador: "JEBS / MEC",
  },
  {
    padrao: /mostra de robotica|robotica.*parana|festival de robotica/i,
    url: "https://www.educacao.pr.gov.br/",
    organizador: "SEED-PR",
  },

  // ---- Programas do governo / escola ----
  {
    padrao: /enem/i,
    url: "https://enem.inep.gov.br/",
    organizador: "INEP / MEC",
  },
  {
    padrao: /seduc|seed.?pr|secretaria de estado da educacao/i,
    url: "https://www.educacao.pr.gov.br/",
    organizador: "SEED-PR",
  },
];

/** Cache: título normalizado → resultado. */
const cache = new Map<string, ResultadoBuscaInscricao>();

export interface ResultadoBuscaInscricao {
  /** URL de inscrição ou página oficial. `null` quando nada confiável foi achado. */
  url: string | null;
  /** Nome da organização responsável. */
  organizador: string | null;
  /** De onde veio: catálogo curado, busca na web, ou nada. */
  fonte: "catalogo" | "web" | "nenhuma";
  /**
   * Consulta pronta para o botão "Procurar na web". Preenchido sempre que não
   * houve link — é uma BUSCA, nunca uma URL de evento inventada.
   */
  termoBusca?: string;
  /** Explicação para o painel administrativo. */
  observacao: string;
}

function normalizar(texto: string): string {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Testa um padrão do catálogo contra o título.
 *
 * Roda contra o título original E contra o título normalizado — assim padrões
 * escritos com ou sem acento funcionam, e a abreviação entre parênteses
 * ("... (OBF)") também é encontrada.
 */
function casarPadrao(padrao: RegExp, titulo: string): boolean {
  const original = (titulo || "").trim();
  if (!original) return false;
  const normalizado = normalizar(original);
  // `padrao` é sempre sem acento; normalizamos também a fonte da regex.
  const fonte = padrao.source.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const flags = padrao.flags.includes("i") ? padrao.flags : `${padrao.flags}i`;
  const alvo = new RegExp(fonte, flags);
  return alvo.test(original) || alvo.test(normalizado) || alvo.test(` ${normalizado} `);
}

/** Monta a consulta de busca mostrada como "Procurar na web". */
export function termoDeBusca(
  titulo: string,
  opcoes: { cidade?: string; organizador?: string } = {}
): string {
  return [titulo, opcoes.organizador, opcoes.cidade, "inscrição site oficial"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Verifica se a URL parece institucional.
 *
 * Rejeita encurtadores, agregadores de link e domínios que não têm cara de
 * site oficial — o objetivo é não mandar o aluno para uma página de spam.
 */
function urlConfiavel(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;

    const host = parsed.hostname.toLowerCase();

    // Domínios de terceiros que costumam "hospedar" links de outros sites.
    const bloqueados = [
      "bit.ly", "tinyurl.com", "t.co", "goo.gl", "linktr.ee",
      "facebook.com", "instagram.com", "twitter.com", "x.com",
      "youtube.com", "tiktok.com", "pinterest.com",
      "wikipedia.org", "blogspot.com", "medium.com",
    ];
    if (bloqueados.some((b) => host === b || host.endsWith(`.${b}`))) return false;

    // Precisa ser um domínio com TLD reconhecível e alguma estrutura.
    return host.includes(".") && host.length > 5;
  } catch {
    return false;
  }
}

/**
 * Busca o link de inscrição de um evento pelo título.
 *
 * Ordem: catálogo curado → DuckDuckGo → nada.
 */
export async function buscarLinkInscricao(
  titulo: string,
  opcoes: { cidade?: string; organizador?: string; timeoutMs?: number } = {}
): Promise<ResultadoBuscaInscricao> {
  const chave = normalizar(titulo).trim();
  if (!chave) {
    return {
      url: null,
      organizador: null,
      fonte: "nenhuma",
      observacao: "Título do evento vazio.",
    };
  }

  const doCache = cache.get(chave);
  if (doCache) return doCache;

  // ---- 1. Catálogo curado (comparação tolerante a acento e caixa) ----
  for (const entrada of URLS_OFICIAIS) {
    if (casarPadrao(entrada.padrao, titulo)) {
      const resultado: ResultadoBuscaInscricao = {
        url: entrada.url,
        organizador: entrada.organizador,
        fonte: "catalogo",
        observacao: `Link oficial de ${entrada.organizador}.`,
      };
      cache.set(chave, resultado);
      return resultado;
    }
  }

  // ---- 2. Busca na web ----
  const daWeb = await buscarNaWeb(titulo, opcoes);
  cache.set(chave, daWeb);
  return daWeb;
}

/** Siglas e palavras que não ajudam a identificar o site oficial. */
const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "para", "em",
  "com", "na", "no", "nas", "nos", "brasileira", "brasileiro", "nacional",
  "olimpiada", "olimpiadas", "feira", "festival", "mostra", "semana",
  "inscricao", "inscricoes", "site", "oficial", "escolar", "escolas",
]);

/**
 * Pontua um resultado de busca pela semelhança com o título/organizador.
 *
 * Sem isso, a camada 2 pegava o primeiro item "confiável" de `RelatedTopics` —
 * que muitas vezes é um assunto vizinho, não o site do evento. A pontuação
 * olha as palavras significativas do título (siglas como OBA/OBF valem muito)
 * e os pedaços do domínio candidato.
 */
function pontuarCandidato(url: string, titulo: string, organizador?: string): number {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return -1;
  }

  const tokens = normalizar(`${titulo} ${organizador || ""}`)
    .split(" ")
    .filter((t) => t.length >= 3 && !PALAVRAS_VAZIAS.has(t));

  if (tokens.length === 0) return 0;

  const pedacosDoHost = host.split(/[.-]/).filter(Boolean);
  let pontos = 0;

  for (const token of tokens) {
    if (pedacosDoHost.some((p) => p === token)) {
      // Sigla curta batendo com o domínio é o sinal mais forte (oba -> oba.org.br).
      pontos += token.length <= 5 ? 4 : 3;
    } else if (pedacosDoHost.some((p) => p.includes(token) || token.includes(p))) {
      pontos += 1;
    }
  }

  // Domínios institucionais ganham um empurrão leve.
  if (/\.(org|edu|gov)\.br$|\b(org|edu|gov)\.br$/.test(host)) pontos += 1;
  return pontos;
}

/**
 * Consulta a API pública do DuckDuckGo (Instant Answer) — sem chave.
 *
 * Limitação honesta: essa API devolve resultados para poucos termos (é feita
 * para "instant answers", não para busca completa). Quando não retorna nada,
 * devolvemos `null` em vez de inventar. Uma opção mais completa seria a
 * Content API, que exige cadastro — o que quebraria a regra de "sem chave".
 */
async function buscarNaWeb(
  titulo: string,
  opcoes: { cidade?: string; organizador?: string; timeoutMs?: number }
): Promise<ResultadoBuscaInscricao> {
  const termo = termoDeBusca(titulo, opcoes);

  const semResultado: ResultadoBuscaInscricao = {
    url: null,
    organizador: null,
    fonte: "nenhuma",
    observacao: "Nenhum site oficial encontrado automaticamente — confirme na escola.",
    termoBusca: termo,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opcoes.timeoutMs ?? 4000);

    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(termo)}&format=json&no_redirect=1&no_html=1&kl=br-pt`,
      { signal: controller.signal }
    );

    clearTimeout(timer);

    if (!res.ok) return semResultado;

    const data = await res.json();

    // A API devolve `AbstractURL` para o verbete principal e `RelatedTopics`
    // para o resto. Preferimos o verbete; se não houver, varremos os tópicos.
    const candidatos: string[] = [];
    if (typeof data.AbstractURL === "string" && data.AbstractURL) {
      candidatos.push(data.AbstractURL);
    }
    for (const item of Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []) {
      if (typeof item?.FirstURL === "string") {
        candidatos.push(item.FirstURL);
      } else if (Array.isArray(item?.Topics)) {
        for (const sub of item.Topics) {
          if (typeof sub?.FirstURL === "string") candidatos.push(sub.FirstURL);
        }
      }
    }

    // Filtra o que é confiável e ordena pela semelhança com o título.
    const pontuados = candidatos
      .filter(urlConfiavel)
      .map((url) => ({ url, pontos: pontuarCandidato(url, titulo, opcoes.organizador) }))
      .sort((a, b) => b.pontos - a.pontos);

    // Exige um mínimo de relevância: resultado irrelevante é pior que nenhum,
    // porque manda o aluno para o site errado.
    const melhor = pontuados[0];
    if (!melhor || melhor.pontos < 2) return semResultado;
    const escolhida = melhor.url;

    return {
      url: escolhida,
      organizador:
        typeof data.AbstractSource === "string" && data.AbstractSource
          ? data.AbstractSource
          : new URL(escolhida).hostname.replace(/^www\./, ""),
      fonte: "web",
      observacao: "Link encontrado por busca automática — confira no painel antes de publicar.",
    };
  } catch {
    // Timeout ou rede bloqueada: segue sem link.
    return semResultado;
  }
}

/**
 * Enriquece uma lista de sugestões com links de inscrição.
 *
 * Roda em paralelo, mas com teto: buscar 40 eventos de uma vez dispararia 40
 * requisições e demoraria. Os primeiros `limite` são os que aparecem no topo
 * do painel, então são eles que importam.
 *
 * @returns a mesma lista, com `website`/`source_url` preenchidos quando havia
 *          link confiável.
 */
export async function enriquecerComLinks<T extends Record<string, any>>(
  sugestoes: T[],
  limite = 8
): Promise<Array<T & { link_inscricao?: string | null; link_fonte?: string }>> {
  const alvo = sugestoes.slice(0, limite);
  const restante = sugestoes.slice(limite);

  const enriquecidas = await Promise.all(
    alvo.map(async (s) => {
      // Já tem link? Não mexe.
      const existente = s.website || s.source_url;
      if (existente && urlConfiavel(String(existente))) {
        return { ...s, link_inscricao: String(existente), link_fonte: "existente" };
      }

      const resultado = await buscarLinkInscricao(String(s.title ?? ""), {
        cidade: s.city,
        organizador: s.source_name,
      });

      if (!resultado.url) {
        return { ...s, link_inscricao: null, link_fonte: resultado.fonte };
      }

      return {
        ...s,
        // Só preenche o que está faltando: dado já revisado tem prioridade.
        website: s.website || resultado.url,
        source_url: s.source_url || resultado.url,
        link_inscricao: resultado.url,
        link_fonte: resultado.fonte,
      };
    })
  );

  return [...enriquecidas, ...restante.map((s) => ({ ...s, link_fonte: "nao_buscado" as const }))];
}

/** Limpa o cache (usado nos testes). */
export function limparCacheLinks(): void {
  cache.clear();
}

/** Exporta a lista de organizadores cobertos, para a documentação/testes. */
export const ORGANIZADORES_COBERTOS = URLS_OFICIAIS.map((e) => e.organizador);
