/**
 * Base de conhecimento do motor local de eventos.
 *
 * Cada entrada descreve um evento ESCOLAR que se repete todo ano e cuja data
 * pode ser calculada a partir de uma regra conhecida.
 *
 * IMPORTANTE — honestidade sobre precisão:
 * O motor NÃO acessa a internet. Ele calcula datas a partir de padrões anuais.
 * Uma data calculada é uma ESTIMATIVA. Sempre que houver dúvida, a entrada
 * vem marcada com `estimated: true` e o admin deve confirmar na fonte oficial
 * antes de publicar.
 */

export type EventCategory =
  | "Olimpíada"
  | "Feira de Profissões"
  | "Vestibular"
  | "Cultural"
  | "Esportivo"
  | "Tecnologia";

export type DateRule =
  /** Dia fixo de um mês fixo. Ex.: 15 de junho. */
  | { kind: "fixed"; month: number; day: number; time?: string }
  /**
   * Uma ou mais janelas de meses. Usado quando a data exata varia a cada ano.
   * Escolhe o primeiro dia do primeiro mês da janela como referência.
   */
  | { kind: "window"; months: number[]; day?: number; time?: string };

export interface LocalEventTemplate {
  id: string;
  title: string;
  category: EventCategory;
  description: string;
  /** Cidade de referência para o filtro do app. */
  city: "Araucária" | "Curitiba";
  location: string;
  /** Página oficial usada pelo admin para conferir a data. */
  sourceName: string;
  sourceUrl: string;
  rule: DateRule;
  /**
   * Confiança-base (0–1). Datas `fixed` recorrentes recebem valor maior,
   * janelas recebem valor menor. Nunca acima de MAX_LOCAL_CONFIDENCE.
   */
  confidence: number;
  /**
   * true = a data é estimativa (janela de meses ou regra sujeita a mudança).
   * A interface exibe "Data estimada — confirme na fonte oficial".
   */
  estimated: boolean;
  requirements?: string;
  isPaid?: boolean;
  price?: string;
  website?: string;
}

/**
 * Teto de confiança do motor local. Fica abaixo do que a IA normalmente
 * atribui a uma data oficialmente divulgada, porque aqui a data é CALCULADA.
 */
export const MAX_LOCAL_CONFIDENCE = 0.55;

/**
 * Catálogo de eventos recorrentes.
 *
 * Escopo amplo: acadêmico (olimpíadas, feiras, vestibulares) + cultural e
 * esportivo escolar.
 */
