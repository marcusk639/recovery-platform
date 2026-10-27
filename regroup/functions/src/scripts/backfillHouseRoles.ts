/**
 * One-off backfill of server-only role records (util/houseRoles) for
 * accounts that already hold an admin or superAdmin claim. Dry run is the
 * DEFAULT; writing requires --apply.
 *
 *   # rehearse on the emulators (both hosts, or the script refuses)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     GCLOUD_PROJECT=demo-house-roles npm run migrate:house-roles:dry-run
 *
 *   # production: report first, review the ambiguous list, then apply
 *   npm run migrate:house-roles:dry-run
 *   npm run migrate:house-roles:apply
 *
 * Per (account, house) with a staff claim:
 *   ownerId or a superAdmin claim -> owner
 *   manager ONLY when unambiguous: the admin claim, never any guest doc in
 *     the house (any status), and listed in the house's adminIds (through
 *     an admins doc of the account) or granted by the owner (an admin
 *     invitation from the owner, redeemed by this account)
 *   everyone else -> peerLeader (least privilege), and listed for the
 *     owner's review with ids and the reason
 * The owner then promotes the real managers with addAdminAuthorization
 * (owner-only), which records `manager`. Existing records are never
 * overwritten (a record created meanwhile is skipped), so a second run
 * writes nothing. Output is ids, tiers and reasons only.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { isActiveGuestDoc } from '../util/guestMembership';
import { emulatorEnvError } from './findGhostGuests';
import type { RoleTier } from '../util/houseRoles';

interface AuthLike {
  listUsers(
    max: number,
    pageToken?: string,
  ): Promise<{
    users: Array<{ uid: string; customClaims?: Record<string, unknown> }>;
    pageToken?: string;
  }>;
}

export interface RoleBackfillRow {
  uid: string;
  houseId: string;
  tier: RoleTier;
  reason: string;
}
export interface RoleBackfillReport {
  toWrite: RoleBackfillRow[];
  existing: number;
  /** Written as peerLeader: the owner reviews and promotes real managers. */
  review: RoleBackfillRow[];
}

const houseKeys = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (v && typeof v === 'object') return Object.keys(v as Record<string, unknown>);
  return [];
};

export async function backfillHouseRoles(
  db: FirebaseFirestore.Firestore,
  authClient: AuthLike,
  opts: { apply: boolean; now?: Date },
): Promise<RoleBackfillReport> {
  const report: RoleBackfillReport = { toWrite: [], existing: 0, review: [] };
  const houses = new Map<string, Record<string, unknown> | null>();
  const houseData = async (id: string) => {
    if (!houses.has(id)) {
      const snap = await db.collection('houses').doc(id).get();
      houses.set(id, snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null);
    }
    return houses.get(id) ?? null;
  };

  let pageToken: string | undefined;
  do {
    const page = await authClient.listUsers(1000, pageToken);
    pageToken = page.pageToken;
    for (const user of page.users) {
      const claims = user.customClaims ?? {};
      const superHouses = new Set(houseKeys(claims.superAdmin));
      const staffHouses = [...new Set([...houseKeys(claims.admin), ...superHouses])];
      if (staffHouses.length === 0) continue;
      const guestDocs = (await db.collection('guests').where('userId', '==', user.uid).get()).docs;

      for (const houseId of staffHouses) {
        const ref = db.collection('house-roles').doc(`${houseId}_${user.uid}`);
        if ((await ref.get()).exists) {
          report.existing += 1;
          continue;
        }
        const house = await houseData(houseId);
        const inHouse = guestDocs.map((d) => d.data() ?? {}).filter((g) => g.houseId === houseId);
        let row: RoleBackfillRow;
        if (house?.ownerId === user.uid || superHouses.has(houseId)) {
          row = { uid: user.uid, houseId, tier: 'owner', reason: 'owner-or-superAdmin' };
        } else {
          const reason = !house
            ? 'house-missing'
            : inHouse.length > 0
              ? inHouse.some((g) => isActiveGuestDoc(g) && g.isAdmin === true)
                ? 'active-resident-isAdmin'
                : 'has-guest-doc'
              : (await listedOrOwnerGranted(db, user.uid, houseId, house))
                ? 'manager-unambiguous'
                : 'staff-not-resident';
          row = {
            uid: user.uid,
            houseId,
            tier: reason === 'manager-unambiguous' ? 'manager' : 'peerLeader',
            reason,
          };
          if (row.tier === 'peerLeader') report.review.push(row);
        }
        report.toWrite.push(row);
        if (opts.apply) {
          try {
            await ref.create({
              tier: row.tier,
              grantedBy: 'backfill',
              grantedAt: (opts.now ?? new Date()).toISOString(),
              via: 'backfill',
            });
          } catch (err) {
            // A grant recorded meanwhile wins; never overwrite it.
            if (!isAlreadyExists(err)) throw err;
            report.toWrite.pop();
            report.existing += 1;
            if (report.review[report.review.length - 1] === row) report.review.pop();
          }
        }
      }
    }
  } while (pageToken);
  return report;
}

const isAlreadyExists = (err: unknown) => {
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === 'already-exists' || /ALREADY_EXISTS/.test(String(err));
};

/** Listed in the house's adminIds through an admins doc of the account, or granted by the owner. */
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
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}: house-roles records`);
  console.log(`Existing records left alone: ${report.existing}`);
  console.log(`${apply ? 'Written' : 'To write'}: ${report.toWrite.length}`);
  console.log('uid\thouseId\ttier\treason');
  for (const r of report.toWrite) console.log(`${r.uid}\t${r.houseId}\t${r.tier}\t${r.reason}`);
  if (report.review.length > 0) {
    console.log('\nRecorded as peerLeader (least privilege); owner to review. Promote real');
    console.log('managers with addAdminAuthorization (owner-only), which records manager:');
    for (const r of report.review) console.log(`${r.uid}\t${r.houseId}\t${r.reason}`);
  }
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
