import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { firestore } from '../../firebase-setup';
import { ChoreRotation } from '../entities/Chore';
import { logException } from '../util/logging';

const choreRotationsCollection = collection(firestore, 'choreRotations');

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
    const rotationDoc = await getDoc(doc(choreRotationsCollection, houseId));
    if (!rotationDoc.exists()) return null;
    return rotationDoc.data() as ChoreRotation;
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
    await setDoc(doc(choreRotationsCollection, houseId), rotation);
  } catch (error) {
    logException(error);
    throw new Error('Failed to set rotation order');
  }
}

export async function advanceRotation(houseId: string): Promise<void> {
  try {
    const rotationDoc = await getDoc(doc(choreRotationsCollection, houseId));
    if (!rotationDoc.exists()) throw new Error('No rotation configured for this house');
    const rotation = rotationDoc.data() as ChoreRotation;
    const nextIndex = (rotation.currentIndex + 1) % rotation.guestIds.length;
    await updateDoc(doc(choreRotationsCollection, houseId), {
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
