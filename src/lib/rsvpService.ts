/**
 * Confirmação de presença em evento — e o cancelamento dela.
 *
 * POR QUE NÃO BASTAVA O `localStorage`
 * ------------------------------------
 * `recordEventParticipation` (userStats.ts) grava apenas no aparelho. A
 * confirmação nunca saía dali: o organizador não sabia quem ia ao evento, e o
 * usuário não tinha como desistir — o "cancelar" do evento é outra coisa (o
 * organizador desmarca o evento inteiro para todos).
 *
 * Aqui a confirmação vai para `event_rsvps`, com estado `confirmed`/`canceled`.
 * O índice único `(event_id, user_id)` faz reconfirmar atualizar a linha em vez
 * de criar duplicata.
 */
import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";

export type SituacaoRsvp = "confirmed" | "canceled" | "none";

export interface Rsvp {
  id: number;
  eventId: number;
  userId: number;
  status: "confirmed" | "canceled";
  canceledAt: string | null;
  canceledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapear(linha: any): Rsvp {
  return {
    id: Number(linha.id),
    eventId: Number(linha.event_id),
    userId: Number(linha.user_id),
    status: linha.status,
    canceledAt: linha.canceled_at ?? null,
    canceledReason: linha.canceled_reason ?? null,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

/** Confirma presença. Se já existia (mesmo cancelada), reativa a linha. */
export async function confirmarPresenca(
  eventId: number,
  userId: number
): Promise<{ rsvp: Rsvp | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { rsvp: null, error: "Banco de dados não configurado neste ambiente." };
  }
  if (!Number.isFinite(eventId) || !Number.isFinite(userId)) {
    return { rsvp: null, error: "Evento ou usuário inválido." };
  }

  try {
    const supabase = getSupabaseClient();
    const agora = new Date().toISOString();

    const { data, error } = await supabase
      .from("event_rsvps")
      .upsert(
        [
          {
            event_id: eventId,
            user_id: userId,
            status: "confirmed",
            canceled_at: null,
            canceled_reason: null,
            updated_at: agora,
          },
        ],
        { onConflict: "event_id,user_id" }
      )
      .select("*")
      .single();

    if (error) return { rsvp: null, error: error.message };
    return { rsvp: mapear(data), error: null };
  } catch (err: any) {
    return { rsvp: null, error: err?.message || "Falha ao confirmar presença." };
  }
}

/** Cancela a confirmação (a pessoa desistiu). O evento em si não muda. */
export async function cancelarPresenca(
  eventId: number,
  userId: number,
  motivo?: string | null
): Promise<{ rsvp: Rsvp | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { rsvp: null, error: "Banco de dados não configurado neste ambiente." };
  }

  try {
    const supabase = getSupabaseClient();
    const agora = new Date().toISOString();

    const { data, error } = await supabase
      .from("event_rsvps")
      .update({
        status: "canceled",
        canceled_at: agora,
        canceled_reason: (motivo || "").trim().slice(0, 500) || null,
        updated_at: agora,
      })
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) return { rsvp: null, error: error.message };
    if (!data) {
      return { rsvp: null, error: "Você não tinha confirmado presença neste evento." };
    }
    return { rsvp: mapear(data), error: null };
  } catch (err: any) {
    return { rsvp: null, error: err?.message || "Falha ao cancelar a presença." };
  }
}

/** Situação atual do usuário naquele evento. */
export async function consultarPresenca(
  eventId: number,
  userId: number
): Promise<{ situacao: SituacaoRsvp; rsvp: Rsvp | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { situacao: "none", rsvp: null, error: null };
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("event_rsvps")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { situacao: "none", rsvp: null, error: error.message };
    if (!data) return { situacao: "none", rsvp: null, error: null };

    const rsvp = mapear(data);
    return { situacao: rsvp.status, rsvp, error: null };
  } catch (err: any) {
    return { situacao: "none", rsvp: null, error: err?.message || "Falha ao consultar." };
  }
}

/**
 * Quem confirmou presença, para o organizador.
 *
 * Devolve só id/status do RSVP — os nomes vêm da lista de usuários que o painel
 * já tem carregada, para não expor `users` (que guarda senha em texto) numa
 * consulta pública.
 */
export async function listarConfirmados(
  eventId: number
): Promise<{ userIds: number[]; error: string | null }> {
  if (!isSupabaseConfigured()) return { userIds: [], error: "Banco não configurado." };
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("status", "confirmed");
    if (error) return { userIds: [], error: error.message };
    return { userIds: (data ?? []).map((r: any) => Number(r.user_id)), error: null };
  } catch (err: any) {
    return { userIds: [], error: err?.message || "Falha ao listar confirmados." };
  }
}
