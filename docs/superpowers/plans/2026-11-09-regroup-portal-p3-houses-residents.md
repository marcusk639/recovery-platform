# Regroup Portal P3: All Houses, One House, Residents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An operator signs in to a table of all their houses, clicks into one house, then into one resident, and every number is either right or says it couldn't be loaded.

**Architecture:** New desktop pages live in `src/app/houses` and `src/app/residents`, and take over four phone routes (`HouseList`, `HouseSummary`, `GuestList`, `GuestOverview`) so reused screens that link to them land in the right place. Pages read through the phone's query hooks and cache keys, so they share data with reused screens. Decisions (what counts, what's missing) are pure functions with no mobile imports, unit tested, and the hooks pass in the phone's own helpers.

**Tech Stack:** As in P2: React 19, react-native-web 0.21, Firebase JavaScript modular SDK, TanStack Query (the phone's client), esbuild, Vitest, Playwright. New pages use plain HTML tables with inline styles.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`, sections 5 and 7. Sequence: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`. Layout reference: `.superpowers/brainstorm/93557-1794173375/content/portal-home.html` (option A) and `portal-drilldown.html`, in the main checkout.

## Global Constraints

P1's and P2's constraints carry over unchanged:

- Nothing edits `regroup/mobile`. If a step seems to need it, stop and report it as a finding.
- Nothing touches `phoenix-cleanhouse` or `regroup-e2e`. Everything runs on loopback emulators under `demo-regroup-e2e`, and browser tests fail on any non-loopback request.
- No production or staging deploys. No rules changes. The only backend change is one read-only callable, `myHouseTiers` (Task 3), in its own commit touching only `regroup/functions`, so it can go out as its own PR as the spec requires. It reaches production only after the launch freeze.
- The portal must never block a mobile PR. Its CI job keeps `continue-on-error: true`.
- A shipped build must never silently stub a native feature.
- No personal data in logs, URLs, page titles, analytics or error reports. URLs carry ids only.
- Don't kill or reuse emulators on the default ports.
- New source files stay at 300 lines or fewer. Commit scopes use `regroup-portal`. Never use `--no-verify`.
- Work only in `~/dev/rp-regroup-portal`, with `git -C <path>`. Quote `"${B}:path"` in zsh. Serena indexes the main checkout, so use Read and Grep on worktree paths.
- **Keeping up with #160.** Before each task, fetch. If `origin/chore/regroup-rn-upgrade` moved, rebase on it. It has moved since P2, so Task 1 starts with a rebase. Once #160 merges (a squash), use `git rebase --onto origin/main <last base SHA>`.
- Check the result of each `git commit` before recording a task. The pre-commit hook can block it, and it blocks test-count drops per file.
- The full browser suite takes over 12 minutes, so run it in the background.

New for P3:

- **A number is right or it says so.** A house or field that is loading, failed or not counted never renders as `0` or `$0.00`.
- **Don't reuse these for money or health:** `getHousePercentage` always returns 0 (it calls `getOverallPercentage` without week stats, `util/house.tsx:142`), and `useLiveHouseDisputes` has no loading state, so its first render looks like "no disputes".
- **Pure modules import nothing from `@mobile`.** Vitest can't load mobile code (`tests/urls.test.ts` explains why), so hooks and pages pass the phone's helpers in. Browser tests cover the wiring.
- **No dead buttons.** The record shows only what works in P3. Resident actions arrive in P4 and P5.
- **Who sees what (owner decision, 2026-11-09).** Owners, co-owners and managers see the same things. Peer leaders see less: no house money totals, no Balance column, no Payments or Reports tabs, and no legal fields. They still see one resident's balance on the record, as on the phone. This gives managers more than the phone does, where Payment Dashboard and Admin Report sit behind `house:full-edit`.
- **How the portal knows the tier.** Managers and peer leaders both hold the `admin` claim, and `house-roles` is server-only, so `myHouseTiers` reports it. `admins` docs aren't used: clients maintain them, an existing admin can't add a second house to theirs (`firestore.rules:136-138`), and nothing removes a house on demotion. When the tier can't be confirmed, the portal shows the peer leader's view and says so.
- **This is display only.** Rules and callables are unchanged and still enforce access.
- **`@mobile/*` is typed `any`** (`src/types/mobile-any.d.ts`), so a wrong field name passes the typecheck. Names to use: `usePaywallKillSwitch()` returns `{ killSwitchEnabled, isLoading }`, and `useCurrentWeek()` returns `startDate`.

**Known phone bugs this plan works around rather than fixes:** #193, #194 (no Medication link on the record), #191 (no "last payment" on the record), #196 (no Staff notes link on the record, because every read is refused and `StaffNotesFeed` then says "No notes for this resident yet"), #197 (no "last drug test" on the record; the phone's `HouseSummary` isn't reused). The phone's house health score always showing 0% is new, and Task 8 reports it.

## Review Focus

1. **One house fails or is slow while others load:** its row says so, other rows work, and the totals say what they leave out (tests in Tasks 2 and 4).
2. **A resident whose phase no longer exists in the house:** no made-up health score, where the phone's helper returns 100% (test in Task 2).
3. **A resident URL from another house, or one that doesn't exist:** a clear message and no resident data (test in Task 7).
4. **A balance changes while the table sits in a background tab:** returning to the tab shows the new amount (test in Task 4).
5. **A reused screen passes a resident's name in navigation params:** it never reaches the URL (test in Task 1).

---

## File Structure

```
regroup/portal/src/app/
  urls.ts                 Modify: resident and extra house paths, stripQuery, safe decode
  current-house.ts        Modify: guestIdForState, HouseList has no house; drops the sidebar's tracking
  route-context.ts        Create: withRouteContext, fills ids a reused screen left out
  single-screen-navigator.tsx  Modify: PortalRouter
  Providers.tsx           Modify: query-free URLs, refresh on returning to the tab
  routes.tsx              Modify: new pages take over four phone routes
  ScreenFrame.tsx         Modify: Breadcrumb, ResidentGate
  HouseGate.tsx           Modify: clears the selected resident on a house change
  access.ts               Modify: hasFullHouseView
  useHouseAccess.ts       Create: the full or limited view for a house
  HouseTabs.tsx           Create: the house's sections as tabs
  test-hooks.ts           Modify: goBack, selectedGuestId, writeProbe (--e2e builds only)
  Sidebar.tsx             Modify: down to Houses and Sign out; sections move to HouseTabs
  Home.tsx                Modify: the all-houses page
  Breadcrumb.tsx          Create
  ui.ts                   Create: shared table and card styles
  sort.ts, SortHeader.tsx Create: column sorting
  houses/summary.ts       Create: pure decisions for one house and the totals
  houses/useHouseSummary.ts  Create: reads one house through the phone's hooks
  houses/HouseTable.tsx   Create: the table and totals, from props
  houses/areas.ts         Create: the house's work areas and their release stage
  houses/HouseNumbers.tsx Create: one house's numbers
  houses/HousePage.tsx    Create: /houses/:houseId
  residents/rows.ts       Create: pure resident row decisions
  residents/ResidentTable.tsx  Create: columns, sort, name filter
  residents/ResidentList.tsx   Create: /houses/:houseId/residents
  residents/ResidentGate.tsx   Create: guest belongs to house, selects them
  residents/ResidentRecord.tsx Create: /houses/:houseId/residents/:guestId
  residents/RecordSections.tsx Create: this week, payments, recovery and legal, open items
regroup/portal/tests/{route-context,house-summary,house-table,areas,resident-rows,sort}.test.ts(x)
regroup/portal/tests/{urls,current-house,access}.test.ts  Modify
regroup/portal/e2e/fixtures.ts  Create: house, week and resident test data
regroup/portal/e2e/{navigation,home,house,resident}.spec.ts  Create
regroup/portal/e2e/survey.spec.ts  Modify: GuestOverview gets its ids
regroup/functions/src/callable/myHouseTiers.ts  Create: the caller's own tier per house
regroup/functions/src/__tests__/callable/myHouseTiers.test.ts  Create
regroup/functions/src/index.ts, regroup/scripts/deploy-batched.sh  Modify: export and deploy list
```

---

### Task 1: URLs that stay real and hold no names

Two defects from P2 sit under everything else. A reused screen calling `navigate(Routes.ApplicationList)` with no params builds `/houses/undefined/applications`, because `getPathFromState` prints a missing required param. And any param with no path slot becomes a query string, so `GuestHome`'s `title: "Bob Documents"` reaches the URL, against the spec's privacy rule.

**Files:**

- Create: `regroup/portal/src/app/route-context.ts`, `regroup/portal/tests/route-context.test.ts`, `regroup/portal/e2e/navigation.spec.ts`, `regroup/portal/e2e/fixtures.ts`
- Modify: `regroup/portal/src/app/urls.ts`, `current-house.ts`, `single-screen-navigator.tsx`, `Providers.tsx`, `routes.tsx`, `test-hooks.ts`, `regroup/portal/tests/urls.test.ts`, `regroup/portal/tests/current-house.test.ts`

**Interfaces:**

- Produces, in `urls.ts`: `residentPath(houseId: string, guestId: string): string`, `RESIDENT_ROUTE_PATHS: Record<string, string>`, `stripQuery(path: string): string`.
- Produces, in `current-house.ts`: `guestIdForState(state): string | null`, reading only the focused route's `params.guestId`.
- Produces, in `route-context.ts`: `withRouteContext(state, action, selectedGuestId: string | null)` and `parentOf(route: { name: string; params?: object }): { name: string; params?: object } | null`.
- Produces, in `test-hooks.ts`: `goBack()`, `selectedGuestId()`, `writeProbe()`.
- Produces, in `e2e/fixtures.ts`: starts empty; later tasks add to it.

- [ ] **Step 1: Commit this plan, rebase on #160, and confirm the suite still builds**

The rebase refuses to run with the roadmap and spec edits unstaged, so commit the docs first:

```bash
git -C ~/dev/rp-regroup-portal add docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md docs/superpowers/plans/2026-11-09-regroup-portal-p3-houses-residents.md docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md
git -C ~/dev/rp-regroup-portal commit -m "docs(regroup-portal): P3 plan"
```

Run: `git -C ~/dev/rp-regroup-portal fetch origin && git -C ~/dev/rp-regroup-portal rebase origin/chore/regroup-rn-upgrade && npm --prefix ~/dev/rp-regroup-portal/regroup/portal test`
Expected: rebase clean, 78 of 78 pass. If a conflict touches `regroup/mobile`, stop and report it.

- [ ] **Step 2: Write the failing unit tests**

In `tests/route-context.test.ts`:

```ts
const state = (routes: object[]) => ({ index: routes.length - 1, routes });
const nav = (name: string, params?: object) => ({ type: 'NAVIGATE', payload: { name, params } });
const inHouse = state([{ name: 'route-GuestList', params: { houseId: 'h1' } }]);

test('a reused screen navigating with no params keeps the current house', () => {
  expect(withRouteContext(inHouse, nav('route-ApplicationList'), null).payload.params).toEqual({
    houseId: 'h1',
  });
});
test('params the screen passed are kept', () => {
  const action = withRouteContext(inHouse, nav('route-Documents', { title: 'x' }), null);
  expect(action.payload.params).toEqual({ title: 'x', houseId: 'h1' });
});
test('an explicit house wins', () => {
  expect(
    withRouteContext(inHouse, nav('route-GuestList', { houseId: 'h2' }), null).payload.params
      .houseId,
  ).toBe('h2');
});
test('a resident screen takes the nearest resident, then the selected one', () => {
  const onRecord = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
  ]);
  expect(withRouteContext(onRecord, nav('route-GuestInfo'), 'g9').payload.params.guestId).toBe(
    'g1',
  );
  expect(withRouteContext(inHouse, nav('route-GuestInfo'), 'g9').payload.params.guestId).toBe('g9');
});
test('a house screen does not pick up a resident', () => {
  expect(withRouteContext(inHouse, nav('route-Beds'), 'g9').payload.params).toEqual({
    houseId: 'h1',
  });
});
test('home and the house list get no house', () => {
  expect(withRouteContext(inHouse, nav('portalHome'), null).payload.params).toBeUndefined();
  expect(withRouteContext(inHouse, nav('route-HouseList'), null).payload.params).toBeUndefined();
});
test('other actions pass through untouched', () => {
  const goBack = { type: 'GO_BACK' };
  expect(withRouteContext(inHouse, goBack, null)).toBe(goBack);
});
test('the walk for a resident stops at home', () => {
  const crossed = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
    { name: 'portalHome' },
    { name: 'route-GuestList', params: { houseId: 'h2' } },
  ]);
  expect(withRouteContext(crossed, nav('route-GuestInfo'), 'g9').payload.params.guestId).toBe('g9');
});
test('the walk for a resident stops at another house', () => {
  const crossed = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
    { name: 'route-GuestList', params: { houseId: 'h2' } },
  ]);
  expect(withRouteContext(crossed, nav('route-GuestInfo'), 'g9').payload.params.guestId).toBe('g9');
});
test('going up a level from each kind of screen', () => {
  const ids = { houseId: 'h1', guestId: 'g1' };
  expect(parentOf({ name: 'route-GuestInfo', params: ids })).toEqual({ name: 'route-GuestOverview', params: ids });
  expect(parentOf({ name: 'route-GuestOverview', params: ids })).toEqual({ name: 'route-GuestList', params: { houseId: 'h1' } });
  expect(parentOf({ name: 'route-Beds', params: { houseId: 'h1' } })).toEqual({ name: 'route-HouseSummary', params: { houseId: 'h1' } });
  expect(parentOf({ name: 'route-HouseSummary', params: { houseId: 'h1' } })).toEqual({ name: 'portalHome' });
  expect(parentOf({ name: 'portalHome' })).toBeNull();
});
```

Add to `tests/urls.test.ts`:

```ts
test('resident paths carry ids only', () => {
  expect(residentPath('h1', 'g 1')).toBe('/houses/h1/residents/g%201');
});
test('stripQuery removes everything after the path', () => {
  expect(stripQuery('/Documents?title=Bob%20Documents')).toBe('/Documents');
  expect(stripQuery('/houses/h1')).toBe('/houses/h1');
});
test('a malformed house URL is treated as no house rather than throwing', () => {
  expect(houseIdFromPath('/houses/%E0%A4%A/residents')).toBeNull();
});
test('the record and its screens have linking paths', () => {
  const { screens } = linkingConfig('http://x').config;
  expect(screens['route-GuestOverview']).toBe('houses/:houseId/residents/:guestId');
  expect(screens['route-GuestInfo']).toBe('houses/:houseId/residents/:guestId/profile');
  expect(screens['route-Beds']).toBe('houses/:houseId/beds');
});
```

Add to `tests/current-house.test.ts`:

```ts
test('guestIdForState reads only the focused route', () => {
  expect(guestIdForState({ index: 0, routes: [{ name: 'x', params: { guestId: 'g1' } }] })).toBe(
    'g1',
  );
  expect(
    guestIdForState({
      index: 1,
      routes: [{ name: 'x', params: { guestId: 'g1' } }, { name: 'y' }],
    }),
  ).toBeNull();
});
test('the house list belongs to no house', () => {
  expect(
    houseIdForState({ index: 0, routes: [{ name: 'route-HouseList', params: { houseId: 'h1' } }] }),
  ).toBeNull();
});
```

- [ ] **Step 3: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- route-context urls current-house`
Expected: FAIL, `withRouteContext` and `residentPath` not defined.

- [ ] **Step 4: Implement the URL changes**

In `urls.ts`, add to `linkingConfig`:

- House screens with no required non-URL params: `Routes.Beds` → `houses/:houseId/beds`, `Routes.Issues` → `.../issues`, `Routes.Complaints` → `.../complaints`, `Routes.DrugTesting` → `.../drug-tests`, `Routes.HouseList` → `houses`.
- `RESIDENT_ROUTE_PATHS`: `Routes.GuestOverview` → `houses/:houseId/residents/:guestId`, plus `/profile` for `GuestInfo`, `/edit` for `EditUserInfo`, `/payments` for `PaymentHistory`, `/meetings` for `MeetingSummary`, `/work` for `WorkSummary`, `/chores` for `ChoreSummary`, `/supporter` for `SupporterSummary`, `/medication` for `MedicationSummary`.
- Leave `Documents`, `StaffNotes`, `ApplicationDetail`, `ResidentIntake` and the drug test form and history unmapped. They need params a URL can't hold, so a reload lands on Home, and P4 and P8 decide each one.

`houseIdFromPath` catches a `URIError` and returns null.

`current-house.ts` treats `Routes.HouseList` like `HOME_ROUTE`. Import the route name from `urls.ts` as `HOUSE_LIST_ROUTE`.

`withRouteContext` handles `NAVIGATE` and `PUSH` only, and returns a new action. It adds `houseId` from `houseIdForState(state)` to any target except Home, NotFound and the house list. It adds `guestId` only when the target is in `RESIDENT_ROUTE_PATHS`, walking back through `state.routes` for the nearest `guestId` and stopping at Home, NotFound or a route for another house, then falling back to `selectedGuestId`.

`parentOf` follows the test above.

`single-screen-navigator.tsx`: define `PortalRouter(options)` wrapping `StackRouter(options)`, overriding `getStateForAction` to pass `withRouteContext(state, action, store.getState().guests.selectedGuestId ?? null)`. A `GO_BACK` the stack can't handle returns null, which `onUnhandledAction` turns into a false "isn't available" alert on any page opened by URL or reload. So on that null, navigate to `parentOf(focused route)`, or return `state` unchanged when it's null. Pass `PortalRouter` to `useNavigationBuilder` in place of `StackRouter`.

`Providers.tsx`: give `linking` a `getPathFromState: (state, options) => stripQuery(getPathFromState(state, options))`, importing the original from `@react-navigation/native`.

`routes.tsx`: register `Routes.HouseList` to `Home` in place of the phone's `HousesOverview`. Its row press would select a house the URL then overrides, which looks like a button that does nothing.

`test-hooks.ts`: add `goBack: () => navigationRef.current?.goBack()`, `selectedGuestId: () => store.getState().guests.selectedGuestId ?? null`, and `writeProbe`, which attempts an `updateDoc` on the signed-in user's own `users` doc and swallows any refusal. The request is what a test needs to see.

- [ ] **Step 5: Run the unit tests**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test`
Expected: PASS, including the 78 from before.

- [ ] **Step 6: Write the browser journeys**

In `e2e/navigation.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { expect, reseed, signInAs, test } from './helpers';
test.beforeEach(() => reseed());

const open = (page: Page, route: string, params?: object) =>
  page.evaluate(([r, p]) => (window as any).__portalTest.open(r, p), [route, params] as const);

test('a screen opened with no params has a real URL, and reload returns to it', async ({
  page,
}) => {
  await signInAs(page, 'manager');
  await open(page, 'HouseDisputes');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await page.reload();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 15_000 });
});

test('a name passed in navigation params never reaches the URL', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'Documents', {
    houseId: 'test-house-123',
    guestId: 'guest-a',
    title: 'Alice Documents',
  });
  await expect(page.getByTestId('document-list-screen')).toBeVisible();
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('Alice');
});

test('the phone house button opens the house table', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'HouseList');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toBeVisible();
  await expect(page.locator('#nav-residents')).toHaveCount(0);
});

test('a malformed house URL does not blank the page', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/houses/%E0%A4%A/residents');
  await expect(page.locator('#nav-home')).toBeVisible({ timeout: 15_000 });
});

test('going back after a reload goes up a level instead of saying it is unavailable', async ({ page }) => {
  await signInAs(page, 'manager');
  await open(page, 'Beds');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/beds$/);
  await page.reload();
  await expect(page.locator('#nav-residents')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => (window as any).__portalTest.goBack());
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});
```

If `document-list-screen` isn't the screen's testID, read `DocumentListScreen.tsx` and use the real one.

- [ ] **Step 7: Run the journeys and the older suites that navigate**

Run: `regroup/portal/scripts/e2e.sh e2e/navigation.spec.ts e2e/shell.spec.ts e2e/multi-house.spec.ts`
Expected: all pass. If `Back to a screen with no house in its URL` changes behaviour because `Issues` now has a path, keep the test and confirm the sidebar assertion still holds.

- [ ] **Step 8: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "fix(regroup-portal): real URLs from reused screens, and no names in them"
```

---

### Task 2: What a house's numbers mean

**Files:**

- Create: `regroup/portal/src/app/houses/summary.ts`, `regroup/portal/tests/house-summary.test.ts`

**Interfaces:**

```ts
export type Cell<T> =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'hidden' } // this role doesn't see it, as on the phone
  | { state: 'ready'; value: T };
