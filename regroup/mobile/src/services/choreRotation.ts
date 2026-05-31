import { firestore } from '../../firebase-setup';
import { ChoreRotation } from '../entities/Chore';
import { logException } from '../util/logging';

const choreRotationsCollection = firestore.collection('choreRotations');

function currentSundayISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

export async function getRotation(
  houseId: string,
): Promise<ChoreRotation | null> {
  try {
    const doc = await choreRotationsCollection.doc(houseId).get();
    if (!doc.exists) return null;
    return doc.data() as ChoreRotation;
  } catch (error) {
    logException(error);
    throw new Error('Failed to fetch chore rotation');
  }
}

export async function setRotationOrder(
  houseId: string,
  choreName: string,
  guestIds: string[],
): Promise<void> {
  try {
    const rotation: ChoreRotation = {
      choreName,
      guestIds,
      currentIndex: 0,
      lastRotatedAt: currentSundayISO(),
    };
    await choreRotationsCollection.doc(houseId).set(rotation);
  } catch (error) {
    logException(error);
    throw new Error('Failed to set rotation order');
  }
}

export async function advanceRotation(houseId: string): Promise<void> {
  try {
    const doc = await choreRotationsCollection.doc(houseId).get();
    if (!doc.exists) throw new Error('No rotation configured for this house');
    const rotation = doc.data() as ChoreRotation;
    const nextIndex = (rotation.currentIndex + 1) % rotation.guestIds.length;
    await choreRotationsCollection.doc(houseId).update({
      currentIndex: nextIndex,
      lastRotatedAt: currentSundayISO(),
    });
  } catch (error) {
    logException(error);
    throw new Error('Failed to advance chore rotation');
  }
}

export async function getCurrentAssignee(
  houseId: string,
): Promise<string | null> {
  try {
    const rotation = await getRotation(houseId);
    if (!rotation || rotation.guestIds.length === 0) return null;
    return rotation.guestIds[rotation.currentIndex] ?? null;
  } catch (error) {
    logException(error);
    throw new Error('Failed to get current chore assignee');
  }
}
