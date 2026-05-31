/**
 * Pure streak computation logic — no Firebase dependencies.
 * Shared between Cloud Functions tests and mobile (via shared-utils or copy).
 */

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCheckIn: string | null; // YYYY-MM-DD (UTC) or null
  checkInDates: string[]; // last 30 days YYYY-MM-DD (UTC)
}

/** Returns YYYY-MM-DD for yesterday (UTC) relative to today */
function yesterdayRelativeTo(todayStr: string): string {
  const [year, month, day] = todayStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure streak computation. Returns updated StreakData.
 *
 * Rules:
 * - If lastCheckIn === dateStr → no-op (already checked in)
 * - If lastCheckIn === yesterday → consecutive, increment streak
 * - Otherwise → reset to 1
 * - longestStreak tracks the maximum ever currentStreak
 * - checkInDates keeps up to the last 30 entries (UTC YYYY-MM-DD)
 */
export function computeStreak(
  current: StreakData | null,
  dateStr: string
): StreakData {
  const prev: StreakData = current ?? {
    currentStreak: 0,
    longestStreak: 0,
    lastCheckIn: null,
    checkInDates: [],
  };

  // Already checked in today — no-op
  if (prev.lastCheckIn === dateStr) {
    return prev;
  }

  let newStreak: number;

  if (prev.lastCheckIn === null) {
    // First ever check-in
    newStreak = 1;
  } else if (prev.lastCheckIn === yesterdayRelativeTo(dateStr)) {
    // Consecutive day
    newStreak = prev.currentStreak + 1;
  } else {
    // Gap of 2+ days — reset
    newStreak = 1;
  }

  const longestStreak = Math.max(prev.longestStreak, newStreak);

  // Keep at most 30 entries; deduplicate today's date
  const updatedDates = [
    ...prev.checkInDates.filter((d) => d !== dateStr),
    dateStr,
  ].slice(-30);

  return {
    currentStreak: newStreak,
    longestStreak,
    lastCheckIn: dateStr,
    checkInDates: updatedDates,
  };
}
