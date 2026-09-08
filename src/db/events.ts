import { db, isDbCachedOffline, markDbOffline, markDbOnline } from './index.ts';
import { events, eventos } from './schema.ts';
import { eq, sql } from 'drizzle-orm';
import { 
  listAllEventsFallback, 
  createNewEventFallback, 
  deleteEventByIdFallback,
  updateEventByIdFallback
} from './fallbackStore.ts';

const handleQueryError = (opsName: string, error: any) => {
  const errMsg = String(error?.message || '').toLowerCase();
  const isConnError = errMsg.includes('timeout') || errMsg.includes('connection') || errMsg.includes('econnrefused') || errMsg.includes('terminated') || errMsg.includes('failed query');
  if (isConnError) {
    console.warn(`[Database Fallback] Postgres is unreachable during ${opsName} query. Serviced gracefully from local school JSON cache.`);
  } else {
    console.error(`Error in ${opsName} query:`, error);
  }
};

/**
 * Converte um registro da tabela 'eventos' (formato Supabase português)
 * para a interface Event utilizada pelo frontend.
 */
export function mapEventoToEvent(row: any): any {
  let startDate = row.dataInicio || row.data_inicio ? new Date(row.dataInicio || row.data_inicio) : null;
  if (!startDate || isNaN(startDate.getTime())) {
    startDate = new Date(2026, 7, 15);
  }

  const day = startDate.getUTCDate();
  const month = startDate.getUTCMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  const year = startDate.getUTCFullYear();
  const hours = String(startDate.getUTCHours()).padStart(2, '0');
  const minutes = String(startDate.getUTCMinutes()).padStart(2, '0');
  const time = `${hours}:${minutes}`;

  // Formatar localização amigável
  let locationStr = row.local || row.location || '';
  const endereco = row.endereco;
  const cidade = row.cidade;
  if (endereco && !locationStr.includes(endereco)) {
    locationStr = locationStr ? `${locationStr} • ${endereco}` : endereco;
  }
  if (cidade && !locationStr.includes(cidade)) {
    locationStr = locationStr ? `${locationStr} (${cidade})` : cidade;
  }
  if (!locationStr) {
    locationStr = 'Escola Estadual Helena Wysocki';
  }

  // Preço
  const isPaid = !!(row.precisaPagar ?? row.precisa_pagar ?? row.isPaid ?? row.is_paid);
  const rawValor = row.valor ?? row.price;
  let priceStr: string | null = null;
  if (isPaid) {
    if (typeof rawValor === 'string' && rawValor.includes('R$')) {
      priceStr = rawValor;
    } else if (rawValor && parseFloat(String(rawValor)) > 0) {
      priceStr = `R$ ${parseFloat(String(rawValor)).toFixed(2).replace('.', ',')}`;
    } else {
      priceStr = 'Pago';
    }
  }

  // Requisitos e público alvo
  let requirements = row.publicoAlvo || row.publico_alvo || row.requirements || '';
  const organizador = row.organizador || row.creatorRole;
  if (organizador && !requirements.includes(organizador)) {
    requirements = requirements ? `${requirements} • Org: ${organizador}` : `Organização: ${organizador}`;
  }
  const vagas = row.vagas;
  if (vagas && !requirements.includes(`${vagas} vagas`)) {
    requirements = requirements ? `${requirements} (${vagas} vagas)` : `${vagas} vagas`;
  }

  const rawId = row.id;
  const numericId = typeof rawId === 'number' ? rawId : parseInt(String(rawId), 10) || Math.floor(Math.random() * 9000 + 1000);

  return {
    id: numericId,
    title: row.titulo || row.title || 'Evento Escolar',
    location: locationStr,
    day: isNaN(day) ? 15 : day,
    month: isNaN(month) ? 7 : month,
    year: isNaN(year) ? 2026 : year,
    time: time === '00:00' ? '09:00' : time,
    isPaid: isPaid,
    price: priceStr,
    requirements: requirements || null,
    description: row.descricao || row.description || null,
    creatorRole: organizador || 'Diretoria Escolar',
    website: row.linkInscricao || row.link_inscricao || row.website || null,
    image: row.imagem || row.image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600',
    createdAt: row.criadoEm || row.criado_em || row.createdAt || row.created_at || new Date().toISOString(),
  };
}