export type SubscriptionState = 'loading' | 'active' | 'pending' | 'grace' | 'lapsed';
export type RowState = 'failed' | 'loading' | 'lapsed' | 'setting-up' | 'numbers';

export interface HouseSummary {
  houseId: string;
  name: string | null;
  house: Cell<true>;
  subscription: SubscriptionState;
  graceEndsAt: Date | null;
  beds: Cell<{ used: number; max: number }>;
  healthPercent: Cell<number | null>; // null: no resident can be scored
  rentOverdueCents: Cell<number>;
  overdueFromDischargedCents: number;
  applicationsWaiting: Cell<number>;
  openDisputes: Cell<number>;
}

export function cellFrom<D, T>(query: { status: string; data?: D }, map: (data: D) => T): Cell<T>;
export function rowStateOf(summary: HouseSummary): RowState;
export function overdueFromDischarged(guests: { rentOwed?: unknown; status?: string }[]): number;

export function subscriptionStateOf(
  house: { subscriptionStatus?: string; guestGraceEndsAt?: unknown },
  killSwitch: { enabled: boolean; isLoading: boolean },
  now: Date,
  toDate: (value: unknown) => Date | null,
): { state: SubscriptionState; graceEndsAt: Date | null };
export function rentOverdue(guests: { rentOwed?: unknown }[]): number | null;
export function applicationsWaiting(applications: { status: string }[]): number;
export function houseHealth(percents: (number | null)[]): number | null;
export function canScore(
  guest: { phase: unknown },
  house: { phases?: Record<string, { rules?: unknown }> },
): boolean;
export function totalsFor(summaries: HouseSummary[]): HouseTotals;
export function formatCents(cents: number): string;
export function formatDay(value: unknown): string | null;
```

`HouseTotals` has `beds`, `rentOverdueCents`, `applicationsWaiting`, `openDisputes`, each `{ value, missing: number }`, and `housesNotCounted: number`.

- [ ] **Step 1: Write the failing tests**

```ts
const switchOn = { enabled: true, isLoading: false };
const toDate = (v: unknown) => (v ? new Date(v as string) : null);
const now = new Date('2026-06-01T00:00:00Z');
const stateOf = (house: object, killSwitch = switchOn) =>
  subscriptionStateOf(house, killSwitch, now, toDate).state;

