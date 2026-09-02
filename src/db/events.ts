import { db, isDbCachedOffline, markDbOffline, markDbOnline } from './index.ts';
import { events } from './schema.ts';
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
    console.error(`Error in ${opsName} query, falling back to in-memory store:`, error);
  }
};

export async function listAllEvents() {
  if (isDbCachedOffline()) {
    return listAllEventsFallback();
  }
  try {
    const result = await db.select().from(events).orderBy(sql`${events.year} DESC, ${events.month} DESC, ${events.day} DESC`);
    markDbOnline();
    return result;
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
  if (isDbCachedOffline()) {
    return createNewEventFallback(data);
  }
  try {
    const result = await db.insert(events)
      .values({
        ...data,
        time: data.time || '18:00',
        isPaid: data.isPaid || false,
      })
      .returning();
    markDbOnline();
    const created = result[0];
    try {
      createNewEventFallback({ ...data, ...(created ? { id: created.id } : {}) });
    } catch {}
    return created;
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
  if (isDbCachedOffline()) {
    return updateEventByIdFallback(id, data as any);
  }
  try {
    const result = await db.update(events)
      .set(data as any)
      .where(eq(events.id, id))
      .returning();
    markDbOnline();
    const updated = result[0];
    try {
      updateEventByIdFallback(id, data as any);
    } catch {}
    return updated;
  } catch (error) {
    handleQueryError('updateEventById', error);
    markDbOffline();
    return updateEventByIdFallback(id, data as any);
  }
}

export async function deleteEventById(id: number) {
  if (isDbCachedOffline()) {
    return deleteEventByIdFallback(id);
  }
  try {
    const result = await db.delete(events).where(eq(events.id, id)).returning();
    markDbOnline();
    const deleted = result[0];
    try {
      deleteEventByIdFallback(id);
    } catch {}
    return deleted;
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
