import { firestore } from '../../firebase-setup';
import { PartialHouseWithId } from '../entities/House';
import { PartialGuestWithId } from '../entities/Guest';
import { Notification } from '../entities/Notification';
import { Dispute } from '../entities/Dispute';
import * as crud from './crud';

const houseCollection = firestore.collection('houses');
const guestCollection = firestore.collection('guests');
const notificationCollection = firestore.collection('notifications');
const disputesCollection = firestore.collection('disputes');

export function updateDispute(
  house: PartialHouseWithId,
  guest: PartialGuestWithId,
  notifications: Notification[],
  resolvedDispute?: Dispute,
) {
  const batch = firestore.batch();
  batch.update(houseCollection.doc(house.id), house);
  batch.update(guestCollection.doc(guest.id), guest);
  if (resolvedDispute) {
    batch.set(disputesCollection.doc(resolvedDispute.id), resolvedDispute);
  }
  notifications.forEach(notification => {
    const newNoteRef = notificationCollection.doc();
    batch.set(newNoteRef, notification);
  });
  return batch.commit();
}

export async function createDispute(dispute: Dispute): Promise<Dispute> {
  return crud.create<Dispute>(disputesCollection, dispute, dispute.id);
}
