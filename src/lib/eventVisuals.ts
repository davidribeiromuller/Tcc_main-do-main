/**
 * Identidade visual dos eventos.
 *
 * ## O problema que isto resolve
 *
 * Todos os eventos sem foto cadastrada caíam na **mesma** imagem genérica
 * (uma plateia escura). Na prática, o mural virava uma fileira de cards
 * idênticos — impossível diferenciar um vestibular de uma olimpíada de
 * astronomia à primeira vista, e a imagem escura ainda brigava com o verde
 * claro do portal.
 *
 * ## A solução
 *
 * Em vez de uma foto genérica, cada evento ganha:
 *  - **ícone** da área (matemática, robótica, biologia, cultura, esporte...)
 *  - **cores** próprias, escolhidas por área de conhecimento
 *  - um **gradiente** suave no topo do card
 *
 * Isso dá identidade a cada card, é leve (nenhuma requisição a mais), funciona
 * offline e respeita o modo escuro. A foto de verdade continua sendo usada
 * quando o evento tem uma — o ícone só entra no lugar do placeholder.
 */

import {
  Calculator,
  FlaskConical,
  Atom,
  Cpu,
  Dna,
  BookOpen,
  Palette,
  Trophy,
  Drama,
  GraduationCap,
  Music,
  Languages,
  Leaf,
  type LucideIcon,
} from "lucide-react";

export type AreaConhecimento =
  | "matematica"
  | "quimica"
  | "fisica"
  | "tecnologia"
  | "biologia"
  | "linguagens"
  | "cultura"
  | "esporte"
  | "vestibular"
  | "meioambiente"
  | "musica"
  | "geral";

export interface VisualEvento {
  area: AreaConhecimento;
  Icone: LucideIcon;
  /** Classe de gradiente para o cabeçalho do card (claro e escuro). */
  gradiente: string;
  /** Cor de destaque (texto/borda) em hexadecimal, para estilos pontuais. */
  cor: string;
  /** Rótulo curto da área, exibido como etiqueta. */
  rotulo: string;
}

/**
 * Paleta por área.
 *
 * Tons sóbrios, que conversam com o verde do portal: nada de cor saturada
 * competindo com o conteúdo. Cada uma tem versão clara e escura.
 */
const VISUAIS: Record<AreaConhecimento, VisualEvento> = {
  matematica: {
    area: "matematica",
    Icone: Calculator,
    gradiente: "from-indigo-500 via-indigo-600 to-violet-700",
    cor: "#4f46e5",
    rotulo: "Matemática",
  },
  quimica: {
    area: "quimica",
    Icone: FlaskConical,
    gradiente: "from-fuchsia-500 via-fuchsia-600 to-pink-700",
    cor: "#c026d3",
    rotulo: "Química",
  },
  fisica: {
    area: "fisica",
    Icone: Atom,
    gradiente: "from-sky-500 via-sky-600 to-blue-700",
    cor: "#0284c7",
    rotulo: "Física",
  },
  tecnologia: {
    area: "tecnologia",
    Icone: Cpu,
    gradiente: "from-cyan-500 via-teal-600 to-emerald-700",
    cor: "#0d9488",
    rotulo: "Tecnologia",
  },
  biologia: {
    area: "biologia",
    Icone: Dna,
    gradiente: "from-emerald-500 via-green-600 to-teal-700",
    cor: "#059669",
    rotulo: "Biologia",
  },
  linguagens: {
    area: "linguagens",
    Icone: BookOpen,
    gradiente: "from-amber-500 via-orange-600 to-rose-700",
    cor: "#d97706",
    rotulo: "Linguagens",
  },
  cultura: {
    area: "cultura",
    Icone: Palette,
    gradiente: "from-rose-500 via-pink-600 to-fuchsia-700",
    cor: "#e11d48",
    rotulo: "Cultura",
  },
  esporte: {
    area: "esporte",
    Icone: Trophy,
    gradiente: "from-orange-500 via-amber-600 to-yellow-600",
    cor: "#ea580c",
    rotulo: "Esporte",
  },
  vestibular: {
    area: "vestibular",
    Icone: GraduationCap,
    gradiente: "from-violet-600 via-purple-700 to-indigo-800",
    cor: "#7c3aed",
    rotulo: "Vestibular",
  },
  meioambiente: {
    area: "meioambiente",
    Icone: Leaf,
    gradiente: "from-lime-500 via-green-600 to-emerald-700",
    cor: "#65a30d",
    rotulo: "Meio ambiente",
  },
  musica: {
    area: "musica",
    Icone: Music,
    gradiente: "from-purple-500 via-violet-600 to-indigo-700",
    cor: "#9333ea",
    rotulo: "Música",
  },
  geral: {
    area: "geral",
    Icone: Drama,
    gradiente: "from-slate-500 via-slate-600 to-slate-700",
    cor: "#475569",
    rotulo: "Evento",
  },
};

