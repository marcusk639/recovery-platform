# Regroup Portal P2: Sign-in, Access and Desktop Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace P1's test harness with the portal's real frame: sign-in that survives a reload but not a closed tab, access decided by role and subscription, idle sign-out, and a desktop shell with real URLs.

**Architecture:** `src/harness` becomes `src/app`. Mobile code stays read-only behind `@mobile/*`. Access rules are small pure functions, tested on their own, and the shell reuses the phone's `SubscriptionGate`, role helpers and thunks rather than reimplementing them. Test hooks exist only in builds made with `--e2e`.

**Tech Stack:** As in P1: React 19, react-native-web 0.21, Firebase JavaScript modular SDK, esbuild, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`. Sequence: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`.

## Global Constraints

P1's constraints carry over unchanged:

- Nothing edits `regroup/mobile`. If a step seems to need it, stop and report it as a finding.
- Nothing touches `phoenix-cleanhouse` or `regroup-e2e`. Everything runs on loopback emulators under `demo-regroup-e2e`, and browser tests fail on any non-loopback request.
- No production or staging deploys. `firebase-setup.ts` keeps no production config, which P7 adds.
- The portal must never block a mobile PR. Its CI job keeps `continue-on-error: true`.
- A shipped build must never silently stub a native feature.
- No personal data in logs, URLs, analytics or error reports. URLs carry ids only.
- Don't kill or reuse emulators on the default ports.
- New source files stay at 300 lines or fewer. Commit scopes use `regroup-portal`. Never use `--no-verify`.
- Work only in `~/dev/rp-regroup-portal`, with `git -C <path>`. Quote `"${B}:path"` in zsh. Serena indexes the main checkout, so use Read and Grep on worktree paths.
- **Keeping up with #160.** Before each task, fetch. If `origin/chore/regroup-rn-upgrade` moved, rebase on it. Once #160 merges (a squash), use `git rebase --onto origin/main <last base SHA>`.

New for P2, from the spec's section 6:

- Sign out automatically after **15 minutes** idle, and keep the session out of persistent browser storage.
- Don't use the phone's `logout` thunk. It signs in anonymously afterward, which would write an anonymous user. Use `signOutAndReset` from Task 2.
- Long runs: the full browser suite takes over 7 minutes, so run it in the background.

**Known phone bugs this plan works around rather than fixes:** #193 (`HouseGate` waits for the house before rendering screens). The medication crash (#194) stays behind the error boundary.

## Review Focus

1. **Signing out, then pressing Back:** no resident data appears, and it is gone from memory (test in Task 2).
2. **Opening a URL for a house the operator doesn't run:** a clear message, no resident data, and no reads of that house's residents (test in Task 4).
3. **A long-open tab after access is removed:** a clear message instead of screens that fail one read at a time (test in Task 5).
4. **Typing a long form for 20 minutes:** activity keeps the session, so nothing is lost (test in Task 3).
5. **Clicking away from a crashed screen:** navigation still works, instead of being stuck on the error (test in Task 4).

---

## File Structure

```
regroup/portal/src/app/          (moved from src/harness)
  main.tsx                       Entry: preload, i18n, providers, app
  Providers.tsx, routes.tsx      As in P1, plus linking
  urls.ts                        URL scheme: sections, paths, linking config
  session.ts                     useRestoreSession, signOutAndReset
  access.ts                      accessFor, operatorHouseIds, canAccessHouse
  idle-timer.ts                  createIdleTimer
  useIdleSignOut.ts              Wires the idle timer to the browser
  useClaimsRefresh.ts            Refreshes claims on focus and on an interval
  SignIn.tsx                     Real sign-in form
  AccessGate.tsx                 Decides what a signed-in person may see
  Shell.tsx, Sidebar.tsx         The desktop frame
  HouseGate.tsx                  House access and loading, wraps screens
  Home.tsx                       Simple house list, replaced by P3's table
  test-hooks.ts                  window.__portalTest, in --e2e builds only
regroup/portal/tests/{access,idle-timer,urls}.test.ts
regroup/portal/e2e/{session,access,shell}.spec.ts
```

---

### Task 1: Sign-in and session restore

**Files:**

