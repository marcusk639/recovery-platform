import { logger } from 'firebase-functions';
import each from 'lodash/each';
import { houseCollection } from '../api/firestore';
import { House } from '../entities/House';
import { runDisputeTransaction } from '../util/disputes';

/**
 * Runs runDisputeTransaction (util/disputes, which owns the resolution rule)
 * over every house's disputes. Body of the `updateDisputes` scheduled function.
 */
export async function runDisputeUpdates(_now: Date = new Date()): Promise<{ updated: number }> {
  logger.info('Retrieving all houses...');
  const houseQuery = await houseCollection.get();
  logger.info('All houses retrieved. Beginning transaction for each house...');
  const transactionPromises: Promise<unknown>[] = [];
  for (const doc of houseQuery.docs) {
    logger.info('Beginning transaction for house', doc.id);
    try {
      const house = doc.data() as House;
      each(house.disputes, (dispute) => {
        transactionPromises.push(runDisputeTransaction(house, dispute));
      });
    } catch (error) {
      logger.error('updateDisputes: failed processing house', error);
      // Bails on the first malformed house without awaiting transactions already queued.
      return { updated: 0 };
    }
  }
  await Promise.all(transactionPromises);
  return { updated: transactionPromises.length };
}
