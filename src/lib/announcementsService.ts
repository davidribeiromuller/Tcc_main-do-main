/**
 * Comunicados escolares — leitura e escrita no Supabase.
 *
 * POR QUE ESTA CAMADA EXISTE
 * --------------------------
 * Antes, comunicado era gravado só em `localStorage` (`schoolNewsStore.ts`).
 * Consequência: quando a diretoria publicava um aviso, ele aparecia **apenas no
 * aparelho de quem publicou**. Nenhum aluno via. Nenhum outro professor via.
 * E o "comunicado geral para todas as escolas" era impossível por construção.
 *
 * A fonte agora é o banco. `school_announcements` guarda o comunicado;
 * `school_id` nulo significa comunicado GLOBAL (aparece em todas as escolas).
 *
 * QUEM PODE ESCREVER
 * ------------------
 * Só a Edge Function `announcements-api`, com a chave de serviço. As policies
 * dão `SELECT` público para o que está publicado e não vencido, e **nenhuma**
 * permissão de escrita para `anon` — a chave publicável está no bundle, então
 * escrita liberada ali significaria qualquer visitante publicando aviso em nome
 * da escola.
 *
 * O `localStorage` continua sendo usado como rascunho de emergência quando o
 * banco não está configurado ou está fora do ar, para não perder o texto que a
 * pessoa acabou de escrever.
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { saveNews } from "./schoolNewsStore.ts";
import type { SchoolNewsItem } from "./schoolsData.ts";

/** Público-alvo de um comunicado. */
export type PublicoAlvo = "all" | "students" | "staff" | "families" | "admins";

export interface Comunicado {
  id: string;
  schoolId: string | null;
  schoolSlug: string | null;
  title: string;
  body: string;
  category: string;
  audience: PublicoAlvo;
  authorName: string | null;
  authorEmail: string | null;
  expiresAt: string | null;
  eventId: number | null;
  eventEndsAt: string | null;
  status: "published" | "hidden" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export const ROTULOS_PUBLICO: Record<PublicoAlvo, string> = {
  all: "Todos (inclui visitantes)",
  students: "Alunos",
  staff: "Funcionários e professores",
  families: "Responsáveis e famílias",
  admins: "Direção e administração",
};

export const CATEGORIAS_COMUNICADO = [
  "Comunicado",
  "Aviso",
  "Pedagógico",
  "Conquista",
  "Cultural",
] as const;

/**
 * Prazo padrão de um comunicado: 2 dias.
 *
 * É a regra que o produto define — "2 dias depois do evento ou do tempo
 * configurado". Quando o comunicado está ligado a um evento, o prazo conta a
 * partir do ENCERRAMENTO do evento, não da publicação: um aviso sobre a feira
 * de ciências não deve sumir antes de a feira acontecer.
 */
export const DIAS_PADRAO_COMUNICADO = 2;

export function calcularExpiracao(entrada: {
  /** Data/hora de encerramento do evento, se houver. */
  eventEndsAt?: string | null;
  /** Prazo em dias. `null` = nunca expira. */
  dias?: number | null;
  /** Base para o cálculo quando não há evento. Padrão: agora. */
  agora?: Date;
}): string | null {
  const { eventEndsAt, dias } = entrada;
  if (dias === null || dias === undefined) return null;

  const agora = entrada.agora ?? new Date();
  const base = eventEndsAt ? new Date(eventEndsAt) : agora;
  if (Number.isNaN(base.getTime())) return null;

  // Se o evento já passou faz tempo, ainda assim respeitamos o prazo relativo
  // ao encerramento — pode ser um comunicado retroativo legítimo.
  const limite = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
  return limite.toISOString();
}

function mapear(linha: any): Comunicado {
  return {
    id: String(linha.id),
    schoolId: linha.school_id ? String(linha.school_id) : null,
    schoolSlug: linha.school_slug ?? null,
    title: linha.title ?? "",
    body: linha.body ?? "",
    category: linha.category ?? "Comunicado",
    audience: (linha.audience ?? "all") as PublicoAlvo,
    authorName: linha.author_name ?? null,
    authorEmail: linha.author_email ?? null,
    expiresAt: linha.expires_at ?? null,
    eventId: linha.event_id ?? null,
    eventEndsAt: linha.event_ends_at ?? null,
    status: (linha.status ?? "published") as Comunicado["status"],
    createdAt: linha.created_at ?? new Date().toISOString(),
    updatedAt: linha.updated_at ?? new Date().toISOString(),
  };
}

/**
 * Busca os comunicados visíveis para uma escola: os dela + os globais.
 *
 * Ordenação: global primeiro quando mais recente, depois por data. A RLS já
 * filtra o que está vencido, mas repetimos a checagem aqui — defesa em
 * profundidade, porque uma policy errada no futuro não deve vazar comunicado
 * velho para a tela.
 */
export async function fetchComunicados(params: {
  schoolId?: string | null;
  schoolSlug?: string | null;
  /** Inclui os globais (school_id nulo). Padrão: true. */
  incluirGlobais?: boolean;
}): Promise<{ comunicados: Comunicado[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { comunicados: [], error: "Banco de dados não configurado neste ambiente." };
  }

  const incluirGlobais = params.incluirGlobais !== false;

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("school_announcements")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100);