- Move: `src/harness/*` to `src/app/*` (with `tools/bundle.mjs`'s entry)
- Create: `src/app/session.ts`, `e2e/session.spec.ts`
- Modify: `src/adapter/firebase-setup.ts`, `src/app/SignIn.tsx`, `src/app/main.tsx`, `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md` (P2 row names this plan)

**Interfaces:**

- Produces: `useRestoreSession(): 'checking' | 'signed-out' | 'signed-in'`. It subscribes to `onAuthStateChanged`, dispatches the phone's `autoLogin(user)` for a restored session, and returns `'signed-in'` once `state.user.loggedIn` is true. `SignIn` takes no props.

- [ ] **Step 1: Write the failing journey**

```ts
test('a reload returns to a working screen without signing in again', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await page.reload();
  await expect(page.locator('#sign-in-form')).toHaveCount(0);
  await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 15_000 });
});
test('the session is kept out of persistent storage', async ({ page }) => {
  await signInAs(page, 'manager');
  const stored = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    databases: (await indexedDB.databases()).map((d) => d.name),
    session: Object.keys(sessionStorage).some((k) => k.startsWith('firebase:authUser')),
  }));
  expect(stored.local).not.toContain('firebase:authUser');
  expect(stored.databases).not.toContain('firebaseLocalStorageDb');
  expect(stored.session).toBe(true);
});
test('a new tab has to sign in', async ({ page, context }) => {
  await signInAs(page, 'manager');
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
});
test('a wrong password shows a message that does not say which part was wrong', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#sign-in-email').fill('test-manager@rats-e2e.com');
  await page.locator('#sign-in-password').fill('wrong-password');
  await page.locator('#sign-in-submit').click();
  await expect(page.getByRole('alert')).toContainText('email or password');
  await expect(page.locator('#sign-in-form')).toBeVisible();
});
test('the sign-in button cannot double-submit', async ({ page }) => {
  // #sign-in-submit is disabled while a sign-in is in flight
});
test('sign-in links to password reset on the existing site', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /forgot/i })).toHaveAttribute('href', /\/reset$/);
});
```

`signInAs` keeps its P1 meaning. `e2e/session.spec.ts` uses the same fixture and `test.beforeEach(() => reseed())`.

- [ ] **Step 2: Run it to verify it fails**

Run: `scripts/e2e.sh e2e/session.spec.ts`
Expected: the reload, storage, reset-link and message tests FAIL.

- [ ] **Step 3: Implement the session**

- `firebase-setup.ts`: use `initializeAuth(app, { persistence: browserSessionPersistence })`, not `getAuth(app)`. Session storage lasts through reloads and ends with the tab.
- `session.ts`: `useRestoreSession` as above. If `autoLogin` rejects, sign out and return `'signed-out'`.
- `SignIn.tsx`: labelled fields, the submit button disabled while in flight, and a role `alert` message. Show "That email or password isn't right" for credential errors, and "Could not sign in. Check your connection and try again." for anything else. Link "Forgot password?" to `${WEB_BASE_URL}/reset`, using `WEB_BASE_URL` from the phone's `SubscriptionRequiredScreen`.

- [ ] **Step 4: Run the journeys**

Run: `npx vitest run && npm run typecheck && scripts/e2e.sh e2e/session.spec.ts e2e/residents.spec.ts`
Expected: PASS. Update P1's "reloading" test to require the working screen rather than accepting the form.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add docs/superpowers/plans regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): sign-in and per-tab session restore"
```

---

### Task 2: Who may enter, the subscription gate and signing out

**Files:**

- Create: `src/app/access.ts`, `src/app/AccessGate.tsx`, `tests/access.test.ts`, `e2e/access.spec.ts`
- Modify: `src/app/session.ts`, `src/app/main.tsx`

**Interfaces:**

- Consumes: `useRestoreSession` from Task 1.
- Produces:
  - `accessFor(user: AccessUser | null, roles: Record<string, string>): 'operator' | 'setup-incomplete' | 'resident' | 'none'`
  - `operatorHouseIds(roles): string[]`
  - `canAccessHouse(roles, houseId): boolean`
  - `signOutAndReset(reason?: 'idle'): Promise<void>`: signs out of Firebase, stores the reason in `sessionStorage` under `portal-signout-reason`, then `location.replace('/')`. The full page load is the point, since it wipes the Redux store and query cache.
  - `AccessGate` wraps the shell. Roles come from the phone's `getRolesFromClaims(state.user.token.claims)`.

- [ ] **Step 1: Write the failing unit tests**

```ts
const roles = { h1: 'admin', h2: 'guest', h3: 'superAdmin' };
test('admin and superAdmin houses are operator houses', () => {
  expect(operatorHouseIds(roles)).toEqual(['h1', 'h3']);
});
test('a house held only as a guest is not accessible', () => {
  expect(canAccessHouse(roles, 'h2')).toBe(false);
  expect(canAccessHouse(roles, 'h1')).toBe(true);
  expect(canAccessHouse(roles, 'unknown')).toBe(false);
});
test('a resident with no staff role is sent to the phone', () => {
  expect(accessFor({ isGuest: true }, { h2: 'guest' })).toBe('resident');
});
// Senior-peer residents hold guest and admin claims, and peer leaders are in scope.
test('a peer leader who is also a resident is an operator', () => {
  expect(accessFor({ isGuest: true, isAdmin: true }, { h1: 'admin' })).toBe('operator');
});
test('an owner who has not finished setup is sent to the phone', () => {
  expect(accessFor({ isSuperAdmin: true, orgSetupCompleted: false }, { h1: 'superAdmin' })).toBe(
    'setup-incomplete',
  );
  expect(accessFor({ potentialSuperAdmin: true, orgSetupCompleted: false }, {})).toBe(
    'setup-incomplete',
  );
});
test('someone with no roles has no access', () => {
  expect(accessFor({}, {})).toBe('none');
  expect(accessFor(null, {})).toBe('none');
});
```

- [ ] **Step 2: Write the failing journeys**

```ts
test('a resident is told to use the phone and can sign out', async ({ page }) => {
  await signInAsRaw(page, 'test-guest-a@rats-e2e.com');
  await expect(page.getByText(/use the Regroup app on your phone/i)).toBeVisible();
  await expect(page.locator('#nav-residents')).toHaveCount(0);
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
});
test('a lapsed operator sees the subscription screen, not the portal', async ({ page }) => {
  await admin().doc('users/e2e-manager').update({ 'subscriptionMetadata.status': 'canceled' });
  await signInAsRaw(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('guest-list-item')).toHaveCount(0);
  await expect(page.getByText(/subscription/i).first()).toBeVisible();
});
test('signing out then pressing Back shows no resident data', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});
test('signing out never creates an anonymous user', async ({ page }) => {
  // users count in the Auth emulator is unchanged after sign-out
});
```

Add `signInAsRaw(page, email)` to `helpers.ts`, which signs in without waiting for the navigation. Find the exact subscription copy in `SubscriptionRequiredScreen.tsx` and use it in place of `/subscription/i`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/access.test.ts && scripts/e2e.sh e2e/access.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

`AccessGate`:

- `'operator'`: the phone's `SubscriptionGate` around children. It already handles loading, `subscription_required` and grace, and re-checks when the tab regains focus through `AppState`.
- `'resident'`, `'setup-incomplete'`, `'none'`: a plain page saying what to do, with `#sign-out`. Copy: "The Regroup portal is for house operators and staff. Please use the Regroup app on your phone." For setup: "Finish setting up your houses in the Regroup app on your phone, then come back."