export async function listAllEvents() {
  if (isDbCachedOffline()) {
    return listAllEventsFallback();
  }

  try {
    const combinedEvents: any[] = [];
    const seenTitles = new Set<string>();
    const seenIds = new Set<number>();

    // 1. Prioridade absoluta: Buscar registros da tabela 'eventos' (tabela do Supabase do usuário)
    try {
      const eventosRows = await db.select().from(eventos).orderBy(sql`${eventos.dataInicio} ASC`);
      if (eventosRows && eventosRows.length > 0) {
        for (const row of eventosRows) {
          const mapped = mapEventoToEvent(row);
          const normalizedTitle = (mapped.title || '').trim().toLowerCase();
          if (!seenTitles.has(normalizedTitle) && !seenIds.has(mapped.id)) {
            seenTitles.add(normalizedTitle);
            seenIds.add(mapped.id);
            combinedEvents.push(mapped);
          }
        }
      }
    } catch (eventosErr) {
      console.warn('[Database] Consulta à tabela eventos avisou:', eventosErr);
    }

    // 2. Buscar também registros da tabela 'events' (compatibilidade e novos registros adicionados)
    try {
      const standardEvents = await db.select().from(events).orderBy(sql`${events.year} DESC, ${events.month} DESC, ${events.day} DESC`);
      if (standardEvents && standardEvents.length > 0) {
        for (const ev of standardEvents) {
          const normalizedTitle = (ev.title || '').trim().toLowerCase();
          if (!seenTitles.has(normalizedTitle) && !seenIds.has(ev.id)) {
            seenTitles.add(normalizedTitle);
            seenIds.add(ev.id);
            combinedEvents.push({
              ...ev,
              time: ev.time || '18:00',
              isPaid: !!ev.isPaid,
            });
          }
        }
      }
    } catch (eventsErr) {
      console.warn('[Database] Consulta à tabela events avisou:', eventsErr);
    }

    if (combinedEvents.length > 0) {
      markDbOnline();
      return combinedEvents;
    }

    // Se ambas as tabelas estiverem vazias, retornar o fallback seguro
    return listAllEventsFallback();
  } catch (error) {
    handleQueryError('listAllEvents', error);
    markDbOffline();
    return listAllEventsFallback();
  }
}

export async function createNewEvent(data: {
  title: string;
  location: string;
  day: number;
  month: number;
  year: number;
  time?: string;
  isPaid?: boolean;
  price?: string | null;
  requirements?: string | null;
  website?: string | null;
  image?: string | null;
  creatorId?: number;
}) {
  // Always synchronize fallback store
  try {
    createNewEventFallback(data);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return createNewEventFallback(data);
  }

  try {
    const timeParts = (data.time || '18:00').split(':');
    const hour = parseInt(timeParts[0], 10) || 18;
    const minute = parseInt(timeParts[1], 10) || 0;
    const startDate = new Date(Date.UTC(data.year, data.month, data.day, hour, minute));
    const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000); // +4 horas

    let numPrice = '0.00';
    if (data.price) {
      const clean = data.price.replace(/[^\d.,]/g, '').replace(',', '.');
      const parsed = parseFloat(clean);
      if (!isNaN(parsed)) numPrice = parsed.toFixed(2);
    }

    // 1. Inserir na tabela 'eventos' (tabela nativa Supabase)
    const eventosResult = await db.insert(eventos)
      .values({
        titulo: data.title,
        descricao: data.requirements || data.title,
        categoria: 'Escolar',
        cidade: 'Araucária',
        local: data.location,
        endereco: data.location,
        dataInicio: startDate,
        dataFim: endDate,
        organizador: 'Escola Estadual Helena Wysocki',
        publicoAlvo: data.requirements || 'Estudantes',
        precisaPagar: !!data.isPaid,
        valor: numPrice,
        inscricoesAbertas: true,
        linkInscricao: data.website || null,
        vagas: 300,
        imagem: data.image || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=600',
        criadoEm: new Date(),
      })
      .returning();

    const createdEvento = eventosResult[0];
    const createdId = Number(createdEvento.id);

    // 2. Sincronizar na tabela 'events' com o mesmo ID
    try {
      await db.insert(events)
        .values({
          id: createdId,
          ...data,
          time: data.time || '18:00',
          isPaid: data.isPaid || false,
        })
        .onConflictDoUpdate({
          target: events.id,
          set: {
            title: data.title,
            location: data.location,
            day: data.day,
            month: data.month,
            year: data.year,
            time: data.time || '18:00',
            isPaid: data.isPaid || false,
            price: data.price || null,
            requirements: data.requirements || null,
            website: data.website || null,
            image: data.image || null,
          }
        });
    } catch (syncErr) {
      console.warn('[Database] Espelhamento na tabela events:', syncErr);
    }

    markDbOnline();
    return mapEventoToEvent(createdEvento);
  } catch (error) {
    handleQueryError('createNewEvent', error);
    markDbOffline();
    return createNewEventFallback(data);
  }
}

