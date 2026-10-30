# Regroup mobile React Native 0.88.1 upgrade: implementation plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `regroup/mobile` from React Native 0.72.17 to 0.88.1 (New Architecture, React 19.3, Hermes everywhere), with every dependency on a maintained version and every user-visible behaviour preserved.

**Architecture:**
- **Pin behaviour first.** Characterization tests go in on 0.72, before anything changes: modal, keyboard and checkbox wrappers, and a normalized Firebase operation log for the money and integrity services.
- **Platform next.** The JS platform moves, then the Android project immediately (a draft PR gives CI an Android build on every push).
- **Then the libraries:**
  - library swaps one at a time;
  - Firebase modular migration by domain, with dual-shape mocks whose money and integrity tests stay byte-identical;
  - notifications;
  - iOS project;
  - edge-to-edge;
  - keyboard.
- **Mac checkpoint**, then docs, the whole-branch gate run, and the gate revert.

**Tech stack:**
- React Native 0.88.1, React 19.3.0, TypeScript.
- RNFirebase 26.4.1, Stripe RN 0.84.0, Sentry RN 8.33.0, react-native-notify-kit 10.10.0, react-native-keyboard-controller 1.22.9 with reanimated 4.7.1 and worklets 0.13.x.
- Gradle 9.4.1, AGP 9.2.1, Kotlin 2.2.21; CocoaPods with static frameworks.

**Spec:** `regroup/mobile/docs/superpowers/specs/2026-10-29-react-native-0.88-upgrade-design.md` (revised 2026-10-30 with the plan-review findings).

**Review record:** `2026-10-30-react-native-0.88-upgrade.review.json`, beside this file. v1 got CHANGES_REQUESTED; every item is addressed here.

## Global Constraints

