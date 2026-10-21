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

const grantOrThrow = async (uid: string, houseIds: string[]): Promise<void> => {
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
};

const hasHouseClaim = (claim: unknown, houseId: string): boolean =>
  typeof claim === 'object' &&
  claim !== null &&
  (claim as Record<string, unknown>)[houseId] === true;

/**
 * For an operator whose setup is already complete: a house added later can be
 * created (and hold a cap slot) while its claim grant failed. Grants only the
 * owned candidates missing admin or superAdmin from the caller's ID token, so
 * a fully granted operator costs no house reads and no grant. Subscription-map
 * keys (server-written, where createHouses records an added house) come
 * before client-writable housesOwned, so junk housesOwned ids cannot push the
 * real house past MAX_CANDIDATE_HOUSES. A stale token can cause a redundant
 * grant, or skip one whose claim was since removed. Flags are already set.
 */
const grantMissingRoles = async (
  uid: string,
  user: Partial<User>,
  token: Record<string, unknown>,
): Promise<FinishOperatorSetupResponse> => {
  const candidates = Array.from(
    new Set([
      ...Object.keys(user.subscriptionMetadata?.houses ?? {}),
      ...stringKeys(user.housesOwned),
    ]),
  );
  const ungranted = candidates.filter(
    (id) => !hasHouseClaim(token.admin, id) || !hasHouseClaim(token.superAdmin, id),
  );
  const houseIds = await ownedHouseIds(uid, ungranted.slice(0, MAX_CANDIDATE_HOUSES));
  const truncated = ungranted.length > MAX_CANDIDATE_HOUSES;
  if (houseIds.length > 0) {
    await grantOrThrow(uid, houseIds);
    logger.info('operator.setup.claims_repaired', { uid, houseIds, truncated });
  } else if (ungranted.length > 0) {
    // Ungranted candidates, none provably owned (e.g. an ownerId rewritten
    // after the house entered the map). Nothing to grant; logged so a client
    // that keeps asking is visible.
    logger.warn('operator.setup.claims_repair_nothing_owned', {
      uid,
      ungrantedCount: ungranted.length,
      truncated,
    });
  }
  return { completed: true, houseIds };
};

/**
 * Recovers an operator whose houses were created by createHouses but whose
 * claim grant or onboarding-flags write failed (e.g. the app restarted before
 * a retry). Grants admin + superAdmin on the houses the caller provably owns,
 * then sets OPERATOR_SETUP_FIELDS — the same post-transaction steps
 * createHouses performs, in the same order. Takes no input: the house set is
 * derived entirely from server-side data. Idempotent; safe to call on every
 * login. When setup is already complete, only owned houses missing from the
 * caller's claims are granted (see grantMissingRoles). Returns
 * `{ completed: false }` when an incomplete caller owns no houses.
 */
export const finishOperatorSetup = onCall(async (request): Promise<FinishOperatorSetupResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Login required');
  }
  const uid = request.auth.uid;
  const userSnap = await userCollection.doc(uid).get();
  const user = userSnap.exists ? (userSnap.data() as Partial<User>) : undefined;
  if (user?.orgSetupCompleted === true) {
    return grantMissingRoles(uid, user, request.auth.token);
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

  await grantOrThrow(uid, houseIds);

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
