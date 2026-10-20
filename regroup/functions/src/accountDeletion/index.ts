import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import {
  adminCollection,
  guestCollection,
  houseCollection,
  ratsFirestore,
  userCollection,
} from '../api/firestore';
import { closeOperatorAccount, OperatorDeletionUser } from './operatorRecords';
import { dischargeResident, removeStaffAdmin } from './memberRecords';
import { deletePersonalData } from './personalData';

export type DeletionStep = 'operator' | 'members' | 'personal' | 'userDoc' | 'auth';

export const DELETION_STEPS: readonly DeletionStep[] = [
  'operator',
  'members',
  'personal',
  'userDoc',
  'auth',
];

/**
 * What the run will act on, captured once on the first run. The "members" step
 * deletes the guest docs that "personal" still needs (guest ids and houses for
 * avatar paths), so a resumed run must read this snapshot, never re-query.
 */
export interface DeletionTargets {
  guestIds: string[];
  houseIdsByGuest: Record<string, string>;
  adminIds: string[];
  ownsHouses: boolean;
  hasSubscription: boolean;
}

interface DeletionRecord {
  completed?: DeletionStep[];
  targets?: DeletionTargets;
}

const deletionDoc = (uid: string) => ratsFirestore.collection('accountDeletions').doc(uid);

async function loadUser(uid: string): Promise<OperatorDeletionUser> {
  const snap = await userCollection.doc(uid).get();
  const data = snap.exists ? (snap.data() as Partial<OperatorDeletionUser>) : {};
  return { ...data, id: uid };
}

async function snapshotTargets(uid: string, user: OperatorDeletionUser): Promise<DeletionTargets> {
  const [guests, admins, houses] = await Promise.all([
    guestCollection.where('userId', '==', uid).get(),
    adminCollection.where('userId', '==', uid).get(),
    houseCollection.where('ownerId', '==', uid).get(),
  ]);
  const houseIdsByGuest: Record<string, string> = {};
  for (const doc of guests.docs) {
    const houseId = (doc.data() as { houseId?: string }).houseId;
    if (houseId) houseIdsByGuest[doc.id] = houseId;
  }
  const { subscriptionId, customerId } = user.subscriptionMetadata ?? {};
  return {
    guestIds: guests.docs.map((d) => d.id),
    houseIdsByGuest,
    adminIds: admins.docs.map((d) => d.id),
    ownsHouses: !houses.empty,
    hasSubscription: Boolean(subscriptionId || customerId),
  };
}

async function deleteAuthUser(uid: string): Promise<void> {
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
}

async function runStep(
  step: DeletionStep,
  uid: string,
  user: OperatorDeletionUser,
  targets: DeletionTargets,
  now: string,
): Promise<void> {
  switch (step) {
    case 'operator':
      if (targets.ownsHouses || targets.hasSubscription) await closeOperatorAccount(user, now);
      return;
    case 'members':
      for (const guestId of targets.guestIds) await dischargeResident(guestId, now);
      for (const adminId of targets.adminIds) await removeStaffAdmin(adminId);
      return;
    case 'personal':
      await deletePersonalData(uid, targets.guestIds, targets.houseIdsByGuest);
      return;
    case 'userDoc':
      await userCollection.doc(uid).delete();
      return;
    case 'auth':
      await deleteAuthUser(uid);
      return;
  }
}

/**
 * Delete a Regroup account. Runs each step in order, recording progress in
 * `accountDeletions/{uid}` so a failed run resumes where it stopped. Skipped
 * steps (non-operators, users with no member docs) are recorded as completed.
 * The Auth user is deleted last. Failures record the step and time only (no
 * error text, which may carry PII) and are rethrown.
 */
export async function runAccountDeletion(
  uid: string,
  now: string = new Date().toISOString(),
): Promise<{ completed: DeletionStep[] }> {
  const ref = deletionDoc(uid);
  const recordSnap = await ref.get();
  const record = (recordSnap.exists ? recordSnap.data() : {}) as DeletionRecord;
  const completed: DeletionStep[] = [...(record.completed ?? [])];

  const user = await loadUser(uid);
  let targets = record.targets;
  if (!targets) {
    targets = await snapshotTargets(uid, user);
    await ref.set({ targets, completed, startedAt: now }, { merge: true });
  }

  for (const step of DELETION_STEPS) {
    if (completed.includes(step)) continue;
    try {
      await runStep(step, uid, user, targets, now);
    } catch (err) {
      await ref.set({ lastError: step, failedAt: now }, { merge: true });
      logger.error('accountDeletion: step failed');
      throw err;
    }
    completed.push(step);
    await ref.set({ completed }, { merge: true });
  }

  await ref.set({ lastError: null, completedAt: now }, { merge: true });
  logger.info('accountDeletion: complete');
  return { completed };
}
