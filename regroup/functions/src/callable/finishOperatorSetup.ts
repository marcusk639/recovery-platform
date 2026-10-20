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
 * Caps the house reads one call can trigger. `subscriptionMetadata.houses` is
 * server-written (rules let a client create it only empty); ownership is still
 * verified by `house.ownerId === uid`. Legitimate
 * houses beyond the first MAX_CANDIDATE_HOUSES candidates are not recovered;
 * that case is logged as `truncated`.
 */
export const MAX_CANDIDATE_HOUSES = 25;

const stringKeys = (ids: unknown): string[] =>
  Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id !== '') : [];

/**
 * Candidate house ids: `housesOwned` first, then the subscription houses map
 * keys, deduped. housesOwned is client-writable and the map is server-written;
 * neither is trusted alone: ownership is verified against the house doc.
 */
const candidateHouseIds = (user: Partial<User> | undefined): string[] =>
  Array.from(
    new Set([
      ...stringKeys(user?.housesOwned),
      ...Object.keys(user?.subscriptionMetadata?.houses ?? {}),
    ]),
  );

/**
 * House ids the caller provably owns: the first MAX_CANDIDATE_HOUSES
 * candidates (read in one getAll) whose house doc exists with
 * `ownerId === uid`. Every other candidate is ignored.
 */
const ownedHouseIds = async (uid: string, candidates: string[]): Promise<string[]> => {
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
  // Skips the grant for completed operators (not a security boundary).
  if (user?.orgSetupCompleted === true) {
    return { completed: true, houseIds: [] };
  }
  const allCandidates = candidateHouseIds(user);
  const candidates = allCandidates.slice(0, MAX_CANDIDATE_HOUSES);
  const houseIds = await ownedHouseIds(uid, candidates);
  if (houseIds.length === 0) {
    logger.warn('finishOperatorSetup: no owned houses found', {
      uid,
      candidateCount: candidates.length,
      ownedCount: houseIds.length,
      truncated: allCandidates.length > candidates.length,
    });
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

  logger.info('operator.setup.finished', {
    uid,
    houseIds,
    truncated: allCandidates.length > candidates.length,
  });
  return { completed: true, houseIds };
});
