import { logger } from 'firebase-functions';
import each from 'lodash/each';
import { houseCollection } from '../api/firestore';
import { House } from '../entities/House';
import { runDisputeTransaction } from '../util/disputes';

// firebase-functions logs a plain object's own keys, and an Error's message and
// stack aren't enumerable, so errors inside a metadata object go in as text.
const errorText = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

/**
 * Runs runDisputeTransaction (util/disputes, which owns the resolution rule)
 * over every house's disputes. Body of the `updateDisputes` scheduled function.
 *
 * A house that throws is reported and the rest carry on (disputes it had already
 * queued still run), and every transaction is awaited, so one bad house or
 * dispute doesn't stop the rest. The run still rejects afterwards, so Cloud
 * Scheduler records the failure.
 */
export async function runDisputeUpdates(): Promise<{ updated: number }> {
  logger.info('Retrieving all houses...');
  const houseQuery = await houseCollection.get();
  logger.info('All houses retrieved. Beginning transaction for each house...');
  const transactions: { houseId: string; disputeId?: string; promise: Promise<unknown> }[] = [];
  const failedHouses: string[] = [];
  for (const doc of houseQuery.docs) {
    logger.info('Beginning transaction for house', doc.id);
    try {
      const house = doc.data() as House;
      each(house.disputes, (dispute) => {
        transactions.push({
          houseId: doc.id,
          disputeId: dispute?.id,
          promise: runDisputeTransaction(house, dispute),
        });
      });
    } catch (error) {
      logger.error('updateDisputes: failed processing house', {
        houseId: doc.id,
        error: errorText(error),
      });
      failedHouses.push(doc.id);
    }
  }
  const results = await Promise.allSettled(transactions.map((t) => t.promise));
  const housesWithFailures = new Set<string>();
  let rejected = 0;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const { houseId, disputeId } = transactions[i];
      logger.error('updateDisputes: dispute transaction failed', {
        houseId,
        disputeId,
        error: errorText(r.reason),
      });
      housesWithFailures.add(houseId);
      rejected++;
    }
  });
  const problems: string[] = [];
  if (failedHouses.length > 0) {
    problems.push(`${failedHouses.length} house(s) failed: ${failedHouses.join(', ')}`);
  }
  if (rejected > 0) {
    problems.push(
      `${rejected} of ${results.length} dispute transactions failed ` +
        `(houses: ${[...housesWithFailures].join(', ')})`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`updateDisputes: ${problems.join('; ')}`);
  }
  return { updated: results.length };
}
