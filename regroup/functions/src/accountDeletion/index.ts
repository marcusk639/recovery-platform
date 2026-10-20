import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { ratsFirestore, userCollection } from '../api/firestore';
import { deleteCustomer } from '../api/stripeDeletion';
import { closeOperatorAccount, OperatorDeletionUser } from './operatorRecords';
import { dischargeResident, removeStaffAdmin, scrubArchivedGuest } from './memberRecords';
import { deletePersonalData } from './personalData';
import { DeletionTargets, mergeTargets, snapshotTargets, TargetUser } from './targets';

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

/**
 * Attach the failed step, and whether earlier steps already removed data, so
 * the callable can log the step and tell the user. Never replaces the error.
 */
function tagStep(err: unknown, step: DeletionStep, partial: boolean): unknown {
  if (typeof err === 'object' && err !== null) {
    try {
      Object.assign(err, { step, partial });
    } catch {
      // Frozen error objects keep their original shape.
    }
  }
  return err;
}

/** Whether running `step` for these targets removes anything. */
function stepActs(step: DeletionStep, t: DeletionTargets): boolean {
  switch (step) {
    case 'operator':
      return t.ownsHouses || t.hasSubscription;
    case 'members':
      return (
        t.guestIds.length > 0 ||
        t.adminIds.length > 0 ||
        (t.archivedGuestIds ?? []).length > 0 ||
        (t.guestCustomerIds ?? []).length > 0
      );
    default:
      return true;
  }
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
 * The Auth user is deleted last.
 *
 * A resumed run merges a fresh snapshot into the stored one, so data created
 * since the first attempt is included while ids of already-deleted docs are kept.
 *
 * A failure, including a failed progress write, logs the step plus the error's
 * code and message. Those messages are expected to carry ids rather than
 * personal data, but that is not guaranteed for every dependency. The failure
 * record holds only the step and time, and the original error is rethrown with
 * `step` and `partial` (earlier steps already removed data) attached.
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
  const fresh = await snapshotTargets(uid, user);
  const targets = record.targets ? mergeTargets(record.targets, fresh) : fresh;
  await ref.set(
    record.targets ? { targets } : { targets, completed, startedAt: now },
    { merge: true },
  );

  const lastStep = DELETION_STEPS[DELETION_STEPS.length - 1];
  let current: DeletionStep = DELETION_STEPS[0];
  let stepRan = false;
  try {
    for (const step of DELETION_STEPS) {
      if (completed.includes(step)) continue;
      current = step;
      stepRan = false;
      await runStep(step, uid, user, targets, now);
      stepRan = true;
      await ref.set({ completed: [...completed, step] }, { merge: true });
      completed.push(step);
    }
    current = lastStep;
    stepRan = true;
    await ref.set({ lastError: null, completedAt: now }, { merge: true });
  } catch (err) {
    const partial =
      completed.some((s) => stepActs(s, targets)) || (stepRan && stepActs(current, targets));
    const e = err as { code?: unknown; message?: unknown } | undefined;
    logger.error('accountDeletion: step failed', {
      uid,
      step: current,
      phase: stepRan ? 'record' : 'run',
      code: e?.code,
      message: e?.message,
    });
    try {
      await ref.set({ lastError: current, failedAt: now }, { merge: true });
    } catch (recordErr) {
      logger.error('accountDeletion: failure record not written', {
        uid,
        step: current,
        code: (recordErr as { code?: unknown } | undefined)?.code,
      });
    }
    throw tagStep(err, current, partial);
  }

  logger.info('accountDeletion: complete');
  return { completed };
}
