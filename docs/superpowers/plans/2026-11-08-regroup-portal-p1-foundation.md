# Regroup Portal P1: Foundation and Go/No-Go Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, on React Native 0.88 and with mobile code imported in place, that the phone's screens and writes work in a browser, then report go or no-go to the owner.

**Architecture:** `regroup/portal` is a new package that bundles `regroup/mobile/src` read-only. An explicit replacement list maps native imports to web versions, and the build fails on anything unlisted. A plain test harness (not the desktop shell) mounts the real screens against Firebase emulators running the real rules and functions.

**Tech Stack:** React 19, react-native-web 0.21, Firebase JavaScript modular SDK, esbuild, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`. Sequence: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`.

## Global Constraints

- Nothing in this plan edits `regroup/mobile`. If a step seems to need it, stop and report it as a finding.
- Nothing touches `phoenix-cleanhouse` or `regroup-e2e`. Everything runs on loopback emulators under `demo-regroup-e2e`, and browser tests fail on any non-loopback request (Task 3).
- No production or staging deploys.
- The portal must never block a mobile PR. Its CI job uses `continue-on-error: true` until launch finishes.
- A shipped build must never silently stub a native feature. Unlisted native imports fail the build. A feature the portal hasn't built fails visibly when reached. A feature that has no meaning on the web may be `inert`, but only with a written reason.
- No personal data in logs, URLs, analytics or error reports. All test data comes from the existing seed.
- Don't kill or reuse any emulator on the default ports. Another session may own them. The portal has its own ports for every emulator it starts (Task 3).
- New source files stay at 300 lines or fewer. Commit scopes use `regroup-portal`. Never use `--no-verify`.
- Work only in `~/dev/rp-regroup-portal`. Use `git -C <path>`, and quote `"${B}:path"` in zsh. Serena indexes the main checkout, so use Read and Grep on worktree paths.
- Money paths get an independent reviewer who reasons from the domain model.
- **Keeping up with #160.** Before each task, fetch. If `origin/chore/regroup-rn-upgrade` moved, rebase on it. #160 lands as a squash merge, so once it merges, use `git rebase --onto origin/main <last base SHA>`, not a plain rebase. Keep that SHA from each rebase.

**Two changes from the spec's slice order:** P1 targets 0.88 only, because the throwaway test already covered 0.72 and #160 changes the Firebase API. The `Alert` replacement moves here from slice 2, because the dispute journey can't pass without it.

## Review Focus

1. **A write the rules refuse:** the operator sees a visible error they can dismiss, no success state, and the balance is unchanged (test in Task 6).
2. **Cancelling a confirm:** Cancel, Escape or clicking outside writes nothing (tests in Tasks 4 and 5).
3. **Double-clicking Record or Approve:** exactly one write. Browser double-clicks are more common than double-taps (tests in Tasks 5 and 6).
4. **Reloading the page mid-session:** the operator returns to a working screen or the sign-in form, never a blank page (test in Task 3).
5. **A reused screen linking to a route the portal doesn't have:** a visible message, not a dead button or crash, including Oxford governance links (test in Task 4).

---

## File Structure

```
regroup/firebase.portal.json          Emulator config on offset ports
regroup/portal/
  package.json, tsconfig.json, index.html, .gitignore, playwright.config.ts, vitest.config.ts
  tools/replacements.mjs              The explicit native-import list and classify()
  tools/bundle.mjs                    esbuild build, resolution rules, build report
  tools/check-bundle.mjs              Post-build invariants
  tools/serve.mjs                     Static server for dist/
  src/types/mobile-any.d.ts           Typecheck boundary for @mobile/* imports
  src/adapter/preload.ts              Browser fixes that must run before mobile code loads
  src/adapter/firebase-setup.ts       Replaces regroup/mobile/firebase-setup.ts
  src/adapter/firebase/{app,auth,firestore,functions,storage}.ts
  src/adapter/react-native.ts         react-native-web plus portal overrides
  src/adapter/alert/{alert-store.ts,AlertHost.tsx}
  src/adapter/{sentry.ts,keyboard-controller.tsx,gesture-handler.tsx,icons.tsx}
  src/adapter/deferred.tsx            Visible failure for features not built yet
  src/adapter/document-picker.ts      Browser file input, same API the Documents screen uses
  src/harness/{main.tsx,Providers.tsx,SignIn.tsx,Nav.tsx,routes.tsx}
  scripts/{e2e.sh,seed.sh}
  e2e/{residents,disputes,payments,documents,survey}.spec.ts, e2e/helpers.ts
  tests/*.test.ts(x)
```

---

### Task 1: Package, bundler and the replacement list

**Files:**

