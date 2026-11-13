import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";

/**
 * Item da lista de eventos excluídos (`deleted_events`).
 * Espelha a tabela criada na migration 0004.
 */
export interface DeletedEvent {
  id: number;
  sourceTable: "events" | "eventos";
  sourceId: number;
  title: string;
  payload: Record<string, any>;
  eventEndsAt: string | null;
  deletedAt: string;
  deletionReason: string;
  deletedBy: string | null;
  restoredAt: string | null;
  restoredEventId: number | null;
}

function mapDeletedEvent(row: any): DeletedEvent {
  return {
    id: Number(row.id),
    sourceTable: row.source_table,
    sourceId: Number(row.source_id),
    title: row.title ?? "Evento sem título",
    payload: row.payload ?? {},
    eventEndsAt: row.event_ends_at ?? null,
    deletedAt: row.deleted_at,
    deletionReason: row.deletion_reason ?? "auto_retention_3d",
    deletedBy: row.deleted_by ?? null,
    restoredAt: row.restored_at ?? null,
    restoredEventId: row.restored_event_id ?? null,
  };
}

/**
 * Lista os eventos excluídos (ainda não restaurados), mais recentes primeiro.
 */
export async function fetchDeletedEvents(options?: {
  includeRestored?: boolean;
  limit?: number;
}): Promise<{ events: DeletedEvent[]; error: any }> {
  if (!isSupabaseConfigured()) {
    return { events: [], error: new Error("Supabase não configurado no cliente") };
  }

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("deleted_events")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(options?.limit ?? 200);

    if (!options?.includeRestored) {
      query = query.is("restored_at", null);
    }

    const { data, error } = await query;
    if (error) return { events: [], error };

    return {
      events: (data ?? []).map(mapDeletedEvent),
      error: null,
    };
  } catch (err) {
    return { events: [], error: err };
  }
}

/**
 * Restaura um evento excluído: recria o registro na tabela de origem
 * a partir do snapshot salvo e marca `restored_at`.
 *
 * A restauração é sempre recuperável e reversível pelo próprio histórico.
 */
export async function restoreDeletedEvent(
  deletedEventId: number
): Promise<{ success: boolean; restoredEventId?: number; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();

  try {
    // 1. Buscar o snapshot
    const { data: rows, error: fetchError } = await supabase
      .from("deleted_events")
      .select("*")
      .eq("id", deletedEventId)
      .limit(1);

    if (fetchError) return { success: false, error: fetchError };
    if (!rows || rows.length === 0) {
      return { success: false, error: new Error("Evento excluído não encontrado") };
    }

    const registro = rows[0] as any;
    if (registro.restored_at) {
      return { success: false, error: new Error("Este evento já foi restaurado") };
    }

    const payload: Record<string, any> = registro.payload ?? {};

    // 2. Reinserir na tabela de origem, removendo o id original e
    //    limpando as flags de arquivamento para que volte a aparecer no app.
    const novoRegistro: Record<string, any> = { ...payload };
    delete novoRegistro.id;
    delete novoRegistro.archived_at;
    delete novoRegistro.ends_at;
    if ("is_archived" in novoRegistro) novoRegistro.is_archived = false;
    if ("status" in novoRegistro) novoRegistro.status = "ativo";

    const { data: inserted, error: insertError } = await supabase
      .from(registro.source_table)
      .insert(novoRegistro)
      .select("id")
      .limit(1);

    if (insertError) return { success: false, error: insertError };

    const restoredEventId = inserted?.[0]?.id ?? null;

    // 3. Marcar como restaurado na lista de excluídos
    const { error: updateError } = await supabase
      .from("deleted_events")
      .update({
        restored_at: new Date().toISOString(),
        restored_event_id: restoredEventId,
      })
      .eq("id", deletedEventId);

    if (updateError) {
      // O evento já foi recriado; registramos o problema mas não desfazemos.
      console.warn("[deletedEvents] Falha ao marcar restored_at:", updateError);
    }

    return { success: true, restoredEventId: restoredEventId ?? undefined, error: null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Exclusão definitiva: remove o item da lista de eventos excluídos.
 * Ação irreversível e sempre manual.
 */
export async function purgeDeletedEvent(
  deletedEventId: number
): Promise<{ success: boolean; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("deleted_events")
      .delete()
      .eq("id", deletedEventId);

    return { success: !error, error: error ?? null };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Executa a rotina de retenção manualmente (útil para a carga inicial única
 * e para testes no painel admin). Depende da função SQL da migration 0004.
 */
export async function runRetentionRoutine(): Promise<{
  success: boolean;
  total?: number;
  message?: string;
  error: any;
}> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("archive_expired_events_routine");

    if (error) return { success: false, error };

    const resultado = (data ?? {}) as any;
    return {
      success: resultado.success === true,
      total: resultado.total ?? 0,
      message: resultado.message,
      error: resultado.success === true ? null : new Error(resultado.error ?? "Falha na rotina"),
    };
  } catch (err) {
    return { success: false, error: err };
  }
}