test('subscription follows the phone gate ladder', () => {
  expect(stateOf({})).toBe('pending');
  expect(stateOf({ subscriptionStatus: 'active' })).toBe('active');
  expect(stateOf({ subscriptionStatus: 'trialing' })).toBe('active');
  expect(stateOf({ subscriptionStatus: 'canceled', guestGraceEndsAt: '2026-07-01' })).toBe('grace');
  expect(stateOf({ subscriptionStatus: 'canceled', guestGraceEndsAt: '2026-01-01' })).toBe(
    'lapsed',
  );
  expect(stateOf({ subscriptionStatus: 'past_due' })).toBe('lapsed');
  expect(stateOf({ subscriptionStatus: 'unpaid' })).toBe('lapsed');
});
test('the kill switch opens every house, and fails closed while loading', () => {
  expect(stateOf({ subscriptionStatus: 'canceled' }, { enabled: false, isLoading: false })).toBe(
    'active',
  );
  expect(stateOf({ subscriptionStatus: 'active' }, { enabled: true, isLoading: true })).toBe(
    'loading',
  );
});

test('a query becomes a cell by its status', () => {
  const double = (n: number) => n * 2;
  expect(cellFrom({ status: 'pending' }, double)).toEqual({ state: 'loading' });
  expect(cellFrom({ status: 'error' }, double)).toEqual({ state: 'error' });
  expect(cellFrom({ status: 'success', data: 2 }, double)).toEqual({ state: 'ready', value: 4 });
});
test('a refresh that fails shows the failure, not the old number', () => {
  expect(cellFrom({ status: 'error', data: 2 }, (n: number) => n)).toEqual({ state: 'error' });
});

test('rent overdue adds positive balances in cents, as the phone does', () => {
  expect(rentOverdue([{ rentOwed: 15000 }, { rentOwed: 0 }, {}, { rentOwed: 2550 }])).toBe(17550);
});
test('a credit does not reduce what others owe', () => {
  expect(rentOverdue([{ rentOwed: -500 }, { rentOwed: 1000 }])).toBe(1000);
});
test('an unreadable balance makes the total unknown, not smaller', () => {
  expect(rentOverdue([{ rentOwed: 1000 }, { rentOwed: '1000' }])).toBeNull();
  expect(rentOverdue([{ rentOwed: NaN }])).toBeNull();
  expect(rentOverdue([{ rentOwed: null }])).toBeNull();
});
test('what discharged residents owe is known separately', () => {
  const guests = [{ rentOwed: 1000, status: 'active' }, { rentOwed: 500, status: 'discharged' }, { status: 'discharged' }];
  expect(overdueFromDischarged(guests)).toBe(500);
});

test('only pending applications are waiting, matching the phone badge', () => {
  expect(
    applicationsWaiting([{ status: 'pending' }, { status: 'reviewing' }, { status: 'approved' }]),
  ).toBe(1);
});

test('house health is the mean of residents who can be scored', () => {
  expect(houseHealth([100, 50])).toBe(75);
  expect(houseHealth([100, null])).toBe(100);
});
test('a house nobody can be scored in has no health, not zero', () => {
  expect(houseHealth([])).toBeNull();
  expect(houseHealth([null])).toBeNull();
});
test('a resident whose phase is gone cannot be scored', () => {
  expect(canScore({ phase: 'Gone' }, { phases: { Default: { rules: {} } } })).toBe(false);
  expect(canScore({ phase: 'Default' }, { phases: { Default: { rules: {} } } })).toBe(true);
  expect(canScore({ phase: 'Default' }, { phases: { Default: {} } })).toBe(false);
  expect(canScore({ phase: 'Default' }, {})).toBe(false);
});

const ready = <T>(value: T): Cell<T> => ({ state: 'ready', value });
const summary = (overrides: Partial<HouseSummary> = {}): HouseSummary => ({
  houseId: 'h1',
  name: 'One',
  house: ready(true),
  subscription: 'active',
  graceEndsAt: null,
  beds: ready({ used: 2, max: 4 }),
  healthPercent: ready(80),
  rentOverdueCents: ready(1000),
  overdueFromDischargedCents: 0,
  applicationsWaiting: ready(1),
  openDisputes: ready(2),
  ...overrides,
});

test('totals add ready houses', () => {
  const totals = totalsFor([summary(), summary({ houseId: 'h2' })]);
  expect(totals.rentOverdueCents).toEqual({ value: 2000, missing: 0 });
  expect(totals.beds.value).toEqual({ used: 4, max: 8 });
  expect(totals.housesNotCounted).toBe(0);
});
test('a failed field is counted as missing, not as zero', () => {
  const totals = totalsFor([
    summary(),
    summary({ houseId: 'h2', rentOverdueCents: { state: 'error' } }),
  ]);
  expect(totals.rentOverdueCents).toEqual({ value: 1000, missing: 1 });
  expect(totals.housesNotCounted).toBe(1);
});
test('a loading house is not counted yet', () => {
  const totals = totalsFor([summary({ openDisputes: { state: 'loading' } })]);
  expect(totals.openDisputes).toEqual({ value: 0, missing: 1 });
  expect(totals.housesNotCounted).toBe(1);
});
test('a lapsed house is not counted', () => {
  const lapsed = summary({ subscription: 'lapsed', rentOverdueCents: { state: 'loading' } });
  expect(totalsFor([summary(), lapsed]).housesNotCounted).toBe(1);
});
test('a hidden field is neither added nor missing', () => {
  const totals = totalsFor([summary({ rentOverdueCents: { state: 'hidden' } })]);
  expect(totals.rentOverdueCents).toEqual({ value: 0, missing: 0 });
  expect(totals.housesNotCounted).toBe(0);
});
test('what a row shows, most important first', () => {
  expect(rowStateOf(summary({ house: { state: 'error' }, subscription: 'loading' }))).toBe('failed');
  expect(rowStateOf(summary({ house: { state: 'loading' }, subscription: 'loading' }))).toBe('loading');
  expect(rowStateOf(summary({ subscription: 'loading' }))).toBe('loading');
  expect(rowStateOf(summary({ subscription: 'lapsed' }))).toBe('lapsed');
  expect(rowStateOf(summary({ subscription: 'pending' }))).toBe('setting-up');
  expect(rowStateOf(summary({ subscription: 'grace' }))).toBe('numbers');
  expect(rowStateOf(summary())).toBe('numbers');
});
test('only rows showing numbers are counted', () => {
  expect(totalsFor([summary({ subscription: 'pending' })]).housesNotCounted).toBe(1);
  expect(totalsFor([summary({ house: { state: 'error' } })]).housesNotCounted).toBe(1);
});

test('money formats like the phone', () => {
  expect(formatCents(15000)).toBe('$150.00');
  expect(formatCents(123456)).toBe('$1,234.56');
  expect(formatCents(0)).toBe('$0.00');
});
test('a date-only value keeps its day in any time zone', () => {
  expect(formatDay('2025-01-01')).toBe('Jan 1, 2025');
});
test('a missing or unreadable date is null', () => {
  expect(formatDay(undefined)).toBeNull();
  expect(formatDay('')).toBeNull();
  expect(formatDay('not a date')).toBeNull();
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- house-summary`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `houses/summary.ts`**

No `@mobile` imports. `subscriptionStateOf` mirrors `evaluateHouseAccess` in `regroup/mobile/src/hooks/useSubscriptionGate.ts`, which isn't exported; say so in a comment. It decides only what a table row shows, and `SubscriptionCheck` still guards the house itself. `cellFrom` reads `status`, not `isLoading`, because in the installed TanStack Query `isLoading` is false for a disabled or paused query, and defaulting from there would produce the `$0.00` this plan forbids. `rentOverdue` treats `undefined` as 0 like the phone's `?? 0`, and any other non-finite or non-number value as unknown. `formatDay` parses `YYYY-MM-DD` at local noon, the same as the phone's `safeParseDate`, and formats with `Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })`.

- [ ] **Step 4: Run the tests**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- house-summary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal/src/app/houses/summary.ts regroup/portal/tests/house-summary.test.ts
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): what a house's numbers mean"
```

---

### Task 3: Telling a manager from a peer leader

**Files:**

- Create: `regroup/functions/src/callable/myHouseTiers.ts`, `regroup/functions/src/__tests__/callable/myHouseTiers.test.ts`, `regroup/portal/src/app/useHouseAccess.ts`
- Modify: `regroup/functions/src/index.ts`, `regroup/scripts/deploy-batched.sh`, `regroup/functions/CLAUDE.md`, `regroup/portal/src/app/access.ts`, `regroup/portal/src/app/ScreenFrame.tsx`, `regroup/portal/src/app/useClaimsRefresh.ts`, `regroup/portal/tests/access.test.ts`, `regroup/portal/e2e/fixtures.ts`

**Interfaces:**

- Produces, on the server: callable `myHouseTiers`, no input, returning `{ tiers: Record<string, 'owner' | 'manager' | 'peerLeader'> }`.
- Produces, in `access.ts`: `hasFullHouseView(roles: Record<string, string>, tiers: Record<string, string> | undefined, houseId: string): boolean`.
- Produces, in `useHouseAccess.ts`: `useHouseAccess(houseId: string): { view: 'full' | 'limited' | 'checking' }` and `useRoleUnknown(): boolean`.
- Produces, in `e2e/fixtures.ts`: `makeManager(account)`, `makePeerLeader(account)`.