The sign-in page shows "You were signed out after 15 minutes of inactivity." when the stored reason is `idle`, then clears it.

- [ ] **Step 5: Run tests**

Run: `npx vitest run && npm run typecheck && scripts/e2e.sh e2e/access.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): role and subscription access, and a clean sign-out"
```

---

### Task 3: Idle sign-out

**Files:**

- Create: `src/app/idle-timer.ts`, `src/app/useIdleSignOut.ts`, `tests/idle-timer.test.ts`
- Modify: `src/app/AccessGate.tsx`, `e2e/session.spec.ts`

**Interfaces:**

- Consumes: `signOutAndReset` from Task 2.
- Produces: `createIdleTimer({ timeoutMs, now, onIdle }): { activity(): void; check(): void }`. `IDLE_TIMEOUT_MS = 15 * 60 * 1000`.

- [ ] **Step 1: Write the failing tests**

```ts
test('fires once after the timeout with no activity', () => {
  /* now advanced to 15:00, check() twice, onIdle once */
});
test('does not fire one millisecond early', () => {
  /* 14:59.999 */
});
test('activity restarts the clock', () => {
  /* 14:00, activity, 14:00 more, not fired */
});
test('a check after a long gap fires, as when a laptop wakes or a hidden tab resumes', () => {
  /* jump 2 hours, check */
});
```

