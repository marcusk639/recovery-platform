# Next-Session Brief — Regroup E2E (Maestro) follow-ups

**For:** a fresh interactive Claude Code session on Marcus's machine (tasks b/c need
local Firebase emulators + an iOS simulator — NOT a headless/cron run).
**Branch:** `fix/p0-launch-blockers`. **Working dir for all paths:** `regroup/mobile/`.
**Prereqs already in place:** OpenJDK 21 at `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`.
**Context:** read `docs/e2e/regroup-e2e-test-plan.md` + `docs/e2e/testid-backlog.md` first.

Tool note: this project uses Serena MCP for code edits (get_symbols_overview →
find_symbol include_body → replace_symbol_body/replace_content). Add `testID` props
only; no behavior changes. Run `npx tsc --noEmit -p tsconfig.json` after edits and
grep for the files you touched (ignore pre-existing errors elsewhere).

---

## Task (a) — Wire 3 shared-component testID forwards

Each is a small, non-breaking optional-prop addition that unblocks several flows.

### a1. `RatsLoadingIndicator` — forward `testID`

File: `src/components/rats-loading-indicator/rats-loading-indicator.tsx`

- Add `testID?: string;` to `interface Props` (line ~6).
- Destructure `testID` and pass it to the root `<View testID={testID} ...>` (line ~19).
- Cleanup: in `src/screens/HouseSearch/HouseSearchScreen.tsx`, the loading spinner
  is currently wrapped in `<View testID="house-search-loading">` as a workaround —
  optionally collapse back to `<RatsLoadingIndicator testID="house-search-loading" />`.
- Unblocks: clean loading-state asserts app-wide.

### a2. `card-list` ActivityItemWithButton — forward button testIDs

File: `src/components/card-list/card-list.tsx`

- In `interface ActivityItemWithButtonProps` (line ~200) add:
  `leftButtonTestID?: string;` and `rightButtonTestID?: string;`
- In the render (left/right `<RatsButton>` around line ~255-270), pass
  `testID={props.leftButtonTestID}` and `testID={props.rightButtonTestID}`
  (RatsButton already accepts `testID`).
- Then in `src/screens/SetupWizards/OrgSetup.tsx` pass
  `leftButtonTestID={\`edit-house-button-${house.id}\`}` /
  `rightButtonTestID={\`delete-house-button-${house.id}\`}`on the per-house`ActivityItemWithButtons`.
- Unblocks: flow 03 (operator setup edit/delete), and many list-row actions.

### a3. `RatsRadioButtonGroup` — forward per-option testID

File: `src/components/rats-radio-button-group/index.tsx`

- Inspect first: it wraps `react-native-simple-radio-button`. If options render as
  `RadioButton`/`RadioButtonInput` you can pass `testID` per option from the
  `options` array (e.g. accept an optional `testID` field on each option, or a
  `getOptionTestID(option)` prop). If the library swallows testID, wrap each
  option row in a `Pressable`/`View testID=...` instead.
- Then in `src/screens/Landing/InitialLandingForm.tsx` (lines ~105-106) give the
  two role options `landing-role-guest` and `landing-role-manager`, and add
  `landing-demo-link` to the "Use the demo" TouchableOpacity (~166-179).
  (NEXT already = `nav-house-search`, SIGN IN already = `sign-in-button`.)
- Unblocks: flow 04 (guest house search → apply) role selection by id.

Commit (a) as: `test(regroup-mobile): forward testIDs in RatsLoadingIndicator/card-list/radio-group`.

---

## Task (b) — Augment `e2e/setup/seedTestData.js`

File: `src/../e2e/setup/seedTestData.js` (+ `e2e/setup/testAccounts.json`).
Verified facts:

- `useOxfordGate` (`src/hooks/useOxfordGate.ts`) requires `house.houseType === 'oxford'`
  AND `user.subscriptionMetadata.oxfordEnabled === true`. `OxfordDashboard` also
  checks `house.oxfordOnboardingComplete`.
- Applications are a **subcollection**: `houses/{houseId}/applications/{appId}`
  with `{ applicantUid, status, ... }` (see `src/services/applications.ts:20,35`).

### b1. Oxford house + oxford-enabled operator

- In `createTestHouses()` `houses` array, add:
  ```js
  {
    id: 'test-house-oxford', name: 'Test Oxford House', houseType: 'oxford',
    oxfordOnboardingComplete: true,   // true → exercises dashboard/charter; set false to exercise the onboarding wizard (flow 26)
    address: '1 Oxford Way', city: 'Test City', state: 'TS', zipCode: '12350',
    capacity: 8, currentOccupancy: 1, gender: 'mens',
    createdDate: new Date().toISOString(),
  }
  ```
- Give `test-manager` admin on it too (or add a dedicated oxford operator account in
  `testAccounts.json`). CRITICAL: when writing that operator's user doc
  (`db.collection('users').doc(uid).set({...})`), include
  `subscriptionMetadata: { oxfordEnabled: true }` — that is what the gate reads.