- [ ] **Step 1: Write the failing callable tests**

In `regroup/functions/src/__tests__/callable/myHouseTiers.test.ts`, following `auth.test.ts`'s mocks. The `regroup-new-callable` skill has the file pattern.

```ts
test('refuses a caller who is not signed in', async () => {
  await expect(call({ auth: undefined })).rejects.toMatchObject({ code: 'unauthenticated' });
});
test('reports each staff house with its tier', async () => {
  setClaims('u1', { superAdmin: { h1: true }, admin: { h1: true, h2: true, h3: true, h4: true } });
  setRecord('h2_u1', { tier: 'manager' });
  setRecord('h3_u1', { tier: 'peerLeader' });
  await expect(call({ auth: { uid: 'u1' } })).resolves.toEqual({
    tiers: { h1: 'owner', h2: 'manager', h3: 'peerLeader', h4: 'peerLeader' },
  });
});
test('leaves out a house where the caller is only a resident', async () => {
  setClaims('u1', { guest: { h1: true }, admin: { h2: true } });
  const { tiers } = await call({ auth: { uid: 'u1' } });
  expect(Object.keys(tiers)).toEqual(['h2']);
});
test('reads live claims, so a house just removed is not reported', async () => {
  setClaims('u1', {});
  const result = await call({ auth: { uid: 'u1', token: { admin: { h1: true } } } });
  expect(result).toEqual({ tiers: {} });
});
test('ignores input, so it cannot report on another account', async () => {
  setClaims('u1', { admin: { h1: true } });
  setClaims('u2', { superAdmin: { h9: true } });
  const { tiers } = await call({ auth: { uid: 'u1' }, data: { uid: 'u2' } });
  expect(Object.keys(tiers)).toEqual(['h1']);
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/functions test -- myHouseTiers`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the callable**

`myHouseTiers` reads `liveClaims(uid)` from `util/houseRoleStore`, takes the union of the `admin` and `superAdmin` house ids, and calls `houseTierOf(uid, houseId)` for each. It logs no personal data. Export it from `src/index.ts`, add it to `ALL_FUNCTIONS` in `regroup/scripts/deploy-batched.sh` (a test keeps that list equal to the exports), and add it to the callable list in `regroup/functions/CLAUDE.md`.

- [ ] **Step 4: Run the functions suite and commit this on its own**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/functions test`
Expected: PASS.

```bash
git -C ~/dev/rp-regroup-portal add regroup/functions regroup/scripts/deploy-batched.sh
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-functions): myHouseTiers reports the caller's own tier per house"
```

- [ ] **Step 5: Write the failing portal test**

Add to `tests/access.test.ts`:

```ts
test('owners and co-owners get the full view without waiting for a tier', () => {
  expect(hasFullHouseView({ h1: 'superAdmin' }, undefined, 'h1')).toBe(true);
});
test('a manager gets the full view', () => {
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'manager' }, 'h1')).toBe(true);
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'owner' }, 'h1')).toBe(true);
});
test('a peer leader, or a tier nobody could confirm, gets the limited view', () => {
  expect(hasFullHouseView({ h1: 'admin' }, { h1: 'peerLeader' }, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'admin' }, undefined, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'admin' }, { h2: 'manager' }, 'h1')).toBe(false);
});
test('a tier does not outrank a missing role', () => {
  expect(hasFullHouseView({}, { h1: 'manager' }, 'h1')).toBe(false);
  expect(hasFullHouseView({ h1: 'guest' }, { h1: 'manager' }, 'h1')).toBe(false);
});
```

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- access`
Expected: FAIL, `hasFullHouseView` not defined.

- [ ] **Step 6: Implement the portal side**

`useHouseAccess.ts` runs one `useQuery` with key `['portal', 'house-tiers']`, `staleTime` 5 minutes, `retry: 1`, calling `callHttpsFunction('myHouseTiers', {})`. It's enabled only when `useRoles()` holds an `admin` role, so an owner never waits on it. `view` is `full` for a `superAdmin` at once. Otherwise it's `checking` while the query is pending, then `hasFullHouseView`'s answer, which is `limited` when the call failed.

`useRoleUnknown` is true when the query is in error and a role needed it. `ScreenFrame` renders `<p data-testid="role-notice">Couldn't confirm your role, so some details are hidden.</p>` above everything when it's true, on Home too. Plain text, because tests count `role="status"` elements for the totals.

`useClaimsRefresh` also invalidates `['portal', 'house-tiers']`, so a promotion takes effect on focus or within 10 minutes.

`e2e/fixtures.ts`: both fixtures drop the account's `superAdmin` claim and keep `admin`, set its `house-roles` record to `primary: false` with `tier: 'manager'` or `tier: 'peerLeader'`, so the server doesn't re-grant the claim, and set `isSuperAdmin: false` on its `users` doc.

- [ ] **Step 7: Run the tests, and commit**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test`
Expected: PASS. The browser journeys that use these fixtures arrive in Task 6.

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): tell a manager from a peer leader"
```

---

### Task 4: The all-houses table

**Files:**

- Create: `regroup/portal/src/app/houses/useHouseSummary.ts`, `houses/HouseTable.tsx`, `src/app/ui.ts`, `src/app/sort.ts`, `src/app/SortHeader.tsx`, `regroup/portal/tests/house-table.test.tsx`, `regroup/portal/tests/sort.test.ts`, `regroup/portal/e2e/home.spec.ts`
- Modify: `regroup/portal/src/app/Home.tsx`, `src/app/Providers.tsx`, `regroup/portal/e2e/fixtures.ts`

**Interfaces:**

- Consumes: Task 2's `summary.ts`; `useHouseAccess` from Task 3; `sectionPath`, `SECTIONS`, `HouseLink`, `operatorHouseIds`, `useRoles` from P2.
- Produces: `useHouseSummary(houseId: string): HouseSummary`; `HouseTable({ summaries: HouseSummary[]; healthLabel?: (percent: number) => string; manageSubscriptionUrl?: string })`; `sortRows<T>(rows: T[], value: (row: T) => string | number | null, direction: 'asc' | 'desc'): T[]`; `SortHeader({ label, active, direction, onSort })`.
- Produces in `e2e/fixtures.ts`: `setRooms(houseId, rooms)`, `setWeekStats(guestId, stats)`, `addHouseClaim(account, houseId)`, `addOxfordResident(rentOwed)`, `removeSecondHouse()`.

- [ ] **Step 1: Write the failing component and sort tests**

`tests/sort.test.ts`:

```ts
const rows = [{ v: 2 }, { v: null }, { v: 1 }];
test('sorts both ways, with unknown values last either way', () => {
  expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([1, 2, null]);
  expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([2, 1, null]);
});
test('does not change the array it was given', () => {
  sortRows(rows, (r) => r.v, 'asc');
  expect(rows[0].v).toBe(2);
});
```

`tests/house-table.test.tsx`, rendering `HouseTable` from props with `@testing-library/react`, or `react-dom/client` if that isn't installed, as `tests/alert.test.tsx` does. Mock `@mobile/navigation/service` as `{ navigationRef: { current: null } }`, because `HouseLink` imports it, and `@mobile/navigation/types` as `urls.test.ts` does, because `urls.ts` imports it.

```ts
test('a failed field says so and never shows zero', () => {
  render(<HouseTable summaries={[summary({ rentOverdueCents: { state: 'error' } })]} />);
  const row = screen.getByRole('row', { name: /One/ });
  expect(within(row).getByText("Couldn't load")).toBeTruthy();
  expect(row.textContent).not.toContain('$0.00');
});
test('a loading field says so', () => {
  render(<HouseTable summaries={[summary({ openDisputes: { state: 'loading' } })]} />);
  expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
});
test('a house that failed entirely says so, by id', () => {
  const failed = summary({ name: null, house: { state: 'error' }, beds: { state: 'error' } });
  render(<HouseTable summaries={[failed]} />);
  expect(screen.getByText(/couldn't load this house/i)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'h1' })).toBeTruthy();
});
test('a lapsed house shows that and no numbers', () => {
  render(<HouseTable summaries={[summary({ subscription: 'lapsed' })]} />);
  const row = screen.getByRole('row', { name: /One/ });
  expect(within(row).getByText('Subscription ended')).toBeTruthy();
  expect(row.textContent).not.toContain('$');
});
test('totals say what they leave out', () => {
  render(<HouseTable summaries={[summary(), summary({ houseId: 'h2', name: 'Two', openDisputes: { state: 'error' } })]} />);
  expect(screen.getByRole('status').textContent).toContain('Not counting 1 of 2 houses');
});
test('a house with no rooms set up says so rather than 0 / 0', () => {
  render(<HouseTable summaries={[summary({ beds: { state: 'ready', value: { used: 0, max: 0 } } })]} />);
  expect(screen.getByText('No beds set up')).toBeTruthy();
});
test('a house nobody can be scored in shows a dash, not 0%', () => {
  render(<HouseTable summaries={[summary({ healthPercent: { state: 'ready', value: null } })]} />);
  expect(screen.queryByText(/^0%/)).toBeNull();
});
test('clicking a heading sorts, and says so to a screen reader', () => {
  render(<HouseTable summaries={[summary({ name: 'Low', rentOverdueCents: { state: 'ready', value: 1 } }), summary({ houseId: 'h2', name: 'High', rentOverdueCents: { state: 'ready', value: 9 } })]} />);
  fireEvent.click(screen.getByRole('button', { name: /Overdue/ }));
  fireEvent.click(screen.getByRole('button', { name: /Overdue/ }));
  expect(screen.getAllByRole('link')[0].textContent).toBe('High');
  expect(screen.getByRole('columnheader', { name: /Overdue/ }).getAttribute('aria-sort')).toBe('descending');
});
```

`summary()` is the same builder as Task 2's test. Move it to `tests/fixtures/house-summary.ts` rather than copying it. Export it as `summary`.

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- house-table sort`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `sort.ts`, `SortHeader.tsx`, `ui.ts` and `HouseTable.tsx`**

`ui.ts` holds the P2 font stack and the card, table, `th` and `td` styles. Pages scroll inside `main`, so a page's outer element uses `flex: 1, minHeight: 0, overflow: 'auto'`.

`HouseTable` renders totals cards above a semantic `<table>` with columns House, Beds, Health, Overdue, Applications and Disputes. `rowStateOf` decides what a row shows, and a total whose field is hidden for every house isn't shown. Copy, exactly:

| Condition              | Shows                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Loading field          | `…`, `aria-label="Loading"`                                                                                    |
| Failed field | `Couldn't load` |
| Hidden field | `—` |
| House doc failed       | House id as the link, plus `Couldn't load this house` across the row                                           |
| `lapsed`               | `Subscription ended` across the row, plus a `Manage subscription` link when `manageSubscriptionUrl` is set |
| Row state `loading` | `…` in each cell, never `Setting up` |
| `pending` | `Setting up` across the row |
| `grace`                | Numbers, plus `Subscription ending <formatDay>` under the name                                                 |
| `beds.max === 0`       | `No beds set up`                                                                                               |
| `healthPercent` null   | `—`                                                                                                            |
| Health ready           | `75% Great`, with the word from `healthLabel` when set |
| `rentOverdueCents`     | `formatCents`                                                                                                  |
| Some house not counted | `Not counting N of M houses` in a `role="status"` element                                                      |