```ts
test('15 idle minutes signs out and says why', async ({ page }) => {
  await page.clock.install();
  await signInAs(page, 'manager');
  await page.clock.fastForward('15:01');
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await expect(page.getByText(/signed out after 15 minutes/i)).toBeVisible();
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});
test('typing keeps the session', async ({ page }) => {
  await page.clock.install();
  await signInAs(page, 'manager');
  await page.click('#nav-payments');
  await page.getByTestId('manual-payment-fab').click();
  for (let i = 0; i < 3; i++) {
    await page.clock.fastForward('10:00');
    await page.getByPlaceholder('Notes (optional)').pressSequentially('a');
  }
  await expect(page.locator('#sign-in-form')).toHaveCount(0);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/idle-timer.test.ts && scripts/e2e.sh e2e/session.spec.ts -g "idle|typing"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`useIdleSignOut` listens in the capture phase on `window` for `pointerdown`, `pointermove`, `keydown`, `wheel` and `touchstart`, so activity inside open Modals counts. It checks on a 30-second interval and on `visibilitychange` and `focus`, because browsers throttle timers in hidden tabs. It runs only inside `AccessGate`, so the sign-in page has no timer.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): sign out after 15 idle minutes"
```

---

### Task 4: Desktop shell and URLs

**Files:**

- Create: `src/app/urls.ts`, `src/app/Shell.tsx`, `src/app/Sidebar.tsx`, `src/app/HouseGate.tsx`, `src/app/Home.tsx`, `tests/urls.test.ts`, `e2e/shell.spec.ts`
- Delete: `src/app/Nav.tsx`
- Modify: `src/app/main.tsx`, `src/app/Providers.tsx`, `src/app/routes.tsx`, `tools/serve.mjs`, `index.html`, `e2e/helpers.ts`, `e2e/documents.spec.ts`

**Interfaces:**

- Consumes: `canAccessHouse`, `operatorHouseIds`, `signOutAndReset`.
- Produces: `SECTIONS`, `sectionPath(houseId: string, section: Section): string`, `houseIdFromPath(pathname: string): string | null` and `linkingConfig(origin: string)`. Link ids: `nav-home`, `nav-house-summary`, `nav-residents`, `nav-applications`, `nav-payments`, `nav-disputes`, `nav-activities`, `nav-reports`, and `sign-out`.

URL scheme (Builder's call):

| Path                            | Route                     |
| ------------------------------- | ------------------------- |
| `/`                             | Home                      |
| `/houses/:houseId`              | `Routes.HouseSummary`     |
| `/houses/:houseId/residents`    | `Routes.GuestList`        |
| `/houses/:houseId/applications` | `Routes.ApplicationList`  |
| `/houses/:houseId/payments`     | `Routes.PaymentDashboard` |
| `/houses/:houseId/disputes`     | `Routes.HouseDisputes`    |
| `/houses/:houseId/activities`   | `Routes.Activities`       |
| `/houses/:houseId/reports`      | `Routes.AdminReport`      |

The other reused routes stay registered with no path, until later plans give them one.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('sectionPath builds the scheme', () => {
  expect(sectionPath('h1', 'residents')).toBe('/houses/h1/residents');
  expect(sectionPath('h1', 'summary')).toBe('/houses/h1');
});
test('houseIdFromPath finds the house', () => {
  expect(houseIdFromPath('/houses/h1/payments')).toBe('h1');
  expect(houseIdFromPath('/houses/h1')).toBe('h1');
  expect(houseIdFromPath('/')).toBeNull();
});
test('every section has a real route name', () => {
  /* linkingConfig values all defined */
});
```

- [ ] **Step 2: Write the failing journeys**

```ts
test('a house URL opens that house after sign-in', async ({ page }) => {
  await page.goto('/houses/test-house-123/residents');
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/houses/test-house-123/residents');
});
test('sidebar links change the URL, and Back returns', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-payments');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/payments$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents$/);
});
test("home lists the operator's houses and links into one", async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
});
test('a house the operator does not run shows a message and no residents', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('test-house-123') && r.url().includes(':18080')) reads.push(r.url());
  });
  await page.goto('/houses/test-house-123/residents');
  await fillSignIn(page, 'test-oxford-operator@rats-e2e.com');
  await expect(page.getByText(/don't have access to this house/i)).toBeVisible();
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
  expect(reads).toEqual([]);
});
test('an unknown URL does not crash', async ({ page }) => {
  /* signed in; /no/such/page shows Home, no page error */
});
test('a text uses a readable font, not the browser default', async ({ page }) => {
  await signInAs(page, 'manager');
  const available = await page.evaluate(() => document.fonts.check('16px "Quicksand-Bold"'));
  expect(available).toBe(true);
});
test.describe('after a crash', () => {
  test.use({ allowPageErrors: true });
  test('clicking a sidebar link leaves a crashed screen', async ({ page }) => {
    await signInAs(page, 'manager');
    await page.evaluate(() => (window as any).__portalTest.open('MedicationSummary'));
    await expect(page.getByText('Something went wrong')).toBeVisible();
    await page.click('#nav-residents');
    await expect(page.getByText('Bob Rivera')).toBeVisible({ timeout: 15_000 });
  });
});
test('a screen missing from the portal says to use the phone', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-house-summary');
  await page.getByText('Oxford House Hub').click();
  await expect(page.getByRole('alertdialog')).toContainText(/use the Regroup app on your phone/i);
});
```

Add `fillSignIn(page, email)` to `helpers.ts`. `signInAs` now goes to `/houses/<house>/residents`, signs in, and waits for `#nav-residents`. Replace `documents.spec.ts`'s `#nav-documents` with `__portalTest.open('Documents', { houseId, guestId, title })`. Read `fontFamily` in the phone's `styles/theme.tsx` and use the actual family name in the font test if it differs.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/urls.test.ts && scripts/e2e.sh e2e/shell.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

