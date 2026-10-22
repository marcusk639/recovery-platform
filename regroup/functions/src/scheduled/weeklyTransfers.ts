import { logger } from 'firebase-functions';
import { transferStats } from '../util/guest';
import { WEEKLY_TRANSFER_TIMEZONES, FALLBACK_TIMEZONE } from '../util/timezones';

/**
 * Consolidated weekly transfer run: iterates all supported timezones and calls
 * transferStats() for each, then a final fallback pass for houses with no
 * timezone. Body of the `weeklyTransfers` scheduled function. See the wrapper
 * in `./index.ts` for the schedule rationale.
 */
export async function runWeeklyTransfers(now: Date = new Date()): Promise<{ transfers: number }> {
  logger.info('weeklyTransfers: starting consolidated weekly run', {
    scheduledTime: Number.isNaN(now.getTime()) ? undefined : now.toISOString(),
    timezones: WEEKLY_TRANSFER_TIMEZONES,
  });

  const passes: (string | null)[] = [...WEEKLY_TRANSFER_TIMEZONES, FALLBACK_TIMEZONE];

  let transfers = 0;
  for (const tz of passes) {
    try {
      const guests = await transferStats(null, tz);
      const count = Object.keys(guests).length;
      transfers += count;
      logger.info(`weeklyTransfers: processed ${count} guests`, {
        timezone: tz ?? '<fallback>',
      });
    } catch (error) {
      logger.error('weeklyTransfers: pass failed', {
        timezone: tz ?? '<fallback>',
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // Continue to next pass — do not rethrow.
    }
  }
  return { transfers };
}
