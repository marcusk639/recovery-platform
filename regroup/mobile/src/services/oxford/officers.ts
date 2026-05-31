import { firestore } from '../../../firebase-setup';
import { Officer, OfficerRole } from '../../entities/oxford/Officer';
import { logException } from '../../util/logging';

export async function getOfficers(houseId: string): Promise<Officer[]> {
  try {
    const snapshot = await firestore
      .collection('houses')
      .doc(houseId)
      .collection('officers')
      .where('isActive', '==', true)
      .get();

    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Officer));
  } catch (error) {
    logException(error);
    throw new Error('Failed to load officers');
  }
}

export async function removeOfficer(
  houseId: string,
  officerId: string,
): Promise<void> {
  try {
    await firestore
      .collection('houses')
      .doc(houseId)
      .collection('officers')
      .doc(officerId)
      .update({ isActive: false });
  } catch (error) {
    logException(error);
    throw new Error('Failed to remove officer');
  }
}

export async function setOfficer(
  houseId: string,
  officer: Omit<Officer, 'id'>,
): Promise<void> {
  try {
    const officersRef = firestore
      .collection('houses')
      .doc(houseId)
      .collection('officers');

    // Find existing active officer with the same role
    const existing = await officersRef
      .where('role', '==', officer.role)
      .where('isActive', '==', true)
      .get();

    const batch = firestore.batch();

    // Deactivate any existing officer with this role
    existing.docs.forEach(doc => {
      batch.update(doc.ref, { isActive: false });
    });

    // Create the new officer document
    const newOfficerRef = officersRef.doc();
    batch.set(newOfficerRef, {
      ...officer,
      id: newOfficerRef.id,
      houseId,
      isActive: true,
      electedAt: new Date().toISOString(),
    });

    await batch.commit();
  } catch (error) {
    logException(error);
    throw new Error('Failed to set officer');
  }
}
