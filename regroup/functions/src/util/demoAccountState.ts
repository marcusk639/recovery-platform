/**
 * Keeps the shared demo account intact (S5, REV-A8). Its password ships in the
 * app, so anyone signed in as it can change its sign-in through Firebase Auth,
 * which offers no per-account lock: a new password locks App Review out, and a
 * linked provider, phone number or second factor would give one person a way
 * back in that survives a password reset.
 *
 * - `markDemoAccount` (owner script `npm run demo:mark-account`) sets the
 *   `demo: true` claim the guards read and records the account in the
 *   server-only `config/demoAccount` doc (uid, tokensValidAfter and the claims
 *   to recreate it with; no password baseline, so the first restore resets
 *   the password). The deploys refuse to run until it has
 *   (`regroup/scripts/preflight-demo-account.js`).
 * - `restoreDemoAccount` (scheduled, `scheduled/demoAccountRestore.ts`):
 *   recreates a deleted account at the same uid; otherwise puts back the email
 *   and password (and the password provider, if unlinked), unlinks every
 *   provider but the password, clears a phone
 *   number and second factors, signs every session out, and re-adds a missing
 *   claim. A password change shows as a new `tokensValidAfterTime`, which Auth
 *   bumps on every password change. Nothing is written while it is intact.
 *
 * Ids only in logs and results.
 */
import { CLAIMS_UPDATES_COLLECTION } from './userClaims';
import { DEMO_ACCOUNT_EMAIL, DEMO_CLAIM } from './demoAccount';

/**
 * The demo password. Public by design: the app's Demo button signs in with it
 * (mobile `InitialLandingForm.tsx`). Keep the two equal.
 */
export const DEMO_ACCOUNT_PASSWORD = 'DemoUser1';
export const DEMO_CONFIG_PATH = { collection: 'config', doc: 'demoAccount' } as const;

interface DemoUserRecord {
  uid: string;
  email?: string;
  phoneNumber?: string;
  providerData?: Array<{ providerId: string }>;
  multiFactor?: { enrolledFactors?: unknown[] };
  customClaims?: Record<string, unknown>;
  tokensValidAfterTime?: string;
}

export interface DemoUpdate {
  email?: string;
  password?: string;
  emailVerified?: boolean;
  disabled?: boolean;
  phoneNumber?: null;
  providersToUnlink?: string[];
  multiFactor?: { enrolledFactors: null };
}