Default sort is by name. Every cell in a row is a `td`, including the name, so browser tests can index them, and the overdue total has `data-testid="total-overdue"`. The house name links with `HouseLink` to `sectionPath(houseId, 'summary')`, so it stays a real link for a new tab.

- [ ] **Step 4: Run the component tests**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- house-table sort`
Expected: PASS.

- [ ] **Step 5: Write the browser journeys, and the fixtures they need**

`e2e/fixtures.ts`:

- `setWeekStats(guestId, stats)` writes `week-summaries/${guestId}_${weekStart}` with the seed house's zone, `America/Chicago`, Monday-based, using `date-fns-tz`. It writes the guest's `houseId` too, or `firestore.rules:979` refuses the read. `stats` fills `meetingsAttended`, `hoursWorked`, `choresCompleted`, `primarySupporterMet`, `medicationTaken`, defaulting to 0.
- `setRooms(houseId, rooms)` updates `houses/${houseId}`.
- `addHouseClaim(account, houseId)` adds that house to the account's `admin` and `superAdmin` claims.
- `addOxfordResident(rentOwed)` creates `guests/guest-ox` in `test-house-oxford`, name `Olive Oxford`.
- `removeSecondHouse()` removes `SECOND_HOUSE` from the manager's claims and deletes its `house-roles` record.

Export `twoBedsOneFilled = { '2A': { id: '2A', beds: { b1: { id: 'b1', guestId: 'guest-a' }, b2: { id: 'b2', guestId: null } } } }`.

`e2e/home.spec.ts`:

```ts
const row = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });

test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('a house row shows the real numbers', async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await setWeekStats('guest-a', { choresCompleted: 1, primarySupporterMet: 1 });
  await setWeekStats('guest-b', { choresCompleted: 1 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  const house = row(page, 'E2E Test House');
  await expect(house).toContainText('1 / 2');
  await expect(house).toContainText('75%');
  await expect(house).toContainText('$150.00');
  await expect(house.getByRole('cell').nth(4)).toHaveText('1');
  await expect(house.getByRole('cell').nth(5)).toHaveText('1');
});

test('totals add across houses', async ({ page }) => {
  await addSecondHouseForManager();
  await admin().doc('guests/guest-c').update({ rentOwed: 2550 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$175\.50/);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('a house that cannot be read says so, and the rest still works', async ({ page }) => {
  await addHouseClaim('manager', 'ghost-house');
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'ghost-house')).toContainText("Couldn't load this house", {
    timeout: 20_000,
  });
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  await expect(page.getByRole('status')).toContainText('Not counting 1 of 2 houses');
});

test('a lapsed house shows its state and its residents are not read', async ({ page }) => {
  await addSecondHouseForManager('canceled');
  const reads: string[] = [];
  const disputeReads: string[] = [];
  page.on('request', (r) => {
    const body = r.postData() ?? '';
    if (r.url().includes(':18080') && body.includes('guests')) reads.push(body);
    if (r.url().includes(':18080') && body.includes('house-disputes')) disputeReads.push(body);
  });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'Second House')).toContainText('Subscription ended');
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  expect(
    reads.some((b) => b.includes('test-house-123')),
    'control: the watcher sees reads',
  ).toBe(true);
  expect(reads.some((b) => b.includes(SECOND_HOUSE))).toBe(false);
  expect(disputeReads.some((b) => b.includes(SECOND_HOUSE))).toBe(false);
});

test('a dispute count that changed shows on returning to the table', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House').getByRole('cell').nth(5)).toHaveText('1');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await admin().doc('house-disputes/test-house-123').set({ disputes: {} });
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House').getByRole('cell').nth(5)).toHaveText('0');
});

test('a house taken away leaves the table and the totals', async ({ page }) => {
  await addSecondHouseForManager();
  await admin().doc('guests/guest-c').update({ rentOwed: 2550 });
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$175\.50/);
  await removeSecondHouse();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(row(page, 'Second House')).toHaveCount(0);
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$150\.00/);
});

test('a balance that changes shows after returning to the tab', async ({ page }) => {
  test.setTimeout(90_000);
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Test House')).toContainText('$150.00');
  await admin().doc('guests/guest-a').update({ rentOwed: 9900 });
  await page.waitForTimeout(31_000); // the guest list's staleTime
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
  await expect(row(page, 'E2E Test House')).toContainText('$99.00', { timeout: 10_000 });
});

test("an Oxford house shows its residents' rent owed", async ({ page }) => {
  await addOxfordResident(12345);
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-home');
  await expect(row(page, 'E2E Oxford House')).toContainText('$123.45');
});

test('a house name in the table can open in a new tab', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await expect(page.getByRole('link', { name: 'E2E Test House' })).toHaveAttribute(
    'href',
    '/houses/test-house-123',
  );
});
```

- [ ] **Step 6: Run them to watch them fail**

Run: `regroup/portal/scripts/e2e.sh e2e/home.spec.ts`
Expected: FAIL. Home is still the simple list.

- [ ] **Step 7: Implement `useHouseSummary` and `Home`**

`useHouseSummary(houseId)` uses `useHouse`, `usePaywallKillSwitch`, `useGuests`, `useHouseApplications` and `useCurrentWeek(house?.timezone)` from mobile. `useGuests`, `useHouseApplications` and the disputes read are `enabled` only when the subscription state is `active` or `grace`. Every cell goes through `cellFrom`. Pass the kill switch on as `{ enabled: killSwitchEnabled, isLoading }`, and use `startDate` from `useCurrentWeek` as the week start. `subscription` is `loading` until the house has loaded. The result is memoized. `rentOverdueCents` follows `useHouseAccess(houseId)`: `{ state: 'loading' }` while `checking`, and `{ state: 'hidden' }` for `limited`. It adds, in this file:

- `useQueries` over the guest ids using `activityKeys.weekSummary(guestId, weekStart)` and `activityService.getWeekSummary`, with the phone's 60-second `staleTime`, so reused screens share the cache.
- A one-shot `useQuery` with key `['disputes', 'house-live', houseId]` on `doc(collection(firestore, LIVE_DISPUTES), houseId)`, for the count, with `staleTime: 0`. Approving or rejecting a dispute (`resolveActivityDispute`) invalidates nothing, so this refetches each time the table or a house page opens, and on returning to the tab. A comment says why this doesn't use `useLiveHouseDisputes`.

Health passes over residents with `status !== 'discharged'`, matching `GuestList`. Each percent is `canScore(guest, house) ? getOverallPercentage(guest, house, getTodaysDate(), undefined, summary?.stats) : null`. A resident with no summary this week scores 0, as the phone does. Any failed summary makes the cell `error`.

Rent overdue passes over all the house's residents, discharged included, matching the phone's Overdue Residents card (`PaymentDashboard.tsx:134`). `rentOverdue` returning null makes the cell `error`. `overdueFromDischargedCents` comes from `overdueFromDischarged`, for Task 5's note. Oxford houses use the same field: the rent screens and `scheduledRentCollection` have no Oxford handling. Expense shares (EES) live in the treasury collections, belong to governance, and aren't in this column.

Beds use `countBeds(house.rooms)`, disputes `countOpenDisputes({ disputes })`.

`Home` keeps state for each house's latest `HouseSummary`. Each house gets a small `HouseSummaryReporter` component that calls the hook and reports to `Home` in an effect, because the house count varies and hooks can't run in a loop. The effect depends on `JSON.stringify(summary)`, not the object, so reporting can't re-trigger itself. `Home` shows only houses still in `operatorHouseIds(useRoles())`, so a house taken away leaves the table and totals. `Home` renders `HouseTable` with those, listing a `loading` summary for any not yet reported. It passes `WEB_PORTAL_URL` from `SubscriptionRequiredScreen`, as `SubscriptionCheck` does, and a `healthLabel` built from `getHealthByPercentage` and `HEALTH_STATUS_MAP`, in title case.

`Providers.tsx`: on module load, merge `refetchOnWindowFocus: true` into `queryClient.setDefaultOptions`, with a comment: the phone turns it off because a phone has no window focus, and a desk session sits in a background tab.

- [ ] **Step 8: Run the journeys and the suites that use Home**

Run: `regroup/portal/scripts/e2e.sh e2e/home.spec.ts e2e/shell.spec.ts e2e/multi-house.spec.ts`
Expected: all pass. `Back to a screen with no house` keeps working until Task 5 replaces `HouseSummary`.

- [ ] **Step 9: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): all houses table"
```

---

### Task 5: One house

