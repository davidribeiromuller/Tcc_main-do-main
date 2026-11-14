// GERADO AUTOMATICAMENTE — não editar à mão.
//
// Cópia standalone da memória de rejeição para uso dentro da Edge Function
// (Deno), que não pode importar arquivos de `src/`.
//
// Fonte de verdade: src/lib/rejectionMemory.ts
// Para atualizar: npm run sync:rejection-memory

/**
 * Memória de rejeição — o "não" do administrador tem validade permanente.
 *
 * ## O problema que este módulo resolve
 *
 * O admin rejeitava uma sugestão, clicava em "buscar eventos" e o mesmo evento
 * voltava. A comparação existente (`mesmoEvento`) usa similaridade de palavras
 * (Jaccard) com limiar 0,6, o que funciona quando as duas descrições são
 * parecidas — mas a IA **reescreve o título a cada chamada**. Medido com dados
 * reais deste banco:
 *
 * | já decidido                                    | sugestão nova                          | Jaccard |
 * |------------------------------------------------|----------------------------------------|---------|
 * | Feira de Profissões da PUCPR                   | Feira de Cursos e Profissões da UFPR   | 0,25    |
 * | Mostra de Inovação e Tecnologia de Araucária   | Mostra de Ciência e Tecnologia UTFPR   | 0,33    |
 * | JEPS — Jogos Escolares do Paraná               | Jogos Escolares do Paraná (Fase Mun.)  | 0,50    |
 * | Feira de Ciências e Tecnologia da UTFPR        | Mostra de Ciência e Tecnologia UTFPR   | 0,33    |
 *
 * Todas ficam abaixo do limiar, então passam como "novas". O problema não é o
 * limiar: baixá-lo faria eventos legitimamente diferentes colidirem.
 *
 * ## A ideia
 *
 * Em vez de comparar strings, extraímos o **tópico** do evento — o sujeito que
 * define o que ele é — e lembramos disso. `Feira`/`Mostra` são ruído de
 * vocabulário (sinônimos), assim como `Inovação`/`Ciência`/`Tecnologia` quando
 * aparecem juntos. Se o tópico já foi rejeitado, o evento nunca volta, com
 * qualquer título que a IA invente.
 *
 * Isso é conservador de propósito: no app escolar, repetir um evento rejeitado
 * é pior do que ocultar uma variação legítima do mesmo assunto.
 */

/**
 * Palavras que NÃO identificam o evento.
 *
 * Inclui conectivos, o vocabulário genérico de "tipo de evento" (feira, mostra,
 * olimpíada...) e os qualificadores que a IA troca livremente sem mudar o
 * assunto (nacional, brasileira, municipal, edição).
 *
 * Atenção: `feira`/`mostra`/`olimpiada` ficam aqui, mas o **assunto** que vem
 * depois delas é preservado — é ele que identifica o evento.
 */
const PALAVRAS_NEUTRAS = new Set([
  // conectivos e artigos
  "de", "da", "do", "das", "dos", "e", "em", "a", "o", "as", "os", "para",
  "com", "no", "na", "nos", "nas", "por", "ao", "aos", "sobre", "the", "of",
  // tipo de evento (o assunto é o que importa)
  "feira", "mostra", "olimpiada", "olimpiadas", "jogos", "jogo", "festival",
  "semana", "dia", "encontro", "evento", "edicao", "edition", "fase", "etapa",
  "prova", "exame", "torneio", "campeonato", "copa",
  // qualificadores trocáveis
  "nacional", "brasileira", "brasileiro", "municipal", "estadual", "regional",
  "internacional", "aberta", "aberto", "publica", "publico", "oficial",
  "primeira", "segunda", "terceira", "1a", "2a", "3a", "1o", "2o", "3o",
  // anos
  "2025", "2026", "2027", "2028", "2029", "2030", "2031",
  // lugar: a cidade já é comparada à parte, e aparece em quase todo título
  "curitiba", "araucaria", "parana", "pr", "brasil",
  // "escola/escolar" é genérico num app escolar — bloquearia tudo
  "escola", "estudantil", "estudantes", "alunos", "ginasio",
]);

