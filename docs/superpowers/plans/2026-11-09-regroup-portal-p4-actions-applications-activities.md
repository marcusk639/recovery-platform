# Regroup Portal P4: Resident Actions, Applications, Staff Notes, Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From a desk, staff can work applications through to intake, discharge a resident, move them up a phase, keep staff notes and a shift log, and verify activities. Every write is the phone's own write, reached through its own screens.

**Architecture:** This plan mostly wires up reused phone screens. Each gets a route and URL, its ids filled in, and a web stand-in for any native control it needs. The record gets the phone's discharge and phase-advance components. New code is limited to navigation rules, one web `<select>` adapter, a leave-guard for the intake form, and the record's header actions. Browser tests prove that each write matches the phone's, field for field.

**Tech Stack:** As in P3.

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-operator-portal-design.md`, section 5 (Residents, Applications, Activities, Intake). Sequence: `docs/superpowers/plans/2026-11-08-regroup-portal-roadmap.md`. Research for this plan is in the explorer maps summarised under "What the phone does" below.

## Global Constraints

P3's constraints carry over unchanged, including:

- No `regroup/mobile` edits.
- Offset emulator ports only.
- No deploys.
- Files at 300 lines or fewer.
- `regroup-portal` commit scope, and never `--no-verify`.
- The browser suite runs in the background.
- A number is right or it says so.
- Peer leaders see less (owner decision).

- **The branch is now PR #210's head.** Rebasing it rewrites published commits, so push only with a force-with-lease, and only once the owner says to push. Commits stay local until then.

New for P4:

- **The phone's writes, not new ones.** No portal code writes to Firestore except through phone hooks, services and screens. Spec section 5 says staff don't log or correct activities, and the phone has no staff edit of a resident's details beyond phase. So P4 adds neither.
- **The two exceptions to "no `regroup/mobile` edits."** `regroup/mobile/firebase/firestore.rules` and its new test come in by cherry-picking PR #211's commit, exactly as #209's callable did, and a rebase drops them once #211 merges.
- **Known phone bugs this plan works around or pins:**
  - #194: the medication summary still crashes, so it gets no link.
  - #196: staff notes needed the rule in #211.
  - Intake has no duplicate guard: a double submit makes two residents. Pin it, and file it in Task 7.
  - `PhaseCustomization` swallows save errors. It stays unregistered, which means a visible "use the phone" alert. File it in Task 7.

## What the phone does (from the explorer maps, 2026-11-09)

- **Applications:**
  - `ApplicationDetail` takes `{houseId, appId}` and finds the application in `useHouseApplications`.
  - Every staff action is one `updateDoc` of `{status, operatorNote, reviewedAt, reviewedBy}` (`services/applications.ts:90-111`). Mark Reviewing is offered only on a pending application. Approve and Reject confirm through `Alert`.
  - Approve navigates to `ResidentIntake {houseId, applicationId}`. Intake ignores `applicationId`.
- **Intake:**
  - Four steps and 17 text fields, with no pickers.
  - The write is one batch: `guests/{newId}`, plus the house's `currentCapacity + 1` (`services/guest.tsx:208-216`).
  - On success it shows an `Alert`, then `goBack`. A reload loses the form.
- **Discharge:**
  - `DischargeGuestModal {visible, guestId, guestName, onClose, onSuccess}` calls `dischargeGuest`. That writes `{status: 'discharged', moveOutDate, dischargeNotes?, updatedAt}`, then calls `removePrivilegesForGuests`.
  - The rules rank-gate it, so a peer leader can't discharge an equal or higher rank.
- **Phase advancement:** `PhaseAdvancementBanner {guest, house, isAdmin}`. Advance confirms through `Alert`, then writes `{phase, updatedAt}`.
- **Staff notes:**
  - `StaffNotesFeed` reads `route.params {houseId, type, guestId, guestName}`. `type` is `resident_note` or `shift_log`, and `guestName` only titles the screen.
  - Writes: add, pin, delete (delete confirms through `Alert`).
- **Activities:**
  - `ActivityScreen` offers staff VERIFY (`{verified, verifiedBy}`) and the dispute actions, which belong to P6.
  - Each stat summary gives staff its left button:
    - Work, ADD HOURS (`add-hours-button`): this is staff logging, so hide it.
    - Medication, UPDATE MEDICATION (`update-medication-button`): staff logging, so hide it.
    - Chore, CHANGE CHORE (`change-chore-button`): writes the guest's `currentChore` through `RatsPicker`, which wraps `react-native-picker-select`. That is deferred today.
    - Supporter, CHANGE SPONSOR (`change-sponsor-button`): writes `primarySupporterName`.
    - Meeting, FIND MEETING: goes to `MeetingSearch`, a resident tool, so it gets the visible alert.
  - VIEW DISPUTES navigates to `Routes.House` with `{screen: HouseDisputes}`, a nested route the portal doesn't have.
  - `StatSummaryScreen` sizes its graph from `Dimensions.get('screen')`, which on a desktop is the whole monitor.

## Review Focus

1. **Approving an application, then leaving intake half done:** a warning before the form is lost, and the application stays approved, as on the phone (tests in Task 4).
2. **A peer leader discharging a manager:** the rules refuse it, and the operator sees why (test in Task 5).
3. **Staff can't log an activity for a resident** from any reused screen (test in Task 6).
4. **Reloading an application, an intake form or a resident's notes:** the page comes back, or says why not, and never goes blank (tests in Tasks 2, 4 and 5).
5. **Double-submitting intake:** pinned as a phone bug (test in Task 4).

---

## File Structure

```
regroup/portal/src/app/
  urls.ts                 Modify: application, intake, notes and shift-log paths
  route-context.ts        Modify: Routes.House {screen} becomes that screen; notes get their type
  routes.tsx              Modify: shift log route, PhaseCustomization stays out
  leave-guard.ts          Create: confirm before leaving the intake form
  HouseLink.tsx           Modify: consults the leave guard
  houses/areas.ts         Modify: Shift log area
  residents/RecordActions.tsx  Create: discharge, staff notes and the phase banner on the record
  residents/ResidentRecord.tsx Modify: renders RecordActions
  staff-only.css          Create: hides the two staff-logging buttons