The phone's `HouseSummary` isn't reused here. Its health card always reads 0%, its chore rotation hook writes on view, and it logs a refused read (#197). The new page keeps its links, with the same labels and routes, so nothing is lost.

**Tabs (owner decision, 2026-11-09).** The house's sections become a tab strip on every house screen, as in the mockup. They move out of the sidebar rather than appearing twice, which leaves it with `Houses` and `Sign out`, so narrow it to 160px. The tabs keep the `nav-*` ids, so older tests still find them. The strip sits outside the screen's error boundary, so a crashed screen can still be left.

**Files:**

- Create: `regroup/portal/src/app/houses/areas.ts`, `src/app/HouseTabs.tsx`, `houses/HouseNumbers.tsx`, `houses/HousePage.tsx`, `src/app/Breadcrumb.tsx`, `regroup/portal/tests/areas.test.ts`, `regroup/portal/e2e/house.spec.ts`
- Modify: `regroup/portal/src/app/routes.tsx`, `urls.ts`, `ScreenFrame.tsx`, `Sidebar.tsx`, `current-house.ts`, `Providers.tsx`

**Interfaces:**

- Consumes: `useHouseSummary` and the formatting from Task 4; `useHouseAccess` from Task 3.
- Produces: `areasFor(house: { houseType?: string }): Area[]`, where `Area = { label: string; route: string; stage: 'core' | 'phone'; params?: object }`; `SHOW_LATER_AREAS = true`; `isRouteReleased(route: string, showLater: boolean): boolean`; `sectionsFor(showLater: boolean, fullView: boolean): Section[]`; `sectionForRoute(routeName: string): Section | null`; `HouseTabs({ houseId, routeName })`; `HouseNumbers({ houseId })`; `Breadcrumb({ houseId, guestId })`.

`areas.ts` imports `Routes` from `@mobile/navigation/types`, and its test mocks that module as `tests/urls.test.ts` does.

- [ ] **Step 1: Write the failing tests**

```ts
test('the page keeps adding a resident', () => {
  expect(areasFor({}).map((a) => a.label)).toEqual(['Add a resident']);
});
test('governance links show only for an Oxford house, and say to use the phone', () => {
  expect(areasFor({}).map((a) => a.label)).not.toContain('Oxford House Hub');
  expect(areasFor({ houseType: 'oxford' }).filter((a) => a.stage === 'phone').length).toBe(5);
});
test('later sections disappear until they ship', () => {
  for (const later of ['beds', 'drugTests', 'issues', 'complaints', 'reports']) {
    expect(sectionsFor(false, true)).not.toContain(later);
    expect(sectionsFor(true, true)).toContain(later);
  }
  expect(sectionsFor(false, true)).toContain('disputes');
});
test('a limited view gets no payments or reports', () => {
  expect(sectionsFor(true, false)).not.toContain('payments');
  expect(sectionsFor(true, false)).not.toContain('reports');
  expect(sectionsFor(true, false)).toContain('residents');
  expect(sectionsFor(true, true)).toContain('payments');
});
test('a resident screen counts as the Residents tab', () => {
  expect(sectionForRoute('route-GuestOverview')).toBe('residents');
  expect(sectionForRoute('route-GuestInfo')).toBe('residents');
  expect(sectionForRoute('route-HouseDisputes')).toBe('disputes');
  expect(sectionForRoute('route-ApplicationDetail')).toBeNull();
});
test('a later route is unregistered until it ships, so a reused screen linking to it alerts', () => {
  for (const later of ['Beds', 'Issues', 'Complaints', 'DrugTesting', 'DrugTestForm', 'DrugTestHistory', 'Documents', 'AdminReport']) {
    expect(isRouteReleased(`route-${later}`, false)).toBe(false);
    expect(isRouteReleased(`route-${later}`, true)).toBe(true);
  }
  expect(isRouteReleased('route-HouseDisputes', false)).toBe(true);
});
```

`e2e/house.spec.ts`:

```ts
test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test('clicking a house shows its breadcrumb, numbers and residents', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'E2E Test House' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123$/);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('All houses');
  await expect(crumbs).toContainText('E2E Test House');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});

test('the breadcrumb goes back to all houses', async ({ page }) => {
  await signInAs(page, 'manager');
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'All houses' })
    .click();
  await expect(page).toHaveURL(/\/$/);
});

test('tabs change the section and mark the current one', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page).toHaveURL(/\/houses\/test-house-123\/disputes$/);
  await expect(page.locator('#nav-disputes')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#nav-residents')).not.toHaveAttribute('aria-current', 'page');
});

test('the sidebar holds only Houses and sign out', async ({ page }) => {
  await signInAs(page, 'manager');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveCount(1);
  await expect(page.locator('#sign-out')).toBeVisible();
});

test('every tab fits a narrow window without scrolling the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await signInAs(page, 'manager');
  await expect(page.locator('#nav-reports')).toBeInViewport();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('a lapsed house shows no tabs', async ({ page }) => {
  await addSecondHouseForManager('canceled');
  await signInAs(page, 'manager');
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'Second House' }).click();
  await expect(page.getByTestId('subscription-required-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#nav-residents')).toHaveCount(0);
});

test('a reused screen keeps the breadcrumb but not the numbers', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-disputes');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
    'E2E Test House',
  );
  await expect(page.getByTestId('house-numbers')).toHaveCount(0);
});

test('a house with no scored residents shows no 0% health', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  await expect(page.getByTestId('house-numbers')).not.toContainText('0%');
});

test('opening a house page writes nothing', async ({ page }) => {
  await signInAs(page, 'manager');
  // After sign-in, which writes to its own account.
  const writes: string[] = [];
  page.on('request', (r) => {
    const isWrite = r.method() === 'POST' && r.url().includes(':18080') && r.url().includes('/Write/');
    if (isWrite && (r.postData() ?? '').includes('writes')) writes.push(r.url());
  });
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  await page.waitForTimeout(2000);
  expect(writes).toEqual([]);
  await page.evaluate(() => (window as any).__portalTest.writeProbe());
  await expect.poll(() => writes.length, { message: 'control: the watcher sees writes' }).toBeGreaterThan(0);
});

test('money owed by discharged residents is called out', async ({ page }) => {
  await admin().doc('guests/guest-b').update({ status: 'discharged', rentOwed: 5000 });
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  const numbers = page.getByTestId('house-numbers');
  await expect(numbers).toContainText('$200.00');
  await expect(numbers).toContainText('includes $50.00 from discharged residents');
});

test('the page title never holds a house or resident name', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-house-summary');
  await expect(page.getByTestId('house-numbers')).toBeVisible();
  expect(await page.title()).not.toMatch(/E2E Test House|Bob|Rivera/);
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- areas && regroup/portal/scripts/e2e.sh e2e/house.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`urls.ts`: move Task 1's `Beds`, `Issues`, `Complaints` and `DrugTesting` paths into `SECTIONS`, as `beds`, `issues`, `complaints` and `drugTests`, and relabel `summary` as `Overview`. Add `sectionForRoute`.

`HouseTabs`, inside `ScreenFrame` below `Breadcrumb`, is a `nav` with `aria-label="House sections"` mapping `sectionsFor(SHOW_LATER_AREAS, view === 'full')` to `HouseLink`s, wrapping onto a second line when narrow. Order, from the mockup: Overview, Residents, Beds, Applications, Payments, Disputes, Activities, Drug tests, Issues, Complaints, Reports. Ids are `nav-house-summary`, `nav-residents`, `nav-beds`, `nav-applications`, `nav-payments`, `nav-disputes`, `nav-activities`, `nav-drug-tests`, `nav-issues`, `nav-complaints`, `nav-reports`. `aria-current="page"` comes from `sectionForRoute(routeName)`, which also retires P2's stale sidebar marker. While `view` is `checking`, Payments and Reports stay out until it's known.

`Sidebar.tsx` keeps `#nav-home` and `#sign-out`. With it gone, `useCurrentHouseId`, `trackNavigationState` and `Providers.tsx`'s `onStateChange` have no users, so remove them. `houseIdForState` stays.

`areas.ts`, with labels read from `HouseSummary.tsx:279-311`: `Add a resident` is `core` with `Routes.ResidentIntake` and `{ houseId }` from the page. For an Oxford house, the five links to `OxfordDashboard`, `OfficerManagement`, `EESTracker`, `BusinessMeetings` and `OxfordVoting` are `phone`, using the labels in that file. Those routes aren't registered, so `onUnhandledAction`'s visible alert handles them, as the spec asks. `Oxford House Hub` keeps its exact text, because an older test clicks it. Meeting search, house settings and the setup banners aren't included: the first is a resident tool, and the spec leaves the second on the phone.

`routes.tsx` keeps the later screens in a `[route, component]` list and registers only those where `isRouteReleased(route, SHOW_LATER_AREAS)`. An unregistered route reaches `onUnhandledAction`'s visible alert, which is what the spec asks of a reused screen linking to an area not yet shipped. The flag stays `true` in this plan, and P7 decides.

`Breadcrumb`, inside `ScreenFrame` below `SubscriptionCheck`: a `nav` with `aria-label="Breadcrumb"`, `All houses` to `/`, the house name to `sectionPath(houseId, 'summary')`, and, when `guestId` is set and `useGuest(guestId)` confirms `guest.houseId === houseId`, the resident's name linking to `residentPath`. Until that's confirmed, the crumb stays out, so a name never shows above "This resident isn't in this house." The current page's crumb is plain text with `aria-current="page"`. Lay it out so the screen below still fills the height (`ScreenFrame` wraps both in a flex column, with the screen in an element with `data-testid="screen-body"` at `flex: 1, minHeight: 0`).

`HouseNumbers`: `data-testid="house-numbers"`, the same five fields and the same cell copy as a table row, from `useHouseSummary`. Export a `Cell` renderer from `HouseTable.tsx` so the copy lives in one place. When `overdueFromDischargedCents` is above 0, show `includes <formatCents> from discharged residents` under the overdue figure, because the list below leaves those residents out and the two would otherwise disagree.

`HousePage`, on `Routes.HouseSummary`: `HouseNumbers`, a row of area buttons (`<button type="button">`, because unmapped and Oxford routes have no `href` to give `HouseLink`) calling `navigation.navigate(area.route, area.params)`, then `ResidentTable` from Task 6. Until Task 6 exists, leave a one-line placeholder paragraph in this commit. Task 6 replaces it.

`routes.tsx`: `Routes.HouseSummary` to `HousePage`.

- [ ] **Step 4: Run the tests, including the older ones that click through `HouseSummary`**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test && regroup/portal/scripts/e2e.sh e2e/house.spec.ts e2e/residents.spec.ts e2e/multi-house.spec.ts e2e/shell.spec.ts`
Expected: everything passes except `clicking a house shows its breadcrumb, numbers and residents`, on `Bob Rivera` alone, until Task 6. Note that here and confirm it passes there.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): one house page with breadcrumb and numbers"
```

---

### Task 6: The resident list

The phone's list has one column, and pressing a row goes back, because on the phone it's a picker. At a desk the same list needs columns and links.

**Files:**

- Create: `regroup/portal/src/app/residents/rows.ts`, `residents/ResidentTable.tsx`, `residents/ResidentList.tsx`, `regroup/portal/tests/resident-rows.test.ts`
- Modify: `regroup/portal/src/app/routes.tsx`, `houses/HousePage.tsx`, `regroup/portal/e2e/resident.spec.ts` (create), `regroup/portal/e2e/fixtures.ts`

**Interfaces:**

- Consumes: `sortRows`, `SortHeader`, `formatCents`, `formatDay`, `canScore`, `residentPath`.
- Produces: `phaseLabel(guest): string`; `tableStateFor(houseId)`, the sort and filter kept in memory per house; `roomOf(rooms, guestId): string | null`; `currentResidents(guests): Guest[]`; `matchesName(guest, text): boolean`; `balanceLabel(rentOwed: unknown): string`; `ResidentTable({ houseId })`; `addResidents(houseId, count)` in `e2e/fixtures.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
const rooms = {
  '2A': { id: '2A', beds: { b1: { id: 'b1', guestId: 'g1' } } },
  '3B': { id: '3B', beds: { b2: { id: 'b2', guestId: null } } },
};

test("finds a resident's room", () => {
  expect(roomOf(rooms, 'g1')).toBe('2A');
  expect(roomOf(rooms, 'g2')).toBeNull();
  expect(roomOf({}, 'g1')).toBeNull();
  expect(roomOf(undefined, 'g1')).toBeNull();
});
test('discharged residents are left out, as on the phone', () => {
  const list = currentResidents({
    a: { id: 'a', status: 'active' },
    b: { id: 'b', status: 'discharged' },
  });
  expect(list.map((g) => g.id)).toEqual(['a']);
});
test('the name filter ignores case and matches either name', () => {
  const bob = { firstName: 'Bob', lastName: 'Rivera' };
  expect(matchesName(bob, 'riv')).toBe(true);
  expect(matchesName(bob, 'BOB R')).toBe(true);
  expect(matchesName(bob, 'alice')).toBe(false);
  expect(matchesName(bob, '  ')).toBe(true);
});
test('a balance is money or says it cannot be read', () => {
  expect(balanceLabel(15000)).toBe('$150.00');
  expect(balanceLabel(undefined)).toBe('$0.00');
  expect(balanceLabel('15000')).toBe("Can't read");
  expect(balanceLabel(NaN)).toBe("Can't read");
});
test('a custom phase has a name, not a document id', () => {
  expect(phaseLabel({ id: 'g1', phase: 'g1' })).toBe('Custom');
  expect(phaseLabel({ id: 'g1', phase: 'Phase 2' })).toBe('Phase 2');
  expect(phaseLabel({ id: 'g1', phase: 2 })).toBe('2');
  expect(phaseLabel({ id: 'g1', phase: '' })).toBe('No phase');
});
```

Start `e2e/resident.spec.ts`:

```ts
test.beforeEach(() => reseed({ E2E_RENT_CENTS: '15000' }));

test("the list shows a resident's details in columns", async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await admin().doc('guests/guest-a').update({ moveInDate: '2026-03-02' });
  await signInAs(page, 'manager');
  const row = page.getByTestId('guest-list-item').filter({ hasText: guestAName });
  await expect(row).toContainText(/active/i);
  await expect(row).toContainText('Default');
  await expect(row).toContainText('2A');
  await expect(row).toContainText('Mar 2, 2026');
  await expect(row).toContainText('$150.00');
});

test('filtering narrows the list by name', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('rivera');
  await expect(page.getByText('Bob Rivera')).toBeVisible();
  await expect(page.getByTestId('guest-list-item')).toHaveCount(1);
});

test('a filter that matches nobody says so', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('zzz');
  await expect(page.getByText('No residents match that name.')).toBeVisible();
});

test('sorting by balance puts the largest first', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('button', { name: /Balance/ }).click();
  await page.getByRole('button', { name: /Balance/ }).click();
  await expect(page.getByTestId('guest-list-item').first()).toContainText('$150.00');
});

test('a house with no residents says so', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-residents');
  await expect(page.getByText('No residents in this house yet.')).toBeVisible();
});

test('a long list can scroll to its last row', async ({ page }) => {
  await addResidents('test-house-123', 40);
  await signInAs(page, 'manager');
  const last = page.getByText('Zed Resident39');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test('a resident with a missing phase shows no score', async ({ page }) => {
  await admin().doc('guests/guest-b').update({ phase: 'Gone' });
  await signInAs(page, 'manager');
  const row = page.getByTestId('guest-list-item').filter({ hasText: 'Bob Rivera' });
  await expect(row).toContainText('No phase rules');
  await expect(row).not.toContainText('100%');
});

test('sort and filter are still there on coming back from a resident', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('searchbox', { name: 'Filter by name' }).fill('rivera');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page).toHaveURL(/\/residents\/guest-b$/);
  await page.goBack();
  await expect(page.getByRole('searchbox', { name: 'Filter by name' })).toHaveValue('rivera');
  await expect(page.getByTestId('guest-list-item')).toHaveCount(1);
});

test('a peer leader sees no house money, balances, Payments or Reports', async ({ page }) => {
  await makePeerLeader('manager');
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').first()).toBeVisible();
  await expect(page.getByTestId('guest-list-item').first()).not.toContainText('$');
  await expect(page.getByTestId('house-numbers')).not.toContainText('$');
  await expect(page.locator('#nav-disputes')).toBeVisible();
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-reports')).toHaveCount(0);
  await page.click('#nav-home');
  const house = page.getByRole('row', { name: /E2E Test House/ });
  await expect(house.getByRole('cell').nth(4)).toHaveText('1');
  await expect(house).not.toContainText('$');
  await expect(page.getByTestId('total-overdue')).toHaveCount(0);
});

test('a manager sees what an owner sees', async ({ page }) => {
  await makeManager('manager');
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').filter({ hasText: guestAName })).toContainText('$150.00');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.locator('#nav-payments')).toBeVisible();
  await expect(page.locator('#nav-reports')).toBeVisible();
  await page.click('#nav-home');
  await expect(page.getByTestId('total-overdue')).toHaveText(/\$150\.00/);
});

test('when the role cannot be confirmed, the limited view shows and says so', async ({ page }) => {
  await makeManager('manager');
  await page.route('**/myHouseTiers', (route) => route.abort());
  await signInAs(page, 'manager');
  await expect(page.getByTestId('role-notice')).toContainText("Couldn't confirm your role");
  await expect(page.getByTestId('house-numbers')).not.toContainText('$');
  await expect(page.locator('#nav-payments')).toHaveCount(0);
  await expect(page.locator('#nav-disputes')).toBeVisible();
});

test('an owner needs no role check', async ({ page }) => {
  await page.route('**/myHouseTiers', (route) => route.abort());
  await signInAs(page, 'manager');
  await expect(page.getByTestId('house-numbers')).toContainText('$150.00');
  await expect(page.getByTestId('role-notice')).toHaveCount(0);
});
```

`guestAName` is the constant `'Test GuestA'`, from `regroup/mobile/e2e/setup/testAccounts.json`. `addResidents` writes guests with ids `zed0` to `zed39` and names `Zed Resident0` to `Zed Resident39`, in phase `Default`. An id can't contain `_`, because `firestore.rules` splits summary ids on it. The row's Bob Rivera is `guest-b`, from the same file.

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- resident-rows && regroup/portal/scripts/e2e.sh e2e/resident.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ResidentTable` keeps `data-testid="guest-list-screen"` and row `data-testid="guest-list-item"`, because older tests use them. Columns: Resident (a `HouseLink` to `residentPath`, `Routes.GuestOverview`, `{ houseId, guestId }`), Status, Phase (`phaseLabel`), Room, Moved in, This week, and Balance for the full view only (`useHouseAccess`). Sort and filter live in a module-level `Map` keyed by house, so they survive leaving for a record and coming back. It's memory only, which the full page load at sign-out wipes. `This week` uses a `useQueries` on the same keys as Task 4, and shows a health icon (`RatsIcon` with `HEALTH_ICON_MAP`; `icons render real glyphs` relies on it) with the percent and word. Failed: `Couldn't load`. `canScore` false: `No phase rules`. Missing move-in: `Not recorded`. No room: `—`. Default sort is by name. A search input with `aria-label="Filter by name"` and `type="search"`. A failed list shows `Couldn't load residents.` and a `Try again` button calling `refetch`.

Move the week query into a `useWeekSummaries(guestIds, weekStart)` hook in `houses/useHouseSummary.ts`, used by both.

`ResidentList` on `Routes.GuestList`: `HouseNumbers`, then `ResidentTable`. `HousePage` swaps its placeholder for `ResidentTable`. The page reads `houseId` from `useSelectedHouse`, which `HouseGate` has already set to the URL's house.

- [ ] **Step 4: Run the tests**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test && regroup/portal/scripts/e2e.sh e2e/resident.spec.ts e2e/house.spec.ts e2e/residents.spec.ts e2e/shell.spec.ts e2e/access.spec.ts`
Expected: all pass, including Task 5's `clicking a house shows...`.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): resident list with columns, sorting and a name filter"
```

---

### Task 7: One resident

The record replaces `GuestHome`, and is read-only in this plan apart from links to reused screens. `GuestHome` still holds what P4 and later plans bring over: discharge, phase advancement and PDF export.

**Files:**

- Create: `regroup/portal/src/app/residents/ResidentGate.tsx`, `residents/ResidentRecord.tsx`, `residents/RecordSections.tsx`
- Modify: `regroup/portal/src/app/ScreenFrame.tsx`, `HouseGate.tsx`, `routes.tsx`, `regroup/portal/e2e/resident.spec.ts`, `regroup/portal/e2e/survey.spec.ts`

**Interfaces:**

- Consumes: `guestIdForState`, `residentPath`, `roomOf`, `balanceLabel`, `formatDay`, `canScore`, `Breadcrumb`.
- Produces: `ResidentGate({ houseId, guestId, children })`; `ResidentRecord`, reading `route.params.guestId`. P4 adds actions to the record's header.

- [ ] **Step 1: Write the failing journeys**

Add to `e2e/resident.spec.ts`:

```ts
const record = (id: string) => `/houses/test-house-123/residents/${id}`;

test('clicking a resident opens their record, by id', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/residents\/guest-b$/);
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Bob Rivera');
  expect(page.url()).not.toContain('Bob');
});

