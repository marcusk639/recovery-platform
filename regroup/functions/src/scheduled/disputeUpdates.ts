import { logger } from 'firebase-functions';
import each from 'lodash/each';
import { houseCollection } from '../api/firestore';
import { House } from '../entities/House';
import { runDisputeTransaction } from '../util/disputes';

/**
 * Runs runDisputeTransaction (util/disputes, which owns the resolution rule)
 * over every house's disputes. Body of the `updateDisputes` scheduled function.
 *
 * A house that fails is skipped and every transaction is awaited, so one bad
 * house or dispute doesn't stop the rest. The run still rejects afterwards, so
 * Cloud Scheduler records the failure.
 */
export async function runDisputeUpdates(): Promise<{ updated: number }> {
  logger.info('Retrieving all houses...');
  const houseQuery = await houseCollection.get();
  logger.info('All houses retrieved. Beginning transaction for each house...');
  const transactionPromises: Promise<unknown>[] = [];
  const failedHouses: string[] = [];
  for (const doc of houseQuery.docs) {
    logger.info('Beginning transaction for house', doc.id);
    try {
      const house = doc.data() as House;
      each(house.disputes, (dispute) => {
        transactionPromises.push(runDisputeTransaction(house, dispute));
      });
    } catch (error) {
      logger.error('updateDisputes: failed processing house', { houseId: doc.id, error });
      failedHouses.push(doc.id);
    }
  }
  const results = await Promise.allSettled(transactionPromises);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const r of rejected) {
    logger.error('updateDisputes: dispute transaction failed', r.reason);
  }
  const problems: string[] = [];
  if (failedHouses.length > 0) {
    problems.push(`${failedHouses.length} house(s) failed: ${failedHouses.join(', ')}`);
  }
  if (rejected.length > 0) {
    problems.push(`${rejected.length} of ${results.length} dispute transactions failed`);
  }
  if (problems.length > 0) {
    throw new Error(`updateDisputes: ${problems.join('; ')}`);
  }
  return { updated: results.length };
}
