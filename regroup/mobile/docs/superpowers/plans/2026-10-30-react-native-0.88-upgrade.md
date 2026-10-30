# Regroup mobile React Native 0.88.1 upgrade: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `regroup/mobile` from React Native 0.72.17 to 0.88.1 (New Architecture, React 19.3, Hermes everywhere), with every dependency on a maintained version. Every user-visible behavior is preserved.

**Architecture:** The plan stages the work so every commit passes Jest and lint.
- **Packages:** JS and platform packages move first, then renamed packages, then the Firebase modular migration domain by domain (the mocks support both API shapes until the last domain lands), then notifications, then the native Android and iOS projects, then keyboard.
- **Mac checkpoint:** the owner builds on a Mac after the native and keyboard work.
- **Last:** snapshots, the ratchet baseline and docs.

**Tech stack:**
- React Native 0.88.1, React 19.3.0, TypeScript.
- RNFirebase 26.4.1, Stripe RN 0.84.0, Sentry RN 8.33.0, react-native-notify-kit 10.10.0, react-native-keyboard-controller 1.22.9 + reanimated 4.7.1.
- Gradle 9.4.1 / AGP 9.2.1 / Kotlin 2.2.21, CocoaPods with static frameworks.

**Spec:** `regroup/mobile/docs/superpowers/specs/2026-10-29-react-native-0.88-upgrade-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Paths are relative to `regroup/mobile/` unless they start with `.claude/`, `.github/` or `docs/` at the repo root.
- **Exact versions (from the spec):**
  - **Core:** `react-native` 0.88.1, `react` 19.3.0, `react-test-renderer` 19.3.0, `@react-native/*` 0.88.1, `@react-native-community/cli*` 20.2.0.
  - **Firebase:** `@react-native-firebase/{app,auth,firestore,functions,messaging,storage,analytics}` 26.4.1.
  - **Payments, monitoring, notifications:** `@stripe/stripe-react-native` 0.84.0, `@sentry/react-native` 8.33.0, `react-native-notify-kit` 10.10.0.
  - **Keyboard:** `react-native-keyboard-controller` 1.22.9, `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.x (the version reanimated 4.7.1 peers).
  - **Modal:** `react-native-modal` 13.0.2 (patched).
  - **Everything else:** as in spec §5.4.
- **Android:** minSdk 24, compileSdk 37, targetSdk 36, buildTools 37.0.0, NDK 27.1.12297006, Kotlin 2.2.21, Gradle 9.4.1, `newArchEnabled=true`, `hermesEnabled=true`, `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`, `android.newDsl=false`.
- **iOS:** `platform :ios, min_ios_version_supported` (15.1). Hermes (no `:hermes_enabled => false`). `use_frameworks! :linkage => :static`, `$RNFirebaseAsStaticFramework = true`, `$RNFirebaseDisableSPM = true`.
- **Per commit:** `npm test -- --ci` green and `npx eslint <changed files>` clean before every commit. Commit scope `regroup-mobile` (or `platform` for `.claude/` changes). Never `--no-verify`, never force-push.
- **Snapshots:** `.snap` changes are committed only with `VERIFY_DIFF_APPROVED_SNAPSHOTS="<path>[:<path>…]" git commit …`, naming exactly the changed files, after reading their diff (Task 1).
- **Data parity:** no change to Firestore collection or field names, query constraints, write payloads, transaction structure, Cloud Function names or payloads, or Stripe amounts.
- **Protected guards:** `babel.config.js` BUNDLED_ENV/E2E guards, `firebase-setup.ts` e2e assertions, `scripts/release-guard.js` wiring, the e2e build types and configurations, and the launch-arguments e2e-only linking all keep working unchanged.
- **Prod code:** no `console.*` (use `logException`); relative imports only (`@/` only in tests); new files ≤ 300 lines.

## Review Focus

1. **Firestore semantics drift in the modular rewrite.** `set(..., {merge:true})` must stay `setDoc(..., {merge:true})`. Query constraint order (`where` before `orderBy`/`startAfter`) stays as is. `FieldValue.serverTimestamp()` stays `serverTimestamp()`, never `new Date()`. Transactions still read before they write. `snapshot.exists` becomes `snapshot.exists()`: a missed call silently reads as truthy. Each test is pinned in Task 9.
2. **Rent reminders.** A reminder scheduled before the upgrade (by the removed library) never fires afterwards; the next `GuestHome` mount must reschedule it with the same ID and the same Friday 09:00 local time, in a channel that exists. Pinned in Task 12.
3. **Keyboard.** On iOS, a text field on a screen that IQKeyboardManager used to lift (one not wrapped in an aware scroll view) must not end up under the keyboard. The chat composer must stay pinned to the keyboard. Pinned in Task 15 by the audit table and the Mac checkpoint.
4. **Release and e2e build guards.** The Android `createBundle<Variant>JsAndAssets` tasks still exist in RN 0.88's plugin (`TaskConfiguration.kt:67`) with `nodeExecutableAndArgs`, so the bundled-env stamp and the release guard must still attach to them. Pinned in Task 13 by a Gradle dry run in CI.
5. **Cold-start deep links and notification taps on iOS.** After the SceneDelegate rewrite, a universal link or URL that launches the app still reaches `Linking.getInitialURL()`, and a running app still gets `openURLContexts`. Pinned in Task 14 and the Mac checkpoint.

---

### Task 1: Snapshot opt-in for verify-diff (temporary)

**Files:**
- Modify: `.claude/agent-gates/verify-diff.sh` (section 4, "snapshot churn")

**Interfaces:**
- Produces: env var `VERIFY_DIFF_APPROVED_SNAPSHOTS`, a colon-separated list of repo-relative `.snap` paths. A changed `.snap` whose path is in the list is excused. Unlisted ones still report `SNAPSHOT-CHURN`. Nothing else changes.

- [ ] **Step 1:** Implement the rule in section 4. Count changed `.snap` paths that are not in the list. Keep the existing message and add one line naming each excused file, so the excusal shows in the commit's hook output.
- [ ] **Step 2:** Verify. With a throwaway staged `.snap` edit:
  - Without the variable: `.claude/agent-gates/verify-diff.sh --staged` → `FAIL` with `SNAPSHOT-CHURN`.
  - With `VERIFY_DIFF_APPROVED_SNAPSHOTS=<that path>`: `PASS`.
  - With a different path listed: `FAIL`.

  Unstage the throwaway edit.
- [ ] **Step 3:** Commit `chore(platform): temporary approved-snapshot opt-in for verify-diff (removed before merge)`. The body explains the owner's instruction and that Task 19 reverts it.

### Task 2: Baselines and audits (read-only)

**Files:**
- Create: `docs/build/react-native-0.88-upgrade.md` (the decision record skeleton; filled in Task 19)

- [ ] **Step 1:** Record these baselines in the record's "Baselines" section, saving the integration failure list (`--verbose`) to an appendix:

  | Suite | Command | Baseline (2026-10-30) |
  |---|---|---|
  | Unit | `npm test -- --ci` | 328 suites, 5,264 tests, 2 todo |
  | Typecheck ratchet | `npm run typecheck:ratchet` | 137 |
  | Rules | `cd firebase && npx -y firebase-tools@15 emulators:exec --only firestore,storage,auth --project demo-test "cd .. && npx jest --config jest.config.rules.js --no-coverage --forceExit"` | 27 suites, 591 tests |
  | Integration | `cd firebase && npx -y firebase-tools@15 emulators:exec --only firestore,auth --project demo-test "cd .. && npx jest --config jest.config.integration.js --no-coverage --forceExit --verbose"` | 48 tests: 27 pass, 21 fail |
- [ ] **Step 2: Keyboard audit, before.**
  - **Screens:** every screen or component rendering a `TextInput`, `RatsTextInput` or a form field (about 50 files under `src/screens`, `src/components`).
  - **What to record for each:** the scroll or keyboard wrapper (APSL `KeyboardAwareScrollView` direct or via `rats-scroll-view`, `KeyboardAvoidingView`, or plain), its keyboard props (`extraScrollHeight`, `extraHeight`, `enableOnAndroid`, `keyboardShouldPersistTaps`, `keyboardDismissMode`), and whether IQKeyboardManager is active there. It is active everywhere on iOS except DirectChat while focused (`useChatLogic.ts:72-75`). HouseSetup sets distance `normalize(100)` (`HouseSetup.tsx:78-79`).
  - **Where:** write the table to the record's "Keyboard audit" section.
- [ ] **Step 3: Deep-import audit.** Grep `react-native/Libraries` in `src`, `App.tsx`, `index.js`, `jest.setup.js` and `__mocks__`. Today: `jest.setup.js` plus three tests (`StalePendingBanner`, `StripeSettingsScreen`, `Splash`). List each with its root-export replacement.
- [ ] **Step 4:** Commit `docs(regroup-mobile): upgrade decision record skeleton with baselines and audits`.

### Task 3: React Native 0.88.1 + React 19.3 core (JS side)

**Files:**
- Modify: `package.json`, `package-lock.json`, `babel.config.js`, `jest.config.js`, `jest.config.integration.js`, `tsconfig.json`, `.eslintrc.js`, `index.js` (only if needed), `i18n.ts`, `src/forms/FilterForm.tsx`, `src/screens/Profile/UserInfo.tsx`, `jest.setup.js`, and the test files from the Task 2 deep-import list.
- Delete: `patches/react-native+0.72.17.patch`, `patches/@react-native-community+datetimepicker+7.7.0.patch`, `@react-native-community+datetimepicker+7.6.2.patch` (mobile root).

**Interfaces:**
- Produces: the installed dependency set that later tasks build on. Firebase stays at 17.5.0 and the notification and keyboard libraries stay put in this task. Their JS is fully mocked in Jest, and later tasks replace them.

- [ ] **Step 1: Bump packages to their spec §5.4 versions in one install.**
  - Core, tooling, cli, `@types/react` ^19.2.0.
  - React 19 peers: `react-redux` 9.3.1 + `redux` 5.0.1, `@reduxjs/toolkit` 2.13.0, `@tanstack/react-query` 5.105.0, `i18next` 26.5.11, `react-i18next` 17.1.9.
  - Navigation 7.5.1 / 7.21.0; `react-native-screens` 4.30.1; `react-native-safe-area-context` 5.11.0; `react-native-gesture-handler` 3.4.0; `react-native-svg` 15.16.0; `victory-native` 37.3.7; `react-native-webview` 14.0.1.
  - Datetimepicker 9.2.2, `react-native-date-picker` 5.0.13, `react-native-picker-select` 9.3.1, `react-native-popover-view` 6.1.0, `react-native-image-picker` 8.3.0, `react-native-google-places-autocomplete` 2.6.5.
  - `@stripe/stripe-react-native` 0.84.0, `@sentry/react-native` 8.33.0.
  - Remove every package in spec §5.4 "Removed as unused", plus `@testing-library/jest-native`.
  - Move `@firebase/rules-unit-testing` and the cli packages to devDependencies.
  - Install with `npm install --ignore-scripts`, then `npx patch-package`.
  - If npm reports peer conflicts, resolve them by version, never with `--legacy-peer-deps`.
- [ ] **Step 2: Config.**
  - **Babel:** preset `module:@react-native/babel-preset`. The rest of `babel.config.js` stays unchanged.
  - **Jest:** `preset: '@react-native/jest-preset'` in both Jest configs. Update `transformIgnorePatterns` to include `@react-native-vector-icons`, `@react-native-documents`, `@dr.pogodin`, `react-native-notify-kit`, `react-native-keyboard-controller`, `react-native-reanimated` and `react-native-worklets` (pre-wiring for later tasks).
  - **tsconfig:** extend `@react-native/typescript-config`.
  - **Removed packages:** delete the mocks for removed packages from `jest.setup.js` (stack, masked-view, modal-datetime-picker, crashlytics, best-viewpager in `OperatorSetupWizard.test.tsx:114`, moment-timezone in the three entity tests). Delete the `redux-logger` ambient declaration (`src/types/modules.d.ts:45`).
- [ ] **Step 3: App code for removed or renamed APIs.**
  - `i18n.ts`: drop `compatibilityJSON: 'v3'`.
  - `FilterForm.tsx`: remove the unused RNGH `ScrollView` import.
  - `UserInfo.tsx`: core `SafeAreaView` → `react-native-safe-area-context`.
  - Deep imports from Task 2 → root exports.
  - Any `StyleSheet.absoluteFillObject` → `StyleSheet.absoluteFill`.
- [ ] **Step 4:** Run `npm test -- --ci`. Expected: everything passes except snapshot mismatches caused by the renderer. Every other failure is fixed in this task.
- [ ] **Step 5:** Commit, with snapshot files excluded: `chore(regroup-mobile): React Native 0.88.1, React 19.3 and JS dependency upgrades`.
- [ ] **Step 6: Snapshots.**
  - Run `npx jest -u <failing snapshot suites>` and read every `.snap` diff. Accept it only if it is renderer markup (prop order, React 19 element shapes).
  - Commit with `VERIFY_DIFF_APPROVED_SNAPSHOTS=…` naming exactly those files: `test(regroup-mobile): update snapshots for react-test-renderer 19`. The body lists each file and the reason.
- [ ] **Step 7:** Run `npm run typecheck:ratchet` and record the count (expected to move; fixed in Task 18).

### Task 4: Vector icons → @react-native-vector-icons 14

**Files:**
- Modify: the 11 icon importers (e.g. `src/components/nav-bar/index.tsx`, `src/components/rats-icon/faces.tsx`, `src/components/rats-picker/rats-picker.tsx`, `src/components/weekdays/DayTimeWidget.tsx`, `src/components/rats-datepicker/rats-datepicker.tsx`, `src/navigation/navigators.tsx`), `jest.setup.js` icon mocks, per-test icon mocks, `package.json`.

**Interfaces:**
- Produces: imports from `@react-native-vector-icons/{fontawesome5,ionicons,material-icons}` at 14.0.0. `@types/react-native-vector-icons` is removed.

- [ ] **Step 1: Write the failing test** `src/components/__tests__/iconNames.test.ts`. It asserts that every Ionicons name the app uses exists in `@react-native-vector-icons/ionicons`'s glyph map (read the package's glyphmap JSON). It fails today on `md-arrow-down` and `ios-calendar`.
- [ ] **Step 2: Swap the packages.**
  - Install the three packages and run `npx @react-native-vector-icons/codemod` on `src`.
  - Boolean `solid` → `iconStyle="solid"`.
  - Replace the retired Ionicons names with the v14 glyphs that look the same: `md-arrow-down` → `arrow-down`, `ios-calendar` → `calendar`, unless the glyph map shows a closer match.
  - Update the mocks.
- [ ] **Step 3:** Run `npx jest src/components/__tests__/iconNames.test.ts` and then the full suite. Both pass. Any icon `.snap` diffs go into their own approved-snapshot commit (as in Task 3 Step 6).
- [ ] **Step 4:** Native font wiring is in Tasks 13 and 14 (`fonts.gradle` removal, `UIAppFonts`). Commit `refactor(regroup-mobile): per-family vector icon packages`.

### Task 5: Document picker, file system, html-to-pdf, geolocation

**Files:**
- Modify: `src/screens/Documents/DocumentListScreen.tsx`, `src/screens/GuestImport/GuestImportScreen.tsx`, `src/services/reportExport.ts`, `src/util/geolocation.ts`, `src/components/rats-search-bar/index.tsx`, `jest.setup.js` mocks, `src/integration/setup.ts` geolocation mock, `package.json`.
- Test: the existing `DocumentListScreen`, `GuestImportScreen` and `reportExport` tests, plus `src/util/__tests__/geolocation.test.ts` (create if absent).

**Interfaces:**
- `@react-native-documents/picker` 12.0.3: `pick({ type: [types.pdf, types.images] })` → `[file]`. Cancel detection is `isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED`. Call `keepLocalCopy({ files: [{ uri, fileName }], destination: 'cachesDirectory' })` before `putFile` / `readFile`.
- `@dr.pogodin/react-native-fs` 2.41.0: `readFile(uri, 'utf8')`.
- `react-native-html-to-pdf` 1.3.0: `generatePDF({ html, fileName, directory })` → `{ filePath }`.
- `@react-native-community/geolocation` 3.4.0: `getCurrentPosition(success, error, options)`. Call `setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'playServices' })` once at module load in `util/geolocation.ts`.

- [ ] **Step 1: Update the tests first.** The cancel path is a no-op with no error toast. A picked document is copied locally, then uploaded with the same storage path. Import reads UTF-8 from the local copy. PDF export calls `generatePDF` with the same options. Geolocation calls `getCurrentPosition` with the same options and configures `playServices`. Run them and confirm they fail.
- [ ] **Step 2:** Implement the swaps and remove the four old packages.
- [ ] **Step 3:** Run the tests, then the full suite. Commit `refactor(regroup-mobile): maintained document-picker, fs, html-to-pdf and geolocation packages`.

### Task 6: react-native-permissions 5

**Files:**
- Modify: `package.json` (remove `reactNativePermissionsIOS`; the postinstall becomes `patch-package && pod-install`), `ios/Podfile` (add `setup_permissions`; landed with Task 14, recorded here).
- Test: `src/util/__tests__/permissions.test.ts` (existing or create).

- [ ] **Step 1:** Write a test asserting that `util/permissions.ts` still calls `check` and `request` with the same `PERMISSIONS.*` constants per platform. Confirm it passes on 3.x.
- [ ] **Step 2:** Upgrade to 5.6.3 and change the postinstall. Write the `setup_permissions` list (Camera, LocationAccuracy, LocationAlways, LocationWhenInUse, Motion, Notifications, PhotoLibrary, PhotoLibraryAddOnly) into Task 14's Podfile notes.
- [ ] **Step 3:** Run the suite. Commit `chore(regroup-mobile): react-native-permissions 5`.

### Task 7: react-native-modal 13.0.2 patch, kept behind RatsModal

**Files:**
- Create: `patches/react-native-modal+13.0.2.patch`
- Modify: `package.json` (pin 13.0.2), `src/components/rats-modal/index.tsx` and `src/components/rats-loading-modal/index.tsx` (only if the patch requires prop changes)
- Test: `src/components/rats-modal/__tests__/rats-modal.behaviour.test.tsx` (create)

**Interfaces:**
- `RatsModal` and `RatsLoadingModal` props are unchanged. They stay the only importers of `react-native-modal` (an `eslint` `no-restricted-imports` rule enforces that outside those two files).

- [ ] **Step 1: Write the characterization tests** against the real `react-native-modal` (unmock it in this file):
  - `onBackdropPress` fires on a backdrop press.
  - Android back press calls `onBackButtonPress` and does not throw.
  - `onModalShow` and `onModalHide` fire on visibility changes.
  - Unmounting while visible throws nothing (exercises the `BackHandler` subscription cleanup).

  On 0.88 they fail with `InteractionManager` / `removeEventListener` errors.
- [ ] **Step 2: Write the patch** to `node_modules/react-native-modal/dist/modal.js`:
  - Store the subscription returned by `BackHandler.addEventListener` and call `.remove()` instead of `removeEventListener`.
  - Remove `InteractionManager.createInteractionHandle` / `clearInteractionHandle` (they only deferred interactions during animation).

  Create the patch with `npx patch-package react-native-modal` and add a header comment explaining both removals and the RN version.
- [ ] **Step 3:** Add the `no-restricted-imports` rule for `react-native-modal` with overrides for the two wrappers. Run the new tests, then the full suite.
- [ ] **Step 4:** Commit `fix(regroup-mobile): keep react-native-modal on RN 0.88 with a minimal patch`.

### Task 8: rats-checkbox in JS

**Files:**
- Modify: `src/components/rats-checkbox/rats-checkbox.tsx`, `src/types/modules.d.ts` (drop the checkbox declaration), `package.json` (remove `@react-native-community/checkbox`)
- Test: `src/components/rats-checkbox/__tests__/rats-checkbox.test.tsx` (existing; extend)

- [ ] **Step 1:** Extend the tests to pin today's props:
  - `value` / `onValueChange` round-trip.
  - `disabled` blocks changes.
  - testID and accessibility state (`accessibilityRole="checkbox"`, `accessibilityState.checked`).
- [ ] **Step 2:** Reimplement with `Pressable` and a material-icons `check-box` / `check-box-outline-blank` glyph, sized and tinted as the native box was, using the theme's tint color.
- [ ] **Step 3:** Run the tests, then the full suite. Commit `refactor(regroup-mobile): JS rats-checkbox replacing the native checkbox`.

### Task 9: RNFirebase 26.4.1, infrastructure and mocks

**Files:**
- Modify: `package.json` (all `@react-native-firebase/*` 26.4.1, crashlytics removed), `firebase-setup.ts`, `src/config/firebase-emulator.ts`, `__mocks__/firebase-setup.ts`, `jest.setup.js`
- Create: `__mocks__/firebase-modular.js` (shared modular mock; `jest.setup.js` wires it in)
- Test: `src/config/__tests__/firebase-emulator.test.ts`, `__tests__/firebaseSetup.test.ts` (create)

**Interfaces:**
- `firebase-setup.ts` keeps its exported names (`auth`, `firestore`, `functions`, `messaging`, `storage`, `callHttpsFunction`, `emulatorConnection`). Its instances come from `getAuth()`, `initializeFirestore(getApp(), { ignoreUndefinedProperties: true })`, `getFunctions()`, `getMessaging()` and `getStorage()`. `callHttpsFunction(name: string, payload: unknown) => Promise<HttpsCallableResult>` is `httpsCallable(functions, name)(payload)`.
- **Mock surface:**
  - The modular functions record calls against plain `{ path, type }` ref objects: `collection`, `doc`, `query`, `where`, `orderBy`, `limit`, `startAfter`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `onSnapshot`, `runTransaction`, `writeBatch`, `serverTimestamp`, `increment`, `arrayUnion`, `arrayRemove`, `deleteField`, `Timestamp`, `GeoPoint`, `FieldPath`, and the auth, storage, functions, messaging and analytics equivalents.
  - The namespaced mock surface stays until Task 10's last domain lands.

- [ ] **Step 1: Write tests.**
  - `firebase-setup` constructs Firestore with `ignoreUndefinedProperties: true`.
  - `callHttpsFunction('x', p)` calls `httpsCallable(functions, 'x')` with `p`.
  - The emulator wiring calls `connectAuthEmulator` / `connectFirestoreEmulator` / `connectStorageEmulator` / `connectFunctionsEmulator` with the same host and ports as today.
  - An unreachable emulator still rejects.
- [ ] **Step 2:** Implement, upgrade the packages, and keep both mock shapes.
- [ ] **Step 3:** Run the full suite (services still on the namespaced shape pass against the namespaced mocks). Commit `refactor(regroup-mobile): RNFirebase 26 modular setup and dual-shape mocks`.

### Task 10: Modular call sites, by domain

**Files:** the 61 Firebase-importing source files (list: `grep -rlE "@react-native-firebase/|firebase-setup" src App.tsx index.js --include=*.ts --include=*.tsx`, minus tests), with their tests. Commit them in these groups, each one green:

| Group | Files (prefix `src/`) |
|---|---|
| 10a money | `services/payments.ts`, `services/paywall.ts`, `services/subscription.ts`, `services/receiptService.ts`, `services/treasury.ts`, `services/treasuryReport.ts`, `services/oxford/ees.ts`, `screens/RentPayment/*`, `screens/HouseSettings/*` (Firebase users) |
| 10b integrity | `services/activity.ts`, `services/dispute.tsx`, `services/guest.tsx`, `services/oxford/votes.ts`, `services/offlineQueue.ts`, `hooks/activity/*`, `state/queries/*`, `state/mutations/*` |
| 10c people & houses | `services/house.tsx`, `services/users.tsx`, `services/admin.tsx`, `services/applications.ts`, `services/invites.ts`, `services/organization.ts`, `services/guestImport.ts`, `services/operator-setup.ts`, `services/setup-wizard.ts` |
| 10d content | `services/message.tsx`, `services/notifications.tsx`, `services/storage.tsx`, `services/documents.ts`, `services/drugTests.ts`, `services/staffNotes.ts`, `services/complaints.ts`, `services/issues.ts`, `services/feedback.ts`, `services/choreRotation.ts`, `services/phaseAdvancement.ts`, `services/reportingService.ts`, `services/oxford/index.ts`, `services/oxford/businessMeetings.ts`, `services/oxford/charterCompliance.ts`, `services/meeting.ts` |
| 10e auth & UI | `components/auth/auth.tsx`, `screens/Login/*`, `screens/SignUp/*`, `screens/NewAccount/*`, `screens/Splash/*`, `screens/Personal/*`, remaining screens, `state/slices/*`, `util/*`, `App.tsx` |

**Interfaces:** the mapping table in spec §5.2. No function signature of any service changes.

- [ ] **Step 1 (per group):** For each service in the group, add or extend a characterization test that pins, for one read, one write and (where present) one transaction or listener: the exact path, constraints, payload and options, against the dual-shape mock. Run it to confirm it passes on the namespaced code.
- [ ] **Step 2 (per group):** Rewrite to the modular API using the mapping table. Move each assertion to the modular mock with the same expected values. Run the group's tests, then the full suite.
- [ ] **Step 3 (per group):** Self-review the diff against Review Focus #1. For 10a and 10b, do a line-by-line comparison of old and new for every write and transaction.
- [ ] **Step 4 (per group):** Commit `refactor(regroup-mobile): modular RNFirebase API in <group> services`.
- [ ] **Step 5 (after 10e):** Delete the namespaced mock surface, then run `grep -rnE "firestore\(\)|auth\(\)|FirebaseFirestoreTypes|FirebaseAuthTypes|FirebaseStorageTypes|FirebaseMessagingTypes|\.exists\b[^(]" src App.tsx` and confirm zero matches outside comments. Run the full suite. Commit `test(regroup-mobile): drop the namespaced Firebase mock surface`.

### Task 11: Integration and rules suites on current SDKs

**Files:**
- Modify: `jest.config.integration.js`, `src/integration/setup.ts`, `src/integration/firebase-admin-setup.ts`, `package.json` (`firebase-admin` latest 13.x, `firebase` matching RNFirebase 26's pin of 12.17.1 as a devDependency, `@firebase/rules-unit-testing` latest compatible), and the integration tests' setup helpers.

**Interfaces:**
- `jest.config.integration.js` maps `@react-native-firebase/(app|auth|firestore|functions|storage)` to `firebase/$1` (via a small `src/integration/rnfb-to-web.ts` that re-exports `firebase/*` and connects to the emulators on first `getApp()`). Admin is used only for seeding.

- [ ] **Step 1:** Implement the mapping. Each suite signs in as its seeded user through the Auth emulator before acting; data no client may write is seeded through Admin.
- [ ] **Step 2:** Run the integration command (Task 2 table). Acceptance: every one of the 27 baseline-passing tests passes, and every failure is in the 21-name baseline list.
- [ ] **Step 3:** Run the rules command. Acceptance: 27 suites, 591 tests passing.
- [ ] **Step 4:** Commit `test(regroup-mobile): integration suite on the Firebase JS SDK, current admin and rules SDKs`.

### Task 12: Notifications on react-native-notify-kit

**Files:**
- Create: `src/services/notifications/channels.ts` (≤ 60 lines), `src/services/notifications/__tests__/channels.test.ts`
- Modify: `src/services/notifications/rentReminder.ts`, `src/services/notifications/__tests__/rentReminder.test.ts`, `src/screens/Splash/Splash.tsx`, `index.js` (the startup call), `jest.setup.js` (notify-kit mock), `package.json`
- Delete: `src/services/notifications/handler.ts`, `src/services/notifications/service.ts` (zero references; no tests of their own)

**Interfaces:**
- `ensureNotificationChannels(): Promise<void>` creates `default` ("General", HIGH) and `default-channel-id` ("Reminders", HIGH). It is idempotent and Android-only, a no-op on iOS.
- `scheduleRentReminder(guest: Guest): Promise<void>` and `cancelRentReminder(guest: Guest): Promise<void>` keep their names. Callers in `GuestHome.tsx`, `ResidentPayment.tsx` and `RentPaymentScreen.tsx` already ignore the return value; awaiting it is optional.

- [ ] **Step 1: Write tests.**
  - `channels.test.ts`: both IDs are created with HIGH importance on Android, and nothing happens on iOS.
  - `rentReminder.test.ts`, rewritten from the push-notification mock to notify-kit while keeping every existing case:
    - Same id (`String(guestNotificationId(id))`).
    - A trigger at the same `nextFridayAt9am()` timestamp, alarm manager with `allowWhileIdle`.
    - Same title, body and data.
    - Skipped on iOS when `authorizationStatus` is DENIED or NOT_DETERMINED.
    - Cancel uses the same id.
  - `Splash` test: an FCM `data.notifee` payload is displayed through notify-kit's `displayNotification` with the parsed object.
- [ ] **Step 2:** Implement and remove `react-native-push-notification`, `@react-native-community/push-notification-ios`, `@notifee/react-native` and `@types/react-native-push-notification`. Call `ensureNotificationChannels()` once at startup in `index.js`, after `firebase-setup`.
- [ ] **Step 3:** Run the tests, then the full suite. Commit `feat(regroup-mobile): notifications on react-native-notify-kit, with the Android channels the app posts to`.

### Task 13: Android native project

**Files:**
- Create: `android/app/src/main/java/com/rats/dev/MainApplication.kt`, `MainActivity.kt`
- Delete: `MainApplication.java`, `MainActivity.java`, `android/app/src/debug/java/com/rats/ReactNativeFlipper.java`, `android/app/src/release/java/com/rats/ReactNativeFlipper.java`, `android/fix-vector-icons.gradle`
- Modify: `android/build.gradle`, `android/app/build.gradle`, `android/settings.gradle`, `android/gradle.properties`, `android/gradle/wrapper/gradle-wrapper.properties` (+ `gradle-wrapper.jar`, `gradlew`, `gradlew.bat` from the 0.88.1 template), `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- `MainApplication : Application(), ReactApplication` with `reactHost` via `getDefaultReactHost(applicationContext, PackageList(this).packages)` and `loadReactNative(this)` in `onCreate`.
- `MainActivity : ReactActivity()` with `getMainComponentName() = "rats"`, `DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)`, and `onCreate` calling `supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()` before `super.onCreate(savedInstanceState)` (react-native-screens 4.30 README).

- [ ] **Step 1:** Apply the Upgrade Helper diff (spec §5.1 Android bullets) while keeping every regroup block:
  - e2e build types, bundled-env stamp, release guard, Sentry, google-services.
  - Signing config comments; `versionCode` / `versionName`.
- [ ] **Step 2:** Update the root and app Gradle files:
  - Remove the `subprojects { afterEvaluate }` workaround, the crashlytics classpath, the `stripeVersion` pin and the `androidx.activity` force.
  - Set `google-services` to 4.5.0.
  - Remove the `fonts.gradle` and `native_modules.gradle` applies (`autolinkLibrariesWithApp()` and `com.facebook.react.settings` replace them).
- [ ] **Step 3: Manifest.**
  - Add `android:supportsRtl="true"` if missing (0.75 requirement).
  - Remove the push-notification receivers and services.
  - Keep `POST_NOTIFICATIONS`.
  - Add the exact-alarm permission only if notify-kit documents it as needed for `allowWhileIdle` parity (record the source).
- [ ] **Step 4:** Static check: `node -e` parse of `gradle.properties`, `grep` for removed symbols (`ReactNativeFlipper`, `ReactNativeHost`, `SoLoader.init`) → zero. A real build happens in CI (Task 16).
- [ ] **Step 5:** Commit `chore(regroup-mobile): Android project for RN 0.88.1 (Kotlin host, AGP 9, Gradle 9.4.1, no Flipper)`.

### Task 14: iOS native project

**Files:**
- Modify: `ios/Podfile`, `ios/rats/AppDelegate.h`, `ios/rats/AppDelegate.mm`, `ios/rats/Info.plist` (`UIAppFonts` for the icon pods, keeping Quicksand), `ios/rats.xcodeproj/project.pbxproj` (remove the bundled icon `.ttf` references and Sentry v8 phase paths, if changed)
- Delete: `ios/*.ttf` icon font copies (AntDesign … Zocial; the Quicksand fonts stay), `ios/Podfile.lock` regeneration at the Mac checkpoint

**Interfaces:**
- `SceneDelegate` holds an `RCTReactNativeFactory *reactNativeFactory` with an `RCTDefaultReactNativeFactoryDelegate` subclass. That subclass sets `dependencyProvider = [RCTAppDependencyProvider new]` and has `bundleURL` (Debug → Metro `index`, else `main.jsbundle`).
- In `scene:willConnectToSession:options:`, it calls `[factory startReactNativeWithModuleName:@"rats" inWindow:self.window connectionOptions:connectionOptions]`.
- `openURLContexts` and `continueUserActivity` forward to `+[RCTLinkingManager scene:…]`.

- [ ] **Step 1: Podfile per spec §5.1.**
  - `min_ios_version_supported`, no `hermes_enabled`, `$RNFirebaseDisableSPM = true`.
  - `setup_permissions([...])` from Task 6.
  - Remove the Folly, Yoga and `SexyTooltip` blocks, and the `IPHONEOS_DEPLOYMENT_TARGET` 15.0 override (→ 15.1).
  - Keep BoringSSL; re-point HtmlToPdf to `build/generated/ios/ReactCodegen` only if pods show it is needed (decided at the checkpoint).
- [ ] **Step 2: AppDelegate / SceneDelegate.**
  - `AppDelegate : UIResponder <UIApplicationDelegate>` keeps `[FIRApp configure]` and the IS_E2E_TEST bridge.
  - Remove the `RCTAppDelegate` superclass, the `UNUserNotificationCenter` delegate, the `RNCPushNotificationIOS` forwards and the launch-options reconstruction.
  - `SceneDelegate` is as specified above.
- [ ] **Step 3: Icon fonts.** Run `npx rnvi-update-plist` (or edit by hand) for `UIAppFonts`, then remove the old `.ttf` file references from the project.
- [ ] **Step 4:** Static check: `plutil`-equivalent XML parse of `Info.plist` (python `plistlib`); `grep` for `RCTAppDelegate`, `RNCPushNotificationIOS`, `hermes_enabled` → zero.
- [ ] **Step 5:** Commit `chore(regroup-mobile): iOS project for RN 0.88.1 (RCTReactNativeFactory SceneDelegate, Hermes, permissions setup)`.

### Task 15: Keyboard (keyboard-controller)

**Files:**
- Modify: `index.js` (`KeyboardProvider` around the app tree), `babel.config.js` (worklets plugin last, skipped under Jest like the other plugins), `src/components/rats-scroll-view/index.tsx`, `src/screens/DirectChat/BaseChat.tsx`, `DirectChat.tsx`, `hooks/useChatLogic.ts`, `src/screens/SetupWizards/HouseSetup.tsx`, `src/forms/FilterForm.tsx`, `src/screens/GuestUpdate/GuestUpdateFormView.tsx`, `src/screens/HouseSettings/PaymentDashboard.tsx`, `src/screens/NewAccount/NewAccount.tsx`, `src/components/rats-modal/index.tsx` (where it uses `KeyboardAvoidingView`), and every screen the Task 2 audit marks "IQKeyboardManager-only", plus the matching `jest.setup.js` mocks (keyboard-controller's official jest mock; reanimated's `react-native-reanimated/mock`)
- Remove: `react-native-keyboard-manager`, `react-native-keyboard-aware-scroll-view`
- Test: `src/components/rats-scroll-view/__tests__/rats-scroll-view.test.tsx` (extend), `src/screens/DirectChat/__tests__/*` (extend)

**Interfaces:**
- `RatsScrollView` keeps its props. It renders keyboard-controller's `KeyboardAwareScrollView`, mapping `extraScrollHeight` / `extraHeight` → `bottomOffset` with the same visible offset, and preserving `keyboardShouldPersistTaps` and `keyboardDismissMode`.

- [ ] **Step 1: Tests.**
  - `RatsScrollView` passes the mapped `bottomOffset` and the persisted props through.
  - The chat composer renders inside `KeyboardStickyView` (or `KeyboardAvoidingView` from keyboard-controller), with the same layout props as today.
  - HouseSetup's fields sit inside an aware scroll view with `bottomOffset = normalize(100)`.
- [ ] **Step 2:** Implement. For each "IQKeyboardManager-only" screen from the audit, wrap its form in `RatsScrollView` (the app's wrapper pattern). Never use the library directly. Record the after-column in the audit table.
- [ ] **Step 3:** Run the tests, then the full suite. Commit `feat(regroup-mobile): keyboard handling on react-native-keyboard-controller (replaces keyboard-manager and keyboard-aware-scroll-view)`.

### Task 16: Draft PR and Android CI

- [ ] **Step 1:** Push and open a **draft** PR "chore(regroup-mobile): React Native 0.88.1 upgrade" with the `test-change-approved` label. The description is a short summary plus a link to the decision record.
- [ ] **Step 2:** Watch the `maestro-smoke` `assembleDebug` job and the `regroup-mobile` test job. Fix every Android build failure from its log, with a minimal targeted change or a patch-package patch carrying a header, and record each in the decision record. Repeat until green.
- [ ] **Step 3:** Add a CI-only dry-run step proving the release and e2e wiring still attaches: `./gradlew :app:assembleE2eEmulator --dry-run` and `:app:assembleRelease --dry-run` in the same job, if runtime allows. Otherwise record it as a Mac-checkpoint item.

### Checkpoint: Mac (owner)

Stop. Ask the owner to run the following on the PR branch, then report results.

**Build:**
1. `npm ci && cd ios && pod install`. Commit the resulting `Podfile.lock`.
2. Debug and Release builds, plus `E2EEmulator`.

**On device or simulator:**
- Sign-in and sign-up.
- A Stripe test PaymentSheet payment, a cancel, and a declined card.
- A foreground push.
- Rent reminder scheduling (Android and iOS).
- Document upload, CSV guest import, PDF export (Android).
- House search with location.
- Both charts.
- **Keyboard on every audited screen**, especially chat and HouseSetup.
- A cold-start universal link and URL.
- Android 15+ edge-to-edge layout.

Fix each reported issue as its own commit, with a test where one can pin it. Resume after the owner confirms.

### Task 17: Sentry v8 build glue

**Files:** `android/app/build.gradle` (the `sentry.gradle` path), `ios/rats.xcodeproj/project.pbxproj` (the bundle and dSYM phases)

- [ ] **Step 1:** Compare against the Sentry RN 8.33.0 package's documented paths. Keep the `sentry.properties` guard and the e2e skip unchanged.
- [ ] **Step 2:** Verify with CI's Android build and the Mac build. Commit `chore(regroup-mobile): Sentry React Native 8 build phases`.

### Task 18: Typecheck ratchet

- [ ] **Step 1:** Run `npm run typecheck`. Fix every error whose identity is genuinely new: a type error the upgrade introduced in app code.
- [ ] **Step 2:** For each remaining error that is a re-worded baseline entry (same file and code, new message text), map it to the old entry in the decision record's ratchet appendix.
- [ ] **Step 3:** Regenerate `.typecheck-baseline` with `node scripts/typecheck-ratchet.js --update` from a CI run's environment (as the script prescribes). The total must be ≤ 137.
- [ ] **Step 4:** Commit `chore(regroup-mobile): typecheck baseline after the RN 0.88 type changes (≤ 137)`.

### Task 19: Docs, memories, gate revert, finish

**Files:**
- Modify:
  - `docs/build/react-native-0.88-upgrade.md` (complete).
  - `docs/build/stripe-rn-version-decision.md` (superseded note).
  - `CLAUDE.md` ("React Native 0.72" → 0.88.1; notifications, keyboard and modal notes).
  - `.claude/rules/architecture.md` and `testing.md` (Jest preset, mocks), `regroup/CLAUDE.md` (stack table).
  - `.serena/memories/regroup/mobile/core.md` (via Serena memory tools; via the memories branch if #159 is unmerged).
  - `.claude/agent-gates/verify-diff.sh` (revert Task 1).

- [ ] **Step 1: The decision record (the owner's requested document).**
  - Why upgrade now.
  - Target selection, with evidence (support table, the UIScene requirement, `0.88` "no breaking changes").
  - The approaches and the owner's choice.
  - Platform changes.
  - Firebase migration: mapping, evidence and parity checks.
  - Notifications, including the channel bug fixed.
  - Keyboard (before/after audit table).
  - Modal patch.
  - Every dependency decision, with its source.
  - Removed packages and why.
  - Gate loosening and its revert.
  - Verification performed: local, CI, Mac checkpoint.
  - What remains unverified.
  - Risks and rollback.
  - Follow-ups (RNFirebase 27 with SPM + dynamic frameworks and Kotlin 2.4; RNTL 14; SwiftPM when React Native makes it the default).
- [ ] **Step 2:** Revert Task 1 with `git revert <task-1 sha>`. Then confirm `git diff origin/main -- .claude/agent-gates/verify-diff.sh` is empty.
- [ ] **Step 3: Final verification.**
  - Full unit suite, the ratchet, lint on all changed files, the integration and rules commands.
  - CI green on the head.
  - Request a whole-branch review (superpowers:requesting-code-review), with the Firebase money and integrity groups (10a, 10b) reviewed by an independent reviewer reasoning from the domain model (root CLAUDE.md: "On money paths, get an independent reviewer").
- [ ] **Step 4:** Mark the PR ready for review. The description lists every test or snapshot change and why (test-tamper policy), with the Mac checkpoint results.