/**
 * URLs de imagem que são, na prática, "sem imagem".
 *
 * O banco grava uma foto de plateia como padrão quando o evento não tem arte.
 * Tratamos essas URLs como ausência, para o card mostrar o ícone da área em vez
 * da mesma foto repetida em todos os cards.
 */
const PLACEHOLDERS = [
  "photo-1540575467063-178a50c2df87", // plateia genérica (padrão antigo do banco)
];

/** `true` se a URL é um placeholder genérico ou está vazia. */
export function imagemEhPlaceholder(url?: string | null): boolean {
  if (!url || !url.trim()) return true;
  return PLACEHOLDERS.some((p) => url.includes(p));
}

/** Palavras-chave por área, já sem acento e em minúsculas. */
const PALAVRAS: Array<{ area: AreaConhecimento; termos: string[] }> = [
  { area: "matematica", termos: ["matematica", "obmep", "calculo", "algebra", "geometria"] },
  { area: "quimica", termos: ["quimica", "obq", "laboratorio de quimica"] },
  { area: "fisica", termos: ["fisica", "obf", "astronomia", "oba", "foguete", "mobfog"] },
  { area: "tecnologia", termos: ["robotica", "informatica", "obi", "programacao", "tecnologia", "computacao", "maker"] },
  { area: "biologia", termos: ["biologia", "obb", "saude", "anatomia", "ciencias biologicas"] },
  /*
    Cuidado: "UFPR"/"UTFPR" só entram junto de termos de seleção. Sozinhos,
    fariam "Feira de Profissões da UTFPR" virar Vestibular — e o card ganharia
    a cor errada.
  */
  {
    area: "vestibular",
    termos: [
      "vestibular",
      "processo seletivo",
      "enem",
      "sisu",
      "prova de conhecimentos",
      "vestibular ufpr",
      "vestibular utfpr",
    ],
  },
  { area: "esporte", termos: ["esporte", "esportivo", "jogo", "jeps", "torneio", "futebol", "volei", "atletismo", "interclasse", "olimpiada escolar"] },
  { area: "musica", termos: ["musica", "musical", "coral", "banda", "sarau"] },
  { area: "cultura", termos: ["cultura", "teatro", "arte", "festival", "mostra cultural", "danca", "literatura", "feira de livro"] },
  { area: "linguagens", termos: ["linguagem", "portugues", "redacao", "historia", "onhb", "geografia", "filosofia"] },
  { area: "meioambiente", termos: ["meio ambiente", "sustentabilidade", "ecologia", "reciclagem", "horta"] },
];

function normalizar(texto: string): string {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Descobre a área do evento pelo título, categoria e descrição.
 *
 * A ordem importa: tecnologia vem antes de esporte para "Olimpíada de
 * Robótica" não virar esporte só por causa da palavra "olimpíada".
 */
export function detectarArea(evento: {
  title?: string | null;
  category?: string | null;
  description?: string | null;
}): AreaConhecimento {
  const titulo = normalizar(evento.title || "");
  const categoria = normalizar(evento.category || "");
  const descricao = normalizar(evento.description?.slice(0, 160) || "");

  if (!titulo && !categoria && !descricao) return "geral";

  /**
   * A categoria declarada pelo autor do evento é a pista mais confiável —
   * mais até que o título, porque títulos costumam ser genéricos
   * ("Inscrições abertas"). Por isso ela é testada primeiro.
   */
  const casar = (texto: string) => {
    if (!texto) return null;
    for (const { area, termos } of PALAVRAS) {
      if (termos.some((t) => texto.includes(t))) return area;
    }
    return null;
  };

  return casar(categoria) ?? casar(titulo) ?? casar(descricao) ?? "geral";
}

/** Visual completo (ícone, cores e rótulo) para um evento. */
export function visualDoEvento(evento: {
  title?: string | null;
  category?: string | null;
  description?: string | null;
}): VisualEvento {
  return VISUAIS[detectarArea(evento)];
}
