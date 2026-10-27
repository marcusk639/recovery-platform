import { auth } from 'firebase-admin';

/**
 * Which guest docs are real members of a house.
 *
 * Firestore rules used to let any signed-in user create a guest doc in ANY
 * house, as long as the doc named their own uid. Those "ghost" docs were then
 * counted by the money math that runs over a house's guests (the EES split in
 * onGuestWrite). The rules now require a guest claim for the house, but docs
 * created before that fix may still exist, and the money math should not
 * depend on the rules alone.
 *
 * The signal is the account's custom claims. They are written only by server
 * callables (redeemInvitation, addGuestAuthorization and the admin grants),
 * never by a client, so a client cannot fake one by writing a guest doc.
 *
 * - No userId: an admin-entered resident (intake form, CSV import). Only a
 *   house admin can create a guest doc without the creator's own uid, under
 *   both the old and the new rules, so these count.
 * - userId with a guest, admin or superAdmin claim for the house: a member.
 * - userId with no claim for the house, or no account at all: not counted.
 * - userId that cannot be a Firebase uid (not a string, over 128 characters,
 *   or containing a slash): not counted, and never sent to getUsers(), which
 *   would reject the whole house's lookup over one bad identifier.
 */

/** The subset of the Admin Auth client used here, so tests can pass a fake. */
export interface ClaimsAuthClient {
  getUsers(identifiers: { uid: string }[]): Promise<{
    users: { uid: string; customClaims?: Record<string, unknown> }[];
  }>;
}

export type Membership =
  | 'no-account'
  | 'member'
  | 'no-claim'
  | 'account-missing'
  | 'invalid-userid'
  | 'no-house';

interface GuestLike {
  userId?: unknown;
  houseId?: unknown;
}

/** Admin SDK getUsers() accepts at most 100 identifiers per call. */
const GET_USERS_LIMIT = 100;

const HOUSE_ROLES = ['guest', 'admin', 'superAdmin'] as const;

/**
 * True when the claims grant any house role for houseId. Accepts the current
 * map shape ({ [houseId]: true }) and the legacy array shape ([houseId]).
 */
export function holdsHouseRole(
  claims: Record<string, unknown> | null | undefined,
  houseId: string,
): boolean {
  if (!claims) return false;
  return HOUSE_ROLES.some((role) => {
    const value = claims[role];
    if (Array.isArray(value)) return value.includes(houseId);
    if (value != null && typeof value === 'object') {
      return Object.prototype.hasOwnProperty.call(value, houseId);
    }
    return false;
  });
}

/** Firebase Auth uids are 1-128 characters; a slash is never valid. */
const MAX_UID_LENGTH = 128;

/**
 * True for a value that could be a Firebase uid. getUsers() rejects the whole
 * call on one malformed identifier, so anything else is filtered out first.
 */
export function isPlausibleUid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_UID_LENGTH &&
    !value.includes('/')
  );
}

/** No userId at all: undefined, null or "" (admin-entered residents). */
function hasNoUserId(guest: GuestLike): boolean {
  return guest.userId === undefined || guest.userId === null || guest.userId === '';
}

function userIdOf(guest: GuestLike): string | undefined {
  return isPlausibleUid(guest.userId) ? guest.userId : undefined;
}

/**
 * Classifies one guest doc. claimsByUid maps uid to that account's custom
 * claims, or to null when no such account exists. houseId defaults to the
 * doc's own houseId.
 */
export function classifyGuestMembership(
  guest: GuestLike,
  claimsByUid: Map<string, Record<string, unknown> | null>,
  houseId?: string,
): Membership {
  const house = houseId ?? (typeof guest.houseId === 'string' ? guest.houseId : '');
  if (!house) return 'no-house';
  if (hasNoUserId(guest)) return 'no-account';
  const uid = userIdOf(guest);
  if (!uid) return 'invalid-userid';
  const claims = claimsByUid.get(uid);
  if (claims === null || claims === undefined) return 'account-missing';
  return holdsHouseRole(claims, house) ? 'member' : 'no-claim';
}

/**
 * Looks up custom claims for each distinct uid. Accounts that do not exist
 * map to null. Errors propagate: a caller computing money must not guess.
 */
export async function fetchClaimsByUid(
  uids: string[],
  authClient: ClaimsAuthClient = auth(),
): Promise<Map<string, Record<string, unknown> | null>> {
  const unique = [...new Set(uids.filter(isPlausibleUid))];
  const result = new Map<string, Record<string, unknown> | null>();
  for (const uid of unique) result.set(uid, null);

  for (let i = 0; i < unique.length; i += GET_USERS_LIMIT) {
    const chunk = unique.slice(i, i + GET_USERS_LIMIT).map((uid) => ({ uid }));
    const { users } = await authClient.getUsers(chunk);
    for (const user of users) result.set(user.uid, user.customClaims ?? {});
  }
  return result;
}

/**
 * Returns the guests that count as members of houseId, in input order. A uid
 * with more than one guest doc in the house is counted once (first doc kept).
 */
export async function selectLegitimateGuests<T extends GuestLike>(
  guests: T[],
  houseId: string,
  authClient: ClaimsAuthClient = auth(),
): Promise<T[]> {
  const uids = guests.map(userIdOf).filter((uid): uid is string => uid !== undefined);
  const claimsByUid = await fetchClaimsByUid(uids, authClient);

  const seen = new Set<string>();
  return guests.filter((guest) => {
    const membership = classifyGuestMembership(guest, claimsByUid, houseId);
    if (membership === 'no-account') return true;
    const uid = userIdOf(guest);
    if (membership !== 'member' || !uid || seen.has(uid)) return false;
    seen.add(uid);
    return true;
  });
}