export async function updateEventById(id: number, data: Partial<{
  title: string;
  location: string;
  day: number;
  month: number;
  year: number;
  time?: string;
  isPaid?: boolean;
  price?: string | null;
  requirements?: string | null;
  website?: string | null;
  image?: string | null;
}>) {
  try {
    updateEventByIdFallback(id, data as any);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return updateEventByIdFallback(id, data as any);
  }

  try {
    let confirmedEvent: any = null;

    // 1. Atualizar na tabela 'eventos' (tabela nativa Supabase)
    try {
      const updateData: any = {};
      if (data.title !== undefined) updateData.titulo = data.title;
      if (data.location !== undefined) {
        updateData.local = data.location;
        updateData.endereco = data.location;
      }
      if (data.requirements !== undefined) {
        updateData.descricao = data.requirements;
        updateData.publicoAlvo = data.requirements;
      }
      if (data.website !== undefined) updateData.linkInscricao = data.website;
      if (data.image !== undefined) updateData.imagem = data.image;
      if (data.isPaid !== undefined) updateData.precisaPagar = !!data.isPaid;
      if (data.price !== undefined) {
        const clean = (data.price || '').replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = parseFloat(clean);
        updateData.valor = isNaN(parsed) ? '0.00' : parsed.toFixed(2);
      }
      if (data.year !== undefined || data.month !== undefined || data.day !== undefined || data.time !== undefined) {
        const existingRows = await db.select().from(eventos).where(eq(eventos.id, id)).limit(1);
        const existing = existingRows[0];
        const existDate = existing?.dataInicio ? new Date(existing.dataInicio) : new Date(2026, 7, 15);
        const y = data.year !== undefined ? data.year : existDate.getUTCFullYear();
        const m = data.month !== undefined ? data.month : existDate.getUTCMonth();
        const d = data.day !== undefined ? data.day : existDate.getUTCDate();
        const timeParts = (data.time || '18:00').split(':');
        const hour = parseInt(timeParts[0], 10) || 18;
        const minute = parseInt(timeParts[1], 10) || 0;
        updateData.dataInicio = new Date(Date.UTC(y, m, d, hour, minute));
        updateData.dataFim = new Date(Date.UTC(y, m, d, hour + 4, minute));
      }

      if (Object.keys(updateData).length > 0) {
        const res = await db.update(eventos)
          .set(updateData)
          .where(eq(eventos.id, id))
          .returning();
        if (res && res.length > 0) {
          confirmedEvent = mapEventoToEvent(res[0]);
        }
      }
    } catch (syncErr) {
      console.warn('[Database] Erro ao atualizar tabela eventos:', syncErr);
    }

    // 2. Atualizar na tabela 'events'
    try {
      const eventsData: any = {};
      if (data.title !== undefined) eventsData.title = data.title;
      if (data.location !== undefined) eventsData.location = data.location;
      if (data.day !== undefined) eventsData.day = data.day;
      if (data.month !== undefined) eventsData.month = data.month;
      if (data.year !== undefined) eventsData.year = data.year;
      if (data.time !== undefined) eventsData.time = data.time;
      if (data.isPaid !== undefined) eventsData.isPaid = data.isPaid;
      if (data.price !== undefined) eventsData.price = data.price;
      if (data.requirements !== undefined) eventsData.requirements = data.requirements;
      if (data.website !== undefined) eventsData.website = data.website;
      if (data.image !== undefined) eventsData.image = data.image;

      const eventsResult = await db.update(events)
        .set(eventsData)
        .where(eq(events.id, id))
        .returning();

      if (!confirmedEvent && eventsResult && eventsResult.length > 0) {
        confirmedEvent = eventsResult[0];
      }
    } catch (eventsErr) {
      console.warn('[Database] Erro ao atualizar tabela events:', eventsErr);
    }

    markDbOnline();
    return confirmedEvent || { id, ...data };
  } catch (error) {
    handleQueryError('updateEventById', error);
    markDbOffline();
    return updateEventByIdFallback(id, data as any);
  }
}

export async function deleteEventById(id: number) {
  try {
    deleteEventByIdFallback(id);
  } catch (e) {}

  if (isDbCachedOffline()) {
    return deleteEventByIdFallback(id);
  }

  try {
    let deleted = false;
    // 1. Excluir da tabela 'eventos'
    try {
      const res = await db.delete(eventos).where(eq(eventos.id, id)).returning();
      if (res && res.length > 0) deleted = true;
    } catch (syncErr) {
      console.warn('[Database] Exclusão na tabela eventos:', syncErr);
    }

    // 2. Excluir da tabela 'events'
    try {
      const res = await db.delete(events).where(eq(events.id, id)).returning();
      if (res && res.length > 0) deleted = true;
    } catch (eventsErr) {
      console.warn('[Database] Exclusão na tabela events:', eventsErr);
    }

    markDbOnline();
    return { id, success: true, deleted };
  } catch (error) {
    handleQueryError('deleteEventById', error);
    markDbOffline();
    try {
      return deleteEventByIdFallback(id);
    } catch (fallbackError) {
      console.error('Fallback error of deleteEventByIdFallback:', fallbackError);
      throw error;
    }
  }
}
