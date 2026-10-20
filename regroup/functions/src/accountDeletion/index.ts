import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { ratsFirestore, userCollection } from '../api/firestore';
import { deleteCustomer } from '../api/stripe';
import { closeOperatorAccount, OperatorDeletionUser } from './operatorRecords';
import { dischargeResident, removeStaffAdmin, scrubArchivedGuest } from './memberRecords';
import { deletePersonalData } from './personalData';
import { DeletionTargets, snapshotTargets, TargetUser } from './targets';

export type { DeletionTargets } from './targets';

export type DeletionStep = 'operator' | 'members' | 'personal' | 'userDoc' | 'auth';

export const DELETION_STEPS: readonly DeletionStep[] = [
  'operator',
  'members',
  'personal',
  'userDoc',
  'auth',
];

interface DeletionRecord {
  completed?: DeletionStep[];
  targets?: DeletionTargets;
}

type DeletionUser = OperatorDeletionUser & TargetUser;

const deletionDoc = (uid: string) => ratsFirestore.collection('accountDeletions').doc(uid);

async function loadUser(uid: string): Promise<DeletionUser> {
  const snap = await userCollection.doc(uid).get();
  const data = snap.exists ? (snap.data() as Partial<DeletionUser>) : {};
  return { ...data, id: uid };
}

async function deleteAuthUser(uid: string): Promise<void> {
  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }
}

/** Attach the failed step so the callable can log it; never masks the error. */
function tagStep(err: unknown, step: DeletionStep): unknown {
  if (typeof err === 'object' && err !== null) {
    try {
      (err as { step?: DeletionStep }).step = step;
    } catch {
      // Frozen error objects keep their original shape.
    }
  }
  return err;
}

async function runStep(
  step: DeletionStep,
  uid: string,
  user: DeletionUser,
  targets: DeletionTargets,
  now: string,
): Promise<void> {
  switch (step) {
    case 'operator':
      if (targets.ownsHouses || targets.hasSubscription) await closeOperatorAccount(user, now);
      return;
    case 'members':
      for (const customerId of targets.guestCustomerIds ?? []) await deleteCustomer(customerId);
      for (const guestId of targets.guestIds) await dischargeResident(guestId, now);
      for (const guestId of targets.archivedGuestIds ?? []) await scrubArchivedGuest(guestId, now);
      for (const adminId of targets.adminIds) await removeStaffAdmin(adminId);
      return;
    case 'personal':
      await deletePersonalData(
        uid,
        [...targets.guestIds, ...(targets.archivedGuestIds ?? [])],
        targets.houseIdsByGuest,
      );
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
 * The Auth user is deleted last. A failure logs the step plus the error's code
 * and message (Firestore/Storage/Stripe messages carry ids, not personal data),
 * records the step and time (no error text) and is rethrown with `step` set.
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
      const e = err as { code?: unknown; message?: unknown } | undefined;
      logger.error('accountDeletion: step failed', {
        uid,
        step,
        code: e?.code,
        message: e?.message,
      });
      try {
        await ref.set({ lastError: step, failedAt: now }, { merge: true });
      } catch (recordErr) {
        logger.error('accountDeletion: failure record not written', {
          uid,
          step,
          code: (recordErr as { code?: unknown } | undefined)?.code,
        });
      }
      throw tagStep(err, step);
    }
    completed.push(step);
    await ref.set({ completed }, { merge: true });
  }

  await ref.set({ lastError: null, completedAt: now }, { merge: true });
  logger.info('accountDeletion: complete');
  return { completed };
}
