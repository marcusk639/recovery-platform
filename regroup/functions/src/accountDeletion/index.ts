import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { ratsFirestore, userCollection } from '../api/firestore';
import { BillingNotVerifiedError, deleteGuestCustomer } from '../api/stripeDeletion';
import { unlinkHouseRecords } from './houseRecords';
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
function tagStep(err: unknown, step: DeletionStep | 'targets', partial: boolean): unknown {
  if (typeof err === 'object' && err !== null) {
    try {
      Object.assign(err, { step, partial });
    } catch {
      // Frozen error objects keep their original shape.
    }
  }
  return err;
}

const hasNew = (before: string[] = [], after: string[] = []) =>
  after.some((id) => !before.includes(id));

/**
 * Completed steps that must run again because a resumed run's merged targets
 * hold something new for them. Steps are idempotent, so re-running is safe.
 */
function stepsToReopen(stored: DeletionTargets, merged: DeletionTargets): DeletionStep[] {
  const steps: DeletionStep[] = [];
  if ((!stored.ownsHouses && merged.ownsHouses) || (!stored.hasSubscription && merged.hasSubscription)) {
    steps.push('operator');
  }
  const newGuests =
    hasNew(stored.guestIds, merged.guestIds) ||
    hasNew(stored.archivedGuestIds, merged.archivedGuestIds);
  if (
    newGuests ||
    hasNew(stored.adminIds, merged.adminIds) ||
    hasNew(stored.guestCustomerIds, merged.guestCustomerIds)
  ) {
    steps.push('members');
  }
  if (newGuests || hasNew(Object.keys(stored.houseIdsByGuest), Object.keys(merged.houseIdsByGuest))) {
    steps.push('personal');
  }
  return steps;
}

/** Whether running `step` for these targets removes anything. */
function stepActs(step: DeletionStep, t: DeletionTargets): boolean {
  switch (step) {
    case 'operator':
      return t.ownsHouses || t.hasSubscription;
    // 'members' also unlinks uid-keyed house records (officer seats, staff notes,
    // archived admins) that only a query can find, so it is assumed to act: the
    // safe direction for partial reporting.
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
      for (const customerId of targets.guestCustomerIds ?? []) await deleteGuestCustomer(uid, customerId);
      for (const guestId of targets.guestIds) await dischargeResident(guestId, now);
      for (const guestId of targets.archivedGuestIds ?? []) await scrubArchivedGuest(guestId, now);
      for (const adminId of targets.adminIds) await removeStaffAdmin(adminId);
      await unlinkHouseRecords(
        uid,
        [...targets.guestIds, ...(targets.archivedGuestIds ?? [])],
        targets.houseIdsByGuest,
        now,
      );
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
 * since the first attempt is included while ids of already-deleted docs are kept;
 * a completed step that the new data concerns is re-run.
 *
 * A failure, including a failed snapshot or progress write (tagged `targets`
 * for the snapshot phase), logs the step plus the error's code and message.
 * Those messages are expected to carry ids rather than personal data, but that
 * is not guaranteed for every dependency. The failure record holds the step and
 * time (plus the unverified subscription id and reason when billing could not
 * be verified), and the original error is rethrown with `step` and `partial`
 * (data may already have been removed) attached.
 */
export async function runAccountDeletion(
  uid: string,
  now: string = new Date().toISOString(),
): Promise<{ completed: DeletionStep[] }> {
  const ref = deletionDoc(uid);
  const recordSnap = await ref.get();
  const record = (recordSnap.exists ? recordSnap.data() : {}) as DeletionRecord;
  let completed: DeletionStep[] = [...(record.completed ?? [])];
  const user = await loadUser(uid);

  const lastStep = DELETION_STEPS[DELETION_STEPS.length - 1];
  let current: DeletionStep | 'targets' = 'targets';
  let stepRan = false;
  let targets: DeletionTargets | undefined = record.targets;
  try {
    const fresh = await snapshotTargets(uid, user);
    if (record.targets) {
      targets = mergeTargets(record.targets, fresh);
      const reopen = stepsToReopen(record.targets, targets);
      completed = completed.filter((s) => !reopen.includes(s));
      await ref.set({ targets, completed }, { merge: true });
    } else {
      targets = fresh;
      await ref.set({ targets, completed, startedAt: now }, { merge: true });
    }

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
    // Over-reports when the failing step's first action failed: the safe direction.
    // An unverified operator subscription is thrown before that step acts.
    const t = targets;
    const done = [...(record.completed ?? []), ...completed];
    const billingUnverified = err instanceof BillingNotVerifiedError ? err : undefined;
    const actedInStep = !billingUnverified && current !== 'targets' && t !== undefined && stepActs(current, t);
    const partial = t !== undefined && (done.some((s) => stepActs(s, t)) || actedInStep);
    const e = err as { code?: unknown; message?: unknown } | undefined;
    logger.error('accountDeletion: step failed', {
      uid,
      step: current,
      phase: current !== 'targets' && !stepRan ? 'run' : 'record',
      code: e?.code,
      message: e?.message,
    });
    try {
      await ref.set(
        {
          lastError: current,
          failedAt: now,
          // Durable trail for support: the subscription was not cancelled.
          ...(billingUnverified && {
            billingUnverified: {
              subscriptionId: billingUnverified.subscriptionId,
              reason: billingUnverified.reason,
            },
          }),
        },
        { merge: true },
      );
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
