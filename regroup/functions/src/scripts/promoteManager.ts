/**
 * Owner-run: record an account as a MANAGER of a house (util/houseRoles),
 * for a real manager the backfill recorded as peerLeader. Dry run is the
 * DEFAULT; writing requires --apply. Ids only in the output.
 *
 *   npm run roles:promote-manager -- --house H --uid U            # dry run
 *   npm run roles:promote-manager -- --house H --uid U --apply
 *
 * The in-app route does the same: the owner sends the person an admin
 * invitation, and redeeming it raises the record to manager.
 *
 * Refuses unless the account holds the house's admin claim. Never lowers a
 * record (an owner stays an owner).
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import { emulatorEnvError } from './findGhostGuests';
import { nextRoleRecord } from '../util/houseRoles';

interface AuthLike {
  getUser(uid: string): Promise<{ customClaims?: Record<string, unknown> }>;
}

export type PromoteResult =
  | { outcome: 'written' | 'would-write'; houseId: string; uid: string; from: string | null }
  | { outcome: 'already'; houseId: string; uid: string; from: string }
  | { outcome: 'refused'; houseId: string; uid: string; reason: string };

export function parseArgs(argv: string[]): { houseId: string; uid: string; apply: boolean } {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
  };
  return { houseId: val('--house'), uid: val('--uid'), apply: argv.includes('--apply') };
}

export async function promoteManager(
  db: FirebaseFirestore.Firestore,
  authClient: AuthLike,
  opts: { houseId: string; uid: string; apply: boolean },
): Promise<PromoteResult> {
  const { houseId, uid } = opts;
  if (!houseId || !uid)
    return { outcome: 'refused', houseId, uid, reason: 'usage: --house H --uid U' };
  const claims = (await authClient.getUser(uid)).customClaims ?? {};
  const adminMap = claims.admin;
  const holdsAdmin = Array.isArray(adminMap)
    ? adminMap.includes(houseId)
    : !!adminMap &&
      typeof adminMap === 'object' &&
      (adminMap as Record<string, unknown>)[houseId] === true;
  if (!holdsAdmin)
    return { outcome: 'refused', houseId, uid, reason: 'no admin claim for the house' };
  const ref = db.collection('house-roles').doc(`${houseId}_${uid}`);
  const snap = await ref.get();
  const from = snap.exists ? (((snap.data() ?? {}).tier as string) ?? null) : null;
  const record = nextRoleRecord(from, 'manager', {
    grantedBy: 'owner-script',
    via: 'promoteScript',
  });
  if (!record) return { outcome: 'already', houseId, uid, from: from ?? '' };
  if (!opts.apply) return { outcome: 'would-write', houseId, uid, from };
  await ref.set(record);
  return { outcome: 'written', houseId, uid, from };
}

if (require.main === module) {
  const envError = emulatorEnvError(process.env);
  if (envError) {
    console.error(envError);
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  promoteManager(admin.firestore(), admin.auth(), args)
    .then((r) => {
      console.log(JSON.stringify(r));
      if (r.outcome === 'would-write') console.log('Nothing was written. Re-run with --apply.');
      if (r.outcome === 'refused') process.exit(1);
    })
    .catch((err) => {
      console.error('promoteManager failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
