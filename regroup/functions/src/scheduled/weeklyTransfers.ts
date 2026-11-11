import { logger } from 'firebase-functions';
import { getFailedHouses, getFailedTransfers, transferStats } from '../util/guest';
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
  const failed: string[] = [];
  for (const tz of passes) {
    try {
      const guests = await transferStats(null, tz);
      const count = Object.keys(guests).length;
      transfers += count;
      logger.info(`weeklyTransfers: processed ${count} guests`, {
        timezone: tz ?? '<fallback>',
      });
      // transferStats catches a failing house or resident and carries on; read what
      // it left behind in this pass.
      const residents = getFailedTransfers().length;
      const houses = getFailedHouses().length;
      if (residents > 0 || houses > 0) {
        failed.push(`${tz ?? '<fallback>'} (${residents} resident(s), ${houses} house(s))`);
      }
    } catch (error) {
      logger.error('weeklyTransfers: pass failed', {
        timezone: tz ?? '<fallback>',
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      // One failing timezone must not block the week rollover for the others.
      failed.push(tz ?? '<fallback>');
    }
  }
  // Fail the run once every pass has had its turn, so Cloud Scheduler records the
  // weeks that didn't advance. The schedule sets no retries, so nothing reruns the
  // passes that succeeded.
  if (failed.length > 0) {
    throw new Error(
      `weeklyTransfers: ${failed.length} of ${passes.length} passes failed: ${failed.join(', ')}`,
    );
  }
  return { transfers };
}
