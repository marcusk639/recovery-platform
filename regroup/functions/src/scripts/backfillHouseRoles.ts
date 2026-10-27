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
 *  1. Owners: every house's ownerId gets the PRIMARY owner record
 *     { tier: 'owner', primary: true }, read now, before any client can
 *     rewrite ownerId under the new code. From then on ownership is the
 *     record, never ownerId.
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
 *     done by the old code between runs) is lowered or removed:
 *     co-owner without superAdmin -> manager (admin) / resident (guest) /
 *     none; manager or peer leader without admin -> resident (guest) / none;
 *     resident without guest -> none. Primary owner records are kept.
 * Existing records are never raised by the backfill, and a record created
 * meanwhile wins (create races are skipped). Output is ids, tiers, reasons.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { isActiveGuestDoc } from '../util/guestMembership';
import { emulatorEnvError } from './findGhostGuests';
import type { RoleTier } from '../util/houseRoles';

type Claims = Record<string, unknown>;
interface AuthLike {
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
  };
  const now = (opts.now ?? new Date()).toISOString();
  const record = (tier: RoleTier, primary = false) => ({
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

  // 1. Primary owners, from ownerId as it is now.
  const houses = new Map<string, Record<string, unknown>>();
  for (const h of (await db.collection('houses').get()).docs) {
    const house = (h.data() ?? {}) as Record<string, unknown>;
    houses.set(h.id, house);
    if (typeof house.ownerId !== 'string' || !house.ownerId) continue;
    const ref = roles.doc(`${h.id}_${house.ownerId}`);
    const cur = await ref.get();
    if (cur.exists && (cur.data() ?? {}).primary === true) continue;
    report.owners.push({ uid: house.ownerId, houseId: h.id, tier: 'owner', reason: 'ownerId' });
    if (opts.apply) await ref.set(record('owner', true));
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
      // The house's ownerId account: pass 1 gave it the primary owner record.
      if (houses.get(houseId)?.ownerId === uid) continue;
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
          await ref.create(record(row.tier as RoleTier));
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
    const c = claimsOf.get(uid);
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
  return report;
}

/** Listed in the house's adminIds through an admins doc of the account, or invited as admin by the owner. */
async function listedOrOwnerGranted(
  db: FirebaseFirestore.Firestore,
  uid: string,
  houseId: string,
  house: Record<string, unknown>,
): Promise<boolean> {
  const adminIds = Array.isArray(house.adminIds) ? (house.adminIds as unknown[]) : [];
  const adminDocs = (await db.collection('admins').where('userId', '==', uid).get()).docs;
  if (adminDocs.some((d) => adminIds.includes(d.id))) return true;
  const invites = (await db.collection('invitations').where('redeemedByUid', '==', uid).get()).docs;
  return invites.some((d) => {
    const inv = d.data() ?? {};
    return inv.houseId === houseId && inv.role === 'admin' && inv.inviterUid === house.ownerId;
  });
}

export function printRoleReport(report: RoleBackfillReport, apply: boolean): void {
  const rows = (title: string, list: RoleBackfillRow[]) => {
    if (list.length === 0) return;
    console.log(`\n${title}\nuid\thouseId\ttier\treason`);
    for (const r of list) console.log(`${r.uid}\t${r.houseId}\t${r.tier}\t${r.reason}`);
  };
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}: house-roles records`);
  console.log(`Existing records left alone: ${report.existing}`);
  console.log(`Redeemed invitations marked completed: ${report.invitationsStamped}`);
  rows('Primary owners (from ownerId):', report.owners);
  rows(`Staff records ${apply ? 'written' : 'to write'}:`, report.toWrite);
  rows(
    'Recorded as peerLeader (least privilege); owner to review. Promote real managers by\n' +
      'sending them an admin invitation, or: npm run roles:promote-manager -- --house H --uid U',
    report.review,
  );
  rows(
    `Stale records ${apply ? 'lowered/removed' : 'to lower/remove'} (claims gone):`,
    report.stale,
  );
  if (!apply) console.log('\nNothing was written. Re-run with --apply to commit.');
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
