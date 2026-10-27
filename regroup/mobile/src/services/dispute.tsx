import { firestore } from '../../firebase-setup';
import { PartialHouseWithId } from '../entities/House';
import { Dispute } from '../entities/Dispute';
import * as crud from './crud';

const houseCollection = firestore.collection('houses');
const disputesCollection = firestore.collection('disputes');

/**
 * Mirror a dispute into house.disputes (where its message and challenges
 * live) and, on resolution, archive it to /disputes.
 *
 * It used to also rewrite the disputed resident's guest doc (an unchanged
 * copy) and create the dispute notifications. Both were denied for a peer:
 * only the resident or an admin may update a guest doc, and notifications may
 * only be created for oneself, so the whole batch failed. Notifications are
 * now sent by the onActivityWritten Cloud Function, and the guest write was a
 * no-op. Residents may update house.disputes (not a sensitive house field).
 */
export function updateDispute(
  house: PartialHouseWithId,
  resolvedDispute?: Dispute,
) {
  const batch = firestore.batch();
  batch.update(houseCollection.doc(house.id), house);
  if (resolvedDispute) {
    batch.set(disputesCollection.doc(resolvedDispute.id), resolvedDispute);
  }
  return batch.commit();
}

export async function createDispute(dispute: Dispute): Promise<Dispute> {
  return crud.create<Dispute>(disputesCollection, dispute, dispute.id);
}
