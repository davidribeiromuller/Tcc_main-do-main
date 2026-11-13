import { SchoolProfile, SchoolNewsItem } from "./schoolsData.ts";

/**
 * Persistência de comunicados escolares.
 *
 * Por que existe: o GitHub Pages publica apenas arquivos estáticos, portanto
 * não há backend Express disponível em produção. Sem esta camada, publicar um
 * comunicado batia em `/api/...`, recebia o `index.html` (HTTP 200 com
 * `text/html`) e o `res.json()` estourava com "Unexpected token '<'".
 *
 * Estratégia (em ordem):
 *  1. Se o Supabase estiver configurado, usa a tabela `events` como fonte
 *     durável? Não — comunicados não são eventos. Mantemos a fonte única em
 *     `localStorage` para não alterar o schema do banco nesta correção.
 *  2. Caso contrário, persiste em `localStorage`, exatamente como o app já faz
 *     para eventos e usuários no modo de contingência.
 *
 * A leitura sempre mescla o que veio do servidor (quando disponível) com o
 * que está no armazenamento local, sem duplicar por id.
 */

const STORAGE_KEY = "eloescola_school_news";

export interface StoredSchoolNews extends SchoolNewsItem {
  slug: string;
  createdAt: string;
}

function readAll(): StoredSchoolNews[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: StoredSchoolNews[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn("[schoolNewsStore] Não foi possível gravar comunicados localmente:", err);
  }
}

/** Comunicados salvos para uma escola, do mais recente para o mais antigo. */
export function listStoredNews(slug: string): StoredSchoolNews[] {
  return readAll()
    .filter((n) => n.slug === slug)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Mescla os comunicados do servidor com os locais, sem duplicar por id. */
export function mergeNews(
  slug: string,
  serverNews: SchoolNewsItem[] | undefined | null
): SchoolNewsItem[] {
  const local = listStoredNews(slug);
  const base = Array.isArray(serverNews) ? serverNews : [];
  const seen = new Set(base.map((n, i) => String(n.id ?? `idx-${i}`)));
  const extra = local.filter((n) => !seen.has(String(n.id)));
  return [...extra, ...base];
}

/**
 * Salva um comunicado e devolve o registro criado, no formato usado pela UI.
 */
export function saveNews(
  slug: string,
  payload: {
    title: string;
    description: string;
    category: SchoolNewsItem["category"];
    author: string;
  }
): StoredSchoolNews {
  const now = new Date();
  const item: StoredSchoolNews = {
    id: `local-news-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    slug,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    author: payload.author,
    date: now.toLocaleDateString("pt-BR"),
    source: "Portal da Escola",
    createdAt: now.toISOString(),
  };

  const all = readAll();
  all.push(item);
  writeAll(all);
  return item;
}

/**
 * Aplica os comunicados locais sobre uma lista de escolas, para que a página
 * pública da escola já mostre o que foi publicado no modo estático.
 */
export function withStoredNews(schools: SchoolProfile[]): SchoolProfile[] {
  return schools.map((school) => ({
    ...school,
    news: mergeNews(school.slug, school.news),
  }));
}
