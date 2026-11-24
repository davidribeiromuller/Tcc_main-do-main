/**
 * Eventos excluídos / retenção — via SERVIDOR.
 *
 * ## Por que este arquivo mudou
 *
 * A versão anterior falava direto com o Supabase usando a chave publicável.
 * Depois da Parte 2 da auditoria, `deleted_events` continua com políticas
 * públicas (`qual: true`), só que `users` e `school_accounts` passaram a ser
 * fechadas — e a consequência prática era pior do que parece: **qualquer
 * visitante, sem login, podia ler, restaurar e apagar definitivamente o
 * histórico de eventos excluídos da rede inteira** (inclusive descarregar o
 * `payload` completo de cada evento).
 *
 * A regra correta é a que o painel já declara na interface: exclusão
 * definitiva é ação do Administrador Chefe. Então a escrita (restaurar,
 * expurgar, rodar a rotina) passou a exigir sessão de administrador **no
 * servidor**, que é quem decide o papel — não o navegador.
 *
 * O Supabase segue como caminho de LEITURA quando o servidor não responde
 * (hospedagem estática / demonstração), porque `deleted_events` é uma tabela
 * sem dado pessoal — só snapshot de evento público.
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { fetchJsonApiWithAuth, mensagemDeErroDaApi } from "./staticHosting.ts";

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
 *
 * Ordem de tentativa: servidor (com sessão) → Supabase público → vazio.
 */
export async function fetchDeletedEvents(options?: {
  includeRestored?: boolean;
  limit?: number;
}): Promise<{ events: DeletedEvent[]; error: any }> {
  const query = new URLSearchParams();
  if (options?.includeRestored) query.set("includeRestored", "1");
  if (options?.limit) query.set("limit", String(options.limit));

  try {
    const res = await fetchJsonApiWithAuth(`/api/events/deleted?${query.toString()}`);
    if (res && res.ok) {
      const corpo = await res.json().catch(() => null);
      if (corpo && Array.isArray(corpo.events)) {
        return { events: corpo.events.map(mapDeletedEvent), error: null };
      }
    }
    if (res && !res.ok) {
      return { events: [], error: new Error(await mensagemDeErroDaApi(res, "Acesso restrito.")) };
    }
  } catch {
    /* servidor indisponível — tenta o caminho público abaixo */
  }

  // Caminho de leitura pública (somente leitura; não permite escrever).
  if (!isSupabaseConfigured()) {
    return { events: [], error: new Error("Servidor e Supabase indisponíveis.") };
  }

  try {
    const supabase = getSupabaseClient();
    let consulta = supabase
      .from("deleted_events")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(options?.limit ?? 200);

    if (!options?.includeRestored) {
      consulta = consulta.is("restored_at", null);
    }

    const { data, error } = await consulta;
    if (error) return { events: [], error };

    return { events: (data ?? []).map(mapDeletedEvent), error: null };
  } catch (err) {
    return { events: [], error: err };
  }
}

/**
 * Restaura um evento excluído: o servidor recria o registro na tabela de
 * origem a partir do snapshot e marca `restored_at`.
 *
 * Não há fallback no navegador de propósito: escrever no histórico sem
 * autorização verificada seria justamente o furo que esta mudança fecha.
 */
export async function restoreDeletedEvent(
  deletedEventId: number
): Promise<{ success: boolean; restoredEventId?: number; error: any }> {
  try {
    const res = await fetchJsonApiWithAuth(`/api/events/deleted/${deletedEventId}/restore`, {
      method: "POST",
    });
    if (res && res.ok) {
      const corpo = await res.json().catch(() => ({}));
      return {
        success: true,
        restoredEventId: corpo?.restoredEventId ?? undefined,
        error: null,
      };
    }
    return { success: false, error: new Error(await mensagemDeErroDaApi(res, "Não foi possível restaurar o evento.")) };
  } catch (err: any) {
    return { success: false, error: new Error(err?.message || "Servidor indisponível para restaurar o evento.") };
  }
}

/**
 * Exclusão definitiva: remove o item da lista de eventos excluídos.
 * Ação irreversível, sempre manual e exclusiva do Chefe.
 */
export async function purgeDeletedEvent(
  deletedEventId: number
): Promise<{ success: boolean; error: any }> {
  try {
    const res = await fetchJsonApiWithAuth(`/api/events/deleted/${deletedEventId}`, {
      method: "DELETE",
    });
    if (res && res.ok) return { success: true, error: null };
    return { success: false, error: new Error(await mensagemDeErroDaApi(res, "Não foi possível excluir definitivamente.")) };
  } catch (err: any) {
    return { success: false, error: new Error(err?.message || "Servidor indisponível.") };
  }
}

/**
 * Executa a rotina de retenção manualmente (arquiva eventos encerrados há
 * mais de 3 dias e move para o histórico de excluídos).
 */
export async function runRetentionRoutine(): Promise<{
  success: boolean;
  total?: number;
  message?: string;
  error: any;
}> {
  try {
    const res = await fetchJsonApiWithAuth("/api/events/cleanup-expired", { method: "POST" });
    if (res && res.ok) {
      const corpo = await res.json().catch(() => ({}));
      return {
        success: true,
        total: corpo?.prunedCount ?? 0,
        message: corpo?.message,
        error: null,
      };
    }
    return { success: false, error: new Error(await mensagemDeErroDaApi(res, "Não foi possível executar a rotina de retenção.")) };
  } catch (err: any) {
    return { success: false, error: new Error(err?.message || "Servidor indisponível.") };
  }
}