regroup/portal/src/adapter/
  react-native.ts         Modify: Dimensions.get('screen') reads the window
  picker-select.tsx       Create: web react-native-picker-select
regroup/portal/tools/replacements.mjs  Modify: picker-select replaced, not deferred
regroup/portal/index.html  Modify: links staff-only.css
regroup/portal/tests/{route-context,urls,leave-guard,picker-select,browser-adapters}.test.ts(x)
regroup/portal/e2e/{applications,actions,notes,activities}.spec.ts  Create
regroup/mobile/firebase/firestore.rules, firebase/__tests__/staffNotes.rules.test.ts  Cherry-picked from #211
```

---

### Task 1: Bring in the staff-notes rule

**Files:** cherry-pick of PR #211's commit (`59cc3890` on `fix/regroup-staff-notes-rules`).

- [ ] **Step 0: Commit this plan and the roadmap row**

`docs(regroup-portal): P4 plan`. The rebase refuses to run with unstaged changes.

- [ ] **Step 1: Rebase on #160, cherry-pick #211, and confirm the suites**

Run:

```
git -C ~/dev/rp-regroup-portal fetch origin
git -C ~/dev/rp-regroup-portal rebase origin/chore/regroup-rn-upgrade
git -C ~/dev/rp-regroup-portal cherry-pick origin/fix/regroup-staff-notes-rules
npm --prefix ~/dev/rp-regroup-portal/regroup/portal test
```

Expected: clean, 155 unit tests pass. If #211 has merged into `main` and #160 has merged too, skip the cherry-pick and rebase on `origin/main`.

- [ ] **Step 2: Run the browser journeys that read staff notes today**

Run: `regroup/portal/scripts/e2e.sh e2e/survey.spec.ts`
Expected: `StaffNotes` moves from degraded to ok in `dist/screen-survey.json`. This is the proof that the portal's emulators load the new rule.

- [ ] **Step 3: Ledger the ruling**

`Task 1: Ruling: cherry-picked #211 (a regroup/mobile rules change) as #209 was, so the emulators allow staff notes; a rebase drops it after #211 merges — cost if wrong: the branch carries a rule that #211's review changes.`

---

### Task 2: Routes and URLs for the reused screens

**Files:**

