# React Native 0.88 upgrade: decision record

Scope: `regroup/mobile`, React Native 0.72.17 → 0.88.1. Started 2026-10-30.

This record says what was decided and done, and why. The design is
`docs/superpowers/specs/2026-10-29-react-native-0.88-upgrade-design.md`; the task-by-task plan is
`docs/superpowers/plans/2026-10-30-react-native-0.88-upgrade.md`. Sections are filled in as each task
lands, so a reader can stop at any point and see what is true on the branch.

## Contents

1. [Summary](#1-summary)
2. [Baselines before the upgrade](#2-baselines-before-the-upgrade)
3. [How behaviour is pinned](#3-how-behaviour-is-pinned)
4. [Pre-existing defects found](#4-pre-existing-defects-found)
5. [Audits](#5-audits)
6. [Decisions, by task](#6-decisions-by-task)
7. [Verification](#7-verification)
- [Appendix A: integration baseline and recovery targets](#appendix-a-integration-baseline-and-recovery-targets)
- [Appendix B: typecheck baseline mapping](#appendix-b-typecheck-baseline-mapping)

## 1. Summary

_Written last (Task 16)._

## 2. Baselines before the upgrade

Measured on 2026-10-30 at `5586d23` (RN 0.72.17, RNFirebase 17.5.0), Linux, Node 22.

| Suite | Command | Result |
| ----- | ------- | ------ |
| Unit | `npx jest --ci` | 328 suites; 5,266 tests: 5,264 pass, 0 fail, 2 todo |
| Typecheck ratchet | `npm run typecheck:ratchet` | 137 errors (baseline 137) |
| Security rules | `firebase emulators:exec --only firestore,storage,auth --project demo-test "… jest.config.rules.js"` | 27 suites, 591 tests, all pass |
| Integration | `firebase emulators:exec --only firestore,auth --project demo-test "… jest.config.integration.js"` | 6 suites, 48 tests: 28 pass, 20 fail |

The plan expected 27 passing integration tests and 21 failing. The measured numbers are 28 and 20;
the measured ones are the baseline. `regroup/mobile/CLAUDE.md` still says "24 of 48 currently fail"
and "240 tests" for the rules suite; Task 16 corrects both. Every failure is an assertion mismatch in
`activity.integration.test.ts` (3) or `activity.emulator.test.ts` (17), not an environment error;
they predate this work and are listed in Appendix A.

The emulator suites ran with `npx firebase-tools@15` and Java 21.

## 3. How behaviour is pinned

The upgrade rewrites code that has no other safety net, so the behaviour is recorded first, on RN
0.72, by tests that must keep passing unchanged.

### 3.1 Firebase operation log

**Problem.** The modular Firebase migration (Task 10) rewrites every Firestore call. Unit tests that
assert mock call chains (`firestore.collection(...).doc(...).set`) must be rewritten with the code, so
a mapping mistake can be copied into the test.

**Decision.** A normalized operation log, `__mocks__/firebase-modular/`. Both API shapes (namespaced
`firestore.collection('x').doc('y').get()` and modular `getDoc(doc(firestore, 'x', 'y'))`) write the same
entries to one in-memory store: `{ op, path, data?, options?, constraints? }`. Sentinels serialize as
`{ __fv: 'serverTimestamp' | 'increment' | … }`. Queries evaluate `where`/`orderBy`/`limit`/cursors
against the store, transactions refuse a read after a write (as Firestore does), `update` fails on a
missing document, and `Date` values are stored and read back as Timestamps.

The money and integrity tests (`*.oplog.test.ts(x)`, 12 files, 103 tests) assert outcomes and log
entries only, and stay **byte-identical from the Task 2 commit to the end of Task 10**. A wrong
mapping fails them instead of being absorbed into an edited expectation.

**Snapshot shape.** Before RNFirebase 22, `snapshot.exists` is a boolean; from 22 it is a method. The
mock follows the installed package version. Simulating the method shape against today's code fails
exactly the 7 tests whose not-found branch changes behaviour:

- `activity.ts`: week summary, update, delete and resolve;
- `treasury.ts`: `getFinancialRecord`;
- `reopenDispute.ts`;
- `guest.tsx`: `updateGuest`.

The other `exists` reads covered here already treat a missing document safely: `payments.ts`,
`activity.ts`'s `residentUidOf`, `useLiveHouseDisputes` and the paywall kill switch.

**Deviation from the plan.** The plan had the global namespaced mocks (`jest.setup.js`,
`__mocks__/firebase-setup.ts`) also write to the log. They are `jest.fn` stubs that 5,264 existing
tests configure per test, so changing them risks every suite for no gain. Instead, each op-log test
opts in with three `jest.mock` lines that route `firebase-setup`, `@react-native-firebase/firestore`
and `@react-native-firebase/functions` to the dual-shape mocks. The global mocks gain modular
functions in Task 9, when the code needs them. Beyond the planned file list, `setup.js` is the
`firebase-setup` stand-in and `log.d.ts` types the helpers for the tests. Each file is kept under 300
lines by splitting along its seams:

- `firestore-query.js`: query evaluation.
- `firestore-snapshots.js`: snapshots.
- `firestore-writes.js`: batches, transactions and sentinels.
- `timestamp.js`: Timestamps.

**Votes.** The plan named "the transaction's reads and writes" for `oxford/votes.ts`. Ballots have
gone through the `castOxfordVote` callable since 2026-07-07, with no client transaction, so the pinned
contract is the callable payload (house, vote, choice, never the client's guest id).

### 3.2 Wrappers

| Wrapper | File | What it pins |
| ------- | ---- | ------------ |
| `RatsModal` with the real `react-native-modal` 13.0.1 | `rats-modal.behaviour.test.tsx` | backdrop press, hardware back (via the `BackHandler` listener), `onModalShow` / `onModalHide`, swipe props reach the library with the JS driver, unmount while visible |
| `RatsLoadingModal` with the real library | `rats-loading-modal.behaviour.test.tsx` | loading → success → auto-hide after 1 s; error text; unmount |
| `RatsCheckBox` in a real Formik `Field` | `rats-checkbox.behaviour.test.tsx` | value shown, testID, label, `onValueChange` without Formik, and two pre-existing defects (§4) |
| `RatsScrollView` | `rats-scroll-view.behaviour.test.tsx` | `keyboardShouldPersistTaps` default and override, `on-drag` dismiss, indicator, `scrollEnabled`, container style; APSL-only props in a block Task 15 replaces |

The swipe gesture itself is the library's (PanResponder touch history is not reproducible in Jest);
the Mac checkpoint exercises it.

Characterization commit: `b5092c7`. The byte-identical rule is checked with
`git diff b5092c7 -- '*.oplog.test.ts' '*.oplog.test.tsx'` (empty through Task 10).

## 4. Pre-existing defects found

Found while pinning behaviour on RN 0.72. None is caused by the upgrade. Each is pinned as found, so
fixing one is a visible, deliberate test change.

1. **Checkbox taps throw inside Formik.** The native checkbox calls `onValueChange(boolean)`, and
   `RatsCheckBox` hands it to Formik's `field.onChange(name)`, which expects a string or an event
   (`formik` 2.4.9 `executeChange` reads `target.type` of `undefined`). A tap throws and the form value
   never changes. Every use goes through a `Field`. The one reachable use is the SignUp terms of
   service (`SignUpFormView.tsx:249`), and SignUp refuses to submit unless `termsOfService` is true
   (`SignUpForm.tsx:246`), so sign-up through that screen appears blocked on a device today. The
   other uses are in screens no navigator registers: HouseConfig phase rules
   (`HouseConfigFormView.tsx:154,167`) and the GuestUpdate/CreateGuest boolean fields
   (`GuestUpdateFormView.tsx:41`). **Owner decision needed** on whether Task 8 (the JS checkbox) fixes
   it, or a separate fix ships first.
2. **`RatsCheckBox` ignores `disabled`.** The prop is declared but never passed on, so a disabled
   form (`disabled={isSubmitting}`) still toggles.
3. **`RatsScrollView` drops its container style when a caller passes one.** `{...props}` is spread
   last, so a caller's `contentContainerStyle` replaces the default (`flexGrow: 1`, centred, full
   width) instead of merging with it.

## 5. Audits

### 5.1 Deep imports (`react-native/Libraries/…`)

All in tests or the Jest setup; none in app code:

- `jest.setup.js:370`: `Libraries/Settings/Settings`.
- `Libraries/Linking/Linking`:
  - `__tests__/App-test.tsx:29`;
  - `StalePendingBanner.test.tsx:6`;
  - `StripeSettingsScreen.test.tsx:116`;
  - `Splash.test.tsx:120`.

### 5.2 Test mocks of packages that are removed or replaced

Each task that removes a package replaces these mocks (never the test cases).

| Package | Mocked in (besides `jest.setup.js`) | Task |
| ------- | ----------------------------------- | ---- |
| `react-native-keyboard-manager` | `HouseChat.test.tsx`, `OperatorSetupWizard.test.tsx`, `DirectChat.test.tsx` | 15 |
| `react-native-keyboard-aware-scroll-view` | `CreateGuest.test.tsx`; the `rats-scroll-view` tests rely on the global mock | 15 |
| `react-native-push-notification` | `rentReminder.test.ts`, `ResidentPayment.test.tsx`, `GuestHome.test.tsx` | 11 |
| `@react-native-community/push-notification-ios`, `@notifee/react-native` | global only | 11 |
| `react-native-document-picker` | `DocumentListScreen.test.tsx`, `GuestImportScreen.test.tsx` | 6 |
| `react-native-fs` | `GuestImportScreen.test.tsx` | 6 |
| `react-native-html-to-pdf` | `GuestHome.test.tsx` | 6 |
| `react-native-geolocation-service` | `src/integration/setup.ts` (orphan) | 6 |
| `@react-native-community/geolocation` (kept, re-configured) | `HouseSearchScreen.test.tsx` | 6 |
| `@react-native-community/checkbox` | `rats-checkbox.test.tsx`, `rats-checkbox.behaviour.test.tsx`, `SignUpFormView.test.tsx` | 8 |
| `react-native-vector-icons/*` | 28 component and screen tests | 5 |
| `@react-native-firebase/crashlytics` | `src/integration/setup.ts` (orphan) | 3 |
| `@react-navigation/stack`, `react-native-modal-datetime-picker` | global only | 3 |
| `react-native-best-viewpager` | `OperatorSetupWizard.test.tsx` | 3 |
| `moment-timezone` | `Complaint.test.ts`, `Notification.test.ts`, `Room.test.ts` | 3 |

The plan named two `moment-timezone` mocks; there are three (`Room.test.ts` too).

### 5.3 Keyboard

The full before-inventory is `docs/build/react-native-0.88-keyboard-audit.md` (every field, its
container, props, modal, lists, footer and Android handling, with file:line). The findings that
shape Task 15:

- **45 files have text fields**; 42 are reachable (about 114 fields). Four components wrap a
  `TextInput`: `RatsTextInput`, `RatsNumericInput`, `RatsSearchBar` and the Google Places wrapper.
- **28 reachable numeric, decimal, number or phone pads, not 19.** The plan's figure missed the 11
  `RatsNumericInput` fields, whose numeric keyboard is the component default. On iOS,
  IQKeyboardManager's toolbar suppresses React Native's own number-pad Done bar. Without it, React
  Native adds one only when `returnKeyType="done"` is set, which 1 of the 28 does
  (`ResidentPayment.tsx:415`). The toolbar replacement is therefore required, not cosmetic.
- **No global keyboard-manager setup**: the app runs on library defaults. Prev/Next are off by
  default, so today's toolbar is most likely Done-only (to confirm on a device at the checkpoint).
- **Only HouseChat disables IQKeyboardManager** (BaseChat via `useChatLogic`), and lifts its composer
  itself. **DirectChat leaves it on**: its absolutely positioned composer is lifted only by
  IQKeyboardManager on iOS and by `adjustResize` on Android.
- **HouseSetup changes the keyboard distance app-wide** (`normalize(100)` on the address field's
  focus) and never resets it. Its Android branches never run.
- **Android**: `adjustResize` is the only mechanism for most screens. `RatsScrollView` enables APSL
  on Android only where a caller passes `enableOnAndroid` (4 call sites). Edge-to-edge (targetSdk 36)
  removes `adjustResize`'s effect, which is why keyboard-controller replaces it.
- **Fields only IQKeyboardManager keeps visible on iOS**: long forms in a plain `ScrollView`
  (FinancialRecordForm, IntakeFormScreen, ApplyScreen and others), dialogs with no avoiding view
  (DischargeGuestModal), and stacked modals (ChoreSetup, PhaseConfigSetup).
- **Unreachable code**: `GuestUpdate/`, `CreateGuest/`, `HouseConfig/`, and
  `Oxford/BusinessMeetingDetail.tsx`, which `BusinessMeetings.tsx:109` navigates to by a route name
  no navigator registers.

## 6. Decisions, by task

_One subsection per task as it lands._

## 7. Verification

_Final results and the Mac checkpoint (Task 16)._

## Appendix A: integration baseline and recovery targets

Each passing test maps to the latest Task 10 group among the modules its import graph evaluates at
load (type-only imports excluded; computed by walking relative imports). After Task 9 about 0 pass;
each group restores exactly its suites.

| Suite | Passing at baseline | Load graph reaches | Restored by |
| ----- | ------------------- | ------------------ | ----------- |
| `activity.integration.test.ts` | 3 of 6 | 10b | 10b |
| `guestWeekTransfer.integration.test.ts` | 5 of 5 | 10b | 10b |
| `weekSummary.integration.test.ts` | 5 of 5 | 10b | 10b |
| `activity.emulator.test.ts` | 1 of 18 | 10b | 10b |
| `guestCRUD.integration.test.ts` | 6 of 6 | 10a, 10b, 10c, 10d (`guest.tsx` → `house.tsx` → `storage.tsx`, …) | 10d |
| `meetings.integration.test.ts` | 8 of 8 | 10a–10d | 10d |

Expected passing after each group: 10a 0, 10b 14, 10c 14, 10d 28, 10e 28.

Failing at baseline (pre-existing):

- `activity.integration.test.ts`:
  - logActivity creates an activity document in Firestore and is readable back;
  - logActivity creates a meeting activity with correct data;
  - resolveDispute reject: marks the activity RESOLVED, disputed rejected, still counted.
- `activity.emulator.test.ts`, every case except "logActivity should set default timestamp if not provided":
  - logActivity: chore, meeting, work with hours, status COMPLETED by default, week summary after logging;
  - getActivities: all for a guest, filter by type, filter by date range, limit, reverse chronological order;
  - updateActivity: notes, status;
  - deleteActivity: soft delete;
  - Week Summary Generation: chores completed, meetings attended, hours worked, activity count.

## Appendix B: typecheck baseline mapping

_Each re-worded `.typecheck-baseline` entry, old → new, as tasks regenerate it._