export const LOCAL_EVENT_TEMPLATES: LocalEventTemplate[] = [
  // ───────────────────────── Olimpíadas ─────────────────────────
  {
    id: "obmep-fase1",
    title: "OBMEP — 1ª Fase (Olimpíada Brasileira de Matemática)",
    category: "Olimpíada",
    description:
      "Primeira fase da Olimpíada Brasileira de Matemática das Escolas Públicas, aplicada nas próprias escolas. Prova objetiva de 20 questões para estudantes do 6º ano do Fundamental ao Ensino Médio.",
    city: "Araucária",
    location: "Escolas participantes de Araucária",
    sourceName: "Site oficial da OBMEP",
    sourceUrl: "https://www.obmep.org.br/",
    rule: { kind: "window", months: [5, 6], day: 15, time: "08:00" },
    confidence: 0.5,
    estimated: true,
    requirements: "Estudantes do 6º ano do Fundamental ao 3º ano do Ensino Médio",
    isPaid: false,
  },
  {
    id: "obmep-fase2",
    title: "OBMEP — 2ª Fase",
    category: "Olimpíada",
    description:
      "Segunda fase da OBMEP, com prova discursiva de 6 questões aplicada nos centros de aplicação definidos pela organização.",
    city: "Curitiba",
    location: "Centros de aplicação definidos pela OBMEP",
    sourceName: "Site oficial da OBMEP",
    sourceUrl: "https://www.obmep.org.br/",
    rule: { kind: "window", months: [8, 9], day: 20, time: "14:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Classificados na 1ª fase",
    isPaid: false,
  },
  {
    id: "obi-fase1",
    title: "OBI — Olimpíada Brasileira de Informática (1ª Fase)",
    category: "Tecnologia",
    description:
      "Primeira fase da Olimpíada Brasileira de Informática, com provas de raciocínio computacional e programação. Realizada nas escolas inscritas.",
    city: "Araucária",
    location: "Escolas inscritas de Araucária",
    sourceName: "Site oficial da OBI",
    sourceUrl: "https://olimpiada.ic.unicamp.br/",
    rule: { kind: "window", months: [4, 5], day: 10, time: "14:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Estudantes do Fundamental II e Ensino Médio",
    isPaid: false,
  },
  {
    id: "onhb",
    title: "ONHB — Olimpíada Nacional em História do Brasil",
    category: "Olimpíada",
    description:
      "Olimpíada Nacional em História do Brasil, organizada pela Unicamp. Fases online em equipe ao longo do primeiro semestre, com prova final presencial.",
    city: "Curitiba",
    location: "Participação online + fase final presencial",
    sourceName: "Site oficial da ONHB",
    sourceUrl: "https://www.olimpiadadehistoria.com.br/",
    rule: { kind: "window", months: [3, 4], day: 5, time: "08:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Equipes de estudantes com professor orientador",
    isPaid: false,
  },
  {
    id: "mobfog",
    title: "MOBFOG — Mostra Brasileira de Foguetes",
    category: "Olimpíada",
    description:
      "Mostra Brasileira de Foguetes, com lançamentos feitos pelas equipes escolares. A escola organiza a etapa interna e envia os resultados.",
    city: "Araucária",
    location: "Escolas participantes de Araucária",
    sourceName: "Site oficial da MOBFOG",
    sourceUrl: "https://www.mobfog.com.br/",
    rule: { kind: "window", months: [4, 5], day: 12, time: "09:00" },
    confidence: 0.42,
    estimated: true,
    requirements: "Equipes de até 3 estudantes do Fundamental II e Médio",
    isPaid: false,
  },
  {
    id: "obq",
    title: "OBQ — Olimpíada Brasileira de Química",
    category: "Olimpíada",
    description:
      "Olimpíada Brasileira de Química, com fase inicial aplicada nas escolas e fases seguintes em centros regionais.",
    city: "Curitiba",
    location: "Escolas e centros regionais do Paraná",
    sourceName: "Site oficial da OBQ",
    sourceUrl: "https://obquimica.org/",
    rule: { kind: "window", months: [5, 6], day: 22, time: "14:00" },
    confidence: 0.42,
    estimated: true,
    requirements: "Estudantes do Ensino Médio",
    isPaid: false,
  },

  // ─────────────────────── Feiras e vestibulares ───────────────────────
  {
    id: "feira-cursos-ufpr",
    title: "Feira de Cursos e Profissões da UFPR",
    category: "Feira de Profissões",
    description:
      "Feira anual da Universidade Federal do Paraná que apresenta os cursos de graduação, com estandes, laboratórios abertos e conversa com alunos e professores.",
    city: "Curitiba",
    location: "Campus da UFPR — Jardim Botânico",
    sourceName: "Site oficial da UFPR",
    sourceUrl: "https://www.ufpr.br/portalufpr/",
    rule: { kind: "window", months: [7, 8], day: 20, time: "09:00" },
    confidence: 0.5,
    estimated: true,
    requirements: "Estudantes do Ensino Médio e comunidade",
    isPaid: false,
  },
  {
    id: "feira-cursos-utfpr",
    title: "Feira de Cursos da UTFPR",
    category: "Feira de Profissões",
    description:
      "Evento da Universidade Tecnológica Federal do Paraná com apresentação dos cursos de engenharia, tecnologia e licenciaturas, além de visitas aos laboratórios.",
    city: "Curitiba",
    location: "Campus Curitiba da UTFPR",
    sourceName: "Site oficial da UTFPR",
    sourceUrl: "https://www.utfpr.edu.br/",
    rule: { kind: "window", months: [8, 9], day: 15, time: "09:00" },
    confidence: 0.45,
    estimated: true,
    requirements: "Estudantes do Ensino Médio",
    isPaid: false,
  },
  {
    id: "vestibular-ufpr",
    title: "Vestibular UFPR — 1ª Fase",
    category: "Vestibular",
    description:
      "Primeira fase do processo seletivo da Universidade Federal do Paraná, com prova objetiva aplicada em Curitiba e no interior do estado.",
    city: "Curitiba",
    location: "Locais de prova definidos pela UFPR",
    sourceName: "Site oficial do vestibular UFPR",
    sourceUrl: "https://www.nc.ufpr.br/",
    rule: { kind: "window", months: [10, 11], day: 20, time: "13:30" },
    confidence: 0.45,
    estimated: true,
    requirements: "Inscritos no vestibular",
    isPaid: true,
    price: "Taxa de inscrição no site oficial",
  },

  // ─────────────────────────── Cultural ───────────────────────────
  {
    id: "mostra-cultural-escolar",
    title: "Mostra Cultural Escolar",
    category: "Cultural",
    description:
      "Mostra de trabalhos culturais das escolas municipais, com apresentações de teatro, música, dança e exposição de artes visuais produzidas pelos estudantes.",
    city: "Araucária",
    location: "Espaços culturais e escolas de Araucária",
    sourceName: "Calendário escolar municipal",
    sourceUrl: "https://www.araucaria.pr.gov.br/",
    rule: { kind: "window", months: [9, 10], day: 10, time: "19:00" },
    confidence: 0.35,
    estimated: true,
    requirements: "Comunidade escolar e familiares",
    isPaid: false,
  },
  {
    id: "festival-teatro-estudantil",
    title: "Festival de Teatro Estudantil",
    category: "Cultural",
    description:
      "Festival com peças produzidas por grupos teatrais de escolas do Paraná, incluindo oficinas e rodas de conversa com os estudantes.",
    city: "Curitiba",
    location: "Teatros e centros culturais de Curitiba",
    sourceName: "Agenda cultural do Paraná",
    sourceUrl: "https://www.cultura.pr.gov.br/",
    rule: { kind: "window", months: [8, 9], day: 25, time: "19:30" },
    confidence: 0.3,
    estimated: true,
    requirements: "Grupos teatrais escolares inscritos",
    isPaid: false,
  },

  // ─────────────────────────── Esportivo ───────────────────────────
  {
    id: "jeps",
    title: "JEPS — Jogos Escolares do Paraná",
    category: "Esportivo",
    description:
      "Jogos Escolares do Paraná, principal competição esportiva estudantil do estado, com fases municipais, regionais e finais em diversas modalidades.",
    city: "Araucária",
    location: "Ginásios e praças esportivas de Araucária",
    sourceName: "Site oficial dos JEPS",
    sourceUrl: "https://www.esportes.pr.gov.br/",
    rule: { kind: "window", months: [3, 4, 5], day: 20, time: "08:00" },
    confidence: 0.4,
    estimated: true,
    requirements: "Atletas estudantes das escolas inscritas",
    isPaid: false,
  },
  {
    id: "jogos-internos",
    title: "Jogos Internos da Escola",
    category: "Esportivo",
    description:
      "Competição esportiva interna entre turmas, com modalidades coletivas e individuais. Data definida pela coordenação de educação física de cada escola.",
    city: "Araucária",
    location: "Quadras e ginásio da escola",
    sourceName: "Calendário escolar interno",
    sourceUrl: "https://www.araucaria.pr.gov.br/",
    rule: { kind: "window", months: [8, 9], day: 5, time: "08:00" },
    confidence: 0.3,
    estimated: true,
    requirements: "Turmas da própria escola",
    isPaid: false,
  },
];