- **Paths.** Relative to `regroup/mobile/`, except `.claude/agent-gates/`, `.github/` and `.serena/`, which are at the repo root. Mobile docs and rules are `regroup/mobile/docs/…` and `regroup/mobile/.claude/rules/…`.
- **Exact versions.** As spec §5.4 and this list:
  - **Core:** `react-native` 0.88.1, `react` 19.3.0, `react-test-renderer` 19.3.0, `@types/react` ^19.2.0, `@types/react-test-renderer` ^19.1.0, `@react-native/*` 0.88.1, `@react-native-community/cli`, `cli-platform-android` and `cli-platform-ios` 20.2.0.
  - **Firebase:** `@react-native-firebase/{app,auth,firestore,functions,messaging,storage,analytics}` 26.4.1; `firebase` 12.17.1 (devDependency, for the integration suite); `firebase-admin` latest 13.x; `@firebase/rules-unit-testing` 5.0.2.
  - **Other native:** `@stripe/stripe-react-native` 0.84.0, `@sentry/react-native` 8.33.0, `react-native-notify-kit` 10.10.0, `react-native-keyboard-controller` 1.22.9, `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.1, `react-native-modal` 13.0.2 (patched).
  - **Engines:** `"node": ">=22.13"`.
- **Android:** minSdk 24, compileSdk 37, targetSdk 36, buildTools 37.0.0, NDK 27.1.12297006, Kotlin 2.2.21, Gradle 9.4.1. `gradle.properties` sets `newArchEnabled=true`, `hermesEnabled=true`, `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`, `android.newDsl=false`.
- **iOS:** `platform :ios, min_ios_version_supported` (15.1). Hermes. `use_frameworks! :linkage => :static`, `$RNFirebaseAsStaticFramework = true`, `$RNFirebaseDisableSPM = true`.
- **Every commit:**
  - `npm test -- --ci` green.
  - `npm run typecheck:ratchet` green (CI runs it before Jest).
  - `npx eslint <changed files>` clean.
  - `.claude/agent-gates/verify-diff.sh --staged` passes (the hook runs it).
  - Snapshot updates in the same commit as their cause, with `VERIFY_DIFF_APPROVED_SNAPSHOTS="<exact paths>"` as a per-command prefix, never exported.
  - Scope `regroup-mobile` (`platform` for `.claude/`, `ci` for workflows).
  - Never `--no-verify` or force-push.
- **Tests:**
  - No converting tests to `it.each` and no merging cases (the gate counts `it(`/`test(` lines).
  - A test that locally mocks a removed package gets its mock replaced, never its cases removed.
  - The money and integrity characterization test files written in Task 2 stay byte-identical from Task 2 to the end of Task 10 (`git diff <task-2 sha> -- <those files>` is empty).
- **Data parity:** no change to Firestore paths, fields, query constraints and their order, write payloads, merge options, transaction structure, Cloud Function names or payloads, or Stripe amounts.
- **Protected:**
  - `babel.config.js` BUNDLED_ENV and E2E guards.
  - `firebase-setup.ts` e2e assertions.
  - The release guard and bundled-env Gradle wiring, which gets stricter (fails closed), never looser.
  - The e2e build types and configurations.
  - launch-arguments linked only for e2e.
- **Prod code:**
  - No `console.*`: use `logException(error, '<static context>')`.
  - Never log notification payloads, CSV content, guest or resident fields.
  - Relative imports only.
  - New files ≤ 300 lines.
- **Wrappers:** the app's pattern is that only one wrapper module imports each new or changed UI or native library. ESLint `no-restricted-imports` allowlists:
  - `react-native-modal`: `rats-modal`, `rats-loading-modal`.
  - `react-native-notify-kit`: `src/services/notifications/**`.
  - `react-native-keyboard-controller`: `rats-scroll-view`, `rats-keyboard`, `index.js`.
  - `@react-native-firebase/*` default imports: banned once Task 10 lands.

## Review Focus

1. **Firestore semantics drift in the modular rewrite.** Merge options, constraint order, `serverTimestamp()`, read-before-write in transactions, and `exists()` (a missed call reads as truthy). Pinned by the Task 2 op-log tests, which stay byte-identical through Task 10.
2. **Notifications across upgrade and platform.**
   - iOS: reminders scheduled before the upgrade persist and must be replaced or cancelled by the same identifier.
   - Android: reminders start firing (a new behaviour, recorded).
   - iOS: foreground banners for `notification`-type server pushes must survive the AppDelegate change.

   Pinned in Tasks 11 and 13 and the checkpoint.
3. **Keyboard.**
   - No field ends up under the keyboard.
   - The chat composer stays pinned.
   - Numeric pads keep a Done button (IQKeyboardManager's toolbar).
   - Android keeps working under edge-to-edge.

   Pinned in Tasks 2 and 15 and the checkpoint.
4. **Release and e2e guards.** They must still attach and must fail closed. Pinned in Task 4 (Gradle checks) and its CI step.
5. **iOS app shell.**
   - `AppDelegate.window` is set: RNFirebase messaging and date-picker modals depend on it.
   - React Native starts once per process.
   - URLs reach `Linking` on cold start, warm open and scene reconnect.

   Pinned in Task 13 and the checkpoint.

---

### Task 1: Snapshot opt-in for verify-diff (temporary)

**Files:** Modify `.claude/agent-gates/verify-diff.sh`, section 4 "snapshot churn".

**Interfaces:**
- Produces `VERIFY_DIFF_APPROVED_SNAPSHOTS`: a colon-separated list of exact repo-relative `.snap` paths.
  - Empty entries are ignored. No globs, prefixes or directories.
  - An excused file is printed as `excused (approved): <path>`.
  - Every other rule, and every unlisted `.snap`, still fails.

- [ ] **Step 1:** Implement the rule.
- [ ] **Step 2:** With one throwaway staged `.snap` edit, run `.claude/agent-gates/verify-diff.sh --staged` with the variable set to:
  - unset → FAIL;
  - the exact path → PASS;
  - `''` → FAIL;
  - `':'` → FAIL;
  - `regroup/` → FAIL;
  - `*.snap` → FAIL;
  - another path → FAIL.

  Unstage the edit afterwards.
- [ ] **Step 3:** Commit `chore(platform): temporary approved-snapshot opt-in for verify-diff (reverted before merge)`. The body quotes the owner's instruction, says the variable is used only as a per-command prefix, and names Task 17 as the revert.

### Task 2: Baselines, audits and characterization on RN 0.72

**Files:**
- Create:
  - `regroup/mobile/docs/build/react-native-0.88-upgrade.md` (decision record skeleton).
  - `__mocks__/firebase-modular/{log,firestore,auth,functions,storage,messaging,analytics}.js`, each ≤ 300 lines. `log.js` is the normalized operation log.
  - `src/components/rats-modal/__tests__/rats-modal.behaviour.test.tsx`.
  - `src/components/rats-loading-modal/__tests__/rats-loading-modal.behaviour.test.tsx`.
  - The op-log characterization tests listed in Step 5.
- Modify: `jest.setup.js` and `__mocks__/firebase-setup.ts`. The namespaced mocks write to the same op log; behaviour is otherwise unchanged.
- Test (extend): `src/components/rats-checkbox/__tests__/*`, `src/components/rats-scroll-view/__tests__/*`.

**Interfaces:**
- Op-log entry: `{ op: 'get'|'getDocs'|'set'|'update'|'add'|'delete'|'listen'|'tx.get'|'tx.set'|'tx.update'|'tx.delete'|'batch.set'|'batch.update'|'batch.delete'|'batch.commit'|'call', path: string, data?: object, options?: object, constraints?: Array<[kind, ...args]> }`.
  - Sentinels serialize as `{ __fv: 'serverTimestamp' | 'increment', n? | 'arrayUnion', items? | 'arrayRemove', items? | 'deleteField' }`.
  - Helpers: `getOpLog()`, `resetOpLog()`, `seedDoc(path, data)`, `seedQuery(pathAndConstraints, docs)`.
- Mock refs are **dual-shape**: a ref from either API shape has `path`, and also the namespaced methods (`.doc`, `.collection`, `.where`, `.orderBy`, `.limit`, `.get`, `.set`, `.update`, `.add`, `.delete`, `.onSnapshot`). Both shapes log identical entries. This keeps cross-group shared refs (`guestCollection`, `houseCollection`, `userCollection`, `paywallConfigRef`, `crud.tsx`) working during Task 10.

- [ ] **Step 1: Baselines.** Measure and write these into the record, with the integration failure names saved in an appendix (`--verbose`):
  - unit: 328 suites, 5,264 tests;
  - ratchet: 137;
  - rules: 27 suites, 591 tests;
  - integration: 48 tests, 27 pass, 21 fail.

  Map the 27 passing integration tests to the services they exercise. Correct the stale numbers in `regroup/mobile/CLAUDE.md` in Task 16.
- [ ] **Step 2: Keyboard audit, before.** For every screen or component with a `TextInput`, `RatsTextInput` or a form field, record:
  - the wrapper: APSL, `rats-scroll-view`, `KeyboardAvoidingView`, or none;
  - its props: `extraScrollHeight`, `extraHeight`, `enableOnAndroid`, `keyboardShouldPersistTaps`, `keyboardDismissMode`, `resetScrollToCoords`;
  - whether IQKeyboardManager lifts it (yes on iOS, except DirectChat while focused);
  - whether it relies on IQKeyboardManager's **toolbar** (every field; critically the 19 numeric, decimal and phone-pad fields: list them);
  - whether it contains a `FlatList` or `SectionList`;
  - whether it has a pinned footer;
  - its Android behaviour (`adjustResize`; HouseSetup `setHeight(normalize(115))`).
- [ ] **Step 3: Deep-import and removed-package audit.**
  - Deep imports: `react-native/Libraries` in `src`, `App.tsx`, `index.js`, `jest.setup.js`, `__mocks__` and the root `__tests__` (`App-test.tsx`).
  - For each package removed in Tasks 3–15: `grep -rn "jest.mock(['\"]<pkg>" src __mocks__ __tests__ jest.setup.js`, so each task lists its files.
- [ ] **Step 4: Wrapper characterization on 0.72** (they pass now, and must keep passing).
  - **`RatsModal`, with the real `react-native-modal`:**
    - Backdrop press calls `onBackdropPress`.
    - Hardware back, via `jest.spyOn(BackHandler, 'addEventListener')` and invoking the captured handler, calls `onBackButtonPress`.
    - `onModalShow` and `onModalHide` fire on visibility changes (`jest.useFakeTimers()` + `act(() => jest.runAllTimers())`).
    - `swipeDirection` + `onSwipeComplete` dismiss.
    - Unmounting while visible throws nothing.
  - **`RatsLoadingModal`:** show then hide.
  - **`rats-checkbox`:**
    - `value`/`onValueChange` round-trip.
    - `disabled`.
    - testID.
    - `accessibilityRole` / `accessibilityState.checked`.
  - **`RatsScrollView`:** the props it passes, including `resetScrollToCoords`, `keyboardShouldPersistTaps` and `extraScrollHeight`.
- [ ] **Step 5: Firebase op-log characterization on 0.72** (money and integrity groups). Write these against the op log, never against mock call chains.
  - **`payments.ts` (`recordRentPayment`):**
    - An existing non-pending record is not written.
    - `set` with `{ merge: true }`.
    - `createdAt` is preserved.
    - A batch holds `set` + `increment(-amountInCents)`.
  - **`guest.tsx`:**
    - Not found throws.
    - `version` = current + 1.
    - Retry on `aborted` / `failed-precondition`.
  - **`activity.ts`:** every `.exists` site, both true and false.
  - **`treasury.ts`:** its write paths.
  - **`oxford/ees.ts`:** batch contents.
  - **`oxford/votes.ts`:** the transaction's reads and writes.
  - **`reopenDispute.ts`:** the transaction writes exactly the reopen fields and nothing else; `exists` both ways; the `firestore/permission-denied` mapping.
  - **`dispute.tsx`:** the dispute and decision writes.
  - **`guestBatch.ts`:** batch sizing and contents.
  - **`useLiveHouseDisputes.ts`:** the listener path, plus `exists` both ways.
  - **`paywall.ts` / `subscription.ts`:** reads.
  - **`useSubscriptionGate.ts`:** the `paywallConfigRef` read.

  One file per service: `src/services/__tests__/<service>.oplog.test.ts`.
- [ ] **Step 6:** Commit `test(regroup-mobile): characterization of wrappers and money/integrity Firebase paths before the RN upgrade` (plus `docs(regroup-mobile): …` for the record skeleton). Note the commit SHA in the record: the byte-identical rule refers to it.

### Task 3: React Native 0.88.1, React 19.3 and JS dependencies, with the modal patch

**Files:**
- Modify:
  - `package.json`, `package-lock.json`, `babel.config.js`, `jest.config.js`, `jest.config.integration.js`, `tsconfig.json`, `.eslintrc.js`, `i18n.ts`, `src/config/sentry.ts` and its test.
  - `src/forms/FilterForm.tsx`, `src/screens/Profile/UserInfo.tsx`, `src/components/rats-modal/index.tsx` (only its StatusBar `backgroundColor` pass-through), `src/components/ios-status-bar/index.tsx` (only the type, if needed).
  - `jest.setup.js`, `src/types/modules.d.ts`, and the deep-import and removed-package test files from Task 2 Step 3.
  - `.typecheck-baseline`, if entries are re-worded.
- Create: `patches/react-native-modal+13.0.2.patch`.
- Delete:
  - `patches/react-native+0.72.17.patch`.
  - `patches/@react-native-community+datetimepicker+7.7.0.patch`.
  - The mobile-root `@react-native-community+datetimepicker+7.6.2.patch`.

**Interfaces:** Firebase stays at 17.5.0; the notification and keyboard libraries and the four Task 6 packages stay. All are fully mocked in Jest, so nothing else changes here.

- [ ] **Step 1: Install everything at once.** Bump every package spec §5.4 lists that keeps its name:
  - **Core and tooling:** core, tooling, cli; `@types/react-test-renderer` ^19.1.0; engines.
  - **State, data, i18n:** `react-redux` 9.3.1 + `redux` 5.0.1, RTK 2.13.0, react-query 5.105.0, i18next 26.5.11 / react-i18next 17.1.9.
  - **Navigation and native UI:** navigation, screens 4.30.1, safe-area 5.11.0, RNGH 3.4.0, svg 15.16.0, victory-native 37.3.7, webview 14.0.1.
  - **Pickers and inputs:** datetimepicker 9.2.2, date-picker 5.0.13, picker-select 9.3.1, popover 6.1.0, image-picker 8.3.0, places-autocomplete 2.6.5.
  - **Payments and monitoring:** Stripe 0.84.0, Sentry 8.33.0.
  - **Modal:** `react-native-modal` pinned to 13.0.2.
  - **Removals:** every package in spec §5.4 "Removed as unused", plus `@testing-library/jest-native` and `@types/react-native-vector-icons` (kept until Task 5), and the stale `overrides.react-native-router-flux` entry.
  - **Moves:** `@firebase/rules-unit-testing` (5.0.2) and the cli packages to devDependencies.

  Run `npm install --ignore-scripts`, then `npx patch-package`. Resolve peer conflicts by version, never with `--legacy-peer-deps`.
- [ ] **Step 2: Modal patch.** Remove `react-native-modal`'s `InteractionManager.createInteractionHandle` / `clearInteractionHandle` calls (`dist/modal.js`; 13.0.2 already uses the `BackHandler` subscription). Run `npx patch-package react-native-modal`, with a header explaining why and the RN version.
- [ ] **Step 3: Config.**
  - **Babel:** preset `module:@react-native/babel-preset`. The rest of `babel.config.js` is unchanged.
  - **Jest:** `preset: '@react-native/jest-preset'` in both configs. `transformIgnorePatterns` gains `@dr\.pogodin`.
  - **TypeScript:** tsconfig extends `@react-native/typescript-config`. TypeScript per the template (^6.0.3), unless the ratchet in Step 6 shows TS 6 adds errors that the newest 5.x doesn't; then hold at that 5.x and record why.
  - **ESLint:** the `react-native-modal` allowlist rule.
  - **Removed packages' mocks:** delete them from `jest.setup.js` (stack, masked-view, modal-datetime-picker, crashlytics) and from the tests found in Task 2 Step 3 (best-viewpager in `OperatorSetupWizard.test.tsx`, moment-timezone in `Complaint.test.ts` and `Notification.test.ts`). Delete the `redux-logger` ambient declaration.
- [ ] **Step 4: App code.**
  - `i18n.ts`: drop `compatibilityJSON: 'v3'`.
  - `FilterForm.tsx`: remove the unused RNGH `ScrollView` import.
  - `UserInfo.tsx`: use `SafeAreaView` from safe-area-context.
  - Migrate deep imports to root exports.
  - RatsModal must not pass `backgroundColor` or `translucent` to `StatusBar` (removed in 0.87).
  - `sentry.ts`: set `sendDefaultPii: false`, `attachScreenshot: false`, `attachViewHierarchy: false`, no replay; add a test pinning them.
- [ ] **Step 5:** Run `npm test -- --ci`. Task 2's wrapper and op-log tests pass. Fix every non-snapshot failure. For snapshot failures, read every diff and accept only renderer markup.
- [ ] **Step 6: Ratchet.** Fix every genuinely new error. Regenerate `.typecheck-baseline` for re-worded entries only, total ≤ 137, and add each 1:1 mapping to the record's appendix.
- [ ] **Step 7:** Commit everything, snapshots included, with `VERIFY_DIFF_APPROVED_SNAPSHOTS="<the changed .snap paths>"`: `chore(regroup-mobile): React Native 0.88.1, React 19.3 and JS dependency upgrades`. The body lists each `.snap` and why.

### Task 4: Android project, Sentry Gradle, fail-closed guards, draft PR

**Files:**
- Create: `android/app/src/main/java/com/rats/dev/MainApplication.kt`, `MainActivity.kt`.
- Delete:
  - `MainApplication.java`, `MainActivity.java`.
  - `android/app/src/debug/java/com/rats/ReactNativeFlipper.java`, `android/app/src/release/java/com/rats/ReactNativeFlipper.java`.
  - `android/fix-vector-icons.gradle` (Task 5 removes its use).
- Modify:
  - `android/build.gradle`, `android/app/build.gradle`, `android/settings.gradle`, `android/gradle.properties`.
  - The wrapper files (`gradle-wrapper.properties`, `.jar`, `gradlew`, `gradlew.bat`) from the 0.88.1 template.
  - `android/app/src/main/AndroidManifest.xml`.
  - `.github/workflows/ci.yml` (`maestro-smoke` job).

**Interfaces:**
- **`MainApplication : Application(), ReactApplication`:**
  - `override val reactHost by lazy { getDefaultReactHost(applicationContext, PackageList(this).packages) }`.
  - `onCreate()` calls `loadReactNative(this)`.
- **`MainActivity : ReactActivity()`:**
  - `getMainComponentName() = "rats"`.
  - `createReactActivityDelegate() = DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)`.
  - `onCreate(savedInstanceState)` sets `supportFragmentManager.fragmentFactory = RNScreensFragmentFactory()`, then calls `super.onCreate(savedInstanceState)`.

- [ ] **Step 1: Apply the Upgrade Helper Android diff.** Keep every regroup block:
  - e2e build types;
  - the bundled-env stamps;
  - the release guard;
  - the `sentry.gradle` apply (the 8.33.0 path and `_SentryUpload_` task names are unchanged);
  - google-services;
  - signing and version.
- [ ] **Step 2: Clean up.**
  - **Remove from Gradle:** the `subprojects { afterEvaluate }` workaround, the crashlytics classpath, the `stripeVersion` pin, the `androidx.activity` force, the e2e `sourceSets` srcDirs (only there for the Flipper stub), the `native_modules.gradle` applies (`autolinkLibrariesWithApp()` and `com.facebook.react.settings` replace them) and `FLIPPER_VERSION`.
  - **Update:** `google-services` to 4.5.0.
  - **Manifest:** add `android:supportsRtl="true"` if missing and declare `POST_NOTIFICATIONS`.
- [ ] **Step 3: Make the guards fail closed.** Add a `gradle.projectsEvaluated` block in `app/build.gradle` that throws a `GradleException` naming the problem if any of these is untrue:
  - `regroupReleaseGuard` is wired before `preReleaseBuild`;
  - every non-debug variant's `createBundle<V>JsAndAssets` depends on its bundled-env stamp (or on the release guard);
  - the e2e Sentry-upload skip matched at least one task.
- [ ] **Step 4: Permanent CI step.** In the `maestro-smoke` job, after `assembleDebug`, add a step that:
  - runs `./gradlew :app:assembleRelease --dry-run` and asserts `regroupReleaseGuard` appears before `createBundleReleaseJsAndAssets`;
  - runs `:app:assembleE2eEmulator --dry-run` and asserts `regroupBundledEnvStampE2eEmulator` appears and `regroupReleaseGuard` does not;
  - runs `STRIPE_PUBLISHABLE_KEY=pk_test_x ./gradlew :app:regroupReleaseGuard`, expecting a non-zero exit with the guard's live-key or project message (not a `values.xml` parse error).

  Then run `.github/scripts/verify-workflow-hardening.*`'s test locally.
- [ ] **Step 5:** Static check: grep for `ReactNativeFlipper`, `ReactNativeHost` and `SoLoader.init(` → zero. Commit `chore(regroup-mobile): Android project for RN 0.88.1 (Kotlin host, AGP 9, Gradle 9.4.1, no Flipper, fail-closed guards)` and `ci(regroup-mobile): assert the release and e2e guard wiring`.
- [ ] **Step 6: Draft PR.** Push and open a **draft** PR, `chore(regroup-mobile): React Native 0.88.1 upgrade`, **without** the label. Fix every `assembleDebug` or guard-step failure with a minimal change or a patch-package patch carrying a header, each recorded in the decision record. From here on, every push gets an Android compile.

### Task 5: Vector icons on @react-native-vector-icons 14

**Files:**
- Modify:
  - The 11 importers, including `src/components/rats-icon/rats-icon.tsx` (map `solid` → `iconStyle="solid"`), `src/components/rats-icon/faces.tsx`, `src/components/nav-bar/index.tsx`, `src/components/rats-picker/rats-picker.tsx`, `src/screens/StatUpdates/DayTimeWidget.tsx`, `src/components/rats-datepicker/rats-datepicker.tsx` and `src/navigation/navigators.tsx`.
  - The `jest.setup.js` icon mocks, the 28 tests mocking `react-native-vector-icons` (from Task 2 Step 3), `package.json` and `android/app/build.gradle` (remove the `fonts.gradle` apply).
- Create: `src/components/__tests__/iconNames.test.ts`.

- [ ] **Step 1: Install and write the failing test.** Install `@react-native-vector-icons/{fontawesome5,ionicons,material-icons}` 14.0.0 first, so the test fails for the right reason. `iconNames.test.ts` scans `src` for icon names per family and asserts each exists in that package's `glyphmaps/*.json`. Dynamic `name={…}` expressions are listed for manual review. It fails on `md-arrow-down` and `ios-calendar`.
- [ ] **Step 2: Migrate.**
  - Run `npx @react-native-vector-icons/codemod src`.
  - Rename the retired Ionicons to the closest v14 glyphs (`arrow-down`, `calendar`, unless the glyph map shows a closer match).
  - Update the mocks; remove `react-native-vector-icons` and its types.
- [ ] **Step 3:** Run the suite and the ratchet; snapshots go in the same commit with the opt-in. Commit `refactor(regroup-mobile): per-family vector icon packages`. Push (CI Android).

### Task 6: Document picker, file system, html-to-pdf, geolocation

**Files:**
- Modify:
  - `src/screens/Documents/DocumentListScreen.tsx`, `src/screens/GuestImport/GuestImportScreen.tsx`, `src/services/reportExport.ts` (also fix its stale react-native.config comment), `src/util/geolocation.ts`.
  - `src/screens/HouseSearch/HouseSearchScreen.tsx` and `useMeetingSearch` (route through `util/geolocation`), `src/components/rats-search-bar/index.tsx`.
  - The mocks from Task 2 Step 3, and `package.json`.
- Test: the existing screen and service tests; create `src/util/__tests__/geolocation.test.ts`.

**Interfaces:**
- Picker: `pick({ type: [types.pdf, types.images] })`. Cancel: `isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED`, with `errorCodes` and `isErrorWithCode` taken from `jest.requireActual` in tests.
- `keepLocalCopy({ files: [{ uri, fileName }], destination: 'cachesDirectory' })` resolves per file; `status: 'error'` is handled.
- `@dr.pogodin/react-native-fs` `readFile(uri, 'utf8')`.
- `generatePDF({ html, fileName, directory })` → `{ filePath }`.
- `getCurrentPosition(success, error, options)`, with explicit options equal to react-native-geolocation-service's defaults (recorded). `setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'playServices' })` runs once in `util/geolocation.ts`, and every caller imports from there.

- [ ] **Step 1: Tests first.**
  - **Document picker:**
    - Cancel: no error toast.
    - Null `name`: rejected before copying.
    - `keepLocalCopy` error: `logException` with a static context, an error alert, no upload.
    - Success: copied, then uploaded to the same storage path.
  - **CSV import:** reads UTF-8 from the local copy, and its content is never logged.
  - **PDF:** `generatePDF` is called with the same options.
  - **Geolocation:** permission-denied and GPS-error branches; options and configuration pinned.
- [ ] **Step 2:** Implement and remove the four old packages.
- [ ] **Step 3:** Suite, ratchet, commit `refactor(regroup-mobile): maintained document-picker, fs, html-to-pdf and geolocation packages`. Push.

### Task 7: react-native-permissions 5

**Files:** Modify `package.json` (remove `reactNativePermissionsIOS`; postinstall becomes `patch-package && pod-install`). Test: `src/util/__tests__/permissions.test.ts` (create or extend).

- [ ] **Step 1:** Pin `check` / `request` with the same `PERMISSIONS.*` per platform; it passes on 3.x.
- [ ] **Step 2:** Upgrade to 5.6.3. Record the Podfile lines for Task 13:
  - `def node_require(script) … end` (README helper);
  - `node_require('react-native-permissions/scripts/setup.rb')`;
  - `setup_permissions(['Camera', 'LocationAccuracy', 'LocationAlways', 'LocationWhenInUse', 'Motion', 'Notifications', 'PhotoLibrary', 'PhotoLibraryAddOnly'])`.
- [ ] **Step 3:** Suite, ratchet, commit `chore(regroup-mobile): react-native-permissions 5`. Push.

### Task 8: rats-checkbox in JS

**Files:** Modify `src/components/rats-checkbox/rats-checkbox.tsx`, `src/types/modules.d.ts`, `package.json`.

- [ ] **Step 1:** Reimplement it with `Pressable` and material-icons `check-box` / `check-box-outline-blank`, sized and tinted like the native box (theme tint). Task 2's tests must pass unchanged.
- [ ] **Step 2:** Remove `@react-native-community/checkbox`. Suite, ratchet, commit `refactor(regroup-mobile): JS rats-checkbox replacing the native checkbox`. Push.

### Task 9: RNFirebase 26.4.1 infrastructure and the integration suite

**Files:**
- Modify:
  - `package.json` (RNFirebase 26.4.1; `firebase` 12.17.1 and `firebase-admin` 13.x as devDependencies).
  - `firebase-setup.ts`, `src/config/firebase-emulator.ts`, `src/services/crud.tsx`.
  - `__mocks__/firebase-modular/*`, `__mocks__/firebase-setup.ts`.
  - `src/config/__tests__/firebase-setup.test.ts` (extend; switch its app mock to modular `getApp`; keep every e2e case).
  - `jest.config.integration.js`, `src/integration/firebase-admin-setup.ts`.
- Create:
  - `src/integration/setup.integration.ts` (its own setup file, without the unit RNFB mocks).
  - `src/integration/rnfb-to-web.ts` (re-exports `firebase/*`, adds a `putFile` shim and RNFirebase-shaped error codes, asserts a `demo-` project and host `127.0.0.1`).

**Interfaces:**
- **`firebase-setup.ts` exports:** `auth`, `firestore`, `functions`, `messaging`, `storage`, `callHttpsFunction(name: string, payload: unknown)` and `emulatorConnection`.
  - It also re-exports the modular types the code needs (`DocumentSnapshot`, `Timestamp`, `User`, …) under explicit names, replacing `Firebase*Types`.
  - **Instances:** `getApp()`, `getAuth()`, `initializeFirestore(app, { ignoreUndefinedProperties: true })` (synchronous in 26.x), `getFunctions()`, `getMessaging()` and `getStorage()`.
  - **Emulators:** `connectToEmulators({ host, ports, instances })` receives these same instances.
  - **Order:** construct, then connect.
- **Integration config:**
  - `setupFiles: ['./src/integration/setup.integration.ts']`.
  - `@react-native-firebase/{app,auth,firestore,functions,storage}` and `firebase-setup` map to `rnfb-to-web.ts`, which runs `initializeFirestore` first and then `connect*Emulator`.
  - `firebase-admin-setup.ts` exports the Admin handle used only for seeding.

- [ ] **Step 1: Tests.**
  - Firestore is built with `ignoreUndefinedProperties: true`.
  - The emulator variant connects the **same** instance `initializeFirestore` returned.
  - `callHttpsFunction` calls `httpsCallable(functions, name)` with the payload.
  - An unreachable emulator still rejects.
  - All existing e2e assertion cases still pass.
- [ ] **Step 2:** Implement, and keep the mocks dual-shape. `crud.tsx` moves to the modular API; its signature is unchanged and its op-log behaviour is pinned.
- [ ] **Step 3: Integration.** Each suite signs in as its seeded user through the Auth emulator; data no client may write is seeded through Admin.
  - **Expected right now:** with services still namespaced, only suites with no service calls pass.
  - **Recorded as the per-group target:** for each Task 10 group, the integration tests of its services must return to baseline-pass once that group lands.
- [ ] **Step 4:** Rules suite at 5.0.2: 27 suites, 591 tests passing.
- [ ] **Step 5:** Suite, ratchet, commit `refactor(regroup-mobile): RNFirebase 26 modular setup, dual-shape mocks and JS-SDK integration harness`. Push.

### Task 10: Modular call sites, by domain

Each group is one commit, and each commit is green: unit tests, ratchet, lint, and the integration tests mapped to that group in Task 2.

**Groups (62 files):** the inventory of imports plus call shapes from 2026-10-30, plus `firebase-setup.ts`. Every file is in exactly one group.

| Group | Files (prefix `src/` unless shown) |
|---|---|
| 9 (done) | `firebase-setup.ts`, `config/firebase-emulator.ts`, `services/crud.tsx`, `index.js` (import only) |
| 10a money | `services/payments.ts`, `services/paywall.ts`, `services/subscription.ts`, `services/treasury.ts`, `services/oxford/ees.ts`, `hooks/useSubscriptionGate.ts`, `screens/RentPayment/RentPaymentScreen.tsx`, `screens/HouseSettings/StripeSettingsScreen.tsx` |
| 10b integrity | `services/activity.ts`, `services/dispute.tsx`, `services/reopenDispute.ts`, `services/guest.tsx`, `services/guestBatch.ts`, `services/oxford/votes.ts`, `hooks/useLiveHouseDisputes.ts`, `hooks/activity/useActivities.ts`, `hooks/activity/useWeekSummary.ts`, `screens/GuestChoreOverview/GuestChoreSummary/GuestChoreSummary.tsx`, `screens/GuestMedicationOverview/GuestMedicationSummary/GuestMedicationSummary.tsx`, `screens/GuestWorkOverview/GuestWorkSummary/GuestWorkSummary.tsx` |
| 10c people & houses | `services/house.tsx`, `services/users.tsx`, `services/admin.tsx`, `services/applications.ts`, `services/invitations.ts`, `services/organization.ts`, `services/guestImport.ts`, `services/operator-setup.ts`, `services/setup-wizard.ts`, `services/setup-wizard-photos.ts`, `state/queries/applicationQueries.ts`, `state/mutations/oxfordOnboardingMutations.ts`, `state/slices/userSlice.ts`, `util/user.ts` |
| 10d content | `services/message.tsx`, `services/notifications.tsx`, `services/storage.tsx`, `services/documents.ts`, `services/drugTests.ts`, `services/staffNotes.ts`, `services/complaints.ts`, `services/issues.ts`, `services/feedback.ts`, `services/choreRotation.ts`, `services/phaseAdvancement.ts`, `services/reportingService.ts`, `services/oxford/index.ts`, `services/oxford/businessMeetings.ts`, `services/meeting.ts` |
| 10e auth & UI | `components/auth/auth.tsx`, `services/EnhancedAuthService.ts`, `services/account.ts`, `screens/Login/LoginForm.tsx`, `screens/SignUp/SignUp.tsx`, `screens/NewAccount/NewAccount.tsx`, `screens/Personal/TwoFactorSetup.tsx`, `screens/Splash/Splash.tsx` |
| Task 11 | `services/notifications/handler.ts` (deleted as dead code) |

**Interfaces:** the mapping in spec §5.2. Service signatures do not change.

- [ ] **Step 0:** Before 10a, re-run the inventory command and assert that the union of the groups equals its output plus `firebase-setup.ts`. Any new file is added to the right group first.
- [ ] **Step 1 (per group):** For services without Task 2 op-log tests (10c–10e), add op-log tests pinning one read, one write and each transaction or listener. They pass on the namespaced code.
- [ ] **Step 2 (per group):**
  - Rewrite to the modular API.
  - Update tests that assert mock call chains, keeping their cases and expected values.
  - **10a and 10b:** their Task 2 op-log files must not change, which proves the mapping.
- [ ] **Step 3 (per group):** `npm run typecheck` shows zero errors in the group's files: no baseline entries in migrated files. Run the integration tests mapped to the group, back to baseline-pass.
- [ ] **Step 4 (10a, 10b):** Line-by-line self-review of every write and transaction against the old code. Then ask an **independent reviewer** (a fresh subagent given the regroup CLAUDE.md domain rules — dispute owner and reopen rules, payment status precedence, `rentOwed` increments, Stripe cents — and the diff, but not my reasoning) to check the op-log tests and the code against the domain rules.
- [ ] **Step 5 (per group):** Commit `refactor(regroup-mobile): modular RNFirebase API in <group> code`, then push.
- [ ] **Step 6 (after 10e):**
  - Remove the namespaced mock surface.
  - Enable the ESLint ban on default `@react-native-firebase/*` imports and `Firebase*Types`.
  - Run `grep -rnE "\bfirestore\.(collection|collectionGroup|doc|batch|runTransaction|settings)\(|FirebaseFirestore\.|\.FieldValue\.|\b(messaging|storage|functions|analytics|firestore|auth)\(\)|\.httpsCallable\(|\.useEmulator\(|\b\w+(Collection|Ref)\.(doc|where|get|add|onSnapshot|update|set)\(|\.exists\b[^(]" src App.tsx index.js firebase-setup.ts`, expecting zero hits outside comments.
  - Run the full integration suite: all 27 baseline passes, and no new failures.
  - Commit `test(regroup-mobile): drop the namespaced Firebase mocks and ban the namespaced API`.

### Task 11: Notifications on react-native-notify-kit

**Files:**
- Create:
  - `src/services/notifications/channels.ts` (≤ 80 lines).
  - `src/services/notifications/remoteMessage.ts` (`displayRemoteMessage`).
  - Their tests.
- Modify:
  - `src/services/notifications/rentReminder.ts` and its test (replace the push-notification mock; keep every case).
  - `src/screens/Splash/Splash.tsx` and its test (replace the notifee mock).
  - `src/screens/Profile/GuestHome.tsx` and its test.
  - `src/screens/Payments/__tests__/ResidentPayment.test.tsx` (mock swap).
  - `index.js` (the startup call).
  - `jest.setup.js` (`react-native-notify-kit/jest-mock`, with real enum values including `AuthorizationStatus.PROVISIONAL` and `AlarmType`).
  - `regroup/mobile/firebase.json` (`react-native.messaging_ios_foreground_presentation_options`).
  - `android/app/src/main/AndroidManifest.xml` (`tools:node="remove"` decisions).
  - `package.json`.
- Delete: `src/services/notifications/handler.ts`, `service.ts`.

**Interfaces:**
- `ensureNotificationChannels(): Promise<void>`:
  - Creates `default` ("General", HIGH) and `default-channel-id` ("Reminders", HIGH).
  - Memoized: one native call per process.
  - Android-only.
- `displayRemoteMessage(message: FirebaseMessagingRemoteMessage): Promise<void>`:
  - Parses `data.notifee` and awaits the channels before displaying.
  - Malformed data is logged with a static context and nothing is displayed.
- `scheduleRentReminder(guest)` / `cancelRentReminder(guest): Promise<void>`:
  - Same names and the same identifier, `String(guestNotificationId(guest.id))`.
  - Schedule: `createTriggerNotification` with a `TimestampTrigger` at `nextFridayAt9am()`, `alarmManager: { allowWhileIdle: true }`, and the same title, body and data, after the channels.
  - iOS: skipped unless `authorizationStatus` ≥ AUTHORIZED (or PROVISIONAL, matching the old `alert` check).
  - Cancel: `cancelTriggerNotification(id)`, verified to remove iOS pending requests by identifier (cite the notify-kit source in the record).
- All four functions catch, call `logException(error, '<context>')` and resolve; none logs payload or guest data.
- `GuestHome` schedules when `rentOwed > 0` and cancels when `rentOwed <= 0` (spec §5.3).
- Splash registers `onMessage` once and unsubscribes on unmount.

- [ ] **Step 1: Tests first.**
  - Channels: created once, with HIGH importance on Android; nothing happens on iOS.
  - Reminder: schedule, cancel and iOS permission cases (DENIED, NOT_DETERMINED, PROVISIONAL, AUTHORIZED), including a native rejection → `logException` called once, the promise resolves, and the logged arguments contain no title, body or guest.
  - `displayRemoteMessage`: a valid payload is displayed after the channels; malformed JSON is logged and not displayed.
  - Splash: registers once and unsubscribes on unmount.
  - GuestHome: cancels when `rentOwed` drops to 0.
- [ ] **Step 2: Implement.**
  - Remove `react-native-push-notification`, `@react-native-community/push-notification-ios`, `@notifee/react-native` and `@types/react-native-push-notification`.
  - Add the notify-kit ESLint allowlist.
  - `index.js` calls `ensureNotificationChannels()` after `firebase-setup`.
  - firebase.json gets `["badge", "sound", "banner", "list"]`.
  - Manifest: decide each merged permission (`SCHEDULE_EXACT_ALARM` → remove, since notify-kit falls back to inexact; `FOREGROUND_SERVICE`, `ACCESS_NOTIFICATION_POLICY` and the full-screen-intent activity → remove unless used), and record each in the decision record with its Play Console impact.
- [ ] **Step 3:** Suite, ratchet, commit `feat(regroup-mobile): notifications on react-native-notify-kit, with the Android channels the app posts to`. Push (CI checks the merged manifest builds).

### Task 12: Sentry v8 iOS build phases

**Files:** `ios/rats.xcodeproj/project.pbxproj` (the bundle phase, around line 460, and the dSYM phase, around line 513).

- [ ] **Step 1:** Rebase the custom bundle phase on RN 0.88's `react-native-xcode.sh` and Sentry 8.33.0's `scripts/sentry-xcode.sh`, so it bundles with Hermes and uploads the composed Hermes source map with its debug ID. Keep the `sentry.properties` guard, the E2E skip, `--reset-cache` and `BUNDLER_ENV` unchanged; update the comments that say "RN 0.72".
- [ ] **Step 2:** Run the pbxproj parse check (`plutil -lint` equivalent: open-step plist parse in Python). Commit `chore(regroup-mobile): Sentry 8 and Hermes in the iOS bundle phases`.

### Task 13: iOS project

**Files:**
- Modify:
  - `ios/Podfile`, `ios/rats/AppDelegate.h`, `ios/rats/AppDelegate.mm`.
  - `ios/rats/Info.plist`: `UIAppFonts` keeps Quicksand, Oswald and Roboto, and adds the icon fonts from the pods via `npx rnvi-update-plist package.json ios/rats/Info.plist`.
  - `ios/rats.xcodeproj/project.pbxproj`: drop the bundled icon `.ttf` references.
- Delete: the icon `.ttf` copies in `ios/` (AntDesign … Zocial).

**Interfaces:**
- **`AppDelegate : UIResponder <UIApplicationDelegate>`** (no longer a `UNUserNotificationCenterDelegate`):
  - `@property (strong, nonatomic) UIWindow *window;`.
  - `@property RCTReactNativeFactory *reactNativeFactory;`, created once in `didFinishLaunching` with an `RCTDefaultReactNativeFactoryDelegate` subclass. That subclass sets `dependencyProvider = [RCTAppDependencyProvider new]` and implements `bundleURL` (Debug → Metro `index`, else `main.jsbundle`).
  - It keeps `[FIRApp configure]` and the IS_E2E_TEST bridge.
- **`SceneDelegate`:**
  - Creates the window.
  - Sets `appDelegate.window = self.window`.
  - First connection per process: `[factory startReactNativeWithModuleName:@"rats" inWindow:self.window connectionOptions:connectionOptions]`.
  - Reconnect: re-attach the existing root view controller and forward the connection options' URLs and activities to `RCTLinkingManager`.
  - `openURLContexts` and `continueUserActivity` forward to `+[RCTLinkingManager scene:…]`. When phone auth is reachable, also call `[FIRAuth canHandleURL:]` first.

- [ ] **Step 1: Podfile (spec §5.1).**
  - `min_ios_version_supported`, no `hermes_enabled`, `$RNFirebaseDisableSPM = true`.
  - The Task 7 permission lines.
  - Remove the Folly, Yoga and `SexyTooltip` blocks; the post_install deployment target becomes 15.1.
  - Keep BoringSSL; the HtmlToPdf header path is decided at the checkpoint.
- [ ] **Step 2: AppDelegate / SceneDelegate** as specified above.
- [ ] **Step 3:** Icon fonts.
- [ ] **Step 4: Static checks.**
  - Parse `Info.plist` and `project.pbxproj`.
  - `grep` for `RCTAppDelegate`, `RNCPushNotificationIOS` and `hermes_enabled` → zero.
  - `grep` for `appDelegate.window = self.window` and `startReactNativeWithModuleName` → present.
- [ ] **Step 5:** Commit `chore(regroup-mobile): iOS project for RN 0.88.1 (RCTReactNativeFactory, scene lifecycle, Hermes, permissions setup)`. Push.

### Task 14: Android edge-to-edge insets

**Files:** `src/components/ios-status-bar/index.tsx` (and its test), plus each screen or tab bar the Task 2 audit marks as having a pinned footer or bottom bar.

- [ ] **Step 1: Failing tests.**
  - On Android, `IOSStatusBar` reserves `useSafeAreaInsets().top`.
  - Each pinned footer or tab bar adds `insets.bottom`.
- [ ] **Step 2:** Implement through the existing wrappers (`IOSStatusBar`, the tab bar component). Suite, ratchet, snapshots with the opt-in. Commit `fix(regroup-mobile): status-bar and bottom insets under Android edge-to-edge`. Push.

### Task 15: Keyboard on react-native-keyboard-controller

**Files:**
- Create:
  - `src/components/rats-keyboard/index.tsx` (`RatsKeyboardProvider`, `RatsKeyboardToolbar`, `RatsKeyboardStickyView`; the only importer besides `rats-scroll-view` and `index.js`).
  - Its tests.
- Modify:
  - `index.js` (provider inside `GestureHandlerRootView`, around `App`).
  - `babel.config.js` (`react-native-worklets/plugin` last, absent under Jest; extend `scripts/babel-config.test.js` to assert both).
  - `src/components/rats-scroll-view/index.tsx` (retype props without the APSL import).
  - `src/screens/DirectChat/{BaseChat,DirectChat}.tsx`, `hooks/useChatLogic.ts`.
  - `src/screens/SetupWizards/HouseSetup.tsx`, `src/forms/FilterForm.tsx`, `src/screens/GuestUpdate/GuestUpdateFormView.tsx`, `src/screens/HouseSettings/PaymentDashboard.tsx`, `src/screens/NewAccount/NewAccount.tsx`, `src/components/rats-modal/index.tsx` (its `KeyboardAvoidingView`), and every screen the audit marks IQKeyboardManager-only.
  - The keyboard mocks in `jest.setup.js` (`react-native-keyboard-controller/jest`, `react-native-reanimated/mock`) and the tests from Task 2 Step 3 (`HouseChat`, `OperatorSetupWizard`, `DirectChat`, `CreateGuest`).
  - `package.json`.

**Interfaces:**
- **`RatsScrollView`:** same props, rendering keyboard-controller's `KeyboardAwareScrollView`.
  - `extraScrollHeight` / `extraHeight` map to `bottomOffset` with the same visible offset.
  - `keyboardShouldPersistTaps` and `keyboardDismissMode` carry over.
  - `resetScrollToCoords` is replaced by scrolling to the top on keyboard hide.
- **`RatsKeyboardToolbar`:** rendered once, app-wide, on iOS, with Prev/Next/Done like IQKeyboardManager.

- [ ] **Step 1: Tests.**
  - `RatsScrollView` prop mapping.
  - The toolbar renders on iOS and not on Android.
  - The chat composer sits inside `RatsKeyboardStickyView` with the same layout props.
  - HouseSetup: `bottomOffset = normalize(100)` on iOS and its Android `setHeight(normalize(115))` path preserved.
  - A structural test per IQKeyboardManager-only screen: its `TextInput` has a `RatsScrollView` or keyboard-controller `KeyboardAvoidingView` ancestor.
  - Screens with a `FlatList` or pinned footer use an avoiding or sticky view, not nested scrolling.
- [ ] **Step 2:**
  - Implement.
  - Remove `react-native-keyboard-manager` and `react-native-keyboard-aware-scroll-view`.
  - Add the ESLint allowlist.
  - Fill in the audit table's "after" column for every row.
- [ ] **Step 3:** Suite, ratchet, snapshots with the opt-in. Commit `feat(regroup-mobile): keyboard handling on react-native-keyboard-controller, with the iOS keyboard toolbar`. Push.

### Checkpoint: Mac (owner)

Stop. Ask the owner to run the following on the PR branch and report.

**Build:**
1. `npm ci && cd ios && pod install`. Commit `Podfile.lock`.
2. Debug, Release, `E2EEmulator` and `E2EStaging` builds; `scripts/verify-ios-variants.sh`.
3. Android `assembleE2eEmulator`, `assembleRelease` (with a live key, or expect the guard's refusal) and `scripts/verify-android-variants.sh`.

**On device or simulator:**
- **Upgrade in place**, on both platforms, from the current store build: signed in, with a pending reminder (`rentOwed > 0`).
  - No forced sign-out.
  - FCM still delivers.
  - Paying leaves no stale reminder (iOS).
- **Auth:** sign-in, sign-up, and the phone-auth screen if reachable.
- **Stripe** test PaymentSheet: success, cancel, decline, and a 3DS card.
- **Pushes:**
  - A data-only push in the foreground.
  - A `notification`-type push (officer-term or payment event) in the foreground on iOS.
  - A background push on Android, landing in the `default` channel.
- **Rent reminder:** schedule on both platforms; cancel on payment.
- **Files and reports:** document upload, including cancel; CSV guest import; PDF export (Android).
- **UI components:** house search with location; both charts; a `rats-datepicker` modal; a `RatsModal` swipe dismiss; Android 16 back gesture on a `RatsModal` and on a screen using `BackHandler`.
- **Keyboard on every audited screen,** especially chat, HouseSetup and ResidentPayment's amount field (Done on the numeric pad).
- **Layout:** edge-to-edge on Android 15+ and on API 30.
- **Links:** cold-start universal link and URL; warm URL; scene reconnect.
- **iOS Hermes Intl:** week start/end and `formatInTimeZone` agree with Android, including a DST-boundary date.
- **Sentry:** a Release build uploads a Hermes source map with a debug ID.
- **Maestro:** `npm run maestro:suite:ios` against E2EEmulator.

Fix each reported issue as its own commit, with a pinning test where possible. Resume after the owner confirms.

### Task 16: Docs, rules, memories

**Files:**
- Modify:
  - `regroup/mobile/docs/build/react-native-0.88-upgrade.md` (complete).
  - `regroup/mobile/docs/build/stripe-rn-version-decision.md` (superseded note).
  - `regroup/mobile/CLAUDE.md` (RN 0.88.1; measured baselines; notifications, keyboard, modal, icons).
  - `regroup/mobile/.claude/rules/firebase.md` (modular examples).
  - `regroup/mobile/.claude/rules/architecture.md` (service table without `offlineQueue.ts` / `invites.ts`; `invitations.ts`).
  - `regroup/mobile/.claude/rules/testing.md` (Jest preset, op log, mocks).
  - `regroup/CLAUDE.md` (stack table).
  - `.serena/memories/regroup/mobile/core.md`, via Serena's memory tools.

- [ ] **Step 1: The decision record** (the owner's requested document):
  - Why now, and the target-selection evidence.
  - Approaches and the owner's choices.
  - Platform changes.
  - Firebase: the mapping, the op-log parity proof, the independent review result.
  - Notifications: the four senders, the channel bug fix, the Android behaviour change, iOS pending reminders, the merged-permission decisions.
  - The keyboard before/after table.
  - Modal patch.
  - Every dependency decision, with its source.
  - Removed packages.
  - Gate loosening and its revert.
  - The ratchet mapping.
  - Verification performed: local, CI, Mac.
  - What remains unverified.
  - Risks.
  - Rollback, including that device state moves forward.
  - Follow-ups: RNFirebase 27 (SPM + dynamic, Kotlin ≥ 2.4), RNTL 14, SwiftPM.
- [ ] **Step 2:** Commit `docs(regroup-mobile): RN 0.88.1 upgrade decision record and updated rules`.

### Task 17: Whole-branch gate run, label, gate revert, finish

- [ ] **Step 1: Whole-branch gate run.**
  - Run `git show origin/main:.claude/agent-gates/verify-diff.sh > "$T"`.
  - Then `bash "$T" "$(git merge-base origin/main HEAD)"`.
  - Expect exactly one violation, SNAPSHOT-CHURN, whose count equals the number of approved snapshot files.
  - Paste the output into the PR description.
  - **Only then** add the `test-change-approved` label.
- [ ] **Step 2: Revert the gate change.** Revert Task 1 (`git revert <sha>`). Confirm `git diff $(git merge-base origin/main HEAD) -- .claude/agent-gates/verify-diff.sh` is empty. Add a "gate opt-in reverted" checkbox to the PR description, ticked.
- [ ] **Step 3: Final verification.**
  - Full unit suite, ratchet, lint, integration (27 baseline passes, no new failures), rules (591).
  - CI green on the head.
  - Whole-branch review (superpowers:requesting-code-review).
- [ ] **Step 4: Mark ready.** The PR description lists every test and snapshot change with its reason, the Mac results, and the link to the decision record.