- Modify: `regroup/portal/src/app/urls.ts`, `route-context.ts`, `routes.tsx`, `houses/areas.ts`, `src/adapter/react-native.ts`
- Test: `tests/route-context.test.ts`, `tests/urls.test.ts`, `tests/areas.test.ts`, `tests/browser-adapters.test.tsx`

**Interfaces:**

- `SHIFT_LOG_ROUTE = 'portalShiftLog'` in `urls.ts`.
- Linking paths:
  - `Routes.ApplicationDetail` → `houses/:houseId/applications/:appId`
  - `Routes.ResidentIntake` → `houses/:houseId/intake`
  - `Routes.StaffNotes` → `houses/:houseId/residents/:guestId/notes`, which becomes a resident route
  - `SHIFT_LOG_ROUTE` → `houses/:houseId/shift-log`

- [ ] **Step 1: Write the failing tests**

Add to `tests/route-context.test.ts`:

```ts
test("the phone's nested House route goes straight to the screen it names", () => {
  const action = withRouteContext(
    inHouse,
    nav('route-House', { screen: 'route-HouseDisputes' }),
    null,
  );
  expect(action.payload.name).toBe('route-HouseDisputes');
  expect(action.payload.params).toEqual({ houseId: 'h1' });
});
test('resident notes get their type when a screen leaves it out', () => {
  const onRecord = state([
    { name: 'route-GuestOverview', params: { houseId: 'h1', guestId: 'g1' } },
  ]);
  expect(paramsOf(withRouteContext(onRecord, nav('route-StaffNotes'), null))).toMatchObject({
    houseId: 'h1',
    guestId: 'g1',
    type: 'resident_note',
  });
});
test('a type the screen passed is kept', () => {
  expect(
    paramsOf(withRouteContext(inHouse, nav('route-StaffNotes', { type: 'shift_log' }), null)).type,
  ).toBe('shift_log');
});
```

Add to `tests/urls.test.ts`:

```ts
test('applications, intake, notes and the shift log have paths', () => {
  const { screens } = linkingConfig('http://x').config;
  expect(screens['route-ApplicationDetail']).toBe('houses/:houseId/applications/:appId');
  expect(screens['route-ResidentIntake']).toBe('houses/:houseId/intake');
  expect(screens['route-StaffNotes']).toBe('houses/:houseId/residents/:guestId/notes');
  expect(screens[SHIFT_LOG_ROUTE]).toBe('houses/:houseId/shift-log');
});
test('notes belong to the Residents tab, and the shift log to none', () => {
  expect(sectionForRoute('route-StaffNotes')).toBe('residents');
  expect(sectionForRoute(SHIFT_LOG_ROUTE)).toBeNull();
});
```

Add to `tests/areas.test.ts`:

```ts
test('the house page offers the shift log', () => {
  expect(areasFor({}).map((a) => a.label)).toEqual(['Add a resident', 'Shift log']);
});
```

Edit the existing `the page keeps adding a resident` test to `expect(areasFor({}).map((a) => a.label)).toContain('Add a resident')`. Its exact-list check moves to the test above, so the file's test count doesn't drop.

Add to `tests/browser-adapters.test.tsx`:

```ts
test("Dimensions.get('screen') reads the window, not the whole monitor", () => {
  expect(Dimensions.get('screen')).toEqual(Dimensions.get('window'));
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test`
Expected: the new tests fail, and the 155 others pass.

- [ ] **Step 3: Implement**

- `withRouteContext`, for a NAVIGATE or PUSH to `Routes.House` whose params carry `screen`: rewrite it to `{ name: params.screen, params: params.params }`, then apply the usual house fill. For `Routes.StaffNotes` with a `guestId` and no `type`, add `type: 'resident_note'`.
- `routes.tsx`: register `SHIFT_LOG_ROUTE` with `StaffNotesFeed` and `initialParams={{ type: 'shift_log' }}`. Leave `PhaseCustomization` unregistered, with a comment pointing to Task 7's issue.
- `areas.ts`: add `{ label: 'Shift log', route: SHIFT_LOG_ROUTE, stage: 'core' }` after "Add a resident".
- `react-native.ts`: re-export `Dimensions` with `get(dim)` that returns `get('window')` when `dim === 'screen'`. Comment that a phone's screen is its window, and a desktop's isn't.