test('the record shows status, phase, room, move-in and money', async ({ page }) => {
  await setRooms('test-house-123', twoBedsOneFilled);
  await admin()
    .doc('guests/guest-a')
    .update({ moveInDate: '2026-03-02', choreFees: 2500, autoPayEnabled: true });
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const header = page.getByTestId('record-header');
  await expect(header).toContainText(/active/i);
  await expect(header).toContainText('Default');
  await expect(header).toContainText('Room 2A');
  await expect(header).toContainText('Mar 2, 2026');
  const money = page.getByTestId('record-payments');
  await expect(money).toContainText('$150.00');
  await expect(money).toContainText('$25.00');
  await expect(money).toContainText('On');
});

test('this week matches the list', async ({ page }) => {
  await setWeekStats('guest-b', { choresCompleted: 1 });
  await signInAs(page, 'manager');
  await expect(page.getByTestId('guest-list-item').filter({ hasText: 'Bob Rivera' })).toContainText(
    '50%',
  );
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page.getByTestId('record-week')).toContainText('50%');
});

test('sensitive fields show, and a probation officer shows only as on file', async ({ page }) => {
  await admin()
    .doc('guests/guest-a')
    .update({ legalStatus: 'parole', probationOfficer: 'Officer Name' });
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const legal = page.getByTestId('record-recovery');
  await expect(legal).toContainText('Jan 1, 2025');
  await expect(legal).toContainText(/parole/i);
  await expect(legal).toContainText('On file');
  await expect(legal).not.toContainText('Officer Name');
});

