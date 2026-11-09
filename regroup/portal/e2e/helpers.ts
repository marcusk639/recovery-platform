import { test as base, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
if (getApps().length === 0) initializeApp({ projectId: 'demo-regroup-e2e' });

export const admin = () => getFirestore();

const ACCOUNTS = {
  manager: { email: 'test-manager@rats-e2e.com', house: 'test-house-123' },
  'oxford-operator': { email: 'test-oxford-operator@rats-e2e.com', house: 'test-house-oxford' },
};
export type Account = keyof typeof ACCOUNTS;

export const SECOND_HOUSE = 'test-house-b';

// The seed's operators run one house each. This makes the manager run two, with a
// resident in the second, the portal's main case.
export async function addSecondHouseForManager(status: 'active' | 'canceled' = 'active'): Promise<void> {
  const user = await getAuth().getUserByEmail(ACCOUNTS.manager.email);
  const house = (await admin().doc('houses/test-house-123').get()).data()!;
  await admin().doc(`houses/${SECOND_HOUSE}`).set({ ...house, id: SECOND_HOUSE, name: 'Second House' });
  const role = (await admin().doc(`house-roles/test-house-123_${user.uid}`).get()).data()!;
  await admin().doc(`house-roles/${SECOND_HOUSE}_${user.uid}`).set(role);
  const guest = (await admin().doc('guests/guest-b').get()).data()!;
  await admin().doc('guests/guest-c').set({
    ...guest,
    id: 'guest-c',
    userId: '',
    houseId: SECOND_HOUSE,
    firstName: 'Cara',
    lastName: 'Second',
    displayName: 'Cara Second',
  });
  await admin().doc(`admins/${user.uid}`).update({ houseIds: FieldValue.arrayUnion(SECOND_HOUSE) });
  const claims = user.customClaims as { admin: object; superAdmin: object };
  await getAuth().setCustomUserClaims(user.uid, {
    ...claims,
    admin: { ...claims.admin, [SECOND_HOUSE]: true },
    superAdmin: { ...claims.superAdmin, [SECOND_HOUSE]: true },
  });
  // The create trigger stamps a status, so set the wanted one after it has run.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await admin().doc(`houses/${SECOND_HOUSE}`).update({ subscriptionStatus: status });
}

export function reseed(env: NodeJS.ProcessEnv = {}): void {
  execFileSync('scripts/seed.sh', { stdio: 'pipe', env: { ...process.env, ...env } });
}

export async function fillSignIn(page: Page, email: string): Promise<void> {
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(process.env.E2E_TEST_PASSWORD!);
  await page.locator('#sign-in-submit').click();
}

// Signs in without assuming the person gets into the portal.
export async function signInAsRaw(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await fillSignIn(page, email);
}

export async function signInAs(page: Page, account: Account): Promise<void> {
  const { email, house } = ACCOUNTS[account];
  await page.goto(`/houses/${house}/residents`);
  await fillSignIn(page, email);
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 20_000 });
}

export async function clearClaims(account: Account): Promise<void> {
  const user = await getAuth().getUserByEmail(ACCOUNTS[account].email);
  await getAuth().setCustomUserClaims(user.uid, {});
}

// Clearing claims alone isn't removal: the server re-grants them to a house's
// primary owner when the phone's sign-in code asks it to recover missing roles.
export async function removeFromHouse(account: Account): Promise<void> {
  const { email, house } = ACCOUNTS[account];
  const user = await getAuth().getUserByEmail(email);
  await admin().doc(`house-roles/${house}_${user.uid}`).delete();
  await clearClaims(account);
}

export async function revokeClaimsAndRefresh(page: Page, account: Account): Promise<void> {
  await clearClaims(account);
  await page.evaluate(() => (window as any).__portalTest.refreshToken());
}

// Fails a test on any non-loopback browser request or uncaught page error.
export const test = base.extend<{ allowPageErrors: boolean; guards: void; pageErrors: string[] }>({
  allowPageErrors: [false, { option: true }],
  pageErrors: async ({}, use) => use([]),
  guards: [
    async ({ page, allowPageErrors, pageErrors }, use) => {
      const external: string[] = [];
      await page.route('**/*', (route) => {
        const { protocol, hostname, pathname } = new URL(route.request().url());
        // The Firestore SDK's own connectivity check when offline. It carries no data.
        if (hostname === 'www.google.com' && pathname === '/images/cleardot.gif') return route.abort();
        if (protocol === 'data:' || protocol === 'blob:' || hostname === '127.0.0.1' || hostname === 'localhost') {
          return route.continue();
        }
        external.push(hostname);
        return route.abort();
      });
      page.on('pageerror', (error) => {
        pageErrors.push(`${error.name}: ${error.message}`.slice(0, 300));
        if (process.env.PORTAL_E2E_DEBUG) console.log('[pageerror]', error.stack?.slice(0, 1200));
      });
      if (process.env.PORTAL_E2E_DEBUG) {
        page.on('console', (m) => {
          if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 500));
        });
      }
      await use();
      expect(external, 'browser requests outside this machine').toEqual([]);
      if (!allowPageErrors) expect(pageErrors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
