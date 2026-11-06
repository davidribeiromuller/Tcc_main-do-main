import { db, isDbCachedOffline, markDbOffline, markDbOnline } from './index.ts';
import { eventAttendanceAuthorizations } from './schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { EventAttendanceAuthorization } from '../types.ts';
import {
  createAuthorizationFallback,
  getAuthorizationByStudentAndEventFallback,
  listAuthorizationsByEventFallback,
  listAuthorizationsByStudentFallback,
  listAllAuthorizationsFallback,
  revokeAuthorizationFallback
} from './fallbackStore.ts';

export async function createAuthorization(
  data: Parameters<typeof createAuthorizationFallback>[0]
): Promise<EventAttendanceAuthorization> {
  const fallbackRecord = createAuthorizationFallback(data);

  if (isDbCachedOffline()) {
    return fallbackRecord;
  }

  try {
    const inserted = await db
      .insert(eventAttendanceAuthorizations)
      .values({
        id: fallbackRecord.id,
        eventId: fallbackRecord.eventId,
        studentUserId: String(fallbackRecord.studentUserId),
        studentName: fallbackRecord.studentName,
        studentSchool: fallbackRecord.studentSchool,
        studentClass: fallbackRecord.studentClass,
        guardianFullName: fallbackRecord.guardianFullName,
        guardianRelationship: fallbackRecord.guardianRelationship,
        guardianContact: fallbackRecord.guardianContact,
        authorizationText: fallbackRecord.authorizationText,
        consentVersion: fallbackRecord.consentVersion,
        declarationAccepted: fallbackRecord.declarationAccepted,
        signedAt: new Date(fallbackRecord.signedAt),
        signaturePath: fallbackRecord.signaturePath,
        verificationMethod: fallbackRecord.verificationMethod,
        verificationStatus: fallbackRecord.verificationStatus,
        status: fallbackRecord.status,
        eventSnapshot: fallbackRecord.eventSnapshot,
      })
      .onConflictDoUpdate({
        target: eventAttendanceAuthorizations.id,
        set: {
          guardianFullName: fallbackRecord.guardianFullName,
          guardianRelationship: fallbackRecord.guardianRelationship,
          guardianContact: fallbackRecord.guardianContact,
          authorizationText: fallbackRecord.authorizationText,
          signaturePath: fallbackRecord.signaturePath,
          status: fallbackRecord.status,
          updatedAt: new Date(),
        },
      })
      .returning();

    markDbOnline();
    if (inserted && inserted[0]) {
      return {
        ...fallbackRecord,
        id: inserted[0].id,
      };
    }
  } catch (error: any) {
    console.warn("[Authorizations] Postgres write error, keeping fallback JSON:", error.message || error);
    markDbOffline();
  }

  return fallbackRecord;
}

export async function getAuthorizationByStudentAndEvent(
  studentUserId: string | number,
  eventId: number
): Promise<EventAttendanceAuthorization | null> {
  if (isDbCachedOffline()) {
    return getAuthorizationByStudentAndEventFallback(studentUserId, eventId);
  }

  try {
    const rows = await db
      .select()
      .from(eventAttendanceAuthorizations)
      .where(
        and(
          eq(eventAttendanceAuthorizations.studentUserId, String(studentUserId)),
          eq(eventAttendanceAuthorizations.eventId, Number(eventId))
        )
      )
      .orderBy(desc(eventAttendanceAuthorizations.signedAt))
      .limit(1);

    if (rows && rows.length > 0) {
      const r = rows[0];
      markDbOnline();
      return {
        id: r.id,
        eventId: r.eventId,
        studentUserId: r.studentUserId,
        studentName: r.studentName,
        studentSchool: r.studentSchool || "",
        studentClass: r.studentClass || "",
        guardianFullName: r.guardianFullName,
        guardianRelationship: r.guardianRelationship,
        guardianContact: r.guardianContact || "",
        authorizationText: r.authorizationText,
        consentVersion: r.consentVersion,
        declarationAccepted: r.declarationAccepted,
        signedAt: r.signedAt ? r.signedAt.toISOString() : new Date().toISOString(),
        signaturePath: r.signaturePath,
        verificationMethod: r.verificationMethod,
        verificationStatus: r.verificationStatus as any,
        status: r.status as any,
        eventSnapshot: (r.eventSnapshot as any) || {
          title: "",
          location: "",
          date: "",
          time: "",
          schoolName: "",
        },
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : undefined,
        revokedAt: r.revokedAt ? r.revokedAt.toISOString() : undefined,
      };
    }
  } catch (error: any) {
    console.warn("[Authorizations] Postgres select error, servicing from fallback:", error.message || error);
    markDbOffline();
  }

  return getAuthorizationByStudentAndEventFallback(studentUserId, eventId);
}