- Create: `regroup/portal/package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `vitest.config.ts`, `tools/replacements.mjs`, `tools/bundle.mjs`, `tools/check-bundle.mjs`, `src/types/mobile-any.d.ts`, `src/harness/main.tsx` (one line rendering "portal" for now)
- Test: `regroup/portal/tests/replacements.test.ts`

**Interfaces:**

- Produces: `classify(specifier: string): { kind: 'real' | 'replace' | 'deferred' | 'inert' | 'unknown'; target?: string; reason?: string }`. `npm run build` writes `dist/main.js` and `dist/build-report.json` with `{ replaced: string[], deferred: string[], inert: { name: string, reason: string }[], sizeBytes: number }`. The alias `@mobile/*` resolves to `regroup/mobile/src/*`.

- [ ] **Step 1: Stack the branch and commit the design**

If #160 has merged, rebase on `origin/main`. Otherwise rebase on its branch, because the portal needs that code.

```bash
git -C ~/dev/rp-regroup-portal fetch origin
git -C ~/dev/rp-regroup-portal branch --unset-upstream
git -C ~/dev/rp-regroup-portal rebase origin/chore/regroup-rn-upgrade
git -C ~/dev/rp-regroup-portal add docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md docs/superpowers/plans/2026-11-08-regroup-portal-p1-foundation.md
git -C ~/dev/rp-regroup-portal commit -m "docs(regroup-portal): design, roadmap and P1 plan"
```

Expected: `grep '"react-native"' regroup/mobile/package.json` shows `0.88.1`.

- [ ] **Step 2: Create the package**

For every package the bundle shares with mobile, use the exact version in `regroup/mobile/package.json`, including `react`, `react-redux`, `@reduxjs/toolkit`, `@tanstack/react-query`, `@react-navigation/*`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `lodash`, `formik`, `yup`, `date-fns`, `date-fns-tz`, `uuid`, `i18next`, `react-i18next`, `ngeohash`, `@callstack/react-theme-provider`, `react-native-modal`, `react-native-popover-view`, `react-native-collapsible`, `react-native-size-matters` and `react-native-simple-radio-button`.

Add `react-dom` at the `react` version, `react-native-web` 0.21.4, `firebase` (latest 12.x), and `victory` at the `victory-native` version. Don't add `react-native-gesture-handler` or `react-native-reanimated`: mobile source uses the first only for one `TouchableOpacity`, and never imports the second.

Dev: `esbuild`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `firebase-admin`. Use the global `firebase` CLI. Scripts: `build`, `test` (`vitest run`), `typecheck`, `e2e`. Commit the lockfile.

Typecheck boundary: `tsconfig.json` includes only `src`, `tests` and `e2e`, and maps `@mobile/*` to `src/types/mobile-any.d.ts`, which declares those modules as `any`. Without this, `tsc` follows imports into mobile code, whose types need the native packages the portal doesn't install.

- [ ] **Step 3: Write the failing test**

```ts
import { classify } from '../tools/replacements.mjs';

test('native import with no entry is unknown', () => {
  expect(classify('react-native-some-new-thing').kind).toBe('unknown');
});
test('react-native maps to the portal wrapper', () => {
  expect(classify('react-native')).toEqual({
    kind: 'replace',
    target: 'src/adapter/react-native.ts',
  });
});
test('firestore maps to the adapter', () => {
  expect(classify('@react-native-firebase/firestore').target).toBe(
    'src/adapter/firebase/firestore.ts',
  );
});
test('ordinary JS packages are real', () => {
  expect(classify('date-fns').kind).toBe('real');
});
test('every inert entry has a reason', () => {
  for (const e of inertEntries()) expect(e.reason.length).toBeGreaterThan(10);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd regroup/portal && npx vitest run tests/replacements.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 5: Implement `classify` in `tools/replacements.mjs`**

A specifier is native if it starts with `react-native`, `@react-native`, or is `@stripe/stripe-react-native` or `@sentry/react-native`. Native specifiers must match a list entry by exact name or package prefix, or they are `unknown`. Everything else is `real`, unless listed. Start with the entries the tests need, plus `victory-native` → `victory`.

- [ ] **Step 6: Implement `tools/bundle.mjs`**

Use esbuild's JS API with `jsx: 'automatic'`, `.web.*` extensions first, `.js` loaded as JSX, image and font loaders as data URLs, `format: 'esm'`, `minify` when `--production`, and `metafile: true`. Define `__DEV__`, `process.env.NODE_ENV` and `process.env` (as `{}`) from `--production`, and `global` as `globalThis`. An esbuild plugin must:

- Map any import resolving to `regroup/mobile/firebase-setup` to `src/adapter/firebase-setup.ts`.
- Resolve every bare import from a file under `regroup/mobile/` starting at `regroup/portal`, so `regroup/mobile/node_modules` is never used.
- Apply `classify`. Collect all `unknown` specifiers, then fail the build once listing them all.
- Generate a module for each `deferred` and `inert` specifier. esbuild refuses missing named exports, so scan `regroup/mobile/src` for what each specifier's importers name, and generate those exports plus a default. Type-only imports are ignored.

- [ ] **Step 7: Implement `tools/check-bundle.mjs`**

Exit 1, naming the problem, if any of these is true:

- A metafile input contains `regroup/mobile/node_modules`.
- More than one copy of `react` is bundled.
- The bundle text contains `phoenix-cleanhouse`.
- A package shared with `regroup/mobile/package.json` has a different version in `regroup/portal/package.json`. Print this one as a warning when `--warn-versions` is set, which CI uses, because a mobile bump must not fail a mobile PR.

- [ ] **Step 8: Run tests and build**

Run: `npx vitest run && npm run typecheck && npm run build && node tools/check-bundle.mjs`
Expected: all pass with the placeholder entry.

- [ ] **Step 9: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): package, bundler and native import allowlist"
```

---

### Task 2: Adapters

**Files:**

- Create: `src/adapter/firebase-setup.ts`, `src/adapter/firebase/{app,auth,firestore,functions,storage}.ts`, `src/adapter/{sentry.ts,deferred.tsx,preload.ts,keyboard-controller.tsx,gesture-handler.tsx,icons.tsx}`
- Modify: `tools/replacements.mjs`, `package.json` (icon packages, for their fonts and glyph maps)
- Test: `tests/firebase-adapter.test.ts`, `tests/deferred.test.tsx`, `tests/icons.test.tsx`

**Interfaces:**

- Consumes: `classify` from Task 1.
- Produces: `firebase-setup.ts` exports the same names as the mobile file: `emulatorConnection`, `firestore`, `auth`, `messaging`, `storage`, `functions`, `callHttpsFunction<T>(name, payload)`. `deferred.tsx` exports `deferred(feature: string)`, returning a value that renders "not available on the web yet: <feature>" and throws `NativeFeatureUnavailable` when called.

- [ ] **Step 1: Read the existing mapping**

Read `regroup/mobile/src/integration/rnfb-to-web.ts`. It already maps the phone's Firebase imports to the web SDK for the integration tests, and it records differences the app depends on. It can't be imported directly, because it uses Node's `fs` and test settings, so port its logic. Keep a comment naming it as the source.

- [ ] **Step 2: Write the failing tests**

```ts
test('Firestore errors carry RN Firebase codes', async () => {
  // activity.ts retries on 'firestore/permission-denied'
  webGetDoc.mockRejectedValue(Object.assign(new Error('no'), { code: 'permission-denied' }));
  await expect(getDoc(fakeRef)).rejects.toMatchObject({ code: 'firestore/permission-denied' });
});
test('a batch commit rejects with the RN Firebase code', ...);   // same mapping via writeBatch().commit()
test('onSnapshot errors carry the RN Firebase code', ...);       // error callback receives firestore/<code>
test('sign-in exposes user._user, which util/user.ts reads', async () => {
  const cred = await signInWithEmailAndPassword(fakeAuth, 'a@example.test', 'pw');
  expect((cred.user as any)._user).toBe(cred.user);
});
test('putFile uploads a blob URL through the web SDK', async () => {
  await putFile(ref(fakeStorage, 'docs/x.pdf'), 'blob:http://localhost/abc', { contentType: 'application/pdf' });
  expect(uploadBytes).toHaveBeenCalledOnce();
});
test('setup refuses any project but demo-regroup-e2e', () => {
  expect(() => assertEmulatorProject('phoenix-cleanhouse')).toThrow();
});
test('calling a deferred feature throws, naming it', () => {
  expect(() => deferred('react-native-webview')()).toThrow(/react-native-webview/);
});
test('rendering a deferred feature shows a visible message', () => {
  const C = deferred('react-native-webview');
  render(<C />);
  expect(screen.getByText(/not available on the web yet: react-native-webview/)).toBeTruthy();
});
test('an icon renders its glyph in its font', () => {
  render(<Ionicons name="home" />);
  expect(screen.getByRole('img', { hidden: true }).textContent).toBe(String.fromCodePoint(ioniconsGlyphs.home));
});
test('an unknown icon name renders a visible fallback', ...);
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/firebase-adapter.test.ts tests/deferred.test.tsx tests/icons.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the Firebase adapters**

Each adapter is `export * from 'firebase/<module>'` plus only the differences:

- `firestore.ts`: the error wrappers from `rnfb-to-web.ts` (`getDoc`, `getDocs`, `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`, `runTransaction`, `writeBatch`, `onSnapshot`).
- `auth.ts`: sign-in functions return a `user` with a non-enumerable `_user` pointing to itself.
- `storage.ts`: `putFile(ref, localUriOrBlobUrl, metadata)` using `fetch` and `uploadBytes`.
- `firebase-setup.ts`: call `assertEmulatorProject`, then initialize with project `demo-regroup-e2e` and `initializeFirestore(app, { ignoreUndefinedProperties: true })`, and connect to the ports from Task 3. There is no production config in P1.

- [ ] **Step 5: Implement the other adapters and list entries**

- `sentry.ts`: `captureException` and `captureMessage` log only the error `code` and `name`, never the message or extras. Stubs for `init`, `addBreadcrumb`, `setUser`, `wrap`.
- `preload.ts`: make `navigator.geolocation` an own writable property, because `components/rats-search-bar/index.tsx` assigns to it at load. It must be the first import in `main.tsx`.
- `keyboard-controller.tsx`: what `components/rats-keyboard/index.tsx` and `components/rats-scroll-view/index.tsx` import, using `ScrollView` and pass-through providers.
- `gesture-handler.tsx`: `TouchableOpacity` from react-native-web, and anything else the build reports.
- `icons.tsx`: `@react-native-vector-icons/{ionicons,material-icons,fontawesome5}/static`, registering each package's font with `@font-face`. `fontawesome5/glyphmaps/...` stays real.
- `inert`, each with a reason: `@react-native-community/geolocation` (`util/geolocation.ts` configures it at load, and desk workflows don't use location), `@react-native-firebase/messaging`, `@react-native-firebase/analytics`, `react-native-notify-kit`, `react-native-launch-arguments`.

Deferred functions throw, so anything mobile code calls at module load must be `inert` or `replace`, or the whole app fails to start.

- [ ] **Step 6: Run tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): Firebase, icon, keyboard and deferred-feature adapters"
```

---

### Task 3: Harness, emulators and the residents journey

This is the earliest test of the biggest unknown: the phone's code on React 19 and React Native 0.88 in a browser.

**Files:**

- Create: `regroup/firebase.portal.json`, `regroup/portal/scripts/e2e.sh`, `scripts/seed.sh`, `tools/serve.mjs`, `playwright.config.ts`, `src/harness/{Providers,SignIn,Nav,routes}.tsx`, `e2e/helpers.ts`, `e2e/residents.spec.ts`
- Modify: `src/harness/main.tsx`, `tools/replacements.mjs`

**Interfaces:**

- Consumes: everything from Tasks 1 and 2.
- Produces: `helpers.ts` exports `signInAs(page, 'manager' | 'oxford-operator')`, `admin()` (an Admin SDK Firestore client on the portal's emulator), `reseed()` and `revokeClaimsAndRefresh(page, account)` (clears the account's claims with the Admin SDK, then forces a token refresh through `window.__portalTest.refreshToken()`, which the harness exposes). `signInAs` selects `test-house-123` for `manager` and `test-house-oxford` for `oxford-operator`. Harness navigation has ids `nav-residents`, `nav-disputes`, `nav-payments`, `nav-documents` and `nav-house-summary`.

- [ ] **Step 1: Create the emulator config**

Copy `regroup/firebase.e2e.json` to `regroup/firebase.portal.json`, with these ports: auth 19099, firestore 18080, firestore websocket 19150, storage 19199, functions 15001, eventarc 19299, tasks 19499, hub 14400, logging 14500, and `ui.enabled: false`. The functions emulator also starts eventarc and tasks, whose default ports 9299 and 9499 are in use on this machine.

- [ ] **Step 2: Write the scripts**

`e2e.sh` is the one command that runs journeys. From `regroup/`, it always runs `npm --prefix functions ci` and `npm --prefix functions run build`, because a stale `lib/` tests old server code. It then runs `npx playwright install chromium`, the bundle build (passing through `--production`), and `firebase emulators:exec --config firebase.portal.json --project demo-regroup-e2e --only auth,firestore,storage,functions "npx playwright test $@"` from the portal directory.

`seed.sh`: set `FIRESTORE_EMULATOR_HOST=127.0.0.1:18080`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099`, `GCLOUD_PROJECT=demo-regroup-e2e`, and `NODE_PATH` to `regroup/portal/node_modules`, then run `node ../mobile/maestro/scripts/seed/index.js`. It requires `E2E_TEST_PASSWORD`, and uses `E2E_STRIPE_ACCOUNT_ID` when set. Read the password from where `regroup/mobile/maestro/README.md` says, and never print it.

Expected output includes: `Seeded demo-regroup-e2e: 4 accounts, 2 houses, 3 activities`.

`playwright.config.ts`: `workers: 1`, because all tests share the emulators, and `webServer` running `tools/serve.mjs`. A shared fixture fails the test on any browser request to a non-loopback host, and on any `pageerror`.

- [ ] **Step 3: Build the harness**

`Providers.tsx` uses the phone's provider order from `regroup/mobile/index.js` and `App.tsx`: redux `Provider`, `QueryClientProvider`, `NavigationContainer ref={navigationRef}`, `RatsKeyboardProvider`, `SafeAreaProvider`, `ThemeProvider`, `DataProvider`, `NotificationProvider`, `ModalProvider`, `Auth`. Leave out `StripeProvider` and `GestureHandlerRootView`. Import mobile code through `@mobile/*`.

`SignIn.tsx` has `id="sign-in-form"`, dispatches the real `login` thunk, then `selectHouseById`. `routes.tsx` registers `GuestList`, `Disputes`, `PaymentDashboard`, `DocumentListScreen` (with `houseId`, `guestId` and `title` params) and `HouseSummary`, using the phone's route names. The container wrapping the navigator must be `display: flex; flex-direction: column`, or screens collapse to zero height. Classify each new native import the build reports, keeping `deferred` for anything these screens don't need.

- [ ] **Step 4: Write the failing journey**

```ts
test('manager signs in and sees seeded residents', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-residents');
  const row = page.getByTestId('guest-list-item').first();
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeGreaterThan(20);
  await expect(page.getByText('Bob Rivera')).toBeVisible();
});
test('icons render real glyphs', ...);   // an icon element has non-empty text and its icon font-family
test('reloading mid-session does not leave a blank page', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.reload();
  await expect(page.locator('#nav-residents, #sign-in-form').first()).toBeVisible({ timeout: 15000 });
});
```

- [ ] **Step 5: Run it to verify the current state**

Run: `scripts/e2e.sh e2e/residents.spec.ts`
Expected: the first run fails. Work through failures in the adapter layer only, adding a test for each adapter fix. Record anything that can't be fixed without editing mobile code.

**Stop and report to the owner now** if the screens can't mount on React 19 and react-native-web without editing mobile code. Later tasks would be wasted.

- [ ] **Step 6: Run the passing journey**

Run: `scripts/e2e.sh e2e/residents.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/firebase.portal.json regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): test harness and residents journey on real rules"
```

---

### Task 4: A real `Alert`

**Files:**

- Create: `src/adapter/alert/alert-store.ts`, `src/adapter/alert/AlertHost.tsx`
- Modify: `src/adapter/react-native.ts`, `src/harness/Providers.tsx`, `src/harness/routes.tsx`, `e2e/residents.spec.ts`
- Test: `tests/alert.test.tsx`

**Interfaces:**

- Produces: `Alert.alert(title, message?, buttons?, options?)` with React Native's signature. `react-native.ts` adds `export { Alert }`, which takes precedence over its `export *`.

- [ ] **Step 1: Write the failing tests**

```tsx
test('shows title, message and all buttons', ...);          // getByRole('alertdialog'), text, 2 buttons
test('a button click runs its onPress once and closes', ...);
test('no buttons means a single OK that closes', ...);
test('Escape runs the cancel-style button, or closes if none, and never a confirm', async () => {
  const approve = vi.fn();
  Alert.alert('Approve dispute?', 'msg', [{ text: 'Cancel', onPress: () => null }, { text: 'Approve', onPress: approve }]);
  await userEvent.keyboard('{Escape}');
  expect(approve).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
test('clicking outside does not confirm', ...);              // same assertion via the backdrop
test('a double-click on a button runs onPress once', ...);
test('a second alert waits until the first closes', ...);
test('it appears above an open React Native Modal and takes clicks', ...); // RNW Modal traps focus; see below
```

Treat a button as cancel-style if `style === 'cancel'` or its text is `Cancel`, because the phone's dispute prompts set no style. `PaymentDashboard` reports a failed payment while its full-screen `Modal` is open, so the alert must sit above react-native-web's `Modal` and work despite its focus trap.

```ts
// e2e/residents.spec.ts
test('a link to a route the portal lacks fails visibly', async ({ page }) => {
  await signInAs(page, 'oxford-operator');
  await page.click('#nav-house-summary');
  await page.getByText('Oxford House Hub').click();
  await expect(page.getByRole('alertdialog')).toContainText("isn't available on the web yet");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/alert.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the store and host**

Use a queue in a small external store read with `useSyncExternalStore`, and `role="alertdialog"` with `aria-modal`. Mount `<AlertHost />` once in `Providers.tsx`. Add `onUnhandledAction` to the `NavigationContainer`, showing "This isn't available on the web yet" through `Alert`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run && scripts/e2e.sh e2e/residents.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): working Alert replacement and visible missing routes"
```

---

### Task 5: Disputes journey

**Files:**

- Create: `regroup/portal/e2e/disputes.spec.ts`
- Modify: adapter files only if the journey exposes a gap

**Interfaces:**

- Consumes: `signInAs`, `admin`, `reseed` from Task 3.

- [ ] **Step 1: Write the failing journey**

The seed has `activities/test-activity-123`, disputed by guest-b against guest-a, in `test-house-123`. Reseed before each test. The server writes the decision log asynchronously, and the rules allow a reopen only after it exists, so wait for it before undoing.

```ts
const ID = 'test-activity-123';
const data = async () => (await admin().doc(`activities/${ID}`).get()).data()!;
const decisions = async () => (await admin().collection(`activities/${ID}/dispute-decisions`).get()).docs.map((d) => d.id);

test('approve writes exactly the required outcome through the real rules', async ({ page }) => {
  await open(page);
  await page.getByTestId(`resolve-dispute-button-${ID}`).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId(`undo-dispute-decision-button-${ID}`)).toBeVisible();
  const a = await data();
  expect(a).toMatchObject({ status: 'resolved', disputed: 'successful', incomplete: true,
    disputeOutcome: 'incomplete-per-residents', disputeResult: 'success' });
  expect(a.disputeResolvedAt).toBeTruthy();
});
test('the server logs the decision, which proves real functions ran', async ({ page }) => {
  await approve(page);
  await expect.poll(decisions, { timeout: 15000 }).toEqual([expect.stringMatching(/^decided_/)]);
});
test('reject keeps the activity counting', ...);   // disputed: 'rejected', incomplete: false, disputeResult: 'fail'
test('undo reopens the decision', ...);            // approve, poll decisions, undo, confirm: status 'disputed', outcome fields null, reopenedBy set
test('cancel writes nothing', ...);                // status stays 'disputed', decisions empty
test('double-clicking Approve in the prompt decides once', ...); // exactly one decided_ entry
```

- [ ] **Step 2: Run it to verify the current state**

Run: `scripts/e2e.sh e2e/disputes.spec.ts`
Expected: failures, if any, point to adapter gaps. Fix them there.

- [ ] **Step 3: Run the passing journey**

Expected: PASS, 6 tests.

- [ ] **Step 4: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "test(regroup-portal): dispute decisions through the real rules and functions"
```

---

### Task 6: Payments journey

**Files:**

- Create: `regroup/portal/e2e/payments.spec.ts`
- Modify: adapter files only if the journey exposes a gap

**Interfaces:**

- Consumes: `signInAs`, `admin`, `reseed`, `revokeClaimsAndRefresh` from Task 3.

**Setup (local only, values never printed or committed):** put the e2e sandbox's `STRIPE_SECRET_KEY` in the gitignored `regroup/functions/.secret.local`, and export `E2E_STRIPE_ACCOUNT_ID`, as `regroup/mobile/maestro/README.md` describes. Both are in `~/.config/regroup-e2e/`. Confirm the key has a test-mode prefix, and stop if it doesn't.

**What the real callable returns:** `listHousePayments` returns only Stripe charges for the house's connected account. Manual payments live in Firestore, so don't expect them in its results. The throwaway test's "Collected $500" came from its fake.

- [ ] **Step 1: Write the failing journey**

Seed with `E2E_RENT_CENTS=15000`, so guest-a owes $150.00. The seed already has guest-a payments of 2222 and 1111 cents, so filter by amount.

```ts
test('the real callable loads with no error', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('payment-stats-card')).toBeVisible();
  await expect(page.getByText('Failed to load payment data.')).toHaveCount(0);
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$150.00 owed');
});
test('recording $50 writes 5000 cents and lowers the balance in one batch', async ({ page }) => {
  await record(page, 'guest-a', '50.00');
  const pays = await admin().collection('payments').where('guestId', '==', 'guest-a').where('amount', '==', 5000).get();
  expect(pays.size).toBe(1);
  expect((await admin().doc('guests/guest-a').get()).data()!.rentOwed).toBe(10000);
  await expect(page.getByTestId('overdue-residents-card')).toContainText('$100.00 owed');
});
test('a cents value is not rounded wrongly', ...);       // 19.99 -> 1999
test('double-clicking RECORD records one payment', ...);
test('a refused write shows an error they can dismiss, and changes nothing', async ({ page }) => {
  await open(page);
  await revokeClaimsAndRefresh(page, 'manager');
  await tryRecord(page, 'guest-a', '50.00');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Failed to record payment');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);
  expect((await admin().doc('guests/guest-a').get()).data()!.rentOwed).toBe(15000);
});
```

- [ ] **Step 2: Run it to verify the current state**

Run: `scripts/e2e.sh e2e/payments.spec.ts`
Expected: failures point to adapter gaps. If the double-click test fails because the phone screen has no guard, don't edit mobile. Record it as a finding for P5, and mark that test `test.fail()` with a comment naming the finding.

- [ ] **Step 3: Answer the dashboard question and pin it**

The spec's section 4 flags $0 outstanding with overdue residents. Read how `PaymentDashboard.tsx` computes Collected and Outstanding, then add a test asserting what the screen really does after a manual payment. Report in plain terms whether a recorded cash payment shows in Collected, the history and the chart, and whether Outstanding counts overdue rent. **If not, that's existing phone behavior, so it goes to the owner as a possible launch issue.** Don't change it here.

- [ ] **Step 4: Dispatch the independent money review**

Give a fresh reviewer the spec, this task's tests, `regroup/mobile/src/services/payments.ts` and `regroup/functions/src/callable/payments.ts`. Ask them to reason from the domain model (cents, batch atomicity, dollars at the callable boundary), not from these tests. Fix any finding in the adapter or tests, and report mobile findings to the owner.

- [ ] **Step 5: Run the passing journey**

Expected: PASS, apart from any `test.fail()` recorded as a finding.

- [ ] **Step 6: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "test(regroup-portal): manual payments and the real payments callable"
```

---

### Task 7: One screen with a picker

**Files:**

- Create: `src/adapter/document-picker.ts`, `tests/document-picker.test.ts`, `e2e/documents.spec.ts`
- Modify: `tools/replacements.mjs`

**Interfaces:**

- Produces: the same names `DocumentListScreen.tsx` imports from `@react-native-documents/picker`: `pick`, `keepLocalCopy`, `types`, `errorCodes`, `isErrorWithCode`. `pick({ type })` resolves to `[{ uri, name, type, size }]`, with `uri` a blob URL. Cancelling rejects with an error whose code is `errorCodes.OPERATION_CANCELED`. `keepLocalCopy({ files, destination })` resolves to `[{ status: 'success', localUri: <the blob URL> }]`.

- [ ] **Step 1: Write the failing tests**

```ts
test('pick resolves with the chosen file', ...);          // fake input change event
test('cancelling rejects with OPERATION_CANCELED', ...);  // input 'cancel' event
test('types.pdf and types.images become the accept attribute', ...);
test('keepLocalCopy returns the shape the screen reads', async () => {
  const [copy] = await keepLocalCopy({ files: [{ uri: 'blob:x', fileName: 'a.pdf' }], destination: 'cachesDirectory' });
  expect(copy).toMatchObject({ status: 'success', localUri: 'blob:x' });
});
```

The screen asks for a category through `Alert` after picking, and opens documents with `Linking.openURL(doc.storageUrl)`.

```ts
test('uploading a PDF creates a document the operator can open', async ({ page, context }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await uploadControl(page).click();
  await (await chooser).setFiles({ name: 'lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.getByRole('alertdialog').getByRole('button').first().click(); // a category
  await expect(page.getByText('lease.pdf')).toBeVisible();
  expect((await admin().collection('documents').where('houseId', '==', 'test-house-123').get()).size).toBe(1);
  const popup = context.waitForEvent('page');
  await page.getByText('lease.pdf').click();
  expect((await popup).url()).toContain('127.0.0.1:19199');
});
test('cancelling the picker shows no error', ...);
```

`uploadControl` uses the screen's real control, once you've read `DocumentListScreen.tsx`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/document-picker.test.ts && scripts/e2e.sh e2e/documents.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the picker and add its list entry**

Use a hidden `<input type="file">`. It must work with the storage rules through `putFile` from Task 2.

- [ ] **Step 4: Run the passing tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "feat(regroup-portal): web document picker and upload journey"
```

---

### Task 8: Survey of every first-release screen

Four working screens can't show whether "most screens need rebuilding", which is one of the no-go conditions. This task mounts the rest and reports what happens, without fixing them.

**Files:**

- Create: `e2e/survey.spec.ts`
- Modify: `src/harness/routes.tsx`, `tools/replacements.mjs`

**Interfaces:**

- Produces: `dist/screen-survey.json`, with one row per screen: `{ screen, mounted, pageErrors, deferredShown, unhandledRoutes }`.

- [ ] **Step 1: Register the first-release screens**

Add the screens from the spec's section 5 scope table to `routes.tsx`: `HouseOverview` screens, `Beds`, `Applications`, `ResidentIntake`, `Profile/GuestHome`, `StaffNotes`, `BalanceDashboard`, `Payments/PaymentHistory`, `Activity`, `StatUpdates` summaries, `DrugTesting`, `Issues`, `Complaints` and `AdminReport`. Classify newly reached native imports as `deferred` unless a replacement is trivial.

- [ ] **Step 2: Write the survey**

```ts
for (const s of SURVEY_SCREENS) {
  test(`survey ${s.route}`, async ({ page }) => {
    await signInAs(page, 'manager');
    await navigate(page, s.route, s.params);
    await page.waitForTimeout(2500);
    record(s.route, {
      mounted: await rootHasContent(page),
      pageErrors,
      deferredShown: await deferredTexts(page),
    });
  });
}
```

Survey rows record problems rather than failing, so one broken screen doesn't hide the others. This suite opts out of the fixture's fail-on-`pageerror`, but keeps the non-loopback check.

- [ ] **Step 3: Run it**

Run: `scripts/e2e.sh e2e/survey.spec.ts`
Expected: `dist/screen-survey.json` has a row for every screen.

- [ ] **Step 4: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal
git -C ~/dev/rp-regroup-portal commit -m "test(regroup-portal): survey of first-release screens"
```

---

### Task 9: Production build and non-blocking CI

**Files:**

- Modify: `tools/bundle.mjs`, `tools/check-bundle.mjs`, `.github/workflows/ci.yml`, `scripts/git-hooks/pre-push`

**Interfaces:**

- Produces: `npm run build -- --production`. `scripts/e2e.sh --production` runs all journeys against the minified bundle.

- [ ] **Step 1: Make the production build pass all journeys**

Run: `scripts/e2e.sh --production && node tools/check-bundle.mjs`
Expected: the same results as the dev bundle. Record `sizeBytes`, gzipped size and the time to the sign-in form in the report. There is no limit yet.

- [ ] **Step 2: Add the CI job**

Add `regroup-portal` to `.github/workflows/ci.yml`, named `regroup/portal — test (non-blocking)`, with `continue-on-error: true`. It runs `npm ci`, `npm run typecheck`, `npx vitest run`, `npm run build -- --production` and `node tools/check-bundle.mjs --warn-versions`. It runs on every PR, so mobile changes that break the portal show up. Browser journeys stay local in P1 because they need sandbox secrets.

- [ ] **Step 3: Add the pre-push package**

Add `regroup/portal` to `PACKAGES` in `scripts/git-hooks/pre-push`, so it only tests when the portal changes.

Verify with: `git -C ~/dev/rp-regroup-portal diff origin/chore/regroup-rn-upgrade --stat -- regroup/mobile` (use `origin/main` once #160 has merged)
Expected: no output, which proves `regroup/mobile` is unchanged.

- [ ] **Step 4: Commit**

```bash
git -C ~/dev/rp-regroup-portal add regroup/portal .github/workflows/ci.yml scripts/git-hooks/pre-push
git -C ~/dev/rp-regroup-portal commit -m "ci(regroup-portal): production build check, non-blocking CI"
```

---

### Task 10: Go/no-go report

**Files:** none. The report goes to the owner, and into the PR body if the owner asks for a PR.

- [ ] **Step 1: Run everything from clean**

```bash
rm -rf regroup/portal/node_modules regroup/portal/dist
cd regroup/portal && npm ci && npx vitest run && npm run typecheck && node tools/check-bundle.mjs && scripts/e2e.sh --production
```

Expected: all pass, or each failure is a recorded finding.

- [ ] **Step 2: Fill in the gate**

**Go** requires all of these. Report each with its evidence:

| Gate                                                                                     | Evidence                         |
| ---------------------------------------------------------------------------------------- | -------------------------------- |
| Screens mount on React 19 and RN 0.88 with no uncaught page errors                       | `residents.spec.ts`              |
| `regroup/mobile` has no edits, and in-place import uses no `regroup/mobile/node_modules` | Task 9 diff, check-bundle        |
| Dispute approve, reject and undo pass the real rules, and the server logs the decisions  | `disputes.spec.ts`               |
| Payment amounts are correct, and refused writes are visible                              | `payments.spec.ts`, money review |
| A picker screen works end to end                                                         | `documents.spec.ts`              |
| The minified build passes the same journeys                                              | `--production` run               |
| Most first-release screens mount, or the rest have an affordable fix                     | `screen-survey.json`             |

**Bring to the owner as no-go, or as a decision,** if any gate fails, if a fix would require editing mobile during launch, or if the survey shows most screens need rebuilding.

Also report: the final replacement list with what's `deferred` and `inert` and why, bundle size and load time, findings for later plans (double-click guards, the dashboard behavior, anything else), and what P2 should change.

- [ ] **Step 3: Stop and ask the owner for the go decision**

Don't start P2, open a PR or push until the owner says so.
