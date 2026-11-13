export interface SchoolNewsItem {
  id: string;
  title: string;
  description: string;
  date: string;
  author: string;
  category: "Comunicado" | "Pedagógico" | "Conquista" | "Cultural" | "Aviso";
  image?: string;
  source: string;
}

export interface SchoolEventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  category: "Feira & Ciência" | "Esporte" | "Cultura" | "Comemoração" | "Reunião";
  isFree: boolean;
  registrationUrl?: string;
  source: string;
}

export interface SchoolProfile {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  type: string;
  neighborhood: string;
  city: string;
  state: string;
  address: string;
  cep: string;
  phone: string;
  email: string;
  network: string;
  nre: string;
  modalities: string[];
  historicalOverview: string;
  pedagogicalHighlights: string[];
  infrastructure: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  image: string;
  imagePlaceholderText?: string;
  news: SchoolNewsItem[];
  events: SchoolEventItem[];
  lastVerifiedDate: string;
  verificationSource: string;
}

/**
 * Resolve o caminho de um asset da pasta `public/` respeitando o `base` do Vite.
 *
 * No GitHub Pages o app é servido em `/Tcc_main-do-main/`, portanto um caminho
 * absoluto como `/images/escolas/x.png` aponta para a raiz do domínio e resulta
 * em 404. Em desenvolvimento o base é `/`, então o comportamento não muda.
 */