- [ ] **Step 4: Run the tests**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test`
Expected: all pass.

- [ ] **Step 5: Commit**

`feat(regroup-portal): routes for applications, intake, staff notes and the shift log`

---

### Task 3: A web stand-in for the select picker

`react-native-picker-select` is deferred today, so CHANGE CHORE fails visibly. `RatsPicker` (`components/rats-picker/rats-picker.tsx:93-121`) uses it with these props: `value`, `itemKey`, `items` (`{key, label, value}`), `onValueChange(value, index)`, `onDonePress`, `useNativeAndroidPickerStyle`, `style`, `textInputProps` and `Icon`. It also takes a `ref` whose `setState({ showPicker: false })` `onDonePress` calls.

**Files:**

- Create: `regroup/portal/src/adapter/picker-select.tsx`, `regroup/portal/tests/picker-select.test.tsx`
- Modify: `regroup/portal/tools/replacements.mjs` (move it from `DEFERRED` to the replacements map), `tests/replacements.test.ts` if it lists the deferred set

**Interfaces:** default export `RNPickerSelect`, a class component rendering a `<select>`.

- [ ] **Step 1: Write the failing tests**

```ts
const items = [
  { key: 'k', label: 'Kitchen', value: 'Kitchen' },
  { key: 'b', label: 'Bathroom', value: 'Bathroom' },
];

test('shows the items and the current value', () => {
  render(<RNPickerSelect items={items} value="Bathroom" onValueChange={() => {}} />);
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Bathroom');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Select an item...', 'Kitchen', 'Bathroom']);
});
test('reports the chosen value and its index, counting the placeholder', () => {
  const onValueChange = vi.fn();
  render(<RNPickerSelect items={items} value={null} onValueChange={onValueChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
  expect(onValueChange).toHaveBeenCalledWith('Kitchen', 1);
});
test('a placeholder of {} means none', () => {
  render(<RNPickerSelect items={items} value="Kitchen" placeholder={{}} onValueChange={() => {}} />);
  expect(screen.getAllByRole('option')).toHaveLength(2);
});
test('setState from a ref, as RatsPicker calls it, does not throw', () => {
  const ref = createRef<any>();
  render(<RNPickerSelect ref={ref} items={items} value="Kitchen" onValueChange={() => {}} />);
  expect(() => act(() => ref.current.setState({ showPicker: false }))).not.toThrow();
});
test('the accessible name comes from textInputProps', () => {
  render(<RNPickerSelect items={items} value="Kitchen" onValueChange={() => {}} textInputProps={{ accessibilityLabel: 'Chore' }} />);
  expect(screen.getByRole('combobox', { name: 'Chore' })).toBeTruthy();
});
```

The placeholder label `Select an item...` and the index counting match the real library's defaults. Check them against `node_modules/react-native-picker-select/src/index.js` in the mobile package, and use what it says if it differs.

- [ ] **Step 2: Run them to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- picker-select`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Option values are indexes, so values of any type survive the trip. `onDonePress` is called after a change. `Icon` is rendered beside the select when given.

- [ ] **Step 4: Run the tests, then confirm the bundle**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test && node ~/dev/rp-regroup-portal/regroup/portal/tools/bundle.mjs --production && node ~/dev/rp-regroup-portal/regroup/portal/tools/check-bundle.mjs`
Expected: PASS, and `check-bundle: OK`.

- [ ] **Step 5: Commit**

`feat(regroup-portal): web select picker, so staff can change a resident's chore`

---

### Task 4: Applications through intake

**Files:**

- Create: `regroup/portal/src/app/leave-guard.ts`, `regroup/portal/tests/leave-guard.test.ts`, `regroup/portal/e2e/applications.spec.ts`
- Modify: `regroup/portal/src/app/HouseLink.tsx`, `regroup/portal/src/app/ScreenFrame.tsx`

**Interfaces:**

- `guardedRoutes = new Set([Routes.ResidentIntake])`
- `confirmLeave(fromRoute: string, leave: () => void): void` calls `leave` at once off a guarded route. On one, it shows `Alert.alert('Leave the intake form?', "What you've entered will be lost.", [Stay, Leave])`, and Leave calls `leave`.
- `useLeaveWarning(routeName)` adds a `beforeunload` listener while on a guarded route.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('off the intake form, leaving happens at once', () => {
  const leave = vi.fn();
  confirmLeave('route-GuestList', leave);
  expect(leave).toHaveBeenCalledTimes(1);
});
test('on the intake form, leaving waits for Leave', () => {
  const leave = vi.fn();
  confirmLeave('route-ResidentIntake', leave);
  expect(leave).not.toHaveBeenCalled();
  const [, , buttons] = lastAlert();
  buttons.find((b) => b.text === 'Leave')!.onPress!();
  expect(leave).toHaveBeenCalledTimes(1);
});
test('Stay keeps the form', () => {
  const leave = vi.fn();
  confirmLeave('route-ResidentIntake', leave);
  lastAlert()[2]
    .find((b) => b.text === 'Stay')!
    .onPress?.();
  expect(leave).not.toHaveBeenCalled();
});
```

`lastAlert` reads the alert store the way `tests/alert.test.tsx` does.

- [ ] **Step 2: Write the failing browser journeys**

In `e2e/applications.spec.ts`. The seed's `test-app-1` is a pending application from "Test Applicant" in `test-house-123`.

```ts
const app = () => admin().doc('houses/test-house-123/applications/test-app-1');

test('an application opens by URL and survives a reload', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.click('#nav-applications');
  await page.getByText('Test Applicant').click();
  await expect(page).toHaveURL(/\/houses\/test-house-123\/applications\/test-app-1$/);
  await page.reload();
  await expect(page.getByText('Test Applicant')).toBeVisible({ timeout: 20_000 });
});

test('marking an application reviewing writes what the phone writes', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/houses/test-house-123/applications/test-app-1');
  await page.getByText(/mark.*review/i).click();
  await expect.poll(async () => (await app().get()).data()!.status).toBe('reviewing');
  const data = (await app().get()).data()!;
  expect(
    Object.keys(data)
      .filter((k) => !SEEDED_APPLICATION_KEYS.includes(k))
      .sort(),
  ).toEqual(['operatorNote', 'reviewedAt', 'reviewedBy']);
  expect(data.reviewedBy).toBe(await uidOf('manager'));
});

