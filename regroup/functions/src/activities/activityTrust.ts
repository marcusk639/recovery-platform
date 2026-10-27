/**
 * Which activities may count toward a guest's week summary.
 *
 * The activity document is client-written, so its guestId, houseId and
 * loggedBy are claims, not facts. Taking them at face value let any signed-in
 * user inflate another resident's week (log an activity with their guestId),
 * or re-parent a victim's summary to another house (its houseId came from the
 * activity). So the summary's house comes from `guests/{guestId}`, and an
 * activity counts only when:
 *   - its houseId is the guest's house, and
 *   - it was logged by the resident themselves (`guests.userId`) or by an
 *     admin/superAdmin of that house.
 *
 * Admin membership is read from Firebase Auth custom claims (`admin` /
 * `superAdmin` maps keyed by houseId), the same source the rules' isAdmin()
 * uses. house.adminIds is not used: it is maintained by the client and is not
 * kept in sync with claim revocation. Claims are current state, so an activity
 * logged by someone who has since lost admin no longer counts on the next
 * recompute; the backfill dry run reports how many activities are excluded.
 */
import { logger } from 'firebase-functions';
import { getAuth } from 'firebase-admin/auth';
import { countsTowardSummary, resolveTimeZone } from './weekSummaryMath';

type Firestore = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;

export type HouseAdminCheck = (uid: string, houseId: string) => Promise<boolean>;

export interface TrustedGuest {
  guestId: string;
  houseId: string;
  /** Auth uid of the resident; null for a guest without an account. */
  residentUid: string | null;
}

export interface GuestContext extends TrustedGuest {
  timeZone: string;
}

export interface Exclusions {
  /** Counted (active/kept) activities whose houseId is not the guest's house. */
  otherHouse: number;
  /** Counted activities logged by neither the resident nor a house admin. */
  untrustedLogger: number;
}

export const noExclusions = (): Exclusions => ({ otherHouse: 0, untrustedLogger: 0 });

/** The guest's house and uid from its doc, or null when it cannot be trusted. */
export function trustedGuestFrom(guestId: string, data: Data | undefined): TrustedGuest | null {
  if (!data || typeof data.houseId !== 'string' || data.houseId === '') return null;
  const uid = typeof data.userId === 'string' && data.userId !== '' ? data.userId : null;
  return { guestId, houseId: data.houseId, residentUid: uid };
}

/** The house's IANA zone, or the default when it is unset, invalid or gone. */
export async function houseTimeZone(db: Firestore, houseId: string): Promise<string> {
  const snap = houseId ? await db.collection('houses').doc(houseId).get() : undefined;
  const { timeZone, fallback } = resolveTimeZone(snap?.data()?.timezone);
  if (fallback) logger.warn('week_summary.timezone_fallback', { houseId, timeZone });
  return timeZone;
}

/** Guest + house zone, or null (logged by id) when the guest doc is missing. */
export async function loadGuestContext(
  db: Firestore,
  guestId: string,
): Promise<GuestContext | null> {
  const snap = await db.collection('guests').doc(guestId).get();
  const guest = trustedGuestFrom(guestId, snap.exists ? (snap.data() as Data) : undefined);
  if (!guest) {
    logger.warn('week_summary.guest_missing', { guestId });
    return null;
  }
  return { ...guest, timeZone: await houseTimeZone(db, guest.houseId) };
}

const hasKey = (map: unknown, key: string): boolean =>
  !!map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key);

/**
 * Admin check against Auth custom claims, mirroring the rules' isAdmin():
 * key presence in the `admin` or `superAdmin` claim map. One Auth lookup per
 * uid per checker; create a checker per event so claims are never stale for
 * longer than one invocation. A uid with no Auth user is not an admin; any
 * other Auth failure is thrown so the event is retried.
 */
export function claimsHouseAdminCheck(
  getUser: (uid: string) => Promise<{ customClaims?: Data }> = (uid) => getAuth().getUser(uid),
): HouseAdminCheck {
  const claims = new Map<string, Promise<Data | null>>();
  return async (uid, houseId) => {
    if (!uid) return false;
    let pending = claims.get(uid);
    if (!pending) {
      pending = getUser(uid).then(
        (user) => user.customClaims ?? {},
        (err: { code?: string }) => {
          if (err?.code === 'auth/user-not-found') return null;
          claims.delete(uid);
          throw err;
        },
      );
      claims.set(uid, pending);
    }
    const c = await pending;
    return !!c && (hasKey(c.admin, houseId) || hasKey(c.superAdmin, houseId));
  };
}

/** Keep only the activities that may count for `guest`; tally the rest. */
export async function trustedActivities(
  activities: Data[],
  guest: TrustedGuest,
  isHouseAdmin: HouseAdminCheck,
): Promise<{ trusted: Data[]; excluded: Exclusions }> {
  const excluded = noExclusions();
  const trusted: Data[] = [];
  for (const a of activities) {
    // Only counted activities (active / kept) need, and pay for, a check.
    if (!countsTowardSummary(a)) continue;
    if (a.houseId !== guest.houseId) {
      excluded.otherHouse++;
      continue;
    }
    const by = typeof a.loggedBy === 'string' ? a.loggedBy : '';
    const byResident = guest.residentUid !== null && by === guest.residentUid;
    if (!byResident && !(await isHouseAdmin(by, guest.houseId))) {
      excluded.untrustedLogger++;
      continue;
    }
    trusted.push(a);
  }
  return { trusted, excluded };
}
