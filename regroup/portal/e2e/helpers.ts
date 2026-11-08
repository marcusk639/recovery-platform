import { test as base, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:18080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
if (getApps().length === 0) initializeApp({ projectId: 'demo-regroup-e2e' });

export const admin = () => getFirestore();

const ACCOUNTS = {
  manager: { email: 'test-manager@rats-e2e.com', house: 'test-house-123' },
  'oxford-operator': { email: 'test-oxford-operator@rats-e2e.com', house: 'test-house-oxford' },
};
export type Account = keyof typeof ACCOUNTS;

export function reseed(env: NodeJS.ProcessEnv = {}): void {
  execFileSync('scripts/seed.sh', { stdio: 'pipe', env: { ...process.env, ...env } });
}

export async function signInAs(page: Page, account: Account): Promise<void> {
  const { email, house } = ACCOUNTS[account];
  await page.goto(`/?house=${house}`);
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(process.env.E2E_TEST_PASSWORD!);
  await page.locator('#sign-in-submit').click();
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 20_000 });
}

export async function revokeClaimsAndRefresh(page: Page, account: Account): Promise<void> {
  const user = await getAuth().getUserByEmail(ACCOUNTS[account].email);
  await getAuth().setCustomUserClaims(user.uid, {});
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
        const { protocol, hostname } = new URL(route.request().url());
        if (protocol === 'data:' || protocol === 'blob:' || hostname === '127.0.0.1' || hostname === 'localhost') {
          return route.continue();
        }
        external.push(hostname);
        return route.abort();
      });
      page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`.slice(0, 300)));
      await use();
      expect(external, 'browser requests outside this machine').toEqual([]);
      if (!allowPageErrors) expect(pageErrors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
