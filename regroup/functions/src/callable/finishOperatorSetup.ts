import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { houseCollection, userCollection } from '../api/firestore';
import type { User } from '../entities/User';
import { writeOperatorSetupFlags } from '../houses/operatorSetup';
import { grantHouseRoles } from '../util/claims';

export type FinishOperatorSetupResponse =
  { completed: false } | { completed: true; houseIds: string[] };

const errorCode = (err: unknown): string | undefined => (err as { code?: string })?.code;

/**
 * House ids the caller provably owns: ids in the server-owned
 * `subscriptionMetadata.houses` map whose house doc exists with
 * `ownerId === uid`. Anything else in the map is ignored.
 */
const ownedHouseIds = async (uid: string): Promise<string[]> => {
  const userSnap = await userCollection.doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() as Partial<User>) : undefined;
  const candidates = Object.keys(user?.subscriptionMetadata?.houses ?? {});
  const snaps = await Promise.all(candidates.map((id) => houseCollection.doc(id).get()));
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
 * derived entirely from server-owned data. Idempotent; safe to call on every
 * login. Returns `{ completed: false }` when the caller owns no houses.
 */
export const finishOperatorSetup = onCall(async (request): Promise<FinishOperatorSetupResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;
  const houseIds = await ownedHouseIds(uid);
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
