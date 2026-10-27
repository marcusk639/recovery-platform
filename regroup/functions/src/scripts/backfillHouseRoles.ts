/**
 * Backfill of server-only role records (util/houseRoles). Dry run is the
 * DEFAULT; writing requires --apply. Run it BEFORE the functions deploy
 * (the old code never reads house-roles) and again right after it.
 *
 *   # rehearse on the emulators (both hosts, or the script refuses)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     GCLOUD_PROJECT=demo-house-roles npm run migrate:house-roles:dry-run
 *
 *   npm run migrate:house-roles:dry-run   # report; the owner reviews it
 *   npm run migrate:house-roles:apply
 *
 * Passes:
 *  0. Every record gets its houseId field.
 *  1. Owners: a house with no primary record gets one for its superAdminId
 *     { tier: 'owner', primary: true } (superAdminId is set only by
 *     createHouses and server-only in every rules version; ownerId is not).
 *     Where ownerId disagrees, superAdminId wins and the house is listed;
 *     with no superAdminId nothing is written and the house is listed.
 *     A house never gets a second primary, so re-runs are safe.
 *  2. Invitations: every redeemed invitation without grantCompletedAt gets
 *     one (= redeemedAt), so an old token can never regrant (the redeem
 *     treats a redeemed invitation without grantPending as completed anyway).
 *  3. Staff claims, per (account, house) with no record yet:
 *       superAdmin claim -> owner (a co-owner, not primary)
 *       manager ONLY when unambiguous: admin claim, never any guest doc in
 *         the house (any status), and listed in the house's adminIds
 *         (through an admins doc of the account) or invited as admin by the
 *         house owner
 *       everyone else -> peerLeader (least privilege), listed for the owner
 *         with the reason (every staff-not-resident row included).
 *  4. Stale records: a record whose claims are gone (a departure or removal
 *     done by the old code between runs), checked against the account's
 *     claims re-read just before (lookup errors skip the record; records
 *     granted after the run started are skipped), is lowered or removed:
 *     co-owner without superAdmin -> manager (admin) / resident (guest) /
 *     none; manager or peer leader without admin -> resident (guest) / none;
 *     resident without guest -> none. Primary owner records are kept.
 * Existing records are never raised by the backfill, and a record created
 * meanwhile wins (create races are skipped). The review list starts with
 * has-guest-doc and active-resident-isAdmin rows. Output is ids, tiers, reasons.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { isActiveGuestDoc } from '../util/guestMembership';
import { emulatorEnvError } from './findGhostGuests';
import { listedOrOwnerGranted, printRoleReport } from './backfillHouseRolesReport';
import type { RoleTier } from '../util/houseRoles';

type Claims = Record<string, unknown>;
interface AuthLike {
  getUser(uid: string): Promise<{ customClaims?: Claims }>;
  listUsers(
    max: number,
    pageToken?: string,
  ): Promise<{ users: Array<{ uid: string; customClaims?: Claims }>; pageToken?: string }>;
}

export interface RoleBackfillRow {
  uid: string;
  houseId: string;
  tier: RoleTier | 'none';
  reason: string;
}
export interface RoleBackfillReport {
  owners: RoleBackfillRow[];
  toWrite: RoleBackfillRow[];
  existing: number;
  /** Written as peerLeader: the owner reviews and promotes real managers. */
  review: RoleBackfillRow[];
  invitationsStamped: number;
  /** Records lowered (tier) or removed ('none') because the claims are gone. */
  stale: RoleBackfillRow[];
  /** Houses whose owner needs a look: superAdminId missing, or disagreeing with ownerId. */
  ownerReview: Array<{ houseId: string; reason: string }>;
}

const houseKeys = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object') return Object.keys(v as Record<string, unknown>);
  return [];
};
const has = (c: Claims | undefined, role: string, houseId: string) =>
  houseKeys(c?.[role]).includes(houseId);
const isAlreadyExists = (err: unknown) => {
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === 'already-exists' || /ALREADY_EXISTS/.test(String(err));
};

