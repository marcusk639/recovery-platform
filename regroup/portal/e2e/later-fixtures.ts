// Reads and seeds for the later areas: beds, drug tests, issues, complaints, reports.
import type { DocumentData } from 'firebase-admin/firestore';
import { admin } from './helpers';

export const HOUSE = 'test-house-123';

export async function houseData(houseId = HOUSE): Promise<DocumentData> {
  return (await admin().doc(`houses/${houseId}`).get()).data() ?? {};
}

// Residents add issues and complaints to the house's maps only (Personal.tsx).
export const putIssues = (map: object, houseId = HOUSE) =>
  admin().doc(`houses/${houseId}`).update({ issues: map });
export const putComplaints = (map: object, houseId = HOUSE) =>
  admin().doc(`houses/${houseId}`).update({ complaints: map });

export async function drugTests(guestId: string): Promise<DocumentData[]> {
  const snap = await admin().collection('drug-tests').where('guestId', '==', guestId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