test('rejecting asks first, then records the note', async ({ page }) => {
  // Reject → the alert dialog → confirm; status 'rejected', operatorNote is the typed note.
});

test('approving leads into intake, which admits the resident', async ({ page }) => {
  // Approve → confirm → URL /houses/test-house-123/intake.
  // Fill step 1 (first, last, email), Next through the steps, Submit.
  // Then: a guests doc with that email in test-house-123, infoEntered true,
  //   intakeCompletedBy the manager's uid, and the house's currentCapacity one higher.
  // The success alert names the resident; OK goes back.
});

test('leaving intake half done asks first, and Stay keeps what was typed', async ({ page }) => {
  // Type a first name, click #nav-residents → the alert "Leave the intake form?";
  //   Stay → the name is still there; click again, Leave → the residents list.
});

test('the application stays approved when intake is abandoned, as on the phone', async ({
  page,
}) => {
  // Approve, leave intake, and the application reads approved with a read-only decision box.
});

test('a peer leader can work applications, as on the phone', async ({ page }) => {
  // makePeerLeader('manager'), mark reviewing → status reviewing.
});

test('home counts one fewer application waiting after a review', async ({ page }) => {
  // Mark reviewing, then #nav-home: the Applications cell for E2E Test House reads 0.
});

test.fail(
  'double-submitting intake admits one resident (phone bug, filed in Task 7)',
  async ({ page }) => {
    // Double-click Submit on the last step; count guests with that email: expect 1.
  },
);
```

Write the bodies the comments describe. `SEEDED_APPLICATION_KEYS` comes from the seed's `application()` in `regroup/mobile/maestro/scripts/seed/docs.js`. Add `uidOf(account)` to `e2e/fixtures.ts`. Read `ApplicationDetailScreen.tsx` and `IntakeFormScreen.tsx` for the real button text and test IDs before writing selectors.

- [ ] **Step 3: Run both to watch them fail**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test -- leave-guard && regroup/portal/scripts/e2e.sh e2e/applications.spec.ts`
Expected: the leave-guard tests fail with module not found. The browser tests fail where they depend on the URL or the guard, and pass where the reused screens already work. Ledger which pass before any change: those prove the reused screen, not new code.