/**
 * Sinônimos normalizados para a mesma ideia.
 *
 * Sem isso, "Feira de Ciências" e "Mostra de Tecnologia" seriam eventos
 * distintos, embora a IA use os dois para o mesmo acontecimento. Medido nos
 * dados reais: a IA chamou o mesmo evento de UTFPR de "Mostra de Ciência e
 * Tecnologia", "Feira de Ciências e Tecnologia" e "Mostra de Inovação e
 * Tecnologia" em três execuções seguidas.
 */
const SINONIMOS: Record<string, string> = {
  ciencias: "ciencia",
  cientifica: "ciencia",
  cientifico: "ciencia",
  cientistas: "ciencia",
  inovacao: "ciencia",
  tecnologico: "tecnologia",
  tech: "tecnologia",
  profissoes: "profissao",
  profissional: "profissao",
  profissionalizante: "profissao",
  carreiras: "profissao",
  carreira: "profissao",
  vocacional: "profissao",
  colegio: "escola",
  colégio: "escola",
  universidade: "universitario",
  universitaria: "universitario",
  universitario: "universitario",
  faculdade: "universitario",
  matematica: "matematica",
  mat: "matematica",
  quimica: "quimica",
  fisica: "fisica",
  historia: "historia",
  geografia: "geografia",
  portugues: "lingua",
  literatura: "lingua",
  idiomas: "lingua",
  ingles: "lingua",
  espanhol: "lingua",
  robotica: "robotica",
  programacao: "computacao",
  informatica: "computacao",
  computacao: "computacao",
  software: "computacao",
  astronomia: "astronomia",
  foguetes: "foguete",
  foguete: "foguete",
  aeroespacial: "foguete",
  esportes: "esporte",
  esportivo: "esporte",
  esportiva: "esporte",
  atletismo: "esporte",
  cultura: "cultural",
  culturais: "cultural",
  artistico: "cultural",
  artistica: "cultural",
  arte: "cultural",
  artes: "cultural",
  musica: "musical",
  musical: "musical",
  teatro: "teatro",
  danca: "danca",
};

/**
 * Normaliza um texto em lista de tokens.
 *
 * Mantém números colados quando fazem parte do nome (OBMEP, OBI, ONHB, UFPR,
 * PUCPR) e descarta pontuação.
 */
