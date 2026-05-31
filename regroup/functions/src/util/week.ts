import Week from '../entities/Week';
import each from 'lodash/each';

// ---------------------------------------------------------------------------
// New normalized week utilities (v2 data model)
// ---------------------------------------------------------------------------

/**
 * Build a week document ID from guestId and week start date.
 * Format: {guestId}_{YYYY-MM-DD}
 */
export function buildWeekId(guestId: string, weekStart: string): string {
  return `${guestId}_${weekStart}`;
}

/**
 * Get the next week's Monday start date from any ISO date string.
 * @param fromDate - ISO date string YYYY-MM-DD
 * @returns ISO date string YYYY-MM-DD of the next Monday
 */
export function getNextWeekStart(fromDate: string): string {
  const date = new Date(fromDate + 'T00:00:00Z');
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon
  const daysUntilNextMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(date);
  nextMonday.setUTCDate(date.getUTCDate() + daysUntilNextMonday);
  return nextMonday.toISOString().split('T')[0];
}

/**
 * Get the current week's Monday start date.
 */
export function getCurrentWeekStart(date: Date = new Date()): string {
  const dayOfWeek = date.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - daysToMonday);
  return monday.toISOString().split('T')[0];
}

export const sumStat = (week: Week, stat: string) => {
  let count = 0;
  each(week.days, (day) => {
    // Cast to Record for dynamic stat key access — Day fields are not index-signed
    const d = day as unknown as Record<string, unknown>;
    if (Array.isArray(d[stat])) {
      count += (d[stat] as unknown[]).length;
    } else if (typeof d[stat] === 'boolean') {
      count += d[stat] ? 1 : 0;
    } else if (typeof d[stat] === 'object' && d[stat] !== null) {
      const obj = d[stat] as Record<string, number>;
      Object.getOwnPropertyNames(obj).forEach((key) => {
        if (obj[key]) {
          count += obj[key];
        }
      });
    } else {
      count += d[stat] as number;
    }
  });
  return count;
};
