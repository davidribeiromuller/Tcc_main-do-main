import { getSupabaseClient, isSupabaseConfigured } from "./supabase.ts";
import { Event } from "../types.ts";

/**
 * Converte um registro da tabela 'eventos' (formato padrão Supabase)
 * para a interface Event utilizada pelo frontend.
 */
export function mapSupabaseEventoToEvent(row: any): Event {
  let startDate: Date | null = null;
  const rawDate = row.dataInicio || row.data_inicio;
  if (rawDate) {
    startDate = new Date(rawDate);
  }
  if (!startDate || isNaN(startDate.getTime())) {
    startDate = new Date(2026, 7, 15);
  }

  // Obter ano, mês e dia locais/UTC com consistência
  const day = startDate.getDate();
  const month = startDate.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  const year = startDate.getFullYear();
  const hours = String(startDate.getHours()).padStart(2, "0");
  const minutes = String(startDate.getMinutes()).padStart(2, "0");
  const time = `${hours}:${minutes}`;

  // Formatar localização amigável
  let locationStr = row.local || row.location || "";
  const endereco = row.endereco;
  const cidade = row.cidade;
  if (endereco && !locationStr.includes(endereco)) {
    locationStr = locationStr ? `${locationStr} • ${endereco}` : endereco;
  }
  if (cidade && !locationStr.includes(cidade)) {
    locationStr = locationStr ? `${locationStr} (${cidade})` : cidade;
  }
  if (!locationStr) {
    locationStr = "Escola Estadual Helena Wysocki";
  }

  // Preço e tipo de evento
  const isPaid = !!(row.precisaPagar ?? row.precisa_pagar ?? row.isPaid ?? row.is_paid);
  const rawValor = row.valor ?? row.price;
  let priceStr: string | null = null;
  if (isPaid) {
    if (typeof rawValor === "string" && rawValor.includes("R$")) {
      priceStr = rawValor;
    } else if (rawValor && parseFloat(String(rawValor)) > 0) {
      priceStr = `R$ ${parseFloat(String(rawValor)).toFixed(2).replace(".", ",")}`;
    } else {
      priceStr = "Pago";
    }
  }

  // Requisitos e público alvo
  let requirements = row.publicoAlvo || row.publico_alvo || row.requirements || "";
  const organizador = row.organizador || row.creatorRole;
  if (organizador && !requirements.includes(organizador)) {
    requirements = requirements ? `${requirements} • Org: ${organizador}` : `Organização: ${organizador}`;
  }
  const vagas = row.vagas;
  if (vagas && !requirements.includes(`${vagas} vagas`)) {
    requirements = requirements ? `${requirements} (${vagas} vagas)` : `${vagas} vagas`;
  }

  const rawId = row.id;
  const numericId = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10) || Math.floor(Math.random() * 9000 + 1000);

  return {
    id: numericId,
    title: row.titulo || row.title || "Evento Escolar",
    location: locationStr,
    day: isNaN(day) ? 15 : day,
    month: isNaN(month) ? 7 : month,
    year: isNaN(year) ? 2026 : year,
    time: time === "00:00" ? "09:00" : time,
    isPaid: isPaid,
    price: priceStr,
    requirements: requirements || null,
    description: row.descricao || row.description || null,
    creatorRole: organizador || "Diretoria Escolar",
    website: row.linkInscricao || row.link_inscricao || row.website || null,
    image: row.imagem || row.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600",
    createdAt: row.criadoEm || row.criado_em || row.createdAt || row.created_at || new Date().toISOString(),
  };
}

/**
 * Converte um registro da tabela 'events' (formato secundário/espelho)
 * para a interface Event.
 */
