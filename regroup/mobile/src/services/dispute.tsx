import {
  collection,
  doc,
  writeBatch,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { PartialHouseWithId } from '../entities/House';
import { Dispute } from '../entities/Dispute';
import * as crud from './crud';

const houseCollection = collection(firestore, 'houses');
const disputesCollection = collection(firestore, 'disputes');

/**
 * Write house.disputes and optionally archive a dispute to /disputes.
 *
 * The app no longer calls this to open or resolve a dispute: the
 * onActivityWritten Cloud Function adds the house.disputes entry when an
 * activity is disputed, removes and archives it on resolution, and sends the
 * notifications. The rules deny residents house.disputes. The only remaining
 * caller is the (hidden, see the follow-up PR) challenge flow, which only a
 * house admin could now complete.
 */
export function updateDispute(
  house: PartialHouseWithId,
  resolvedDispute?: Dispute,
) {
  const batch = writeBatch(firestore);
  batch.update(doc(houseCollection, house.id), house);
  if (resolvedDispute) {
    batch.set(doc(disputesCollection, resolvedDispute.id), resolvedDispute);
  }
  return batch.commit();
}

export async function createDispute(dispute: Dispute): Promise<Dispute> {
  return crud.create<Dispute>(disputesCollection, dispute, dispute.id);
}
