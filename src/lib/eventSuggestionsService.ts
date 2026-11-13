import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { createEventDirectInSupabase } from "./eventsService.ts";

/** Candidato a evento gerado pela IA, aguardando aprovação do admin. */
export interface EventSuggestion {
  id: number;
  title: string;
  location: string | null;
  address: string | null;
  city: string | null;
  category: string | null;
  description: string | null;
  requirements: string | null;
  website: string | null;
  image: string | null;
  day: number | null;
  month: number | null;
  year: number | null;
  time: string | null;
  isPaid: boolean;
  price: string | null;
  schoolName: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  aiConfidence: number | null;
  aiReasoning: string | null;
  /** Fonte: IA externa ou motor local. */
  origin: "ai" | "local_engine";
  /** true = data calculada/estimada; exige confirmação antes de publicar. */
  isEstimated: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvedEventId: number | null;
  rejectionReason: string | null;
}

function mapSuggestion(row: any): EventSuggestion {
  return {
    id: Number(row.id),
    title: row.title,
    location: row.location ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    category: row.category ?? null,
    description: row.description ?? null,
    requirements: row.requirements ?? null,
    website: row.website ?? null,
    image: row.image ?? null,
    day: row.day ?? null,
    month: row.month ?? null,
    year: row.year ?? null,
    time: row.time ?? null,
    isPaid: Boolean(row.is_paid),
    price: row.price ?? null,
    schoolName: row.school_name ?? null,
    sourceName: row.source_name ?? null,
    sourceUrl: row.source_url ?? null,
    aiConfidence: row.ai_confidence !== null && row.ai_confidence !== undefined
      ? Number(row.ai_confidence)
      : null,
    aiReasoning: row.ai_reasoning ?? null,
    origin: row.origin === "local_engine" ? "local_engine" : "ai",
    isEstimated: Boolean(row.is_estimated),
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    approvedEventId: row.approved_event_id ?? null,
    rejectionReason: row.rejection_reason ?? null,
  };
}

/**
 * Lista as sugestões da IA. Visível para todos os níveis hierárquicos.
 */
export async function fetchEventSuggestions(
  status: "pending" | "approved" | "rejected" | "all" = "pending"
): Promise<{ suggestions: EventSuggestion[]; error: any }> {
  if (!isSupabaseConfigured()) {
    return { suggestions: [], error: new Error("Supabase não configurado no cliente") };
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase.from("event_suggestions").select("*");

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) return { suggestions: [], error };

    return { suggestions: (data ?? []).map(mapSuggestion), error: null };
  } catch (err) {
    return { suggestions: [], error: err };
  }
}

/**
 * Aprova uma sugestão: cria o evento no app e no banco
 * (tabelas `events` e `eventos`) e marca a sugestão como aprovada.
 */
export async function approveEventSuggestion(
  suggestionId: number,
  reviewedBy: string
): Promise<{ success: boolean; eventId?: number; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();

  try {
    const { data: rows, error: fetchError } = await supabase
      .from("event_suggestions")
      .select("*")
      .eq("id", suggestionId)
      .limit(1);

    if (fetchError) return { success: false, error: fetchError };
    if (!rows || rows.length === 0) {
      return { success: false, error: new Error("Sugestão não encontrada") };
    }

    const sugestao = rows[0] as any;
    if (sugestao.status !== "pending") {
      return { success: false, error: new Error("Esta sugestão já foi revisada") };
    }

    // 1. Criar o evento de verdade (grava em `events` e `eventos`)
    const resultado = await createEventDirectInSupabase({
      title: sugestao.title,
      location: sugestao.location || sugestao.address || sugestao.city || "",
      day: sugestao.day,
      month: sugestao.month,
      year: sugestao.year,
      time: sugestao.time || "08:00",
      isPaid: Boolean(sugestao.is_paid),
      price: sugestao.price,
      requirements: sugestao.requirements,
      website: sugestao.website,
      image: sugestao.image,
      description: sugestao.description,
      category: sugestao.category,
      city: sugestao.city,
      schoolName: sugestao.school_name,
    } as any);

    if (!resultado.success) {
      return { success: false, error: resultado.error };
    }

    const eventId = resultado.event?.id ?? null;

    // 2. Marcar a sugestão como aprovada
    const { error: updateError } = await supabase
      .from("event_suggestions")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
        approved_event_id: eventId,
        approved_table: "events",
      })
      .eq("id", suggestionId);

    if (updateError) {
      console.warn("[suggestions] Evento criado, mas falhou ao marcar aprovação:", updateError);
    }

    return { success: true, eventId: eventId ?? undefined, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/** Rejeita uma sugestão (não cria evento). */
export async function rejectEventSuggestion(
  suggestionId: number,
  reviewedBy: string,
  reason?: string
): Promise<{ success: boolean; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("event_suggestions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
        rejection_reason: reason ?? null,
      })
      .eq("id", suggestionId);

    return { success: !error, error: error ?? null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Dispara a Edge Function que faz a IA descobrir novos eventos.
 */
export async function triggerAiEventScout(
  options?: { count?: number; focus?: string }
): Promise<{
  success: boolean;
  inseridas?: number;
  message?: string;
  /** Aviso não-fatal (ex.: IA sem chave, caiu para o motor local). */
  aviso?: string | null;
  /** Quais fontes rodaram nesta execução. */
  fontes?: string[];
  resumo?: { local_engine: number; ai: number };
  provider?: string | null;
  model?: string | null;
  error: any;
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke("ai-event-scout", {
      body: { count: options?.count ?? 5, focus: options?.focus },
    });

    if (error) {
      // A Edge Function devolve o corpo de erro; `FunctionsHttpError` guarda a resposta.
      let detalhe: any = null;
      try {
        if (typeof (error as any).context?.json === "function") {
          detalhe = await (error as any).context.json();
        }
      } catch (_) {
        detalhe = null;
      }

      return {
        success: false,
        error: new Error(detalhe?.error || error.message || "Falha ao executar a descoberta"),
      };
    }

    return {
      success: data?.success === true,
      inseridas: data?.inseridas ?? 0,
      message: data?.message,
      aviso: data?.aviso ?? null,
      fontes: data?.fontes ?? [],
      resumo: data?.resumo,
      provider: data?.provider ?? null,
      model: data?.model ?? null,
      error: data?.success === true ? null : new Error(data?.error ?? "Falha ao executar a IA"),
    };
  } catch (err) {
    return { success: false, error: err };
  }
}
