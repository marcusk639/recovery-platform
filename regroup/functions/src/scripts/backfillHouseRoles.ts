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
 *   ownerId or a superAdmin claim                      -> owner
 *   an ACTIVE guest doc in the house with isAdmin true -> peerLeader
 *   otherwise                                          -> manager
 * "Ambiguous" (printed for the owner to review) is a manager that has some
 * other guest doc in the house, or a house doc that is missing. Until a
 * record exists the server treats an admin-claim holder as a peer leader, so
 * running this late only under-grants. Existing records are never
 * overwritten, so a second run writes nothing. Output is ids and tiers only.
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
  ambiguous: RoleBackfillRow[];
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
  const report: RoleBackfillReport = { toWrite: [], existing: 0, ambiguous: [] };
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
        } else if (inHouse.some((g) => isActiveGuestDoc(g) && g.isAdmin === true)) {
          row = { uid: user.uid, houseId, tier: 'peerLeader', reason: 'active-resident-isAdmin' };
        } else {
          const reason = !house
            ? 'house-missing'
            : inHouse.length > 0
              ? 'has-guest-doc-not-active-peer'
              : 'staff-not-resident';
          row = { uid: user.uid, houseId, tier: 'manager', reason };
          if (reason !== 'staff-not-resident') report.ambiguous.push(row);
        }
        report.toWrite.push(row);
        if (opts.apply) {
          await ref.create({
            tier: row.tier,
            grantedBy: 'backfill',
            grantedAt: (opts.now ?? new Date()).toISOString(),
            via: 'backfill',
          });
        }
      }
    }
  } while (pageToken);
  return report;
}

export function printRoleReport(report: RoleBackfillReport, apply: boolean): void {
  console.log(`Mode: ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}: house-roles records`);
  console.log(`Existing records left alone: ${report.existing}`);
  console.log(`${apply ? 'Written' : 'To write'}: ${report.toWrite.length}`);
  console.log('uid\thouseId\ttier\treason');
  for (const r of report.toWrite) console.log(`${r.uid}\t${r.houseId}\t${r.tier}\t${r.reason}`);
  if (report.ambiguous.length > 0) {
    console.log('\nAmbiguous (classified manager; owner to review):');
    for (const r of report.ambiguous) console.log(`${r.uid}\t${r.houseId}\t${r.reason}`);
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