test('a peer leader sees the balance but not the legal fields', async ({ page }) => {
  await admin().doc('guests/guest-a').update({ legalStatus: 'parole' });
  await makePeerLeader('manager');
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-payments')).toContainText('$150.00');
  const recovery = page.getByTestId('record-recovery');
  await expect(recovery).toContainText('Jan 1, 2025');
  await expect(recovery).not.toContainText(/parole|legal status|probation/i);
});

test('a manager sees the legal fields', async ({ page }) => {
  await admin().doc('guests/guest-a').update({ legalStatus: 'parole' });
  await makeManager('manager');
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-recovery')).toContainText(/parole/i);
});

test('a resident with no activity this week shows 0%, not an error', async ({ page }) => {
  await addResidents('test-house-123', 1);
  await page.goto(record('zed0'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  const week = page.getByTestId('record-week');
  await expect(week).toContainText(/\b0%/);
  await expect(week).toContainText('No activity logged this week.');
  await expect(week).not.toContainText("Couldn't load");
});

test("open items count this resident's disputes", async ({ page }) => {
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-open-items')).toContainText('1 open dispute');
});

test('a resident in another house gets a message and none of their data', async ({ page }) => {
  await addSecondHouseForManager();
  await page.goto(`/houses/${SECOND_HOUSE}/residents/guest-a`);
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText("This resident isn't in this house.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('record-header')).toHaveCount(0);
  await expect(page.getByText(guestAName)).toHaveCount(0);
});

test('a resident who does not exist gets a message', async ({ page }) => {
  await page.goto(record('no-such-guest'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByText("Couldn't open this resident.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#nav-residents')).toBeVisible();
});

test('a resident in a house the operator does not run is refused by the gate', async ({ page }) => {
  await page.goto(record('guest-a'));
  await fillSignIn(page, 'test-oxford-operator@rats-e2e.com');
  await expect(page.getByText(/don't have access to this house/i)).toBeVisible({ timeout: 20_000 });
});

test("a discharged resident's record still opens, and says so", async ({ page }) => {
  await admin().doc('guests/guest-b').update({ status: 'discharged' });
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByTestId('record-header')).toContainText(/discharged/i);
});

test('a record survives a reload', async ({ page }) => {
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
});

test('links from the record open that resident in the reused screen, with no name in the URL', async ({
  page,
}) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await page.getByRole('link', { name: 'Full profile' }).click();
  await expect(page).toHaveURL(/\/residents\/guest-b\/profile$/);
  await expect(page.getByTestId('screen-body')).toContainText('Bob');
  await page.goBack();
  await expect(page).toHaveURL(/\/residents\/guest-b$/);
  await page.getByRole('button', { name: 'Documents' }).click();
  await expect(page.getByTestId('document-list-screen')).toBeVisible();
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('Bob');
});

test('a resident chosen in one house does not carry into the next', async ({ page }) => {
  await addSecondHouseForManager();
  await page.goto(record('guest-b'));
  await fillSignIn(page, 'test-manager@rats-e2e.com');
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.click('#nav-home');
  await page.getByRole('link', { name: 'Second House' }).click();
  await expect(page.locator('#nav-residents')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__portalTest.selectedGuestId()))
    .toBeNull();
});

// Entered through the app: a page opened by URL leaves nothing to go Back to but about:blank.
test('signing out from a record then pressing Back shows no resident data', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.getByRole('link', { name: 'Bob Rivera' }).click();
  await expect(page.getByRole('heading', { name: 'Bob Rivera' })).toBeVisible({ timeout: 20_000 });
  await page.locator('#sign-out').click();
  await expect(page.locator('#sign-in-form')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sign-in-form')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Bob Rivera')).toHaveCount(0);
});
```

In `e2e/survey.spec.ts`, change `['GuestOverview']` to `['GuestOverview', { houseId: HOUSE, guestId: GUEST }]`. The number of tests doesn't change.

- [ ] **Step 2: Run them to watch them fail**

Run: `regroup/portal/scripts/e2e.sh e2e/resident.spec.ts`
Expected: FAIL. Clicking a name does nothing yet, because `GuestOverview` is still the phone's `GuestHome`.

- [ ] **Step 3: Implement**

`ResidentGate`: `useGuest(guestId)`. While loading: `Loading this resident...` (`role="status"`). Failed or no doc: `Couldn't open this resident.`. `guest.houseId !== houseId`: `This resident isn't in this house.`. Each message has a link back to `sectionPath(houseId, 'residents')`. Otherwise it dispatches `selectGuestById(guestId)` in an effect and renders children once selected, the way `HouseGate` does for the house, so reused screens that read the selection get this resident. No resident data renders before the `houseId` check.

`ScreenFrame`: `HouseGate` then `SubscriptionCheck`, then `Breadcrumb` (with `guestIdForState(state)`) and `HouseTabs`, then `ResidentGate` when a guest id is present, then the keyed `ErrorBoundary`.

`HouseGate`: the effect that selects a new house also dispatches `selectGuestById(null)`. Fresh sessions already start with no selection, so reused screens handle it.

`ResidentRecord`, on `Routes.GuestOverview`, reads `route.params.guestId` and the house from `useSelectedHouse`. With no `guestId`, it shows `Choose a resident from the list.` with a link. Layout, from `portal-drilldown.html`: heading with the name; `data-testid="record-header"` with `<status> · <phaseLabel> · Room <room> · Moved in <date>`, plus `Full profile` to `Routes.GuestInfo`; then the four sections below in a two-column grid that drops to one column under 1100px.

`RecordSections.tsx`:

| testid              | Heading            | Contents                                                                                                                                                                                                                                             | Source                                                                                                                                                                                                            |
| ------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record-week`       | This week          | Percent and word, the phone's `ComplianceBreakdown`, links to Meetings, Work, Chores and Primary supporter summaries                                                                                                                                 | `useComplianceCheck`; percent is `getOverallPercentage`, the same as the list. `isError`: `Couldn't load this week.`. `canScore` false: `No phase rules`. No summary yet, which is normal early in a week: `0%` and `No activity logged this week.`. No Medication link while #194 stands |
| `record-payments`   | Payments           | Rent owed, Chore fees, Autopay `On` or `Off`, link to Payment history                                                                                                                                                                                | Guest doc, through `balanceLabel`                                                                                                                                                                                 |
| `record-recovery`   | Recovery and legal | Sobriety date and Drug of choice for all staff, as on the phone's edit form. Legal status, Probation officer `On file` or `None`, Referring center `On file` or `None` for the full view only (`useHouseAccess`), and not while `checking` | Guest doc, with `Not recorded` for blanks |
| `record-open-items` | Open items         | `N open disputes` linking to `SECTIONS.disputes`, a Documents button (`isRouteReleased` permitting) with `houseId`, `guestId`, `title`, Emergency contact `On file` or `Missing` | The count filters the same query key as Task 4 by `guestId` and open status; if it fails, `Couldn't load disputes`                                                                                                |

Keep to these. No "last payment", because of #191. No "last drug test", because of #197. No Staff notes link, because of #196: every read is refused, and the reused feed would say there are no notes. No action buttons: P4 and P5 add them.

`routes.tsx`: `Routes.GuestOverview` to `ResidentRecord`. Remove the `GuestHome`, `GuestList`, `HouseSummary` and `HousesOverview` imports.

- [ ] **Step 4: Run the journeys**

Run: `regroup/portal/scripts/e2e.sh e2e/resident.spec.ts`
Expected: all pass.

- [ ] **Step 5: Confirm nothing was left behind in the bundle's allowlist**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test && npm --prefix ~/dev/rp-regroup-portal/regroup/portal run typecheck && node ~/dev/rp-regroup-portal/regroup/portal/tools/bundle.mjs --production && node ~/dev/rp-regroup-portal/regroup/portal/tools/check-bundle.mjs`
Expected: PASS, `check-bundle: OK`. A native import that dropped out of the bundle with `GuestHome` may leave an unused allowlist entry. Leave those entries, since other reused screens and P4 still use them, unless `check-bundle` objects.

- [ ] **Step 6: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): resident record"
```

---

### Task 8: Prove it from a fresh clone, and report

**Files:**

- Modify: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`

- [ ] **Step 1: Run the whole thing from a fresh clone, on the production build, in the background**

Clone to the scratchpad at HEAD, copy the gitignored `regroup/functions/.secret.local`, `npm ci`, then unit tests, typecheck, and `scripts/e2e.sh --production`, with `E2E_TEST_PASSWORD` set and `E2E_STRIPE_ACCOUNT_ID` from `~/.config/regroup-e2e/stripe-e2e-account.txt`.
Expected: all unit tests pass. The browser suite passes, with exactly the 6 pinned phone bugs from P2 as expected failures. `check-bundle: OK`, and 0 test hooks in a normal build. Record bundle size and time to the sign-in form against P2's 4.4 MB and about 162 ms.

- [ ] **Step 2: Read the survey**

Read `dist/screen-survey.json`. Expected: `HouseSummary` moves from degraded to ok, since the phone's screen and its refused read are gone. `HouseList`, `GuestList` and `GuestOverview` are ok, and everything else matches P2. Any new crash or refused read is a finding.

- [ ] **Step 3: Time the table with a realistic operator**

In a one-off Playwright run, not committed: 8 houses of 12 residents, using the fixtures. Record the time from `#nav-home` until no cell says `…`, then the time and the number of reads for a return to the tab once the data is stale (about 120 reads, plus a rule `get()` for each missing summary). The spec says a server summary is follow-up work if this is too slow, so report the number and let the owner judge. Don't build one.

- [ ] **Step 4: Take screenshots and look at them**

At 1440 and 1024 wide: all houses, one house, the list, a record, and all houses with a failed row. Check each for clipped text, overlaps and scrolling. Fix anything on these new pages in this plan. Layout problems on reused screens go to P9.

- [ ] **Step 5: Mark the roadmap and commit**

Set P3's row to `Done` with this plan's path, and P4's to `Next`. Add a line under "Writing the next sub-plan": `P4 moves discharge and phase advancement from GuestHome to the record's header, adds Staff notes once #196 lets them load, maps Documents and StaffNotes to URLs if their params allow it, and revisits losing a form on a tab click. P5 decides what a direct /payments URL does for a peer leader, and checks a real invited manager against listHousePayments, whose assertHouseAdmin reads the house doc's adminIds rather than house-roles, so it may refuse them.`

```bash
git -C ~/dev/rp-regroup-portal add docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md
git -C ~/dev/rp-regroup-portal commit -m "docs(regroup-portal): P3 done"
```

- [ ] **Step 6: Report to the owner**

Include what an operator can now do, screenshots, the table's load time, the rulings and deferred minors, and what a peer leader can't see. Say that the phone's house health score always shows 0% (`getHousePercentage`, `HouseSummary.tsx`), and ask whether to file it. Don't file it or start P4 until they answer.
