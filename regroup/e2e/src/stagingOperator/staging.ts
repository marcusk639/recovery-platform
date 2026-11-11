import * as fs from 'fs';

/** The only project this command may touch. Nothing overrides it. */
export const STAGING_PROJECT_ID = 'regroup-e2e';

/**
 * regroup-e2e's project number. The config file names a project, but the API key decides
 * where signUp creates the account, so the key's own project is checked against this.
 */
export const STAGING_PROJECT_NUMBER = '706803426891';

/** The project a Firebase ID token was issued for (its `aud`), or undefined if unreadable. */
export function tokenAudience(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload?.aud === 'string' ? payload.aud : undefined;
  } catch {
    return undefined;
  }
}

export interface StagingConfig {
  apiKey: string;
  projectId: typeof STAGING_PROJECT_ID;
}

const CONFIG_HINT =
  'Expected ~/.config/regroup-e2e/firebase-web-config.json with the regroup-e2e web app config.';

export function readStagingConfig(
  file: string,
  read: (f: string) => string = (f) => fs.readFileSync(f, 'utf8'),
): StagingConfig {
  let parsed: { apiKey?: unknown; projectId?: unknown };
  try {
    parsed = JSON.parse(read(file));
  } catch (err) {
    throw new Error(
      `Could not read the staging config at ${file}: ${(err as Error).message}. ${CONFIG_HINT}`,
    );
  }
  if (parsed.projectId !== STAGING_PROJECT_ID) {
    throw new Error(
      `The config at ${file} is for project ${String(parsed.projectId)}, not ${STAGING_PROJECT_ID}. ${CONFIG_HINT}`,
    );
  }
  if (typeof parsed.apiKey !== 'string' || parsed.apiKey === '') {
    throw new Error(`The config at ${file} has no apiKey. ${CONFIG_HINT}`);
  }
  return { apiKey: parsed.apiKey, projectId: STAGING_PROJECT_ID };
}

/**
 * The users/{uid} document the web's operator signup writes: createSuperAdmin, then
 * convertFirebaseUserToRatsUser (regroup/web/src/app/services/auth/auth-service.service.ts).
 * subscriptionMetadata stays empty: only createOperatorSubscription may fill it, and the
 * users create rule refuses anything else.
 */
export function buildOperatorUserDoc(uid: string, email: string): Record<string, unknown> {
  return {
    id: uid,
    uid,
    email,
    billingEmail: email,
    isSuperAdmin: true,
    potentialSuperAdmin: true,
    termsOfService: true,
    emailVerified: true,
    isAdmin: false,
    houseAccountVerified: false,
    isAnonymous: false,
    houseCode: null,
    subscriptionMetadata: {
      subscriptionId: '',
      currentPeriodEnd: 0,
      status: '',
      customerId: '',
      items: { guestItemId: '', houseItemId: '' },
      houses: {},
    },
  };
}

// assertCanCreateHouses (functions/src/houses/createHousesTx.ts) after
// operatorStatusToHouseStatus (functions/src/util/entitlement.ts), which maps
// "cancelling" to active because it still bills until the period ends.
const ENTITLED_STATUSES = new Set(['active', 'trialing', 'cancelling']);

export function canCreateHouses(meta: unknown): boolean {
  if (meta === null || typeof meta !== 'object') return false;
  const { tier, status } = meta as { tier?: unknown; status?: unknown };
  return typeof tier === 'string' && tier !== '' && ENTITLED_STATUSES.has(String(status));
}

const PASSWORD_BYTES = 18;

export function newOperatorCredentials(
  now: Date,
  random: (bytes: number) => Buffer,
): { email: string; password: string } {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const suffix = random(2).toString('hex');
  return {
    email: `operator-${stamp}-${suffix}@rats-e2e.com`,
    password: random(PASSWORD_BYTES).toString('base64url'),
  };
}
