/**
 * Guest-doc writes in batches the security rules can evaluate.
 *
 * A status, moveOutDate or house change, a delete or an account-linked create
 * of a guest doc makes the rules read the house-roles record of the doc's
 * account (firestore.rules, guests block), plus the caller's own record once
 * per batch; a batch may make at most 20 such reads. Its only user,
 * services/house updateHouseBatch, has no caller; the app removes and
 * discharges one guest doc at a time, so the limit does not affect it.
 */
import type { WriteBatch } from '@react-native-firebase/firestore';

export const GUEST_BATCH_SIZE = 8;

/** One guest doc's writes (its archive copy included) in a batch. */
export type GuestBatchOp = (batch: WriteBatch) => void;

/** Commits the ops GUEST_BATCH_SIZE at a time; resolves when every batch has. */
export async function commitGuestOps(
  newBatch: () => WriteBatch,
  ops: GuestBatchOp[],
): Promise<void> {
  const commits: Promise<void>[] = [];
  for (let i = 0; i < ops.length; i += GUEST_BATCH_SIZE) {
    const batch = newBatch();
    ops.slice(i, i + GUEST_BATCH_SIZE).forEach((op) => op(batch));
    commits.push(batch.commit());
  }
  await Promise.all(commits);
}
