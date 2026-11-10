import { Event } from "../types.ts";

/**
 * Global constant for event retention policy:
 * Events are automatically archived 30 days after their scheduled end date.
 */
export const EVENT_RETENTION_DAYS = 30;

/**
 * Converts event day, month, year, time into a Date object in Brazilian timezone.
 */
export function getEventEndDateTime(event: Event): Date {
  let [hours, minutes] = [18, 0];
  if (event.time && event.time.includes(":")) {
    const parts = event.time.split(":");
    hours = parseInt(parts[0], 10) || 18;
    minutes = parseInt(parts[1], 10) || 0;
  }

  // Month is 0-indexed in JavaScript Date
  return new Date(event.year, event.month, event.day, hours, minutes);
}

/**
 * Returns true if the event has already concluded.
 */
export function isEventEnded(event: Event, referenceDate: Date = new Date()): boolean {
  const endDate = getEventEndDateTime(event);
  return referenceDate.getTime() > endDate.getTime();
}

/**
 * Returns true if the event concluded more than EVENT_RETENTION_DAYS (30 days) ago.
 */
export function isEventRetentionExpired(event: Event, referenceDate: Date = new Date()): boolean {
  const endDate = getEventEndDateTime(event);
  const retentionMs = EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return referenceDate.getTime() - endDate.getTime() >= retentionMs;
}

/**
 * Calculates remaining days in retention period before archiving (0 if already expired).
 */
export function getDaysUntilArchived(event: Event, referenceDate: Date = new Date()): number {
  const endDate = getEventEndDateTime(event);
  const timeSinceEnd = referenceDate.getTime() - endDate.getTime();
  const retentionMs = EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = retentionMs - timeSinceEnd;

  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}