export function publicAsset(path: string): string {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const base = import.meta.env?.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}${normalized}`;
}

export const SCHOOL_IMAGES: Record<string, string> = {
  "julio-szymanski": publicAsset("/images/escolas/szymanski.png"),
  "helena-wysocki": publicAsset("/images/escolas/helena-wysocki.png"),
  "maria-da-graca": publicAsset("/images/escolas/maria-da-graca.png"),
  "guajuvira": publicAsset("/images/escolas/guajuvira.png"),
  "marilze-da-luz-brand": publicAsset("/images/escolas/marilze.png"),
  "cecilia-meireles": publicAsset("/images/escolas/cecilia.png")
};

export const ARAUCARIA_SCHOOLS: SchoolProfile[] = [
  {
    id: 1,
    slug: "julio-szymanski",
    name: "Colégio Estadual Professor Júlio Szymanski",
    shortName: "C.E. Prof. Júlio Szymanski",
    type: "Colégio Estadual (Ensino Fundamental e Médio)",
    neighborhood: "Centro",
    city: "Araucária",
    state: "PR",
    address: "Rua São Vicente de Paulo, 76, Centro",
    cep: "83702-050",
    phone: "(41) 3642-4089",
    email: "aucjulio@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental II (6º ao 9º ano)",
      "Ensino Médio Regular e Itinerários Formativos",
      "Projetos de Extensão e Iniciação Científica"
    ],
    historicalOverview:
      "O Colégio Estadual Professor Júlio Szymanski é uma das mais tradicionais e centrais instituições de ensino de Araucária. Nomeado em honra ao ilustre educador e médico Dr. Júlio Szymanski, o colégio tem papel histórico na formação acadêmica, social e profissional de sucessivas gerações do município. A escola destaca-se pelo corpo docente qualificado e ampla participação da comunidade escolar nas decisões pedagógicas.",
    pedagogicalHighlights: [
      "Incentivo sistemático à participação em olimpíadas do conhecimento (OBMEP, OBA, ONBH)",
      "Feira Anual de Ciências e Mostra de Projetos Integradores do Ensino Médio",
      "Projetos de incentivo à cidadania, debates contemporâneos e grêmio estudantil ativo",
      "Orientação profissional e acompanhamento para os vestibulares do Paraná e ENEM"
    ],
    infrastructure: [
      "Salas de aula climatizadas com recursos multimídia",
      "Laboratório de Ciências da Natureza e Biologia",
      "Laboratório de Informática Educativa",
      "Biblioteca Central com acervo literário e espaço de estudos",
      "Quadra poliesportiva coberta com vestiários",
      "Pátio arborizado para convivência comunitária"
    ],
    coordinates: {
      lat: -25.5908,
      lng: -49.4068
    },
    image: publicAsset("/images/escolas/szymanski.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. Júlio Szymanski",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "SEED-PR / NRE Área Metropolitana Sul / Consulta Escolas Paraná",
    news: [
      {
        id: "js-n1",
        title: "Abertura das inscrições para a Mostra Científica e Cultural Szymanski 2026",
        description:
          "Os estudantes do Ensino Médio podem inscrever suas pesquisas integradoras até o final deste mês. Os melhores projetos serão credenciados para a etapa regional.",
        date: "02/11/2026",
        author: "Coordenação Pedagógica",
        category: "Pedagógico",
        source: "Informativo Escolar Szymanski"
      },
      {
        id: "js-n2",
        title: "Destaque dos estudantes de Araucária na etapa estadual de matemática",
        description:
          "Parabéns aos alunos e professores de matemática pelas menções honrosas conquistadas na olimpíada paranaense do conhecimento.",
        date: "28/10/2026",
        author: "Direção Escolar",
        category: "Conquista",
        source: "Mural da Direção"
      }
    ],
    events: [
      {
        id: "js-e1",
        title: "Mostra Anual de Projetos Científicos e Tecnológicos",
        description:
          "Apresentação aberta à comunidade de maquetes, protótipos de robótica e ensaios científicos desenvolvidos pelas turmas.",
        date: "14/11/2026",
        time: "08:30 às 16:30",
        location: "Ginásio e Pátio Principal • C.E. Júlio Szymanski",
        category: "Feira & Ciência",
        isFree: true,
        source: "Calendário Oficial Szymanski"
      },
      {
        id: "js-e2",
        title: "Reunião de Pais e Avaliação do 4º Bimestre",
        description:
          "Momento de integração entre educadores e responsáveis para acompanhamento do rendimento pedagógico e frequência escolar.",
        date: "21/11/2026",
        time: "09:00",
        location: "Auditório Central",
        category: "Reunião",
        isFree: true,
        source: "Secretaria Escolar"
      }
    ]
  },
  {
    id: 2,
    slug: "helena-wysocki",
    name: "Colégio Estadual Professora Helena Wysocki",
    shortName: "C.E. Helena Wysocki",
    type: "Colégio Estadual (Ensino Fundamental e Médio)",
    neighborhood: "Costeira",
    city: "Araucária",
    state: "PR",
    address: "Rua Maranhão, 2673, bairro Costeira",
    cep: "83709-810",
    phone: "(41) 3607-2899",
    email: "auchelena@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental II",
      "Ensino Médio Regular",
      "Atividades Complementares e Projetos Esportivos"
    ],
    historicalOverview:
      "O Colégio Estadual Professora Helena Wysocki atende a comunidade do bairro Costeira e regiões vizinhas em Araucária. A instituição presta homenagem à educadora Helena Wysocki, reconhecida pela dedicação ao ensino público paranaense. A escola caracteriza-se pela vibrante vida comunitária, forte incentivo à prática esportiva escolar e desenvolvimento de projetos de responsabilidade ambiental e social.",
    pedagogicalHighlights: [
      "Projetos interdisciplinares de conscientização ambiental e sustentabilidade urbana",
      "Jogos internos interclasses e participação ativa nos Jogos Escolares do Paraná",
      "Mostras culturais que integram música, teatro e literatura paranaense",
      "Plano de acolhimento estudantil e mediação de conflitos escolares"
    ],
    infrastructure: [
      "Salas de aula com iluminação natural e ventilação adequada",
      "Biblioteca escolar com computadores de pesquisa conectados à internet",
      "Laboratório multidisciplinar de informática e ciências",
      "Quadra de esportes coberta com arquibancada",
      "Refeitório escolar com alimentação balanceada do programa estadual",
      "Rampas de acessibilidade em todos os acessos térreos"
    ],
    coordinates: {
      lat: -25.5785,
      lng: -49.3975
    },
    image: publicAsset("/images/escolas/helena-wysocki.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. Helena Wysocki",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "SEED-PR / Consulta Escolas Paraná",
    news: [
      {
        id: "hw-n1",
        title: "Projeto de Sustentabilidade Escolar realiza plantio de mudas nativas",
        description:
          "Estudantes do ensino fundamental integraram a aula de ciências com práticas de preservação no entorno escolar com apoio da comunidade.",
        date: "01/11/2026",
        author: "Equipe de Ciências",
        category: "Pedagógico",
        source: "Coordenação Escolar"
      },
      {
        id: "hw-n2",
        title: "Cronograma de rematrícula e confirmação de vagas para 2027",
        description:
          "Pais e responsáveis devem conferir a documentação necessária na secretaria escolar ou pelo sistema online da SEED-PR.",
        date: "25/10/2026",
        author: "Secretaria Escolar",
        category: "Aviso",
        source: "Secretaria Geral"
      }
    ],
    events: [
      {
        id: "hw-e1",
        title: "Torneio Interclasses da Primavera",
        description:
          "Competições de futsal, voleibol e handebol entre turmas da manhã e da tarde, valorizando o espírito esportivo e respeito mútuo.",
        date: "19/11/2026",
        time: "13:30",
        location: "Quadra Poliesportiva Helena Wysocki",
        category: "Esporte",
        isFree: true,
        source: "Departamento de Educação Física"
      },
      {
        id: "hw-e2",
        title: "Sarau de Poesia e Música da Costeira",
        description:
          "Apresentações de poemas, recital literário e composições musicais organizadas pelos grêmios estudantis e turmas de língua portuguesa.",
        date: "27/11/2026",
        time: "19:00",
        location: "Pátio Coberto",
        category: "Cultura",
        isFree: true,
        source: "Comissão Cultural Helena Wysocki"
      }
    ]
  },
  {
    id: 3,
    slug: "maria-da-graca",
    name: "Colégio Estadual Professora Maria da Graça Siqueira Silva e Lima",
    shortName: "C.E. Profª Maria da Graça",
    type: "Colégio Estadual (Ensino Fundamental e Médio)",
    neighborhood: "Costeira",
    city: "Araucária",
    state: "PR",
    address: "Rua Bernardino Lemos, 326, bairro Costeira",
    cep: "83709-250",
    phone: "(41) 3642-1614",
    email: "aucmariagssilva@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental (anos finais)",
      "Ensino Médio Regular",
      "Projetos Comunitários de Cidadania"
    ],
    historicalOverview:
      "Instituído pelo Conselho Estadual de Educação do Paraná, o Colégio Estadual Professora Maria da Graça Siqueira Silva e Lima desempenha papel fundamental no acolhimento de jovens e adolescentes do bairro Costeira. A instituição prima pela gestão democrática, constante aproximação com os pais e estímulo à permanência escolar através de iniciativas de combate à evasão.",
    pedagogicalHighlights: [
      "Programa permanente de tutoria pedagógica e reforço escolar em Língua Portuguesa e Matemática",
      "Feira Cultural e Étnico-Racial valorizando a diversidade e história paranaense",
      "Ações de voluntariado e solidariedade lideradas pelos estudantes",
      "Participação em mostras artísticas municipais de Araucária"
    ],
    infrastructure: [
      "Prédio amplo com acessibilidade estruturada",
      "Biblioteca didática e infantojuvenil com acervo do PNLD",
      "Espaço maker para desenvolvimento de projetos em equipe",
      "Quadra esportiva com iluminação para turnos estendidos",
      "Refeitório e cozinha industrial padronizada",
      "Sala de professores e coordenação pedagógica integradas"
    ],
    coordinates: {
      lat: -25.5842,
      lng: -49.3921
    },
    image: publicAsset("/images/escolas/maria-da-graca.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. Maria da Graça",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "CEE-PR / Consulta Escolas Paraná / NRE Metropolitana Sul",
    news: [
      {
        id: "mg-n1",
        title: "Clube do Livro divulga autores paranaenses e bate recorde de leituras",
        description:
          "Iniciativa liderada pelos estudantes do 9º ano envolveu mais de 150 leitores no último bimestre com debates temáticos quinzenais.",
        date: "30/10/2026",
        author: "Biblioteca Escolar",
        category: "Cultural",
        source: "Boletim Informativo Maria da Graça"
      },
      {
        id: "mg-n2",
        title: "Oficina de Redação para o ENEM reúne turmas de 3º ano",
        description:
          "Atividade aos sábados com foco nas competências avaliativas e estratégias de argumentação para os exames nacionais.",
        date: "24/10/2026",
        author: "Corpo Docente",
        category: "Pedagógico",
        source: "Mural Acadêmico"
      }
    ],
    events: [
      {
        id: "mg-e1",
        title: "Mostra Cultural da Diversidade e Consciência Cidadã",
        description:
          "Exposições artísticas, danças tradicionais e painéis históricos apresentados pelas turmas do fundamental e médio.",
        date: "20/11/2026",
        time: "10:00 às 15:00",
        location: "Pátio e Salas Temáticas",
        category: "Cultura",
        isFree: true,
        source: "Comissão de Eventos Maria da Graça"
      }
    ]
  },
  {
    id: 4,
    slug: "guajuvira",
    name: "Colégio Estadual do Campo Guajuvira",
    shortName: "C.E. do Campo Guajuvira",
    type: "Colégio Estadual do Campo",
    neighborhood: "Guajuvira (Zona Rural)",
    city: "Araucária",
    state: "PR",
    address: "Rua Pedro Czanovski, 511, Guajuvira",
    cep: "83725-000",
    phone: "(41) 3647-1211",
    email: "aucguajuvira@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná — Educação do Campo",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental do Campo",
      "Ensino Médio Integrado com Práticas Sustentáveis",
      "Projetos Agroecológicos e Comunitários"
    ],
    historicalOverview:
      "O Colégio Estadual do Campo Guajuvira é a principal referência de ensino público para a comunidade rural do distrito de Guajuvira, em Araucária. A escola compartilha estrutura física com a Escola Municipal do Campo Rosa Picheth, preservando identidade administrativa estadual autônoma. Suas diretrizes pedagógicas estão fundamentadas na Educação do Campo, valorizando os saberes tradicionais, o trabalho familiar na terra e a sustentabilidade ambiental.",
    pedagogicalHighlights: [
      "Horta pedagógica agroecológica e compostagem manejada pelos estudantes",
      "Estudos sobre os ciclos da agricultura familiar de Araucária e preservação de mananciais",
      "Projetos de valorização da história e cultura dos colonizadores e comunidades tradicionais",
      "Integração direta com cooperativas agrícolas e produtores locais"
    ],
    infrastructure: [
      "Estrutura escolar em ampla área verde e contato direto com a natureza",
      "Salas de aula com ventilação arejada",
      "Área de experimentação agrícola e horta comunitária",
      "Biblioteca com títulos de ciências agrárias, literatura e história regional",
      "Espaço poliesportivo para atividades da juventude do campo",
      "Transporte escolar rural articulado com o município"
    ],
    coordinates: {
      lat: -25.6835,
      lng: -49.5212
    },
    image: publicAsset("/images/escolas/guajuvira.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. do Campo Guajuvira",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "SEED-PR / Consulta Escolas Paraná (Educação do Campo)",
    news: [
      {
        id: "gj-n1",
        title: "Colheita da horta pedagógica abastece merenda escolar com alimentos frescos",
        description:
          "Hortaliças e legumes cultivados pelos alunos sem agrotóxicos enriqueceram as refeições diárias e renderam oficinas sobre alimentação saudável.",
        date: "29/10/2026",
        author: "Comitê de Agroecologia",
        category: "Conquista",
        source: "Comunidade Guajuvira"
      },
      {
        id: "gj-n2",
        title: "Oficina de preservação de nascentes reúne moradores e estudantes",
        description:
          "Parceria entre a escola e extensionistas rurais capacitou jovens para o monitoramento de fontes d'água na bacia do Guajuvira.",
        date: "22/10/2026",
        author: "Coordenação de Meio Ambiente",
        category: "Pedagógico",
        source: "Informativo Rural"
      }
    ],
    events: [
      {
        id: "gj-e1",
        title: "Feira de Troca de Sementes e Tradições do Campo",
        description:
          "Evento tradicional da localidade de Guajuvira com exposição de produtos artesanais, sementes crioulas e apresentações culturais.",
        date: "28/11/2026",
        time: "09:00 às 16:00",
        location: "Área de Convivência Externa • Guajuvira",
        category: "Comemoração",
        isFree: true,
        source: "Associação Comunitária e C.E. Guajuvira"
      }
    ]
  },
  {
    id: 5,
    slug: "marilze-da-luz-brand",
    name: "Colégio Estadual Professora Marilze da Luz Brand",
    shortName: "C.E. Profª Marilze da Luz Brand",
    type: "Colégio Estadual (Ensino Fundamental e Médio)",
    neighborhood: "Iguaçu",
    city: "Araucária",
    state: "PR",
    address: "Rua Barigui, 120, bairro Iguaçu",
    cep: "83701-530",
    phone: "(41) 3643-8134",
    email: "aucmarilzeluzbrand@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental II",
      "Ensino Médio Regular",
      "Clubes de Leitura e Tecnologia Educacional"
    ],
    historicalOverview:
      "Localizado no bairro Iguaçu, o Colégio Estadual Professora Marilze da Luz Brand atende a uma comunidade urbana dinâmica em constante crescimento. A instituição homenageia a educadora Marilze da Luz Brand, cuja trajetória foi marcada pelo compromisso com o desenvolvimento humano e pedagógico. A escola possui projetos consolidados na área de robótica, incentivo à leitura e inclusão de alunos com necessidades educacionais especiais.",
    pedagogicalHighlights: [
      "Clube de Robótica e Programação com participação em competições regionais",
      "Sala de Recursos Multifuncionais com atendimento educacional especializado (AEE)",
      "Projetos de incentivo à literatura infanto-juvenil e produção textual",
      "Gincana do Conhecimento e Cidadania envolvendo toda a comunidade do bairro Iguaçu"
    ],
    infrastructure: [
      "Edificação escolar com piso tátil e banheiros acessíveis",
      "Laboratório de Informática atualizado com internet banda larga",
      "Sala de Recursos Multifuncionais (AEE)",
      "Biblioteca equipada com espaço para leitura individual e em grupo",
      "Quadra poliesportiva coberta com demarcação oficial",
      "Pátio interno coberto para recreio e assembleias estudantis"
    ],
    coordinates: {
      lat: -25.5971,
      lng: -49.3874
    },
    image: publicAsset("/images/escolas/marilze.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. Marilze da Luz Brand",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "SEED-PR / NRE Metropolitana Sul / Consulta Escolas",
    news: [
      {
        id: "mb-n1",
        title: "Equipe de Robótica conquista classificação para o torneio metropolitano",
        description:
          "Com um robô seguidor de linha e desafio de resgate, os estudantes do 1º ano do Ensino Médio avançaram para a etapa final.",
        date: "03/11/2026",
        author: "Laboratório Maker",
        category: "Conquista",
        source: "Informativo Tecnológico Brand"
      },
      {
        id: "mb-n2",
        title: "Semana da Convivência Pacífica e Prevenção ao Bullying",
        description:
          "Oficinas de escuta ativa, dinâmicas de grupo e palestras com psicólogos convidados marcaram as atividades no colégio.",
        date: "27/10/2026",
        author: "Equipe Pedagógica",
        category: "Pedagógico",
        source: "Mural da Orientação"
      }
    ],
    events: [
      {
        id: "mb-e1",
        title: "Festival de Arte, Dança e Música dos Estudantes",
        description:
          "Apresentações teatrais, coreografias e números musicais criados e encenados pelas turmas do fundamental e médio.",
        date: "25/11/2026",
        time: "14:00",
        location: "Ginásio do C.E. Marilze da Luz Brand",
        category: "Cultura",
        isFree: true,
        source: "Coordenação Cultural Brand"
      }
    ]
  },
  {
    id: 6,
    slug: "cecilia-meireles",
    name: "Colégio Estadual Cecília Meireles",
    shortName: "C.E. Cecília Meireles",
    type: "Colégio Estadual (Ensino Fundamental e Médio)",
    neighborhood: "Cachoeira",
    city: "Araucária",
    state: "PR",
    address: "Rua Gumercindo Rosa Pimenta, 76, bairro Cachoeira",
    cep: "83708-550",
    phone: "(41) 3642-2347",
    email: "aucceciliameireles@seed.pr.gov.br",
    network: "Rede Estadual de Ensino do Paraná",
    nre: "NRE Área Metropolitana Sul",
    modalities: [
      "Ensino Fundamental (6º ao 9º ano)",
      "Ensino Médio Regular e Itinerários Formativos",
      "Projetos de Línguas e Comunicação"
    ],
    historicalOverview:
      "O Colégio Estadual Cecília Meireles é uma instituição de grande relevância comunitária instalada no bairro Cachoeira, em Araucária. Carrega no nome a homenagem à poetisa, cronista e educadora Cecília Meireles, pioneira na defesa da escola pública de qualidade no Brasil. A instituição tem como marca histórica a atuante Associação de Pais, Mestres e Funcionários (APMF), com estreita parceria no aprimoramento dos espaços escolares e no apoio às atividades pedagógicas.",
    pedagogicalHighlights: [
      "Circuito Literário Cecília Meireles: produção de poesias, crônicas e contos pelos estudantes",
      "Feira Cultural e Científica do Bairro Cachoeira",
      "Projetos de iniciação à comunicação social, jornal mural e podcasts escolares",
      "Atividades esportivas extracurriculares de handebol, futsal e atletismo"
    ],
    infrastructure: [
      "Blocos de salas de aula arejadas e bem iluminadas",
      "Biblioteca moderna com espaço 'Cantinho da Poesia'",
      "Laboratório de Informática Educativa",
      "Quadra poliesportiva coberta com vestiários estruturados",
      "Área externa com bosque preservado para atividades ao ar livre",
      "Cantina escolar com supervisão nutricional"
    ],
    coordinates: {
      lat: -25.5714,
      lng: -49.4215
    },
    image: publicAsset("/images/escolas/cecilia.png"),
    imagePlaceholderText: "Fotografia Institucional • C.E. Cecília Meireles",
    lastVerifiedDate: "Novembro de 2026",
    verificationSource: "SEED-PR / Câmara Municipal de Araucária (Registro APMF) / NRE Sul",
    news: [
      {
        id: "cm-n1",
        title: "Edição 2026 do Varal de Poesias encanta visitantes no bairro Cachoeira",
        description:
          "Mais de 200 poesias autorais foram penduradas no pátio e na calçada da escola, presenteando a comunidade com versos inspiradores.",
        date: "01/11/2026",
        author: "Departamento de Letras",
        category: "Cultural",
        source: "Jornal Escolar Cecília Meireles"
      },
      {
        id: "cm-n2",
        title: "Assembleia Geral da APMF delibera melhorias na biblioteca e quadra",
        description:
          "Famílias e educadores aprovaram a aquisição de novos títulos literários e manutenção do piso da quadra poliesportiva.",
        date: "26/10/2026",
        author: "Diretoria APMF",
        category: "Comunicado",
        source: "Atas da APMF"
      }
    ],
    events: [
      {
        id: "cm-e1",
        title: "Caminhada da Primavera e Feira da Saúde Comunitária",
        description:
          "Concentração no colégio para caminhada ecológica pelas ruas do bairro Cachoeira, com aferição de pressão e orientações nutricionais.",
        date: "22/11/2026",
        time: "08:00 às 12:00",
        location: "Ponto de Partida: Portão Principal do C.E. Cecília Meireles",
        category: "Comemoração",
        isFree: true,
        source: "APMF e Grêmio Estudantil"
      }
    ]
  }
];

export function getSchoolBySlug(slug: string): SchoolProfile | undefined {
  if (!slug) return undefined;
  const cleanSlug = slug.toLowerCase().trim();
  return ARAUCARIA_SCHOOLS.find(
    (s) => s.slug === cleanSlug || s.slug.replace(/-/g, "") === cleanSlug.replace(/-/g, "")
  );
}

export function getSchoolById(id: number): SchoolProfile | undefined {
  return ARAUCARIA_SCHOOLS.find((s) => s.id === id);
}

export function addSchoolNews(slug: string, news: Omit<SchoolNewsItem, "id">): SchoolNewsItem {
  const school = getSchoolBySlug(slug);
  if (!school) {
    throw new Error("Escola não encontrada.");
  }
  const newItem: SchoolNewsItem = {
    ...news,
    id: `dyn-n-${Date.now()}`
  };
  school.news.unshift(newItem);
  return newItem;
}

export function addSchoolEvent(slug: string, event: Omit<SchoolEventItem, "id">): SchoolEventItem {
  const school = getSchoolBySlug(slug);
  if (!school) {
    throw new Error("Escola não encontrada.");
  }
  const newItem: SchoolEventItem = {
    ...event,
    id: `dyn-e-${Date.now()}`
  };
  school.events.unshift(newItem);
  return newItem;
}
