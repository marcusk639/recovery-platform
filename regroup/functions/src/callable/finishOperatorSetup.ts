import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { houseCollection, ratsFirestore, userCollection } from '../api/firestore';
import type { User } from '../entities/User';
import { writeOperatorSetupFlags } from '../houses/operatorSetup';
import { grantHouseRoles } from '../util/claims';

export type FinishOperatorSetupResponse =
  { completed: false } | { completed: true; houseIds: string[] };

const errorCode = (err: unknown): string | undefined => (err as { code?: string })?.code;

/**
 * The subscription houses map is client-seedable, so only this many of its
 * keys are considered: it bounds the house reads one call can trigger.
 */
export const MAX_CANDIDATE_HOUSES = 25;

/**
 * House ids the caller provably owns: ids in the `subscriptionMetadata.houses`
 * map (at most MAX_CANDIDATE_HOUSES, read in one getAll) whose house doc
 * exists with `ownerId === uid`. Anything else in the map is ignored.
 */
const ownedHouseIds = async (uid: string, user: Partial<User> | undefined): Promise<string[]> => {
  const candidates = Object.keys(user?.subscriptionMetadata?.houses ?? {}).slice(
    0,
    MAX_CANDIDATE_HOUSES,
  );
  if (candidates.length === 0) {
    return [];
  }
  const snaps = await ratsFirestore.getAll(...candidates.map((id) => houseCollection.doc(id)));
  return candidates.filter((_id, i) => {
    const snap = snaps[i];
    return snap.exists && (snap.data() as { ownerId?: string } | undefined)?.ownerId === uid;
  });
};

/**
 * Recovers an operator whose houses were created by createHouses but whose
 * claim grant or onboarding-flags write failed (e.g. the app restarted before
 * a retry). Grants admin + superAdmin on the houses the caller provably owns,
 * then sets OPERATOR_SETUP_FIELDS — the same post-transaction steps
 * createHouses performs, in the same order. Takes no input: the house set is
 * derived entirely from server-side data. Idempotent; safe to call on every
 * login. Returns `{ completed: true, houseIds: [] }` without granting when setup
 * is already complete, and `{ completed: false }` when the caller owns no houses.
 */
export const finishOperatorSetup = onCall(async (request): Promise<FinishOperatorSetupResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;
  const userSnap = await userCollection.doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() as Partial<User>) : undefined;
  // Already-completed operators are never re-granted.
  if (user?.orgSetupCompleted === true) {
    return { completed: true, houseIds: [] };
  }
  const houseIds = await ownedHouseIds(uid, user);
  if (houseIds.length === 0) {
    return { completed: false };
  }

  try {
    await grantHouseRoles(uid, houseIds);
  } catch (err) {
    logger.error('finishOperatorSetup: claim grant failed', {
      uid,
      houseIds,
      code: errorCode(err),
    });
    throw new HttpsError(
      'internal',
      'Houses were created but access could not be granted. Try again.',
    );
  }

  try {
    await writeOperatorSetupFlags(uid);
  } catch (err) {
    logger.error('finishOperatorSetup: onboarding flags update failed', {
      uid,
      houseIds,
      code: errorCode(err),
    });
    throw new HttpsError('internal', 'Houses were created but setup could not finish. Try again.');
  }

  logger.info('operator.setup.finished', { uid, houseIds });
  return { completed: true, houseIds };
});
