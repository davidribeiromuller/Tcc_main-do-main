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
 *    API pública do DuckDuckGo (sem chave) e escolhe o primeiro resultado cujo
 *    domínio parece oficial.
 * 3. **Fallback** — se nada for encontrado, devolve `null` e a interface mostra
 *    "inscrições: consulte a escola", em vez de um link quebrado.
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
  /** Explicação para o painel administrativo. */
  observacao: string;
}

function normalizar(texto: string): string {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

  // ---- 1. Catálogo curado ----
  for (const entrada of URLS_OFICIAIS) {
    if (entrada.padrao.test(titulo)) {
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
  const termo = [titulo, opcoes.organizador, opcoes.cidade, "inscrição"]
    .filter(Boolean)
    .join(" ")
    .trim();

  const semResultado: ResultadoBuscaInscricao = {
    url: null,
    organizador: null,
    fonte: "nenhuma",
    observacao: "Nenhum site oficial encontrado automaticamente — confirme na escola.",
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

    const escolhida = candidatos.find(urlConfiavel);
    if (!escolhida) return semResultado;

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
