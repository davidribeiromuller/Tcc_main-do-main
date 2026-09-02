/**
 * User Statistics Tracking Module
 * Tracks real user activity without mock/fake numbers:
 * - Participated / Confirmed Events
 * - Created Events
 * - Map routes calculated
 * - Feedbacks / Messages sent
 */

export interface UserStats {
  participatedEventsCount: number;
  participatedEventIds: number[];
  createdEventsCount: number;
  routesCalculatedCount: number;
  feedbacksSentCount: number;
}

const STATS_STORAGE_KEY_PREFIX = "helenawysocki_user_stats_";

export function getUserStats(userId?: number | string | null): UserStats {
  if (!userId) {
    return {
      participatedEventsCount: 0,
      participatedEventIds: [],
      createdEventsCount: 0,
      routesCalculatedCount: 0,
      feedbacksSentCount: 0,
    };
  }

  try {
    const raw = localStorage.getItem(`${STATS_STORAGE_KEY_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        participatedEventsCount: Array.isArray(parsed.participatedEventIds)
          ? parsed.participatedEventIds.length
          : Number(parsed.participatedEventsCount || 0),
        participatedEventIds: Array.isArray(parsed.participatedEventIds)
          ? parsed.participatedEventIds
          : [],
        createdEventsCount: Number(parsed.createdEventsCount || 0),
        routesCalculatedCount: Number(parsed.routesCalculatedCount || 0),
        feedbacksSentCount: Number(parsed.feedbacksSentCount || 0),
      };
    }
  } catch (e) {
    console.warn("Error reading user stats:", e);
  }

  return {
    participatedEventsCount: 0,
    participatedEventIds: [],
    createdEventsCount: 0,
    routesCalculatedCount: 0,
    feedbacksSentCount: 0,
  };
}

export function saveUserStats(userId: number | string, stats: UserStats): void {
  try {
    localStorage.setItem(`${STATS_STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(stats));
  } catch (e) {
    console.warn("Error saving user stats:", e);
  }
}

export function recordEventParticipation(userId: number | string, eventId: number): void {
  const current = getUserStats(userId);
  if (!current.participatedEventIds.includes(eventId)) {
    current.participatedEventIds.push(eventId);
    current.participatedEventsCount = current.participatedEventIds.length;
    saveUserStats(userId, current);
  }
}

export function recordRouteCalculation(userId?: number | string | null): void {
  if (!userId) return;
  const current = getUserStats(userId);
  current.routesCalculatedCount = (current.routesCalculatedCount || 0) + 1;
  saveUserStats(userId, current);
}

export function recordFeedbackSent(userId?: number | string | null): void {
  if (!userId) return;
  const current = getUserStats(userId);
  current.feedbacksSentCount = (current.feedbacksSentCount || 0) + 1;
  saveUserStats(userId, current);
}

export function calculateRealUserStats(
  userId: number | string,
  allEvents: Array<{ id: number; creatorId?: number | null }> = []
): UserStats {
  const localStats = getUserStats(userId);
  const numId = Number(userId);

  // Real events created by this user
  const realCreatedCount = allEvents.filter(
    (e) => e.creatorId === numId || (!isNaN(numId) && Number(e.creatorId) === numId)
  ).length;

  return {
    participatedEventsCount: localStats.participatedEventIds.length,
    participatedEventIds: localStats.participatedEventIds,
    createdEventsCount: realCreatedCount > 0 ? realCreatedCount : localStats.createdEventsCount,
    routesCalculatedCount: localStats.routesCalculatedCount,
    feedbacksSentCount: localStats.feedbacksSentCount,
  };
}
