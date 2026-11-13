/**
 * Motor local de descoberta de eventos — funciona SEM chave de IA.
 *
 * Ele percorre o catálogo de eventos recorrentes (`localEventCatalog.ts`) e
 * calcula a próxima ocorrência de cada um a partir da regra de data, gerando
 * candidatos no mesmo formato usado pela IA.
 *
 * O que ele faz: cobre o calendário previsível (olimpíadas, feiras,
 * vestibulares, eventos culturais e esportivos recorrentes).
 * O que ele NÃO faz: descobrir eventos inéditos. Para isso existe a IA.
 *
 * Toda data calculada é uma ESTIMATIVA. A confiança fica limitada a
 * `MAX_LOCAL_CONFIDENCE` e as entradas marcadas como `estimated` aparecem
 * na interface com aviso para confirmar na fonte oficial.
 */

import {
  LOCAL_EVENT_TEMPLATES,
  MAX_LOCAL_CONFIDENCE,
  type LocalEventTemplate,
} from "./localEventCatalog.ts";

/** Candidato gerado pelo motor, no mesmo formato aceito por `event_suggestions`. */
export interface LocalCandidate {
  title: string;
  description: string;
  location: string;
  address: string | null;
  city: "Araucária" | "Curitiba";
  category: string;
  school_name: string | null;
  day: number;
  month: number;
  year: number;
  time: string;
  is_paid: boolean;
  price: string | null;
  requirements: string | null;
  website: string | null;
  source_name: string;
  source_url: string;
  ai_confidence: number;
  ai_reasoning: string;
  fingerprint: string;
  status: "pending";
  /** Campos extras gravados na tabela (colunas da migration 0006). */
  origin: "local_engine";
  is_estimated: boolean;
}

/** Normaliza texto para comparação (sem acento, sem pontuação). */
function normalize(value: string): string {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Mesma regra usada pela Edge Function, para deduplicar entre as fontes. */
export function buildFingerprint(input: {
  title: string;
  day: number;
  month: number;
  year: number;
  city?: string | null;
}): string {
  return `${normalize(input.title)}|${input.year}-${input.month}-${input.day}|${normalize(
    input.city || ""
  )}`;
}

/** Retorna o último dia válido do mês (evita 31/04 virar 01/05). */
function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, new Date(year, month + 1, 0).getDate());
}

/**
 * Calcula a próxima ocorrência futura de um template.
 *
 * Estratégia: tenta o ano atual; se a data já passou (com folga de 1 dia),
 * tenta o ano seguinte. Isso resolve a virada de ano — em dezembro, a OBMEP
 * de junho é projetada para o ano que vem.
 */
export function computeNextOccurrence(
  template: LocalEventTemplate,
  referenceDate: Date = new Date()
): { day: number; month: number; year: number; time: string } | null {
  const anoAtual = referenceDate.getFullYear();
  const { rule } = template;

  // Margem de 1 dia: não sugerir evento que está acontecendo/terminando hoje.
  const limite = new Date(referenceDate.getTime());
  limite.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= 2; offset++) {
    const year = anoAtual + offset;

    if (rule.kind === "fixed") {
      const day = clampDay(year, rule.month, rule.day);
      const data = new Date(year, rule.month, day);
      if (data.getTime() > limite.getTime()) {
        return { day, month: rule.month, year, time: rule.time ?? "08:00" };
      }
    } else {
      // Janela de meses: usa o primeiro mês da janela como referência.
      const meses = [...rule.months].sort((a, b) => a - b);
      for (const month of meses) {
        const day = clampDay(year, month, rule.day ?? 15);
        const data = new Date(year, month, day);
        if (data.getTime() > limite.getTime()) {
          return { day, month, year, time: rule.time ?? "08:00" };
        }
      }
    }
  }

  return null;
}

/** Texto da justificativa exibida ao admin. */
function buildReasoning(template: LocalEventTemplate, data: {
  day: number;
  month: number;
  year: number;
}): string {
  const MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];

  const janela =
    template.rule.kind === "window"
      ? template.rule.months.map((m) => MESES[m]).join(" a ")
      : MESES[template.rule.month];

  if (template.estimated) {
    return (
      `Evento recorrente com realização prevista em ${janela}. ` +
      `Data estimada pelo motor local — confirme no site oficial antes de publicar.`
    );
  }

  return `Evento recorrente com data prevista em ${data.day} de ${MESES[data.month]}. Confirme na fonte oficial.`;
}

/**
 * Gera os candidatos do motor local.
 *
 * @param options.referenceDate data de referência (para testes)
 * @param options.cities       filtra cidades; vazio = todas
 * @param options.limit        máximo de sugestões
 */
export function runLocalEventEngine(options?: {
  referenceDate?: Date;
  cities?: Array<"Araucária" | "Curitiba">;
  limit?: number;
}): LocalCandidate[] {
  const referenceDate = options?.referenceDate ?? new Date();
  const cities = options?.cities ?? [];
  const limit = options?.limit ?? 10;

  const candidatos: LocalCandidate[] = [];

  for (const template of LOCAL_EVENT_TEMPLATES) {
    if (cities.length > 0 && !cities.includes(template.city)) continue;

    const ocorrencia = computeNextOccurrence(template, referenceDate);
    if (!ocorrencia) continue;

    // Confiança nunca ultrapassa o teto do motor local.
    const confianca = Math.min(template.confidence, MAX_LOCAL_CONFIDENCE);

    candidatos.push({
      title: template.title,
      description: template.description,
      location: template.location,
      address: null,
      city: template.city,
      category: template.category,
      school_name: null,
      day: ocorrencia.day,
      month: ocorrencia.month,
      year: ocorrencia.year,
      time: ocorrencia.time,
      is_paid: Boolean(template.isPaid),
      price: template.price ?? null,
      requirements: template.requirements ?? null,
      website: template.website ?? template.sourceUrl,
      source_name: template.sourceName,
      source_url: template.sourceUrl,
      ai_confidence: confianca,
      ai_reasoning: buildReasoning(template, ocorrencia),
      fingerprint: buildFingerprint({
        title: template.title,
        day: ocorrencia.day,
        month: ocorrencia.month,
        year: ocorrencia.year,
        city: template.city,
      }),
      status: "pending",
      origin: "local_engine",
      is_estimated: template.estimated,
    });
  }

  // Ordena por data (mais próximos primeiro) e respeita o limite.
  candidatos.sort((a, b) => {
    const da = new Date(a.year, a.month, a.day).getTime();
    const db = new Date(b.year, b.month, b.day).getTime();
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title, "pt-BR");
  });

  return candidatos.slice(0, limit);
}