- `urls.ts`, and pass `linkingConfig` to the `NavigationContainer`. Change the missing-route alert to "This isn't available on the web yet. Please use the Regroup app on your phone."
- `Sidebar`: real `<a href>` links, background `#1f3a4d`, width about 200px, `aria-current` on the active link, and section links only when a house is in the URL. Plain clicks call `navigationRef.current.navigate` and `preventDefault`, except when `Shell` reports a crash, where the browser does the full page load. A crashed boundary has unmounted the navigator, so that load is the recovery. The session survives it.
- `HouseGate` wraps `<Screens />` when the URL names a house: not allowed by `canAccessHouse` gives "You don't have access to this house", with a link home and no navigator mounted, so no reads happen. Allowed: dispatch `selectHouseById(houseId)`, then wait for the house and user as P1's `WhenHouseLoaded` does (#193).
- `Home`: operator houses from `useHousesByAdmin(user.adminId)`, filtered by `canAccessHouse`, as links. P3 replaces this with the real table.
- `Shell`: sidebar plus `<main>` as a flex column, with mobile's `ErrorBoundary` around the screens, and a small wrapper that tells `Sidebar` when it caught an error.
- `tools/serve.mjs`: serve `index.html` for any unknown path without a file extension.
- `index.html`: `@font-face` aliases for each family in the phone's theme, using `local('Helvetica Neue'), local('Segoe UI'), local('Arial')`. Unknown families otherwise fall back to the browser's serif default.

- [ ] **Step 5: Run tests**

Run: `npx vitest run && npm run typecheck && scripts/e2e.sh e2e/shell.spec.ts e2e/residents.spec.ts e2e/documents.spec.ts`
Expected: PASS.

- [ ] **Step 6: Look at it**

Screenshot home, residents and payments at 1440x900 and at 1024x768. Confirm the sidebar doesn't overlap content and nothing is cut off. Record anything for P9.