- [ ] **Step 4: Implement**

- `HouseLink` and the house tabs call `confirmLeave(navigationRef.getCurrentRoute()?.name ?? '', go)` before navigating.
- `ScreenFrame` calls `useLeaveWarning(routeName)`.
- Browser Back isn't guarded. Comment why: a popstate can't be held without fighting the router.

- [ ] **Step 5: Run them**

Run: `npm --prefix ~/dev/rp-regroup-portal/regroup/portal test && regroup/portal/scripts/e2e.sh e2e/applications.spec.ts e2e/home.spec.ts e2e/house.spec.ts`
Expected: all pass, and the `test.fail` is reported as an expected failure.

- [ ] **Step 6: Commit**

`feat(regroup-portal): applications through intake, with a warning before an intake form is lost`

---

### Task 5: Resident actions and staff notes

**Files:**

- Create: `regroup/portal/src/app/residents/RecordActions.tsx`, `regroup/portal/e2e/actions.spec.ts`, `regroup/portal/e2e/notes.spec.ts`
- Modify: `regroup/portal/src/app/residents/ResidentRecord.tsx`, `residents/RecordSections.tsx` (Open items gets the notes link)

**Interfaces:** `RecordActions({ guest, house })` renders, under the record header:

- the phone's `PhaseAdvancementBanner` with `isAdmin` true, because every portal user is staff;
- a Discharge button, unless the resident is already discharged, which opens `DischargeGuestModal` with `guestName = fullName(guest)`, where `onSuccess` invalidates `guestKeys.list(house.id)` and `guestKeys.detail(guest.id)`.

Open items gets a "Staff notes" link to `/houses/:houseId/residents/:guestId/notes`, with `guestName` in navigation state only.

- [ ] **Step 1: Write the failing browser journeys**

`e2e/actions.spec.ts`:

```ts
test('discharging writes what the phone writes, and the record and list follow', async ({
  page,
}) => {
  // Record guest-b → Discharge → type a note → confirm.
  // guests/guest-b: status discharged, moveOutDate set, dischargeNotes the note.
  // Bob Rivera's guest claim for test-house-123 is gone (getAuth().getUser).
  // The record header reads Discharged, and the residents list no longer shows Bob Rivera.
});
test('a peer leader discharging a manager is refused, and is told so', async ({ page }) => {
  // Seed: guest-b's account is a manager (house-roles tier manager, admin claim);
  //   makePeerLeader('manager'); discharge Bob → an alert says it failed;
  //   guests/guest-b status still active.
});
test('a resident who is eligible can be moved up a phase from the record', async ({ page }) => {
  // Seed a second phase and guest-a's week stats so the banner offers advancement;
  //   click it, confirm → guests/guest-a phase is the next phase.
});
test('a discharged resident shows no Discharge button', async ({ page }) => {
  /* status discharged → button absent */
});
test('Change Phase on the full profile says to use the phone', async ({ page }) => {
  // Full profile → Change Phase → the alert "use the Regroup app on your phone".
});
```

`e2e/notes.spec.ts`:

```ts
test('staff add a note to a resident, and it stays after a reload', async ({ page }) => {
  // Record → Staff notes → URL /residents/guest-a/notes, no '?' and no name;
  //   type, save → listed; reload → still listed; staffNotes doc has authorId the manager.
});
test('pinning and deleting a note', async ({ page }) => {
  /* pin → pinned true; delete asks first → gone */
});
test('the shift log is reached from the house page and keeps house-wide notes', async ({
  page,
}) => {
  // House page → Shift log → /houses/test-house-123/shift-log; add → listed; doc type shift_log, no guestId.
});
test('a peer leader can keep notes, as the rule allows', async ({ page }) => {
  /* makePeerLeader, add a note → saved */
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `regroup/portal/scripts/e2e.sh e2e/actions.spec.ts e2e/notes.spec.ts`
Expected: fail. The record has no actions, and notes have no link.

- [ ] **Step 3: Implement `RecordActions` and the notes link**

- If the rank refusal reaches the operator only as the phone's generic "Failed" alert, that is acceptable. The test asserts that an alert appears and the status is unchanged.
- If `PhaseAdvancementBanner` or `DischargeGuestModal` crash or render wrongly in the browser, fix it in the adapter or with a wrapper style, never in mobile code. Ledger it.

- [ ] **Step 4: Run them, with the record suite**

Run: `regroup/portal/scripts/e2e.sh e2e/actions.spec.ts e2e/notes.spec.ts e2e/resident.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