    // Filtro: ou é da escola, ou é global.
    const filtros: string[] = [];
    if (params.schoolId) filtros.push(`school_id.eq.${params.schoolId}`);
    if (params.schoolSlug) filtros.push(`school_slug.eq.${params.schoolSlug}`);
    if (incluirGlobais) filtros.push("school_id.is.null");

    if (filtros.length > 0) {
      query = query.or(filtros.join(","));
    }

    const { data, error } = await query;
    if (error) {
      return { comunicados: [], error: error.message };
    }

    const agora = Date.now();
    const visiveis = (data ?? [])
      .map(mapear)
      .filter((c) => {
        if (!c.expiresAt) return true;
        const limite = new Date(c.expiresAt).getTime();
        return Number.isNaN(limite) || limite > agora;
      });

    return { comunicados: visiveis, error: null };
  } catch (err: any) {
    return { comunicados: [], error: err?.message || "Falha ao carregar comunicados." };
  }
}

/**
 * Publica um comunicado.
 *
 * Via de regra quem publica é a escola (ou o proprietário, para o comunicado
 * geral). A autorização real é do servidor; aqui só montamos o registro.
 *
 * Se o banco falhar, o texto NÃO é perdido: cai para o armazenamento local,
 * e o retorno informa `salvoLocalmente: true` para a UI dizer a verdade em vez
 * de anunciar "publicado".
 */
export async function publicarComunicado(entrada: {
  schoolId?: string | null;
  schoolSlug?: string | null;
  title: string;
  body: string;
  category?: string;
  audience?: PublicoAlvo;
  authorName?: string | null;
  authorEmail?: string | null;
  /** Prazo em dias. `null` = sem prazo. Padrão: 2 dias. */
  diasParaExpirar?: number | null;
  eventId?: number | null;
  eventEndsAt?: string | null;
}): Promise<{
  comunicado: Comunicado | null;
  salvoLocalmente: boolean;
  error: string | null;
}> {
  const titulo = (entrada.title || "").trim();
  const corpo = (entrada.body || "").trim();

  if (titulo.length < 2) {
    return { comunicado: null, salvoLocalmente: false, error: "Informe um título para o comunicado." };
  }
  if (corpo.length < 1) {
    return { comunicado: null, salvoLocalmente: false, error: "Escreva o conteúdo do comunicado." };
  }

  const dias = entrada.diasParaExpirar === undefined ? DIAS_PADRAO_COMUNICADO : entrada.diasParaExpirar;
  const expiresAt = calcularExpiracao({
    eventEndsAt: entrada.eventEndsAt ?? null,
    dias,
  });

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("school_announcements")
        .insert([
          {
            school_id: entrada.schoolId ?? null,
            school_slug: entrada.schoolSlug ?? null,
            title: titulo,
            body: corpo,
            category: entrada.category || "Comunicado",
            audience: entrada.audience || "all",
            author_name: entrada.authorName ?? null,
            author_email: entrada.authorEmail ?? null,
            expires_at: expiresAt,
            event_id: entrada.eventId ?? null,
            event_ends_at: entrada.eventEndsAt ?? null,
            status: "published",
          },
        ])
        .select("*")
        .single();

      if (!error && data) {
        return { comunicado: mapear(data), salvoLocalmente: false, error: null };
      }

      // Erro do banco (RLS, rede, coluna) — tenta o rascunho local antes de
      // devolver falha, para não perder o que a pessoa escreveu.
      console.warn("[announcementsService] Falha ao gravar no banco:", error?.message);
    } catch (err: any) {
      console.warn("[announcementsService] Exceção ao gravar no banco:", err?.message);
    }
  }

  // Último recurso: rascunho local. A UI avisa que não foi publicado de fato.
  if (entrada.schoolSlug) {
    saveNews(entrada.schoolSlug, {
      title: titulo,
      description: corpo,
      category: (entrada.category as any) || "Comunicado",
      author: entrada.authorName || "Portal da Escola",
    });
  }

  return {
    comunicado: null,
    salvoLocalmente: true,
    error:
      "O comunicado não pôde ser publicado no servidor. O texto foi guardado neste dispositivo — " +
      "ninguém mais consegue vê-lo até a publicação funcionar.",
  };
}

/** Esconde um comunicado sem apagar o registro (histórico preservado). */
export async function ocultarComunicado(id: string): Promise<{ ok: boolean; error: string | null }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Banco não configurado." };
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("school_announcements")
      .update({ status: "hidden", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: "Comunicado não encontrado ou sem permissão para alterar." };
    }
    return { ok: true, error: null };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Falha ao ocultar." };
  }
}

/**
 * Converte os comunicados do banco para o formato `SchoolNewsItem` que as telas
 * já renderizam. Assim a vitrine existente continua funcionando sem reescrita.
 */
export function paraSchoolNews(comunicados: Comunicado[]): SchoolNewsItem[] {
  return comunicados.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.body,
    date: new Date(c.createdAt).toLocaleDateString("pt-BR"),
    author: c.authorName || "Portal da Escola",
    category: (CATEGORIAS_COMUNICADO as readonly string[]).includes(c.category)
      ? (c.category as SchoolNewsItem["category"])
      : "Comunicado",
    source: c.schoolId ? "Portal da Escola" : "eloEscola — Comunicado Geral",
  }));
}