export async function backfillHouseRoles(
  db: FirebaseFirestore.Firestore,
  authClient: AuthLike,
  opts: { apply: boolean; now?: Date },
): Promise<RoleBackfillReport> {
  const report: RoleBackfillReport = {
    owners: [],
    toWrite: [],
    existing: 0,
    review: [],
    invitationsStamped: 0,
    stale: [],
    ownerReview: [],
  };
  const now = (opts.now ?? new Date()).toISOString();
  const record = (houseId: string, tier: RoleTier, primary = false) => ({
    houseId,
    tier,
    grantedBy: 'backfill',
    grantedAt: now,
    via: 'backfill',
    ...(primary ? { primary: true } : {}),
  });
  const roles = db.collection('house-roles');

  // All accounts and their live claims.
  const claimsOf = new Map<string, Claims>();
  let pageToken: string | undefined;
  do {
    const page = await authClient.listUsers(1000, pageToken);
    pageToken = page.pageToken;
    for (const u of page.users) claimsOf.set(u.uid, u.customClaims ?? {});
  } while (pageToken);

  // 0. Every record carries its houseId (records from before it existed).
  const houseOf = (id: string) => id.slice(0, id.lastIndexOf('_'));
  const primaryHouses = new Set<string>();
  for (const d of (await roles.get()).docs) {
    const r = d.data() ?? {};
    if (r.primary === true) primaryHouses.add(houseOf(d.id));
    if (opts.apply && r.houseId !== houseOf(d.id)) await d.ref.update({ houseId: houseOf(d.id) });
  }

  // 1. Primary owners, from superAdminId: set only by createHouses and
  // server-only in every rules version, unlike ownerId (a superAdmin can
  // rewrite ownerId until #145's rules deploy). Written only for a house
  // with no primary record yet, so a re-run never adds a second owner.
  const houses = new Map<string, Record<string, unknown>>();
  for (const h of (await db.collection('houses').get()).docs) {
    const house = (h.data() ?? {}) as Record<string, unknown>;
    houses.set(h.id, house);
    const owner = typeof house.superAdminId === 'string' ? house.superAdminId : '';
    if (!owner) {
      report.ownerReview.push({ houseId: h.id, reason: 'no-superAdminId: no primary written' });
      continue;
    }
    if (house.ownerId !== owner) {
      report.ownerReview.push({ houseId: h.id, reason: 'ownerId-disagrees: superAdminId used' });
    }
    if (primaryHouses.has(h.id)) continue;
    primaryHouses.add(h.id);
    report.owners.push({ uid: owner, houseId: h.id, tier: 'owner', reason: 'superAdminId' });
    if (opts.apply) await roles.doc(`${h.id}_${owner}`).set(record(h.id, 'owner', true));
  }

  // 2. Redeemed invitations: mark the grant completed.
  for (const d of (await db.collection('invitations').get()).docs) {
    const inv = d.data() ?? {};
    if (!inv.redeemedAt || inv.grantCompletedAt || inv.grantPending === true) continue;
    report.invitationsStamped += 1;
    if (opts.apply) await d.ref.update({ grantCompletedAt: inv.redeemedAt });
  }

  // 3. Staff claims without a record.
  for (const [uid, claims] of claimsOf) {
    const superHouses = new Set(houseKeys(claims.superAdmin));
    const staffHouses = [...new Set([...houseKeys(claims.admin), ...superHouses])];
    if (staffHouses.length === 0) continue;
    const guestDocs = (await db.collection('guests').where('userId', '==', uid).get()).docs;
    for (const houseId of staffHouses) {
      const ref = roles.doc(`${houseId}_${uid}`);
      // The house's owner: pass 1 gave it the primary owner record.
      if (houses.get(houseId)?.superAdminId === uid) continue;
      if ((await ref.get()).exists) {
        report.existing += 1;
        continue;
      }
      const house = houses.get(houseId);
      const inHouse = guestDocs.map((d) => d.data() ?? {}).filter((g) => g.houseId === houseId);
      let row: RoleBackfillRow;
      if (superHouses.has(houseId)) {
        row = { uid, houseId, tier: 'owner', reason: 'superAdmin-co-owner' };
      } else {
        const reason = !house
          ? 'house-missing'
          : inHouse.length > 0
            ? inHouse.some((g) => isActiveGuestDoc(g) && g.isAdmin === true)
              ? 'active-resident-isAdmin'
              : 'has-guest-doc'
            : (await listedOrOwnerGranted(db, uid, houseId, house))
              ? 'manager-unambiguous'
              : 'staff-not-resident';
        row = {
          uid,
          houseId,
          tier: reason === 'manager-unambiguous' ? 'manager' : 'peerLeader',
          reason,
        };
      }
      if (opts.apply) {
        try {
          await ref.create(record(houseId, row.tier as RoleTier));
        } catch (err) {
          // A grant recorded meanwhile wins; never overwrite it.
          if (!isAlreadyExists(err)) throw err;
          report.existing += 1;
          continue;
        }
      }
      report.toWrite.push(row);
      if (row.tier === 'peerLeader') report.review.push(row);
    }
  }

  // 4. Stale records: lower or remove where the claims are gone.
  for (const d of (await roles.get()).docs) {
    const r = d.data() ?? {};
    if (r.primary === true) continue;
    const i = d.id.lastIndexOf('_');
    const houseId = d.id.slice(0, i);
    const uid = d.id.slice(i + 1);
    // A grant recorded after the run started is newer than anything read here.
    if (typeof r.grantedAt === 'string' && r.grantedAt > now) continue;
    // Re-read this account's live claims right before acting, so a grant made
    // since the listing is never deleted; an unexpected error skips the record.
    let c: Claims;
    try {
      c = (await authClient.getUser(uid)).customClaims ?? {};
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') {
        report.stale.push({ uid, houseId, tier: r.tier, reason: 'skipped: claims lookup failed' });
        continue;
      }
      c = {};
    }
    const fallback: RoleTier | 'none' = has(c, 'admin', houseId)
      ? 'manager'
      : has(c, 'guest', houseId)
        ? 'resident'
        : 'none';
    let next: RoleTier | 'none' = r.tier;
    if (r.tier === 'owner' && !has(c, 'superAdmin', houseId)) next = fallback;
    if ((r.tier === 'manager' || r.tier === 'peerLeader') && !has(c, 'admin', houseId)) {
      next = has(c, 'guest', houseId) ? 'resident' : 'none';
    }
    if (r.tier === 'resident' && !has(c, 'guest', houseId)) next = 'none';
    if (next === r.tier) continue;
    report.stale.push({ uid, houseId, tier: next, reason: `was ${r.tier}` });
    if (opts.apply) {
      if (next === 'none') await d.ref.delete();
      else await d.ref.update({ tier: next });
    }
  }
  // Review rows that matter first: staff who are (or were) residents here.
  const order = ['has-guest-doc', 'active-resident-isAdmin'];
  const rank = (r: RoleBackfillRow) => (order.includes(r.reason) ? order.indexOf(r.reason) : 9);
  report.review.sort((a, b) => rank(a) - rank(b));
  return report;
}

if (require.main === module) {
  const envError = emulatorEnvError(process.env);
  if (envError) {
    console.error(envError);
    process.exit(1);
  }
  const apply = process.argv.includes('--apply');
  backfillHouseRoles(admin.firestore(), admin.auth(), { apply })
    .then((report) => printRoleReport(report, apply))
    .catch((err) => {
      console.error('backfillHouseRoles failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