export interface DemoAuth {
  getUser(uid: string): Promise<DemoUserRecord>;
  getUserByEmail(email: string): Promise<DemoUserRecord>;
  createUser(props: {
    uid: string;
    email: string;
    password: string;
    emailVerified: boolean;
  }): Promise<unknown>;
  setCustomUserClaims(uid: string, claims: object | null): Promise<void>;
  updateUser(uid: string, props: DemoUpdate): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

type Db = FirebaseFirestore.Firestore;
const configRef = (db: Db) => db.collection(DEMO_CONFIG_PATH.collection).doc(DEMO_CONFIG_PATH.doc);
const authCode = (error: unknown) => (error as { code?: unknown } | null)?.code;
const SIGN_IN = { email: DEMO_ACCOUNT_EMAIL, password: DEMO_ACCOUNT_PASSWORD, emailVerified: true };

async function setClaims(
  db: Db,
  auth: DemoAuth,
  uid: string,
  claims: Record<string, unknown>,
): Promise<void> {
  await auth.setCustomUserClaims(uid, { ...claims, [DEMO_CLAIM]: true });
  // As util/userClaims does: the app refreshes its token on this stamp.
  await db.collection(CLAIMS_UPDATES_COLLECTION).doc(uid).set({ updatedAt: new Date() });
}

async function ensureClaim(db: Db, auth: DemoAuth, user: DemoUserRecord): Promise<boolean> {
  if (user.customClaims?.[DEMO_CLAIM] === true) return false;
  await setClaims(db, auth, user.uid, user.customClaims ?? {});
  return true;
}

/**
 * Records the account for the restore. `baseline: false` (the mark) records no
 * password baseline: the password was public and unguarded before the mark, so
 * it may already have been changed, and the first restore then resets it and
 * records the baseline itself.
 */
async function record(
  db: Db,
  auth: DemoAuth,
  uid: string,
  claims: unknown,
  { baseline = true }: { baseline?: boolean } = {},
): Promise<void> {
  const fresh = baseline ? await auth.getUser(uid) : undefined;
  await configRef(db).set({
    uid,
    tokensValidAfter: fresh?.tokensValidAfterTime ?? null,
    claims: claims ?? {},
  });
}

export type MarkResult =
  | { outcome: 'would-mark' | 'marked'; uid: string; claimAdded: boolean }
  | { outcome: 'refused'; reason: string };

/**
 * By --uid, or by the demo email. Run the dry run first and check the uid: if
 * someone changed the demo email and another account took it, the email finds
 * that account. So once config/demoAccount names an account, the email may
 * only find that same one (the re-run after the functions deploy); marking a
 * different account needs an explicit --uid. Lookup errors other than a
 * missing account (credentials, project, network) are thrown, not reported as
 * a missing account.
 */
export async function markDemoAccount(
  db: Db,
  auth: DemoAuth,
  opts: { uid?: string; apply: boolean },
): Promise<MarkResult> {
  let user: DemoUserRecord;
  try {
    user = opts.uid ? await auth.getUser(opts.uid) : await auth.getUserByEmail(DEMO_ACCOUNT_EMAIL);
  } catch (error) {
    if (authCode(error) !== 'auth/user-not-found') throw error;
    return { outcome: 'refused', reason: 'no such account (pass --uid if its email was changed)' };
  }
  const recordedUid = (await configRef(db).get()).data()?.uid;
  if (!opts.uid && typeof recordedUid === 'string' && recordedUid && recordedUid !== user.uid) {
    return {
      outcome: 'refused',
      reason: `the demo email now belongs to ${user.uid}, not the marked account ${recordedUid} (pass --uid to change it)`,
    };
  }
  const claimAdded = user.customClaims?.[DEMO_CLAIM] !== true;
  if (!opts.apply) return { outcome: 'would-mark', uid: user.uid, claimAdded };
  await ensureClaim(db, auth, user);
  await record(
    db,
    auth,
    user.uid,
    { ...(user.customClaims ?? {}), [DEMO_CLAIM]: true },
    { baseline: false },
  );
  return { outcome: 'marked', uid: user.uid, claimAdded };
}

/** Where an account that took the demo email is moved; it is also disabled. */
export const squattedEmail = (uid: string) => `squatted-${uid}@invalid.regroup-app.com`;

/**
 * Runs `write`, first freeing the demo email if another account holds it:
 * once someone changed the demo email, free signup could register it on
 * another account. That account is moved to a parking address, disabled and
 * signed out. Returns the squatter's uid, if any.
 */
async function withDemoEmailFree(auth: DemoAuth, uid: string, write: () => Promise<unknown>) {
  try {
    await write();
    return undefined;
  } catch (error) {
    if (authCode(error) !== 'auth/email-already-exists') throw error;
  }
  const squatter = await auth.getUserByEmail(DEMO_ACCOUNT_EMAIL);
  if (squatter.uid === uid) throw new Error('demo email reported taken by the demo account itself');
  await auth.updateUser(squatter.uid, { email: squattedEmail(squatter.uid), disabled: true });
  await auth.revokeRefreshTokens(squatter.uid);
  await write();
  return squatter.uid;
}

interface Changes {
  emailChanged: boolean;
  passwordChanged: boolean;
  /** The password provider was unlinked; setting the password puts it back. */
  passwordMissing: boolean;
  /** Providers other than the password, which the restore unlinks. */
  providersUnlinked: string[];
  phoneCleared: boolean;
  mfaCleared: boolean;
}

function changesOf(user: DemoUserRecord, tokensValidAfter: unknown): Changes {
  return {
    emailChanged: (user.email ?? '').toLowerCase() !== DEMO_ACCOUNT_EMAIL,
    passwordChanged: (user.tokensValidAfterTime ?? null) !== (tokensValidAfter ?? null),
    passwordMissing: !(user.providerData ?? []).some((p) => p.providerId === 'password'),
    // Phone goes through phoneNumber: null (the SDK refuses unlinking it both ways).
    providersUnlinked: (user.providerData ?? [])
      .map((p) => p.providerId)
      .filter((id) => id !== 'password' && id !== 'phone'),
    phoneCleared: !!user.phoneNumber,
    mfaCleared: (user.multiFactor?.enrolledFactors?.length ?? 0) > 0,
  };
}

const tampered = (c: Changes) =>
  c.emailChanged ||
  c.passwordChanged ||
  c.passwordMissing ||
  c.providersUnlinked.length > 0 ||
  c.phoneCleared ||
  c.mfaCleared;

export type RestoreResult =
  | { outcome: 'not-configured' }
  | { outcome: 'recreated'; uid: string; squatterUid?: string }
  | ({
      outcome: 'intact' | 'restored';
      uid: string;
      claimAdded: boolean;
      squatterUid?: string;
    } & Changes);

export async function restoreDemoAccount(db: Db, auth: DemoAuth): Promise<RestoreResult> {
  const config = (await configRef(db).get()).data();
  const uid = typeof config?.uid === 'string' ? config.uid : '';
  if (!uid) return { outcome: 'not-configured' };
  const savedClaims =
    config?.claims && typeof config.claims === 'object'
      ? (config.claims as Record<string, unknown>)
      : {};

  let user: DemoUserRecord;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    if (authCode(error) !== 'auth/user-not-found') throw error;
    // Deleted: recreate it at the same uid, so its data and roles line up again.
    const squatterUid = await withDemoEmailFree(auth, uid, () =>
      auth.createUser({ uid, ...SIGN_IN }),
    );
    await setClaims(db, auth, uid, savedClaims);
    await record(db, auth, uid, { ...savedClaims, [DEMO_CLAIM]: true });
    return { outcome: 'recreated', uid, ...(squatterUid ? { squatterUid } : {}) };
  }

  const changes = changesOf(user, config?.tokensValidAfter);
  const claimAdded = await ensureClaim(db, auth, user);
  if (!tampered(changes)) return { outcome: 'intact', uid, claimAdded, ...changes };

  const update: DemoUpdate = {
    ...SIGN_IN,
    ...(changes.providersUnlinked.length ? { providersToUnlink: changes.providersUnlinked } : {}),
    ...(changes.phoneCleared ? { phoneNumber: null } : {}),
    ...(changes.mfaCleared ? { multiFactor: { enrolledFactors: null } } : {}),
  };
  const squatterUid = await withDemoEmailFree(auth, uid, () => auth.updateUser(uid, update));
  // Whoever changed it keeps no session.
  await auth.revokeRefreshTokens(uid);
  await record(
    db,
    auth,
    uid,
    config?.claims ?? { ...(user.customClaims ?? {}), [DEMO_CLAIM]: true },
  );
  return {
    outcome: 'restored',
    uid,
    claimAdded,
    ...changes,
    ...(squatterUid ? { squatterUid } : {}),
  };
}
