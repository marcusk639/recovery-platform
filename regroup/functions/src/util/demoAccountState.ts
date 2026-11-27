/**
 * Keeps the shared demo account intact (S5, REV-A8). Its password ships in the
 * app, so anyone signed in as it can change its email or password through
 * Firebase Auth, which offers no per-account lock: an email change would have
 * escaped an email-based guard, and a password change locks App Review out.
 *
 * - `markDemoAccount` (owner script `npm run demo:mark-account`) sets the
 *   `demo: true` claim the guards read and records the account in the
 *   server-only `config/demoAccount` doc.
 * - `restoreDemoAccount` (scheduled, `scheduled/index.ts`) puts back the email
 *   and password when either changed, signs every session of the account out,
 *   and re-adds the claim if it is missing. A password change shows as a new
 *   `tokensValidAfterTime`, which Auth bumps on every password change.
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
  customClaims?: Record<string, unknown>;
  tokensValidAfterTime?: string;
}

export interface DemoAuth {
  getUser(uid: string): Promise<DemoUserRecord>;
  getUserByEmail(email: string): Promise<DemoUserRecord>;
  setCustomUserClaims(uid: string, claims: object | null): Promise<void>;
  updateUser(
    uid: string,
    props: {
      email: string;
      password?: string;
      emailVerified?: boolean;
      disabled?: boolean;
    },
  ): Promise<unknown>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

type Db = FirebaseFirestore.Firestore;
const configRef = (db: Db) =>
  db.collection(DEMO_CONFIG_PATH.collection).doc(DEMO_CONFIG_PATH.doc);
const authCode = (error: unknown) => (error as { code?: unknown } | null)?.code;

async function ensureClaim(
  db: Db,
  auth: DemoAuth,
  user: DemoUserRecord,
): Promise<boolean> {
  if (user.customClaims?.[DEMO_CLAIM] === true) return false;
  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims ?? {}),
    [DEMO_CLAIM]: true,
  });
  // As util/userClaims does: the app refreshes its token on this stamp.
  await db
    .collection(CLAIMS_UPDATES_COLLECTION)
    .doc(user.uid)
    .set({ updatedAt: new Date() });
  return true;
}

export type MarkResult =
  | { outcome: "would-mark" | "marked"; uid: string; claimAdded: boolean }
  | { outcome: "refused"; reason: string };

export async function markDemoAccount(
  db: Db,
  auth: DemoAuth,
  opts: { uid?: string; apply: boolean },
): Promise<MarkResult> {
  let user: DemoUserRecord;
  try {
    user = opts.uid
      ? await auth.getUser(opts.uid)
      : await auth.getUserByEmail(DEMO_ACCOUNT_EMAIL);
  } catch {
    return {
      outcome: "refused",
      reason: "no such account (pass --uid if its email was changed)",
    };
  }
  const claimAdded = user.customClaims?.[DEMO_CLAIM] !== true;
  if (!opts.apply) return { outcome: "would-mark", uid: user.uid, claimAdded };
  await ensureClaim(db, auth, user);
  const fresh = await auth.getUser(user.uid);
  await configRef(db).set({
    uid: user.uid,
    tokensValidAfter: fresh.tokensValidAfterTime ?? null,
  });
  return { outcome: "marked", uid: user.uid, claimAdded };
}

/** Where an account that took the demo email is moved; it is also disabled. */
export const squattedEmail = (uid: string) =>
  `squatted-${uid}@invalid.regroup-app.com`;

/**
 * Puts the demo email and password back. Once someone changed the email, the
 * address was free and free signup could register it on another account; that
 * account is moved to a parking address, disabled and signed out first, or the
 * restore would fail on every run (auth/email-already-exists) while the Demo
 * link signed in to the squatter. Returns the squatter's uid, if any.
 */
async function putBack(
  auth: DemoAuth,
  uid: string,
): Promise<string | undefined> {
  const props = {
    email: DEMO_ACCOUNT_EMAIL,
    password: DEMO_ACCOUNT_PASSWORD,
    emailVerified: true,
  };
  try {
    await auth.updateUser(uid, props);
    return undefined;
  } catch (error) {
    if (authCode(error) !== "auth/email-already-exists") throw error;
  }
  const squatter = await auth.getUserByEmail(DEMO_ACCOUNT_EMAIL);
  if (squatter.uid === uid)
    throw new Error("demo email reported taken by the demo account itself");
  await auth.updateUser(squatter.uid, {
    email: squattedEmail(squatter.uid),
    disabled: true,
  });
  await auth.revokeRefreshTokens(squatter.uid);
  await auth.updateUser(uid, props);
  return squatter.uid;
}

export type RestoreResult =
  | { outcome: "not-configured" }
  | { outcome: "missing"; uid: string }
  | {
      outcome: "intact" | "restored";
      uid: string;
      emailChanged: boolean;
      passwordChanged: boolean;
      claimAdded: boolean;
      /** The account that had taken the demo email, now disabled. */
      squatterUid?: string;
    };

export async function restoreDemoAccount(
  db: Db,
  auth: DemoAuth,
): Promise<RestoreResult> {
  const config = (await configRef(db).get()).data();
  const uid = typeof config?.uid === "string" ? config.uid : "";
  if (!uid) return { outcome: "not-configured" };

  let user: DemoUserRecord;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    if (authCode(error) === "auth/user-not-found")
      return { outcome: "missing", uid };
    throw error;
  }
  const emailChanged = (user.email ?? "").toLowerCase() !== DEMO_ACCOUNT_EMAIL;
  const passwordChanged =
    (user.tokensValidAfterTime ?? null) !== (config?.tokensValidAfter ?? null);
  const claimAdded = await ensureClaim(db, auth, user);
  if (!emailChanged && !passwordChanged) {
    return {
      outcome: "intact",
      uid,
      emailChanged,
      passwordChanged,
      claimAdded,
    };
  }
  const squatterUid = await putBack(auth, uid);
  // Whoever changed them keeps no session.
  await auth.revokeRefreshTokens(uid);
  const fresh = await auth.getUser(uid);
  await configRef(db).set({
    uid,
    tokensValidAfter: fresh.tokensValidAfterTime ?? null,
  });
  return {
    outcome: "restored",
    uid,
    emailChanged,
    passwordChanged,
    claimAdded,
    ...(squatterUid ? { squatterUid } : {}),
  };
}