- [ ] **Step 7: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): desktop shell, real URLs and per-house access"
```

---

### Task 5: Long-open tabs

**Files:**

- Create: `src/app/useClaimsRefresh.ts`
- Modify: `src/app/AccessGate.tsx`, `e2e/access.spec.ts`, `e2e/helpers.ts`

**Interfaces:**

- Consumes: `accessFor`, `canAccessHouse`.
- Produces: `useClaimsRefresh(): void`. Mounted in `AccessGate`. Refreshes claims on `focus`, and every `CLAIMS_REFRESH_MS = 10 * 60 * 1000`.

- [ ] **Step 1: Write the failing journeys**

```ts
test('losing access while the tab is open replaces the portal with a message', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await clearClaims('manager');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText(/use the Regroup app|don't have access/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});
test('claims refresh on the interval too, with the tab in the background', async ({ page }) => {
  await page.clock.install();
  await signInAs(page, 'manager');
  await clearClaims('manager');
  await page.clock.fastForward('10:01');
  await expect(page.getByText('Bob Rivera')).toHaveCount(0, { timeout: 10_000 });
});
test('a promotion takes effect without signing in again', async ({ page }) => {
  // resident signs in, sees the phone message; admin claim added for test-house-123; focus: portal appears
});
test('a failed refresh, as when offline, keeps the current screen', async ({ page, context }) => {
  await signInAs(page, 'manager');
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(1000);
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await context.setOffline(false);
});
```

Split `clearClaims(account)` out of `revokeClaimsAndRefresh` in `helpers.ts`.

- [ ] **Step 2: Run them to verify they fail**

Run: `scripts/e2e.sh e2e/access.spec.ts -g "access while|interval|promotion|failed refresh"`
Expected: the first three FAIL.

- [ ] **Step 3: Implement**

On each trigger, re-run the phone's `autoLogin(currentUser)` after `getIdToken(currentUser, true)`. It reloads the user and puts fresh claims in `state.user.token`, which `Auth` and `AccessGate` read. Ignore failures, since a failed refresh must not end the session. Run one refresh at a time.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): pick up role changes in long-open tabs"
```

---

### Task 6: Test hooks out of normal builds

**Files:**

- Create: `src/app/test-hooks.ts`
- Modify: `src/app/main.tsx`, `tools/bundle.mjs`, `tools/check-bundle.mjs`, `scripts/e2e.sh`, `tests/bundle.test.ts`, `.github/workflows/ci.yml` (only if the build command changes)

**Interfaces:**

- Produces: `node tools/bundle.mjs [--production] [--e2e]`. `__E2E__` is defined from `--e2e`. `dist/build-report.json` gains `e2e: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a normal build has no test hooks', () => {
  execFileSync('node', [
    'tools/bundle.mjs',
    '--production',
    '--outfile',
    outfile,
    '--entry',
    'src/app/main.tsx',
  ]);
  expect(fs.readFileSync(outfile, 'utf8')).not.toContain('__portalTest');
});
test('an e2e build has them', () => {
  /* same with --e2e: contains __portalTest */
});
test('check-bundle fails if a non-e2e report comes with test hooks in the bundle', () => {
  // a fixture dist with e2e: false and "__portalTest" in main.js exits 1
});
```

`--entry` and `--outfile` don't write the report, so give `check-bundle.mjs` a `--dist <dir>` option for the fixture.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/bundle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Move `window.__portalTest` to `test-hooks.ts`, and load it from `main.tsx` inside `if (__E2E__)` with a dynamic or conditional import that esbuild removes when false. `e2e.sh` always passes `--e2e`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run && npm run build -- --production && node tools/check-bundle.mjs --warn-versions`
Expected: PASS. `grep -c __portalTest dist/main.js` prints 0.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal .github/workflows/ci.yml
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): test hooks only in e2e builds"
```

---

### Task 7: Full run from a fresh clone

**Files:** none, unless the run finds something.

- [ ] **Step 1: Run everything from a fresh clone of the branch**

Clone into the scratchpad, as in P1, and copy only `regroup/functions/.secret.local`. Run in the background:

```bash
npm ci && npx vitest run && npm run typecheck && npm run build -- --production && node tools/check-bundle.mjs --warn-versions && scripts/e2e.sh --production
```

Expected: all pass, apart from P1's six expected failures. Then rerun `scripts/e2e.sh e2e/disputes.spec.ts --repeat-each=5` to confirm #193's workaround still holds in the shell. The survey has no new crashes beyond `MedicationSummary`.

- [ ] **Step 2: Confirm the invariants**

Run: `git -C ~/dev/rp-regroup-portal diff $(git merge-base HEAD origin/chore/regroup-rn-upgrade) HEAD --stat -- regroup/mobile`
Expected: no output (use `origin/main` once #160 has merged).

- [ ] **Step 3: Remove the clone and report**

Report what changed for an operator, screenshots of the shell, anything found for P3 or P9, and whether any phone issue has changed.
