/**
 * Classificação de eventos por localidade, tipo e conteúdo.
 *
 * Decisões de produto (Rodada 5):
 * - A IA e o motor local buscam eventos de **Curitiba** e **Araucária**.
 * - O app separa eventos **escolares** de **não escolares**. "Não escolar" traz
 *   eventos abertos ao público das duas cidades (vestibular, feira de profissões,
 *   mostra cultural). O foco escolar fica na home.
 * - **Balada, rave, festa e show não são permitidos.** O bloqueio é feito aqui,
 *   de forma determinística: um prompt de IA não é garantia.
 */

export const CIDADES_SUPORTADAS = ["Araucária", "Curitiba"] as const;
export type CidadeSuportada = (typeof CIDADES_SUPORTADAS)[number];

/** Remove acentos e normaliza para comparação. */
function norm(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Descobre a cidade de um evento.
 *
 * Aceita cidade explícita; se não houver, tenta inferir pelo texto (local,
 * endereço, título). Retorna `null` quando não é possível afirmar — jamais
 * assume uma cidade padrão, para não gravar dado errado.
 */
export function resolveEventCity(input: {
  city?: string | null;
  location?: string | null;
  address?: string | null;
  title?: string | null;
}): CidadeSuportada | null {
  const explicita = norm(input.city);
  if (explicita.includes("curitiba")) return "Curitiba";
  if (explicita.includes("araucaria")) return "Araucária";

  const texto = norm([input.location, input.address, input.title].filter(Boolean).join(" "));
  if (!texto) return null;

  // Araucária primeiro: "Araucária" nunca aparece em endereço de Curitiba,
  // mas muitos endereços de Araucária citam Curitiba na região metropolitana.
  if (texto.includes("araucaria")) return "Araucária";
  if (texto.includes("curitiba")) return "Curitiba";
  return null;
}

/**
 * Marcadores de evento escolar. Se qualquer um aparecer no texto, o evento é
 * tratado como escolar — a menos que haja marcação explícita em contrário.
 */
const MARCADORES_ESCOLAR = [
  "escolar",
  "escola",
  "colegio",
  "colégio",
  "estudante",
  "aluno",
  "olimpiada",
  "olimpíada",
  "obmep",
  "obmep",
  "mobfog",
  "onhb",
  "obi ",
  "vestibular",
  "feira de profiss",
  "feira de cursos",
  "feira de ciencia",
  "feira de ciência",
  "mostra de inovacao",
  "mostra de inovação",
  "jeps",
  "jogos escolares",
  "professor",
  "educacao",
  "educação",
  "universidade",
  "faculdade",
  "campus",
  "processo seletivo",
  "enem",
  "robotica",
  "robótica",
];

/**
 * Classifica o evento como escolar ou não escolar.
 *
 * Prioridade: categoria explícita ("Escolar"/"Acadêmico") > marcadores no texto.
 * Sem evidência, considera **não escolar** (aberto ao público), que é a leitura
 * conservadora: nada entra na vitrine escolar sem justificativa.
 */
export function classifyEventAsSchool(input: {
  isSchool?: boolean | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  schoolName?: string | null;
  location?: string | null;
}): boolean {
  if (typeof input.isSchool === "boolean") return input.isSchool;

  const categoria = norm(input.category);
  if (categoria === "escolar" || categoria === "academico" || categoria === "educacao") return true;
  if (categoria === "cultural" || categoria === "esporte" || categoria === "esportivo") return false;

  if (input.schoolName && norm(input.schoolName).length > 0) return true;

  const texto = norm(
    [input.title, input.description, input.category, input.location].filter(Boolean).join(" ")
  );
  return MARCADORES_ESCOLAR.some((m) => texto.includes(norm(m)));
}

/**
 * Termos que caracterizam conteúdo não permitido no app escolar.
 * Inclui variações no singular/plural e gírias comuns em cartazes.
 */
const TERMOS_PROIBIDOS = [
  "balada",
  "rave",
  "boate",
  "night club",
  "nightclub",
  "open bar",
  "openbar",
  "cerveja",
  "cervejada",
  "happy hour",
  "festival de musica",
  "show",
  "shows",
  "concerto",
  "turnê",
  "turne",
  "line-up",
  "lineup",
  "dj ",
  "festa",
  "festinha",
  "micareta",
  "carnaval",
  "oktoberfest",
  "pegação",
  "pegacao",
  "bebida",
  "alcool",
  "álcool",
  "drinks",
  "lual",
  "sarau reggae",
];

/**
 * Exceções: expressões legítimas que contêm um termo proibido por substring.
 * Ex.: "Festa Junina" e "Mostra de Dança" são eventos escolares clássicos.
 */
const EXCECOES_PERMITIDAS = [
  "festa junina",
  "festa julina",
  "festa da familia",
  "festa da família",
  "festa junina escolar",
  "festival de danca",
  "festival de dança",
  "festival estudantil",
  "festival de talentos",
  "festival de cinema",
  "festival de teatro",
  "mostra de danca",
  "mostra de dança",
  "show de talentos",
  "show de ciencias",
  "show de ciências",
  "feira de ciencias",
  "feira de ciências",
];

export interface ResultadoConteudo {
  proibido: boolean;
  termo?: string;
  motivo?: string;
}

/**
 * Verifica se o evento é balada, rave, festa ou show — conteúdo não permitido.
 *
 * A checagem roda sobre título, descrição, categoria e requisitos, porque é
 * nesses campos que a IA descreve o evento.
 */
export function detectForbiddenContent(input: {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  requirements?: string | null;
}): ResultadoConteudo {
  const texto = norm(
    [input.title, input.description, input.category, input.requirements]
      .filter(Boolean)
      .join(" ")
  );
  if (!texto) return { proibido: false };

  // Duas exceções podem coexistir no mesmo título: "Festa Junina + Show de Talentos".
  let base = texto;
  for (const excecao of EXCECOES_PERMITIDAS) {
    base = base.split(norm(excecao)).join(" ");
  }

  for (const termo of TERMOS_PROIBIDOS) {
    const alvo = norm(termo);
    // "show"/"festa" exigem limite de palavra para não casar em "showcase".
    const padrao = new RegExp(`(^|[^a-z])${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    if (padrao.test(base)) {
      return {
        proibido: true,
        termo: termo.trim(),
        motivo: `Conteúdo não permitido em app escolar: "${termo.trim()}".`,
      };
    }
  }

  return { proibido: false };
}

/** Formata a cidade para exibição, com fallback honesto. */
export function formatEventCity(city: string | null | undefined): string {
  const resolvida = resolveEventCity({ city });
  return resolvida || "Local não informado";
}