export function mapSupabaseEventsTableToEvent(row: any): Event {
  const isPaid = !!(row.is_paid ?? row.isPaid);
  const rawId = row.id;
  const numericId = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10) || Math.floor(Math.random() * 9000 + 1000);

  return {
    id: numericId,
    title: row.title || "Evento Escolar",
    location: row.location || "Escola Estadual Helena Wysocki",
    day: Number(row.day) || 15,
    month: Number(row.month) ?? 7,
    year: Number(row.year) || 2026,
    time: row.time || "09:00",
    isPaid: isPaid,
    price: row.price || null,
    requirements: row.requirements || null,
    description: row.description || null,
    creatorRole: row.creator_role || row.creatorRole || "Diretoria Escolar",
    website: row.website || null,
    image: row.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600",
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

/**
 * Busca os eventos diretamente do Supabase Client via REST/PostgREST.
 * Realiza a leitura das tabelas 'eventos' e 'events' respeitando unicidade por ID e Título.
 */
export async function fetchEventsDirectFromSupabase(): Promise<{ events: Event[]; error: any }> {
  if (!isSupabaseConfigured()) {
    return {
      events: [],
      error: new Error("Supabase não configurado no cliente"),
    };
  }

  const supabase = getSupabaseClient();
  const combined: Event[] = [];
  const seenIds = new Set<number>();
  const seenTitles = new Set<string>();

  let caughtError: any = null;

  // 1. Tabela 'eventos' (tabela nativa Supabase em português)
  try {
    const { data: eventosRows, error: errEventos } = await supabase
      .from("eventos")
      .select("*")
      .order("data_inicio", { ascending: true });

    if (errEventos) {
      console.warn("[SupabaseDirect] Erro na consulta à tabela 'eventos':", errEventos);
      caughtError = errEventos;
    } else if (eventosRows && Array.isArray(eventosRows) && eventosRows.length > 0) {
      for (const row of eventosRows) {
        const mapped = mapSupabaseEventoToEvent(row);
        const normTitle = (mapped.title || "").trim().toLowerCase();
        if (!seenIds.has(mapped.id) && !seenTitles.has(normTitle)) {
          seenIds.add(mapped.id);
          seenTitles.add(normTitle);
          combined.push(mapped);
        }
      }
    }
  } catch (err) {
    console.warn("[SupabaseDirect] Exceção ao consultar 'eventos':", err);
    caughtError = caughtError || err;
  }

  // 2. Tabela 'events' (tabela em inglês / espelho)
  try {
    const { data: eventsRows, error: errEvents } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (errEvents) {
      console.warn("[SupabaseDirect] Erro na consulta à tabela 'events':", errEvents);
      if (!caughtError) caughtError = errEvents;
    } else if (eventsRows && Array.isArray(eventsRows) && eventsRows.length > 0) {
      for (const row of eventsRows) {
        const mapped = mapSupabaseEventsTableToEvent(row);
        const normTitle = (mapped.title || "").trim().toLowerCase();
        if (!seenIds.has(mapped.id) && !seenTitles.has(normTitle)) {
          seenIds.add(mapped.id);
          seenTitles.add(normTitle);
          combined.push(mapped);
        }
      }
    }
  } catch (err) {
    console.warn("[SupabaseDirect] Exceção ao consultar 'events':", err);
    if (!caughtError) caughtError = err;
  }

  return {
    events: combined,
    error: combined.length > 0 ? null : caughtError,
  };
}

/**
 * Cria um novo evento diretamente no Supabase.
 * Salva na tabela 'eventos' e 'events' para garantir compatibilidade total.
 */
export async function createEventDirectInSupabase(eventData: {
  title: string;
  location: string;
  day: number;
  month: number;
  year: number;
  time: string;
  isPaid: boolean;
  price?: string | null;
  requirements?: string | null;
  website?: string | null;
  image?: string;
  creatorId?: number;
}): Promise<{ success: boolean; event: Event | null; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, event: null, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();

  // Calcular timestamp data_inicio
  const day = Number(eventData.day) || 1;
  const month = Number(eventData.month) || 0;
  const year = Number(eventData.year) || 2026;
  const [hours, minutes] = (eventData.time || "14:00").split(":").map(Number);
  const eventDate = new Date(year, month, day, isNaN(hours) ? 14 : hours, isNaN(minutes) ? 0 : minutes);
  const dataInicioIso = eventDate.toISOString();

  let createdEvent: Event | null = null;
  let lastError: any = null;

  // 1. Tentar salvar em 'events'
  try {
    const rowEvents: Record<string, any> = {
      title: eventData.title,
      location: eventData.location,
      day: day,
      month: month,
      year: year,
      time: eventData.time || "14:00",
      is_paid: !!eventData.isPaid,
      price: eventData.price || null,
      requirements: eventData.requirements || null,
      website: eventData.website || null,
      image: eventData.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600",
      creator_id: eventData.creatorId || 2,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("events").insert([rowEvents]).select();
    if (!error && data && data.length > 0) {
      createdEvent = mapSupabaseEventsTableToEvent(data[0]);
    } else if (error) {
      lastError = error;
    }
  } catch (err) {
    lastError = err;
  }

  // 2. Tentar salvar em 'eventos'
  try {
    const rowEventos: Record<string, any> = {
      titulo: eventData.title,
      descricao: eventData.requirements || "Evento da comunidade escolar",
      categoria: "Escolar",
      cidade: "Araucária",
      local: eventData.location,
      endereco: eventData.location,
      data_inicio: dataInicioIso,
      data_fim: dataInicioIso,
      organizador: "Diretoria Helena Wysocki",
      publico_alvo: eventData.requirements || "Comunidade Escolar",
      precisa_pagar: !!eventData.isPaid,
      valor: eventData.price ? parseFloat(eventData.price.replace(/[^\d.,]/g, "").replace(",", ".")) || 0 : 0,
      inscricoes_abertas: true,
      link_inscricao: eventData.website || null,
      imagem: eventData.image || "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600",
      criado_em: new Date().toISOString(),
    };

    const { data: evData, error: evError } = await supabase.from("eventos").insert([rowEventos]).select();
    if (!evError && evData && evData.length > 0) {
      if (!createdEvent) {
        createdEvent = mapSupabaseEventoToEvent(evData[0]);
      }
    }
  } catch (_) {}

  return {
    success: !!createdEvent,
    event: createdEvent,
    error: createdEvent ? null : lastError,
  };
}

/**
 * Atualiza um evento diretamente no Supabase (em 'events' ou 'eventos').
 */
export async function updateEventDirectInSupabase(
  eventId: number,
  eventData: Partial<Event>
): Promise<{ success: boolean; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();
  let anySuccess = false;
  let lastError: any = null;

  // Atualizar em 'events'
  try {
    const payloadEvents: Record<string, any> = {};
    if (eventData.title !== undefined) payloadEvents.title = eventData.title;
    if (eventData.location !== undefined) payloadEvents.location = eventData.location;
    if (eventData.day !== undefined) payloadEvents.day = eventData.day;
    if (eventData.month !== undefined) payloadEvents.month = eventData.month;
    if (eventData.year !== undefined) payloadEvents.year = eventData.year;
    if (eventData.time !== undefined) payloadEvents.time = eventData.time;
    if (eventData.isPaid !== undefined) payloadEvents.is_paid = eventData.isPaid;
    if (eventData.price !== undefined) payloadEvents.price = eventData.price;
    if (eventData.requirements !== undefined) payloadEvents.requirements = eventData.requirements;
    if (eventData.website !== undefined) payloadEvents.website = eventData.website;
    if (eventData.image !== undefined) payloadEvents.image = eventData.image;

    const { error } = await supabase.from("events").update(payloadEvents).eq("id", eventId);
    if (!error) anySuccess = true;
    else lastError = error;
  } catch (err) {
    lastError = err;
  }

  // Atualizar em 'eventos'
  try {
    const payloadEventos: Record<string, any> = {};
    if (eventData.title !== undefined) payloadEventos.titulo = eventData.title;
    if (eventData.location !== undefined) {
      payloadEventos.local = eventData.location;
      payloadEventos.endereco = eventData.location;
    }
    if (eventData.requirements !== undefined) {
      payloadEventos.descricao = eventData.requirements;
      payloadEventos.publico_alvo = eventData.requirements;
    }
    if (eventData.isPaid !== undefined) payloadEventos.precisa_pagar = eventData.isPaid;
    if (eventData.price !== undefined) {
      payloadEventos.valor = eventData.price
        ? parseFloat(eventData.price.replace(/[^\d.,]/g, "").replace(",", ".")) || 0
        : 0;
    }
    if (eventData.website !== undefined) payloadEventos.link_inscricao = eventData.website;
    if (eventData.image !== undefined) payloadEventos.imagem = eventData.image;

    const { error } = await supabase.from("eventos").update(payloadEventos).eq("id", eventId);
    if (!error) anySuccess = true;
  } catch (_) {}

  return { success: anySuccess, error: anySuccess ? null : lastError };
}

/**
 * Remove um evento diretamente no Supabase.
 */
export async function deleteEventDirectInSupabase(eventId: number): Promise<{ success: boolean; error: any }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: new Error("Supabase não configurado") };
  }

  const supabase = getSupabaseClient();
  let anySuccess = false;
  let lastError: any = null;

  try {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (!error) anySuccess = true;
    else lastError = error;
  } catch (err) {
    lastError = err;
  }

  try {
    const { error } = await supabase.from("eventos").delete().eq("id", eventId);
    if (!error) anySuccess = true;
  } catch (_) {}

  return { success: anySuccess, error: anySuccess ? null : lastError };
}