export async function listAuthorizationsByEvent(
  eventId: number
): Promise<EventAttendanceAuthorization[]> {
  if (isDbCachedOffline()) {
    return listAuthorizationsByEventFallback(eventId);
  }

  try {
    const rows = await db
      .select()
      .from(eventAttendanceAuthorizations)
      .where(eq(eventAttendanceAuthorizations.eventId, Number(eventId)))
      .orderBy(desc(eventAttendanceAuthorizations.signedAt));

    if (rows && rows.length > 0) {
      markDbOnline();
      return rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        studentUserId: r.studentUserId,
        studentName: r.studentName,
        studentSchool: r.studentSchool || "",
        studentClass: r.studentClass || "",
        guardianFullName: r.guardianFullName,
        guardianRelationship: r.guardianRelationship,
        guardianContact: r.guardianContact || "",
        authorizationText: r.authorizationText,
        consentVersion: r.consentVersion,
        declarationAccepted: r.declarationAccepted,
        signedAt: r.signedAt ? r.signedAt.toISOString() : new Date().toISOString(),
        signaturePath: r.signaturePath,
        verificationMethod: r.verificationMethod,
        verificationStatus: r.verificationStatus as any,
        status: r.status as any,
        eventSnapshot: (r.eventSnapshot as any) || {
          title: "",
          location: "",
          date: "",
          time: "",
          schoolName: "",
        },
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
      }));
    }
  } catch (error: any) {
    console.warn("[Authorizations] Postgres select error, servicing from fallback:", error.message || error);
    markDbOffline();
  }

  return listAuthorizationsByEventFallback(eventId);
}

export async function listAuthorizationsByStudent(
  studentUserId: string | number
): Promise<EventAttendanceAuthorization[]> {
  if (isDbCachedOffline()) {
    return listAuthorizationsByStudentFallback(studentUserId);
  }

  try {
    const rows = await db
      .select()
      .from(eventAttendanceAuthorizations)
      .where(eq(eventAttendanceAuthorizations.studentUserId, String(studentUserId)))
      .orderBy(desc(eventAttendanceAuthorizations.signedAt));

    if (rows && rows.length > 0) {
      markDbOnline();
      return rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        studentUserId: r.studentUserId,
        studentName: r.studentName,
        studentSchool: r.studentSchool || "",
        studentClass: r.studentClass || "",
        guardianFullName: r.guardianFullName,
        guardianRelationship: r.guardianRelationship,
        guardianContact: r.guardianContact || "",
        authorizationText: r.authorizationText,
        consentVersion: r.consentVersion,
        declarationAccepted: r.declarationAccepted,
        signedAt: r.signedAt ? r.signedAt.toISOString() : new Date().toISOString(),
        signaturePath: r.signaturePath,
        verificationMethod: r.verificationMethod,
        verificationStatus: r.verificationStatus as any,
        status: r.status as any,
        eventSnapshot: (r.eventSnapshot as any) || {
          title: "",
          location: "",
          date: "",
          time: "",
          schoolName: "",
        },
        createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
      }));
    }
  } catch (error: any) {
    console.warn("[Authorizations] Postgres select error, servicing from fallback:", error.message || error);
    markDbOffline();
  }

  return listAuthorizationsByStudentFallback(studentUserId);
}