function tokenizar(texto: string): string[] {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Extrai os tópicos identificadores de um título.
 *
 * Exemplos reais:
 * - "Feira de Profissões da PUCPR"        → ["pucpr", "profissao"]
 * - "OBMEP 2027 - Primeira Fase"          → ["obmep"]
 * - "Mostra de Ciência e Tecnologia UTFPR"→ ["utfpr", "ciencia", "tecnologia"]
 * - "JEPS — Jogos Escolares do Paraná"    → ["jeps"]
 *
 * Siglas (≥3 letras, todas maiúsculas no original) são preservadas porque são
 * exatamente o nome do evento. Como `tokenizar` já perdeu o caixa, detectamos a
 * sigla no texto original antes de normalizar.
 */
export function extrairTopicos(titulo: string): string[] {
  const brutos = (titulo || "").match(/\b[A-Z]{3,}\b/g) ?? [];
  const siglas = brutos.map((s) => s.toLowerCase());

  const topicos = new Set<string>(siglas);

  for (const token of tokenizar(titulo)) {
    const canonico = SINONIMOS[token] ?? token;
    if (PALAVRAS_NEUTRAS.has(canonico)) continue;
    if (PALAVRAS_NEUTRAS.has(token)) continue;
    if (canonico.length < 3) continue;
    // Token é só um ano ou número solto.
    if (/^\d+$/.test(canonico)) continue;
    topicos.add(canonico);
  }

  return [...topicos];
}

/**
 * Dois eventos são o mesmo assunto quando compartilham tópicos suficientes.
 *
 * Regra: interseção não vazia **e** sobreposição ≥ 50% do menor conjunto.
 * O limiar é relativo porque títulos têm tamanhos muito diferentes — "OBMEP"
 * tem 1 tópico e "OBMEP 2027 - Prova da Primeira Fase" tem 1 também, mas
 * "Feira de Ciência e Tecnologia da UTFPR" tem 3.
 */
/**
 * Nomes de instituição/organização.
 *
 * São tópicos legítimos, mas NÃO identificam o evento: a UFPR pode ter um
 * vestibular, uma feira de cursos e uma mostra de ciências — três eventos
 * distintos. Se a instituição sozinha bastasse para bloquear, rejeitar um
 * evento esconderia tudo o que a mesma instituição promove.
 */
const INSTITUICOES = new Set([
  "ufpr", "utfpr", "pucpr", "uepg", "ufsc", "ifpr", "unespar", "unicuritiba",
  "unibrasil", "positivo", "up", "utfpr", "unb", "usp", "unicamp", "ufrj",
  "senai", "sesi", "senac", "sebrae", "sistema", "fiep", "sesc", "sebrae",
  "mackenzie", "fae", "esic", "opet", "bomjesus", "expo",
]);

/**
 * Quanto do menor conjunto de tópicos precisa coincidir.
 *
 * 0,6 e não 0,5 por um caso concreto: "Vestibular UFPR — 1ª Fase" tem
 * {vestibular, ufpr} e "Feira de Cursos e Profissões da UFPR" tem
 * {cursos, profissoes, ufpr}. A interseção é só `ufpr` — a instituição, não o
 * evento. Com 0,5 (1 de 2) os dois colidiam e uma feira de cursos legítima era
 * escondida porque um vestibular da mesma universidade havia sido rejeitado.
 * Com 0,6, 1-de-2 não passa, mas 2-de-2 (mesmo assunto, vocabulário trocado)
 * passa.
 */
const LIMIAR_SOBREPOSICAO = 0.6;

export function mesmoAssunto(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  let comuns = 0;
  for (const t of a) if (setB.has(t)) comuns++;
  if (comuns === 0) return false;
  const menor = Math.min(a.length, b.length);
  return comuns / menor >= LIMIAR_SOBREPOSICAO;
}

/**
 * Constrói o conjunto de tópicos que não devem voltar.
 *
 * @param titulosDecididos títulos já rejeitados, aprovados ou pendentes
 */
export function buildRejectionMemory(titulosDecididos: string[]): {
  topicosProibidos: Set<string>;
  topicosPorTitulo: Map<string, string[]>;
} {
  const topicosProibidos = new Set<string>();
  const topicosPorTitulo = new Map<string, string[]>();

  for (const titulo of titulosDecididos) {
    const topicos = extrairTopicos(titulo);
    topicosPorTitulo.set(titulo, topicos);
    for (const t of topicos) topicosProibidos.add(t);
  }

  return { topicosProibidos, topicosPorTitulo };
}

/**
 * Verifica se um candidato colide com a memória.
 *
 * Combina duas checagens: tópico exato já proibido (rápido) e mesmo assunto por
 * sobreposição (pega casos em que um tópico novo aparece junto dos antigos).
 */
export function colideComMemoria(
  titulo: string,
  memoria: { topicosProibidos: Set<string>; topicosPorTitulo: Map<string, string[]> }
): boolean {
  const topicos = extrairTopicos(titulo);

  /**
   * Não basta compartilhar UM tópico — e a instituição sozinha não conta.
   *
   * A versão anterior liberava o bloqueio assim que qualquer tópico aparecesse
   * no conjunto proibido. Como o nome da instituição (UFPR, UTFPR, PUCPR) é um
   * tópico, rejeitar um evento deixava a instituição inteira bloqueada: a
   * "Feira de Cursos da UFPR" desaparecia porque um "Vestibular UFPR" havia
   * sido rejeitado. Agora a colisão exige coincidência de assunto — e o assunto
   * não pode ser apenas o nome da instituição.
   */
  for (const antigos of memoria.topicosPorTitulo.values()) {
    if (!mesmoAssunto(topicos, antigos)) continue;

    const comuns = topicos.filter((t) => antigos.includes(t));
    const assuntosComuns = comuns.filter((t) => !INSTITUICOES.has(t));

    if (assuntosComuns.length > 0) return true;
  }

  return false;
}