- Note for flows 28/30/31: charter compliance / EES / voting read their own
  Firestore data (votes, ees-records, officers). With none seeded they render
  empty/PENDING states — assert the screen + cards render (already how flow 31 is
  scoped), or seed a vote/EES/officer doc if you want populated assertions.

### b2. Seed an application for review (flow 09)

- After houses/users exist, write one pending application:
  ```js
  await db
    .collection('houses')
    .doc('test-house-123')
    .collection('applications')
    .doc('test-app-1')
    .set({
      id: 'test-app-1',
      applicantUid: '<guest-b uid or a synthetic applicant uid>',
      name: 'Applicant One',
      email: 'applicant1@rats-e2e.com',
      phone: '555-0300',
      status: 'pending',
      sobrietyDate: '2026-01-01',
      programType: 'AA',
      createdAt: new Date().toISOString(),
    });
  ```
  (Use a uid that exists in Auth if the read rule requires it; manager reads via
  `isAdmin([houseId])` so any applicantUid is fine for the admin-review path.)

### b3. Author the now-unblocked flows

Add under `maestro/flows/` following the existing pattern (login subflow → act →
logout), all `${APP_ID}`-parameterized, YAML-validate with
`ruby -ryaml -e '...'` (see how the existing flows were checked):

- `operator-applications.yaml` (09): manager → Applications → `app-row-test-app-1`
  → `btn-approve` → (with a3+intake testIDs) lands on `intake-form-screen`.
- `oxford-dashboard.yaml` (31): login(oxford operator) → select Oxford house →
  `oxford-charter-card` → assert `charter-compliance-screen` + `charter-card-*`.
- `oxford-onboarding.yaml` (26): seed house with `oxfordOnboardingComplete:false`
  → wizard `wizard-step-1..5` → `button-finish` → `oxford-dashboard-content`.
- `operator-setup-wizard.yaml` (03): after a2, drive add-house → wizard nav.

Commit (b) as: `test(regroup-mobile): seed Oxford house + application; author unblocked flows`.

---

## Task (c) — Live smoke run via the Maestro MCP

The Maestro MCP tools (`list_devices`, `inspect_screen`, `take_screenshot`, `run`)
are available. Workflow: `list_devices` → `run` → `inspect_screen` on failure.

### c1. Bring up the backend

```bash
cd regroup/mobile
export PATH="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin:$PATH"
npm run maestro:seed     # starts Firebase emulators (8080/9099/9199) + seeds; keep running
```

(If `maestro:seed` only seeds and doesn't keep emulators up, start them separately:
`cd firebase && firebase emulators:start --only firestore,auth,storage` with the
JDK-21 PATH, then `npm run seed-e2e` in another shell.)

### c2. Build + install the iOS app on a simulator

```bash
xcrun simctl list devices booted        # is a sim booted? if not:
# boot one, e.g.: xcrun simctl boot "iPhone 15"  (or open -a Simulator)
npm run ios                              # builds the debug app + installs on the booted sim
```

The app reads `IS_E2E_TEST` as a launch arg (NSUserDefaults) → `connectToEmulators()`.
No special build flag needed; Maestro passes the arg at launch.

### c3. Smoke-validate the emulator switch FIRST (runbook troubleshooting #1)

Via Maestro MCP: `list_devices` → pick the iOS `device_id` → `run` with
`{ files: ["maestro/flows/smoke.yaml"], device_id, env: { APP_ID: "com.rats.dev" } }`.
Smoke asserts `initial-landing-screen`. To prove the switch actually engaged,
after smoke also run `node maestro/scripts/assert-firestore.js` (reads a seeded
doc via the emulator) — if it sees the seed, the app is on the emulator, not prod.

### c4. Run the authored suite

`run` with `{ dir: "maestro/flows", device_id, env: { APP_ID: "com.rats.dev" } }`
(or one file at a time to isolate). On any failure: `inspect_screen` to read the
live hierarchy / confirm the expected testID is present, `take_screenshot` for a
visual, fix the flow or the testID, re-run.

### Known gotchas (carry-overs)

- **iOS only** — Android `IS_E2E_TEST` launch arg is unimplemented (NSUserDefaults
  is iOS-only); don't run `maestro:android` yet.
- **login.yaml uses `hideKeyboard`** — per maestro-gotchas this can mistype on iOS;
  if login flakes, replace with tap-next-field / `pressKey: enter`.
- **Stripe** — `guest-rent-payment.yaml` intentionally stops before `pay-now-button`
  (Stripe Checkout isn't emulated). Don't complete payment.
- **Seeded activity/guest doc-id mismatch** — `seedTestData.js` writes activities to
  `guests/<account-id>` while guest docs are keyed by Auth uid; the logged-in
  guest's `currentWeek` may read empty. If `guest-home`/`activity` asserts fail on
  data, fix the seed to key activities by uid (worth doing regardless).

Produce a report at `docs/e2e/reports/2026-06-DD-staging.md` (format in the
mobile-e2e skill, Workflow 3).

---

## Suggested order

a (unblocks) → b (seed + author) → c (run everything). Each is independently
committable. If short on time, **c1–c3 (smoke validation) is the single highest-value
step** — it proves the whole harness works end-to-end before investing further.