`feat(regroup-portal): discharge, phase advancement and staff notes on the resident record`

---

### Task 6: Activities, and no staff logging

**Files:**

- Create: `regroup/portal/src/app/staff-only.css`, `regroup/portal/e2e/activities.spec.ts`
- Modify: `regroup/portal/index.html`, `regroup/portal/tools/bundle.mjs` if CSS needs copying into `dist/`

- [ ] **Step 1: Write the failing browser journeys**

```ts
test('verifying an activity writes what the phone writes', async ({ page }) => {
  // #nav-activities → VERIFY on guest-b's chore → activities/test-activity-b1 verified true, verifiedBy the manager.
});
test('staff see no way to log an activity for a resident', async ({ page }) => {
  // Open the work and medication summaries for guest-a
  //   (__portalTest.open for medication, because it crashes, #194, so assert on work only):
  //   the add-hours-button is not visible; and no activities doc is created during the visit.
});
test('changing a resident chore uses the web picker and writes currentChore', async ({ page }) => {
  // Record → Chores → CHANGE CHORE → choose Bathroom → submit → guests/guest-a currentChore 'Bathroom'.
});
test('changing a sponsor writes primarySupporterName', async ({ page }) => {
  // Record → Primary supporter → CHANGE SPONSOR → type → submit.
});
test("VIEW DISPUTES on a summary opens the house's disputes tab", async ({ page }) => {
  // Chores summary → VIEW DISPUTES → URL /houses/test-house-123/disputes.
});
test('the summary graph fits the window', async ({ page }) => {
  // Chores summary at 1440x900: the graph element's bounding box is no wider than the main area.
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `regroup/portal/scripts/e2e.sh e2e/activities.spec.ts`
Expected: the logging, chore, disputes and graph tests fail. Verify may already pass, which proves the reused screen. Ledger that.

- [ ] **Step 3: Implement `staff-only.css`**

```css
/* Staff don't log or correct a resident's activities (spec, section 5). The phone
   shows staff these two, and the rules would allow the write, so hide them. */
[data-testid='add-hours-button'],
[data-testid='update-medication-button'] {
  display: none !important;
}
```

Link it from `index.html`. The chore, disputes and graph fixes come from Tasks 2 and 3. If one still fails, debug it here.

- [ ] **Step 4: Run them, with the suites that open summaries**

Run: `regroup/portal/scripts/e2e.sh e2e/activities.spec.ts e2e/resident.spec.ts e2e/survey.spec.ts`
Expected: all pass. The survey shows WorkSummary and ChoreSummary as ok.

- [ ] **Step 5: Commit**

`feat(regroup-portal): activities for staff, with no way to log for a resident`

---

### Task 7: Prove it, file what it found, and report

- [ ] **Step 1: Fresh clone, the production build, and the whole suite in the background**

As P3's Task 8. Expected: all unit tests pass. In the browser suite, the expected failures are P2's 6 plus Task 4's 1, and nothing else fails. `check-bundle` is OK.

- [ ] **Step 2: Screenshots at 1440 and 1024**

Take an application, the intake form, the record with its actions, the discharge modal, staff notes, the shift log, and a stat summary. Check the reused screens' layout, and list problems for P9 rather than fixing them.

- [ ] **Step 3: File the phone bugs this plan pinned, with the owner's earlier go-ahead for phone bugs**

- Intake has no duplicate guard.
- `PhaseCustomization` swallows save errors and goes back.

Use the same format as #208.

- [ ] **Step 4: Mark the roadmap and commit**

P4 Done, P5 Next. Note for P5: the intake form doesn't link the guest to its application, so an approved applicant can be admitted twice by hand. This is the phone's behaviour.

- [ ] **Step 5: Report**

What operators can now do, screenshots, the rulings and deferred minors, and the two issues filed. Then ask about P5.
