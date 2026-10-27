/**
 * READ-ONLY report of guest docs that are not backed by a house claim.
 *
 * Until the guests create rule required the house guest claim, any signed-in
 * user could create a guest doc in any house with their own uid. onGuestWrite
 * now ignores such docs when it splits EES, but they may still exist and
 * still show up in the app's resident lists (EESTracker bills every guest it
 * lists). This lists them so a house operator or the owner can review them.
 *
 * It never writes. There is no --apply mode: deleting a guest doc is a
 * per-house decision, made after looking at each id.
 *
 *   # rehearse against the emulators (both are needed: Firestore + Auth)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     GCLOUD_PROJECT=demo-ghosts npm run report:ghost-guests
 *
 *   # production (read-only; needs credentials, see scriptBootstrap)
 *   npm run report:ghost-guests
 *
 * Output is guest doc ids, house ids and a reason, never names, emails or
 * uids. Reasons:
 *   no-claim           the account named by userId has no guest/admin/
 *                      superAdmin claim for the house: the ghost pattern
 *   account-missing    userId names an account that no longer exists
 *   invalid-userid     userId is not a uid this app could have issued (not a
 *                      string, over 128 characters, or contains a slash: the
 *                      app's sign-up never creates such uids, and one could
 *                      not key users/{uid}); never looked up, and not counted
 *                      by onGuestWrite either
 *   duplicate-account  a second guest doc for the same account in the house
 *                      (whichever the scan reached second, which can be the
 *                      resident's real record). Never delete one on this
 *                      report alone: deleting a guest doc revokes the
 *                      account's house claims unless another doc of theirs
 *                      still counts (onGuestWrite, util/admission
 *                      entitlingDocs: the doc bound to their invitation
 *                      ticket, not flagged in guest-flags). Merge the two
 *                      docs, or confirm which one counts first.
 *   no-house           the doc has no houseId
 * Docs with no userId (admin intake, CSV import) are not flagged: only an
 * admin could create those. Claims are read live, so a guest whose claim was
 * revoked while their doc stayed will show as no-claim too; check before
 * deleting.
 */
import './scriptBootstrap';
import * as admin from 'firebase-admin';
import {
  ClaimsAuthClient,
  classifyGuestMembership,
  fetchClaimsByUid,
} from '../util/guestMembership';

export type SuspectReason =
  'no-claim' | 'account-missing' | 'invalid-userid' | 'duplicate-account' | 'no-house';

export interface Suspect {
  guestId: string;
  houseId: string;
  reason: SuspectReason;
}

export async function findSuspiciousGuests(
  database: FirebaseFirestore.Firestore,
  authClient: ClaimsAuthClient,
): Promise<{ scanned: number; suspects: Suspect[] }> {
  const snapshot = await database.collection('guests').get();
  const guests = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));

  const uids = guests
    .map((g) => g.data.userId)
    .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);
  const claimsByUid = await fetchClaimsByUid(uids, authClient);

  const suspects: Suspect[] = [];
  const seen = new Set<string>();
  for (const guest of guests) {
    const houseId = typeof guest.data.houseId === 'string' ? guest.data.houseId : '';
    const membership = classifyGuestMembership(guest.data, claimsByUid);
    if (membership === 'no-account') continue;
    if (membership !== 'member') {
      suspects.push({ guestId: guest.id, houseId, reason: membership });
      continue;
    }
    const key = `${houseId}\u0000${guest.data.userId as string}`;
    if (seen.has(key)) {
      suspects.push({ guestId: guest.id, houseId, reason: 'duplicate-account' });
    }
    seen.add(key);
  }
  return { scanned: guests.length, suspects };
}

export async function run(
  database: FirebaseFirestore.Firestore,
  authClient: ClaimsAuthClient,
): Promise<{ scanned: number; suspects: Suspect[] }> {
  console.log('Mode: READ ONLY. guests not backed by a house claim');
  const result = await findSuspiciousGuests(database, authClient);

  console.log(`Scanned: ${result.scanned} guest docs`);
  if (result.suspects.length === 0) {
    console.log('No suspicious guest docs found.');
    return result;
  }

  console.log(`Suspicious: ${result.suspects.length}\n`);
  console.log('guestId\thouseId\treason');
  // Ids only. These are resident records: never print names, contact
  // details, uids or amounts.
  for (const s of result.suspects) {
    console.log(`${s.guestId}\t${s.houseId || '(none)'}\t${s.reason}`);
  }
  if (result.suspects.some((s) => s.reason === 'duplicate-account')) {
    console.log(
      '\nduplicate-account: the doc listed may be the real record. Deleting a guest doc ' +
        "revokes the account's house claims unless another of its docs still counts; " +
        'merge the docs or confirm which one counts before deleting either.',
    );
  }
  console.log('\nNothing was written.');
  return result;
}

/**
 * Emulator hosts must be set together. Firestore emulated with real Auth
 * would look up claims in a real project (or fail without credentials);
 * Auth emulated with real Firestore would read production guests and judge
 * them against fake accounts. Returns the refusal message, or null.
 */
export function emulatorEnvError(env: NodeJS.ProcessEnv): string | null {
  const firestore = Boolean(env.FIRESTORE_EMULATOR_HOST);
  const authHost = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST);
  if (firestore === authHost) return null;
  const set = firestore ? 'FIRESTORE_EMULATOR_HOST' : 'FIREBASE_AUTH_EMULATOR_HOST';
  const unset = firestore ? 'FIREBASE_AUTH_EMULATOR_HOST' : 'FIRESTORE_EMULATOR_HOST';
  return `${set} is set but ${unset} is not. Set both or neither.`;
}

if (require.main === module) {
  // Checked before any read. scriptBootstrap (imported above) only
  // initializes the Admin SDK; it makes no request.
  const envError = emulatorEnvError(process.env);
  if (envError) {
    console.error(envError);
    process.exit(1);
  }
  run(admin.firestore(), admin.auth()).catch((err) => {
    console.error('findGhostGuests failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
