# Regroup mobile: React Native 0.72.17 → 0.88.1 upgrade, design

Date: 2026-10-29. Scope: `regroup/mobile` only. Approach **B** (chosen by the owner): upgrade React Native and modernize every dependency in one PR, including the RNFirebase modular-API migration and replacing the notification stack. Status: owner answered the builder-check questions and approved the §7 calls on 2026-10-30 (decisions folded in below, marked *owner*).

The upgrade PR also contains a reader-facing decision record, `regroup/mobile/docs/build/react-native-0.88-upgrade.md`. That record covers what was done and why. This document is the design it is built from.

## 1. Intent

Regroup mobile runs React Native **0.72.17**. React Native has not supported it since 2024; the last 0.72 patch was published 2024-08-19. Staying put is getting more expensive:

- **iOS 27 SDK.** Apple requires the UIScene lifecycle, and apps built with Xcode 27 fail to launch without it (RN 0.88 release post). Regroup works around this with a hand-written `SceneDelegate` on top of RN 0.72's `RCTAppDelegate` (`ios/rats/AppDelegate.mm`). RN 0.88 is the first release with built-in SceneDelegate entry points on `RCTReactNativeFactory`.
- **Newer Xcode keeps breaking 0.72.** It needs `patches/react-native+0.72.17.patch` (Yoga literal operators) and a `-Wno-deprecated-literal-operator` Podfile hack (`docs/e2e/XCODE26-BUILD-AND-E2E-HANDOFF.md`).
- **Payments are stuck on old SDKs.** `@stripe/stripe-react-native` is pinned to 0.44.0 because every later version extends `BaseReactPackage`, which first appears in RN 0.74 (`docs/build/stripe-rn-version-decision.md`). That pins the native Stripe SDKs to 21.14.0 (Android) and 24.11.x (iOS).
- **Dependencies are years behind.** About 37 native packages, ten RNFirebase majors behind (17 → 27), and several archived or unmaintained libraries.

**Success:** the app builds on current toolchains (Xcode 16.1+, AGP 9, Gradle 9), runs on the New Architecture, and keeps every user-visible behavior. The things that must not regress are payments, auth, data reads and writes, notifications, and the e2e build variants. The dependency set should leave no known blocker for the next RN minors.

## 2. Goals, non-goals, anti-goals

**Goals**
1. RN **0.88.1**, React **19.3.0**, New Architecture (mandatory since 0.82), Hermes on both platforms.
2. Every native dependency on a maintained, New-Architecture-native version where one exists. Unused native packages removed.
3. RNFirebase on the modular API at **26.4.1**.
4. One maintained notification library that preserves the server's FCM payload contract.
5. All existing unit tests pass (328 suites / 5,264 tests baseline); the typecheck ratchet holds at ≤ 137 errors; lint is clean on changed files.
6. A decision record a reader can follow without this conversation.

**Non-goals**
- New product features.
- Notification tap routing. It is not wired today: `handler.ts` and `service.ts` are dead code with zero references, so this upgrade does not add routing.
- Migrating `@testing-library/react-native` to 14 (async `render`/`fireEvent` across 182 test files). 13.3.3 supports React 19, so it stays.
- `victory-native` 41+ (Skia rewrite).
- Swift Package Manager for iOS (still experimental in 0.88).
- RNFirebase 27 (see §4).
- Expo.
- Any change to regroup functions or web.

**Anti-goals (failure even if it "works")**
- Any change to what is written to Firestore, the amounts sent to Stripe, or Cloud Function call shapes.
- A release build that skips `scripts/release-guard.js`, or e2e variants that lose their emulator / project / Stripe-key guards (`babel.config.js`, `firebase-setup.ts`).
- Weakening, skipping or deleting tests to get green (verify-diff gate).
- Logging PII.

## 3. Constraints

- **Verification environment.** This Linux container can run Jest, `tsc` and lint. It cannot run Xcode or CocoaPods, and the Android SDK host (`dl.google.com`) is blocked by network policy. Android compile is verified by CI (`maestro-smoke`: `npm ci` + `./gradlew assembleDebug`, JDK 17). That job's Maestro step is `continue-on-error`, so it only proves the build. iOS (`pod install`, build, run) and device behavior must be verified on a Mac before merge; the decision record lists them.
- **Repo gates.**
  - pre-commit: secret scan, a 300-line limit for new source files, verify-diff (no deleted or renamed tests, no `.skip`/`.only`, no test-count drop, **no `.snap` change**).
  - commit-msg scope `regroup-mobile`.
  - No force-push; `--no-verify` is denied in `.claude/settings.json`.
- **Gate loosening for this PR (*owner*: "only to the extent absolutely necessary").**
  - The only gate rule this work cannot satisfy is SNAPSHOT-CHURN (react-test-renderer 19, icon packages and modal markup change snapshot output).
  - The PR's first commit adds a single opt-in to `.claude/agent-gates/verify-diff.sh`: `VERIFY_DIFF_APPROVED_SNAPSHOTS`, a colon-separated list of exact `.snap` paths. A staged `.snap` change is excused only if its path is in that list; every other rule, and every unlisted `.snap`, still fails.
  - The PR's last commit removes the opt-in again, so the merged diff leaves the gate unchanged. `.claude/settings.json` is not changed.
  - CI's `test-tamper` job runs the base-branch copy of the script, so the PR carries the existing `test-change-approved` label, and its description lists each changed `.snap` with the reason.
- **Mac checkpoint (*owner*).** The owner can build iOS at a midpoint. The plan therefore lands the native iOS work and the keyboard changes before that checkpoint, then stops for a `pod install`, a build and a device pass.
- **Release guard and e2e variants** (`android/app/build.gradle`, `scripts/*`, `react-native.config.js`, iOS `E2E*` configurations) must keep working unchanged.
- **Data model.** Collection names, field names and query semantics must not change during the Firebase migration. Rules tests (`firebase/__tests__`) are the oracle for rules-affecting behavior.

## 4. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| A | RN 0.88.1. Keep the data and notification code: RNFirebase 25.1.0 (namespaced API still present but deprecated), patch the old notification libs. | Smallest blast radius; owes two follow-up PRs. | Not chosen. |
| **B** | RN 0.88.1 and modernize everything: RNFirebase 26.4.1 + modular migration, a new notification stack, every dependency current. | Larger PR mixing platform and data-layer changes, but leaves no deprecated runtime path and no follow-up debt. | **Chosen by owner.** |
| C | Like A, but RNFirebase 27.1.0. | v27 needs Kotlin ≥ 2.4.0 (RN 0.88 bundles 2.2.0) and SPM-only Firebase with dynamic frameworks on iOS. It shipped 2026-10-19, and both conflicts sit in unverifiable parts. | Rejected. |

**Target version.** 0.88.1 over 0.87.1:
- 0.88 is Active.
- It has no user-facing breaking changes against 0.87.
- It is the only release with built-in UIScene support.
- 0.87 moves to End of Cycle when 0.89 ships (scheduled 2026-12-07).

**Direct jump** over a 0.81 stepping stone. 0.82's post suggests enabling the New Architecture on 0.81 first. That only helps if the app can be exercised between hops, and it can't be here.

**Within B, RNFirebase 26.4.1, not 27.**
- 26 is the newest line whose published toolchain matches RN 0.88: Android BoM 34.18, minSdk 23, no Kotlin 2.4 floor; iOS Firebase 12.19.3 via CocoaPods with static frameworks (`$RNFirebaseDisableSPM = true`).
- Moving to 27 later is a native-config change only (Kotlin 2.4, SPM + dynamic frameworks); the JS is the same modular API.

## 5. Design

### 5.1 Platform (from the official Upgrade Helper diff 0.72.17 → 0.88.1, `rn-diff-purge`)

**JS tooling**
- `react-native` 0.88.1, `react` 19.3.0, `react-test-renderer` 19.3.0 (exact; 19.3.1 peers react ^19.3.1).
- `@react-native/{babel-preset,metro-config,jest-preset,eslint-config,typescript-config}` 0.88.1.
- `@react-native-community/cli`, `cli-platform-android`, `cli-platform-ios` 20.2.0 as devDependencies.
- TypeScript per template (^6.0.3), with `@types/react` ^19.2.0. If TS 6 moves the ratchet, the builder may hold TS at the newest 5.x that satisfies `@react-native/typescript-config`, and must record why.
- Node ≥ 22.13 (`engines`).
- `babel.config.js`: preset `module:@react-native/babel-preset`. Everything else in the file (BUNDLED_ENV, E2E guards, the tanstack private-methods plugins) stays.
- `jest.config.js`: `preset: '@react-native/jest-preset'`. `transformIgnorePatterns` is updated for the renamed packages.
- `metro.config.js` is unchanged in shape.
- The Strict TypeScript API is the default. Deep imports into `react-native/Libraries/*` are migrated to root exports. The `react-native-legacy-deep-imports` opt-out is not used: it disappears after 0.88.
- Removed APIs to fix in app code: `InteractionManager` (none in src), `Modal animated`, `StatusBar backgroundColor/translucent`, boolean `keyboardShouldPersistTaps` (none found), `NativeMethodsMixin` types, `StyleSheet.absoluteFillObject`.

**Android**
- `MainApplication` and `MainActivity` are rewritten in Kotlin per the template: `ReactHost`, `loadReactNative(this)`, `DefaultReactActivityDelegate`.
- Flipper is removed: `ReactNativeFlipper.java` (debug and release), `FLIPPER_VERSION`, the debug dependencies, and the e2e `srcDirs` that only exist for the release Flipper stub.
- `MainActivity` keeps `getMainComponentName() = "rats"` and adopts the react-native-screens 4.30 guidance: `setFragmentFactory(RNScreensFragmentFactory())`, then `super.onCreate(savedInstanceState)`.
- Root `build.gradle` follows the template:
  - `buildToolsVersion` 37.0.0, minSdk **24**, compileSdk **37**, targetSdk **36**, NDK 27.1.12297006.
  - Kotlin **2.2.21**: the newest 2.2.x, which matches Stripe 0.84's declared `StripeSdk_kotlinVersion` and RN's 2.2.0 line.
  - AGP from the RN plugin (9.2.1); `apply plugin: "com.facebook.react.rootproject"`.
  - `google-services` 4.5.0 (RNFB 26 `gmsGoogleServicesGradle`).
  - The crashlytics classpath is removed.
- Gradle wrapper 9.4.1. `gradle.properties`:
  - `newArchEnabled=true`, `hermesEnabled=true`, `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`, `android.newDsl=false`.
  - `FLIPPER_VERSION` and `android.enableJetifier` are removed, the latter if CI shows nothing needs it. The memory settings are kept.
- `settings.gradle` uses the template's `com.facebook.react.settings` / `autolinkLibrariesFromCommand()`. `app/build.gradle` gets `autolinkLibrariesWithApp()` and the old `native_modules.gradle` applies are removed. All regroup-specific blocks stay: e2e build types, bundled-env stamps, release guard, Sentry, google-services.
- The `subprojects { afterEvaluate {…} }` workaround in `android/build.gradle` is removed. The RN 0.88 plugin now derives library namespaces and aligns Java to 17. The `buildConfig` opt-in is kept only if CI shows a library needs it, and it then moves to a mechanism that AGP 9 accepts.
- **Edge-to-edge (plan review).** targetSdk 36 with `edgeToEdgeEnabled` makes the status bar transparent on every API level. `IOSStatusBar`, the app-wide top spacer, is 0 high on Android today. It reserves `useSafeAreaInsets().top` on Android too, and tab bars and pinned footers are audited for bottom insets.
- **Release and e2e guards fail closed (plan review).** `android/app/build.gradle` attaches the release guard and bundled-env stamps by task name, and silently skips if a task is missing. Configuration-time checks in `gradle.projectsEvaluated` now fail the build if `regroupReleaseGuard` isn't wired before `preReleaseBuild`, or a non-debug variant has no stamp. The `maestro-smoke` CI job gains a permanent Regroup-only step that asserts those tasks in `--dry-run` task lists and runs the guard with a test key, expecting its refusal (this design's call; it lives in `.github/workflows/ci.yml`).
- The `stripeVersion` pin is removed: wrapper 0.84.0 declares native 23.25.1. The `androidx.activity` force-resolution to 1.7.0 is removed or raised: it would pin newer libraries down.

**iOS**
- `platform :ios, min_ios_version_supported` (15.1). The post_install `IPHONEOS_DEPLOYMENT_TARGET` override moves to 15.1.
- **Hermes replaces JSC**: drop `:hermes_enabled => false`. RN 0.81 removed the built-in JSC.
- Linkage stays `use_frameworks! :linkage => :static`, plus `$RNFirebaseAsStaticFramework = true` and **`$RNFirebaseDisableSPM = true`** (CocoaPods Firebase 12.19.3, RNFB 26).
- Podfile workarounds:
  - Removed: Folly header paths and the Yoga `-Wno-deprecated-literal-operator` flag (0.72-only).
  - Kept: the BoringSSL-GRPC flag fix, if still needed.
  - The HtmlToPdf header path is re-checked against `build/generated/ios/ReactCodegen`.
  - The `SexyTooltip` git pod is removed (no references).
- `AppDelegate.mm` stays Objective-C++ but moves off the deprecated `RCTAppDelegate`. It keeps `[FIRApp configure]`, the `IS_E2E_TEST` → `NSUserDefaults` bridge, and the Debug Metro / Release `main.jsbundle` bundle URL.
  - **SceneDelegate** owns an `RCTReactNativeFactory` with an `RCTDefaultReactNativeFactoryDelegate` (`dependencyProvider = [RCTAppDependencyProvider new]`). It calls `startReactNativeWithModuleName:@"rats" inWindow:connectionOptions:` and forwards URLs and user activities through `+[RCTLinkingManager scene:openURLContexts:]` / `scene:continueUserActivity:`.
  - The hand-rolled launch-options reconstruction is deleted: 0.88 forwards the first URL or activity from the connection options.
  - **Kept from today's design (plan review):**
    - `AppDelegate` declares and owns `@property UIWindow *window`, and `SceneDelegate` assigns `appDelegate.window = self.window` before starting React Native. RNFirebase messaging and react-native-date-picker's modal mode reach the window through the app delegate; without it the first crashes at launch and the second never opens.
    - The `RCTReactNativeFactory` lives on `AppDelegate` and starts React Native **once per process**. A scene that reconnects while the process lives gets the existing root view controller, and its connection-option URLs and user activities are forwarded to `RCTLinkingManager`, as today.
    - If phone-auth reCAPTCHA is reachable, the SceneDelegate also forwards URLs to `[FIRAuth canHandleURL:]` (checked at the Mac checkpoint).
  - The `RNCPushNotificationIOS` calls and the app's own `UNUserNotificationCenter` delegate go (see §5.3).
  - `Info.plist` already has a single-scene `UIApplicationSceneManifest`; `UISceneDelegateClassName` stays `SceneDelegate`.
- `react-native.config.js` keeps the launch-arguments iOS restriction to the `E2E*` configurations.

**Patches**
- Delete `patches/react-native+0.72.17.patch`. Its Yoga fix is unneeded and it would fail against 0.88.
- Delete `patches/@react-native-community+datetimepicker+7.7.0.patch`. It is IDE junk (`.project`, `bin/*.class`) for a version that isn't installed.
- Delete the stray `@react-native-community+datetimepicker+7.6.2.patch` at the mobile root. It was never applied, and its fix ships in 9.x.
- New patches only where §5.4 says so, each with a header comment explaining why.

### 5.2 RNFirebase 26.4.1, modular migration

- **Packages:** `app`, `auth`, `firestore`, `functions`, `messaging`, `storage`, `analytics`, all at 26.4.1. `crashlytics` is removed (zero call sites; Sentry is the only error sink).
- **`firebase-setup.ts`** becomes the single place that constructs instances:
  - `getApp()`, `getAuth()`, `initializeFirestore(app, { ignoreUndefinedProperties: true })` (or `getFirestore` + the documented settings path), `getFunctions()`, `getMessaging()`, `getStorage()`.
  - It keeps its exported names (`auth`, `firestore`, `functions`, `messaging`, `storage`, `callHttpsFunction`, `emulatorConnection`), so imports stay stable.
  - `callHttpsFunction(name, payload)` becomes `httpsCallable(functions, name)(payload)`.
- **Emulator wiring** (`src/config/firebase-emulator.ts`) uses `connectAuthEmulator`, `connectFirestoreEmulator`, `connectStorageEmulator` and `connectFunctionsEmulator`, with the same hosts and ports. It still fails hard when unreachable.
- **Call sites** (≈ 41 non-test files: services, hooks, queries, models, screens) are rewritten mechanically, with no query-semantics changes:
  - `firestore.collection(c).doc(id).get()` → `getDoc(doc(firestore, c, id))`
  - `.where/.orderBy/.limit/.startAfter` → `query(collection(...), where(...), …)`
  - `.onSnapshot` → `onSnapshot(ref, …)`
  - `runTransaction(firestore, …)`, `writeBatch(firestore)`
  - `FieldValue.*` → `serverTimestamp()`, `increment()`, `arrayUnion()`, `arrayRemove()`, `deleteField()`
  - `Timestamp`, `GeoPoint` and `FieldPath` imported from `@react-native-firebase/firestore`
  - `snapshot.exists` → `snapshot.exists()`
  - Auth: `auth.currentUser` stays a property; method calls become functions (`signInWithEmailAndPassword(auth, …)`, `signOut(auth)`, `onAuthStateChanged(auth, …)`, `getIdTokenResult(user)`, `PhoneAuthProvider`/`EmailAuthProvider` modular forms).
  - Storage: `ref(storage, path)`, `putFile`, `getDownloadURL`.
  - Messaging: `getToken`, `onMessage`, `setBackgroundMessageHandler`, `onTokenRefresh`, `requestPermission`, `AuthorizationStatus`.
  - Analytics: `logEvent(getAnalytics(), …)`.
  - Types come from the root modular exports, replacing `Firebase*Types` namespaces.
- **Money and integrity paths get line-by-line review against the old code:** payments, EES, treasury, disputes, guest optimistic locking (`version`), votes transactions, dispute reopen (`reopenDispute.ts`), guest batches (`guestBatch.ts`), the live dispute list (`useLiveHouseDisputes.ts`). (There is no offline-queue service in the code; the architecture rule that lists one is stale and gets corrected.)
- **Tests.**
  - `jest.setup.js` and `__mocks__/firebase-setup.ts` gain a modular mock surface: functions recording calls against a fake `ref` model.
  - Test assertions change from namespaced call chains to the equivalent modular calls. Test count and intent are preserved.
  - **Integration suite (*owner*: upgrade the SDKs rather than build an adapter).** `src/integration/setup.ts` maps the RN Firebase packages onto `firebase-admin`'s chained API. After the migration the services call modular functions (`doc`, `getDoc`, `query`…), which `firebase-admin` has never had, at any version. The SDK with that exact API is the Firebase JS SDK (`firebase`, already a dependency of RNFirebase 26, which mirrors it). So the integration config maps `@react-native-firebase/{app,auth,firestore,functions,storage}` to `firebase/*` connected to the emulators, and `firebase-admin` (latest 13.x) stays only for seeding and Admin-only helpers.
    - The JS SDK is a client SDK, so emulator security rules apply where the Admin SDK bypassed them. Each suite signs in as the seeded user it acts for, through the Auth emulator. Where a test needs to set up data that no client may write, the setup step seeds it through Admin.
    - The integration config gets its own setup file without the unit-test RNFB mocks (a `jest.mock` factory would override any module mapping). `firebase-setup` in that config builds JS SDK instances in the order the JS SDK requires: `initializeFirestore` first, then `connect*Emulator`. The setup asserts `projectId` starts with `demo-` and the host is `127.0.0.1`, so it can never reach a real project.
    - RNFirebase-only APIs (`putFile`) get a minimal shim. Error codes differ (`firestore/permission-denied` on device, `permission-denied` in the JS SDK); the shim prefixes them as RNFirebase does, so service code sees device-shaped errors.
    - `@firebase/rules-unit-testing` is pinned to **5.0.2**: 6.x peers `firebase` 13, while RNFirebase 26 pins 12.17.1.
    - Acceptance: every integration test that passes in the measured baseline (2026-10-30: 27 of 48) still passes, and no new failure appears.
  - The rules suites (`firebase/__tests__`, `@firebase/rules-unit-testing` + `firebase`) move to the JS SDK version RNFirebase 26 pins. Their assertions don't change.
  - Anything else that uses a Firebase SDK directly (scripts, e2e seeding, mocks) is upgraded and fixed alongside.
- **Messaging contract corrections (v26/v27 notes) apply only to fields Regroup reads.** It reads `message.data.notifee` only, so nothing changes there.

### 5.3 Notifications

**Live behavior today (verified with Serena references)**
1. **Server pushes (four senders, plan review).**
   - Data-only: `sendNotification` in `regroup/functions/src/util/notifications.ts` sends `data.notifee = JSON.stringify({ body, title, data, android: { channelId: 'default' } })`. In the foreground, `Splash.tsx` `messaging().onMessage` → `notifee.displayNotification(JSON.parse(...))`.
   - With a `notification` block: `sendFcmToHouseAdmins` (`notifications.ts`, ten callers), `sendFcmToUser` (`webhooks/stripeWebhook.ts`) and `officerTermReminder.ts`. The OS shows them in the background. On iOS in the foreground they show only because `AppDelegate` is the `UNUserNotificationCenter` delegate returning banner + sound + badge.
2. **Rent reminders.** `src/services/notifications/rentReminder.ts` uses `react-native-push-notification` to schedule a local notification (Friday 09:00, `allowWhileIdle`, string id per guest, channel `default-channel-id`), cancel it, and check iOS alert permission first.
3. **Dead code.** `handler.ts` (`PushNotification.configure`) and `service.ts` (`NotificationService`, which creates channels) have zero references. **No live code creates an Android channel**, so on Android 8+ notifications posted to `default` or `default-channel-id` are not shown: a pre-existing bug.

**Design**
- **Library.** Replace `react-native-push-notification`, `@react-native-community/push-notification-ios`, `@notifee/react-native` and `@types/react-native-push-notification` with **`react-native-notify-kit` 10.10.0**.
  - It is the community fork named by the archived Notifee README (Notifee archived 2026-04-07).
  - It keeps the Notifee API and Java package, is a codegen TurboModule, and peers RN ≥ 0.73.
  - The server payload contract stays exactly as it is.
  - Risk: a single maintainer, with the first release 2026-04. Mitigation: all usage sits behind `src/services/notifications/`.
- **Startup channel setup.** One function creates the channels the code references: `default` (server pushes) and `default-channel-id` (rent reminders), both high importance, matching the dead `service.ts` intent. It is a memoized promise that startup kicks off and that every display and schedule path awaits. This fixes the bug; the decision record calls it out.
- **Rent reminders**
  - Scheduling uses `createTriggerNotification` with a `TimestampTrigger` (alarm manager, allow-while-idle), the same id, channel, title, body and `data: { screen, guestId }`.
  - Cancelling uses `cancelTriggerNotification(id)`.
  - The iOS permission check uses `getNotificationSettings().authorizationStatus`.
  - Same call sites: `GuestHome`, `ResidentPayment`, `RentPaymentScreen`.
- **Delete dead code.** Remove `handler.ts` and `service.ts`. Their tests, if any, are replaced by tests of the new module so the test count holds.
- **iOS remote push.**
  - RNFirebase messaging keeps APNs registration through its app-delegate proxy.
  - The AppDelegate stops forwarding to `RNCPushNotificationIOS` and stops being the `UNUserNotificationCenter` delegate. notify-kit then owns presentation of what it displays and forwards other pushes to RNFirebase.
  - RNFirebase 26 presents a foreground `notification` push only when `messaging_ios_foreground_presentation_options` is set. So `regroup/mobile/firebase.json` gains `"react-native": { "messaging_ios_foreground_presentation_options": ["badge", "sound", "banner", "list"] }`, matching today's banner + sound + badge.
  - notify-kit's own foreground presentation is configured to the same options.
- **Error handling.** Every exported notification function catches, calls `logException(error, '<static context>')` and resolves; none rejects, so fire-and-forget callers stay safe. Notification titles, bodies, data and guest fields are never logged.
- **Wrapper pattern.** `src/services/notifications/` is the only importer of notify-kit (ESLint `no-restricted-imports` allowlist). `Splash.tsx` calls `displayRemoteMessage(message)` from there.
- **Existing installs.**
  - iOS reminders scheduled by the old library stay pending in `UNUserNotificationCenter` after the update and still fire. The new code keeps the same identifier (`String(guestNotificationId(id))`), so rescheduling replaces them and cancelling removes them (verified against notify-kit's iOS cancel path).
  - On Android the old library's receivers were never declared and no channel existed, so Android reminders never fired. **After this upgrade they will: a deliberate behaviour change, recorded in the decision record.** To avoid reminding a resident whose rent is settled outside the app, `GuestHome` also cancels the reminder when `rentOwed <= 0` (this design's call).
- **Merged Android permissions.** notify-kit's library manifest adds `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `ACCESS_NOTIFICATION_POLICY`, `WAKE_LOCK` and a full-screen-intent activity. Each is kept or removed with `tools:node="remove"`, and every decision is recorded with its reason and Play Console impact. `SCHEDULE_EXACT_ALARM` is removable, because notify-kit falls back to inexact `setAndAllowWhileIdle`. The app declares `POST_NOTIFICATIONS` itself.
- **Android manifest.** Drop the push-notification receivers and services, and the `ShortcutBadger` dependency. Keep `POST_NOTIFICATIONS` and add `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM` only if notify-kit's alarm-manager trigger needs it for parity with `allowWhileIdle`. The builder decides from notify-kit's docs and records the choice.

### 5.4 Other dependencies (evidence: published tarballs inspected 2026-10-29)

| Package | From → To | Why / required change |
|---|---|---|
| @stripe/stripe-react-native | 0.44.0 → **0.84.0** | The `BaseReactPackage` blocker is gone. Native Android 23.25.1, iOS 26.15.1. The app's API (`StripeProvider`, `usePaymentSheet().initPaymentSheet({merchantDisplayName, paymentIntentClientSecret})`, `presentPaymentSheet`, code `Canceled`) is unchanged in the 0.84 types. `stripe-rn-version-decision.md` gets a superseded note. |
| @sentry/react-native | 7.12.0 → **8.33.0** | 7.x gets critical fixes only. Needs iOS 15+, Xcode 16.4+, CLI v3. The app uses `init`, `captureException` and `captureMessage` only. `sendDefaultPii: false`, `attachScreenshot: false` and `attachViewHierarchy: false` are set explicitly, with no replay, and pinned in `sentry.test.ts`. The `sentry.properties`-guarded Xcode phases (now bundling Hermes and uploading its composed source map) and `sentry.gradle` are updated before the Mac checkpoint. |
| react-native-gesture-handler | 2.9.0 → **3.4.0** | Its support table lists RN 0.85–0.88 for 3.4.x. `GestureHandlerRootView` is unchanged. Remove the unused `ScrollView` import in `FilterForm.tsx`; `TouchableOpacity` still exported. |
| react-native-screens | 4.0.0 → **4.30.1** | 4.26+ needs RN ≥ 0.84; Paper is unsupported. `MainActivity` fragment-factory change (§5.1). |
| react-native-safe-area-context | 4.5.0 → **5.11.0** | Same exports. Migrate the one core `SafeAreaView` use (`src/screens/Profile/UserInfo.tsx`). |
| react-native-svg | 13.14.1 → **15.16.0** | Needs RN ≥ 0.80. Only victory uses it. |
| victory-native | 36.9.2 → **37.3.7** (`legacy` tag, SVG line) | Peer react ≥ 16.6. A static scan found no removed React 19 APIs. Four symbols are used, all still exported. 43.x (Skia + reanimated + worklets + chart rewrite) is not worth it for two bar charts. |
| @react-navigation/native / native-stack / bottom-tabs | → **7.5.1 / 7.21.0 / 7.21.0** | No API change found. |
| react-native-webview | 13.16.0 → **14.0.1** (npm `latest`) | API ≥ 24 (matches minSdk). All props used still exist. 16.0.0 is still on npm `next`. |
| react-native-permissions | 3.10.1 → **5.6.3** | Remove `"reactNativePermissionsIOS"` and `react-native setup-ios-permissions` from postinstall; add `setup_permissions([...8 names...])` to the Podfile. JS is unchanged. |
| react-native-image-picker | 8.2.1 → **8.3.0** | Minor. |
| react-native-document-picker | 9.3.1 → **@react-native-documents/picker 12.0.3** | Renamed upstream. `pickSingle` → `pick`, `isCancel` → `isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED`. `keepLocalCopy` before `putFile` / `readFile` (Android `content://` uris). Affects `DocumentListScreen`, `GuestImportScreen`, their tests and mocks. |
| react-native-fs | 2.20.0 → **@dr.pogodin/react-native-fs 2.41.0** | Maintained TurboModule fork; same `readFile(uri, 'utf8')`. |
| react-native-html-to-pdf | 0.12.0 → **1.3.0** | No default export: `require(...).generatePDF(options)` in `reportExport.ts`, with the same options and `filePath`. |
| @react-native-community/datetimepicker | 7.6.2 → **9.2.2** | Same props; `onChange` deprecated but works. |
| react-native-date-picker | 4.4.2 → **5.0.13** | Props used (`modal/open/date/mode/onConfirm/onCancel`) exist. |
| react-native-picker-select | 8.1.0 → **9.3.1** | Same props. `@react-native-picker/picker` stays 2.11.4 (latest). |
| react-native-geolocation-service | 5.3.1 → **removed**; use **@react-native-community/geolocation 3.4.0** | Same `getCurrentPosition` signature. Call `setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'playServices' })` to keep the fused provider. Applies to `util/geolocation.ts`, `rats-search-bar`, and the mocks. |
| react-native-keyboard-manager | 6.5.4-alpha.2 → **removed** | Doesn't compile on 0.88 (imports the removed `RCTBaseTextInputView.h`). |
| react-native-keyboard-aware-scroll-view | 0.9.5 → **removed** | Replaced by **react-native-keyboard-controller 1.22.9** (Fabric). Mandatory Android edge-to-edge (targetSdk 36) breaks `adjustResize`-based avoidance, which keyboard-controller handles. `KeyboardProvider` goes at the root; `rats-scroll-view` and the other APSL users switch to its `KeyboardAwareScrollView`. Adds **react-native-reanimated 4.7.1 + react-native-worklets 0.13.x** (peer requirement) and the worklets Babel plugin (placed last, test-safe). |
| **IQKeyboardManager parity** | — | KeyboardManager also drew its Prev/Next/Done toolbar over every iOS keyboard: the only way to dismiss the 19 numeric, decimal and phone pads (including the rent amount). A `RatsKeyboardToolbar` wrapper renders keyboard-controller's `KeyboardToolbar` app-wide on iOS. KeyboardManager also auto-lifted every iOS text field. The builder audits screens with `TextInput` outside an aware scroll view and wraps each in keyboard-controller's `KeyboardAwareScrollView` (or `KeyboardAvoidingView`), so no field ends up under the keyboard. Chat had it disabled; HouseSetup set a 100-point distance → `bottomOffset`. |
| react-native-modal | 13.0.1 → **13.0.2 + patch** (*owner*: keep it) | It wraps RN's own `Modal` and supplies the swipe-to-dismiss, slide/zoom animations and `onModalShow`/`onModalHide` that `BaseActivityScreen`, `PhaseCustomization`, `ModalContext` and `ChoreSetup` rely on. Its only 0.88 breakage is `InteractionManager` (2 `createInteractionHandle` and 3 `clearInteractionHandle` calls; RN 0.88 throws on access in dev). 13.0.2 already uses the `BackHandler` subscription's `.remove()`. A patch-package patch removes the interaction handles, which only deferred work behind animations. The patch is pinned to 13.0.2 and carries a header explaining why. `RatsModal` and `RatsLoadingModal` stay the only importers (the app's wrapper pattern): every app modal goes through them, and they keep their props and behaviour. The patched paths get characterization tests: back-button dismiss, backdrop press, swipe and show/hide callbacks firing. |
| @react-native-community/checkbox | 0.5.20 → **removed** | 0.6.0's codegen points at a missing `js/` directory. `rats-checkbox` is reimplemented in JS (`Pressable` + icon) with the same props and testIDs. |
| react-native-vector-icons | 9.2.0 → **@react-native-vector-icons/fontawesome5, ionicons, material-icons 14.0.0** | v10 is deprecated. Run the official codemod; `solid` → `iconStyle="solid"`. Rename the three Ionicons names that no longer exist (`md-arrow-down`, `ios-calendar` → v14 names). Remove `fonts.gradle`, `fix-vector-icons.gradle` and the bundled `.ttf` copies in `ios/`. Fonts come from the pods; `UIAppFonts` via `rnvi-update-plist`. The Quicksand app fonts stay. |
| @react-native-clipboard/clipboard, react-native-launch-arguments, @react-native-picker/picker, react-native-collapsible, react-native-simple-radio-button, react-native-size-matters, @callstack/react-theme-provider, react-native-google-places-autocomplete (→ 2.6.5) | already latest / JS | No change beyond version. launch-arguments stays interop (e2e only). |
| react-native-popover-view | 5.1.9 → **6.1.0** | JS; no documented breaking change since 4→5. |
| react-redux / redux | 8.1.3 / 4.2.1 → **9.3.1 / 5.0.1** | React 19 peer. `connect` still supported. |
| @reduxjs/toolkit, @tanstack/react-query | → **2.13.0 / 5.105.0** | Minor. |
| i18next / react-i18next | 22.5.1 / 12.3.1 → **26.5.11 / 17.1.9** | Remove `compatibilityJSON: 'v3'` from `i18n.ts` (v4 only). Resources have no plural keys. |
| formik, yup, date-fns, date-fns-tz, lodash, uuid | latest compatible | No API change expected. |
| @testing-library/react-native | **keep 13.3.3** | Supports React 19 (non-goal: v14 async migration). |
| @testing-library/jest-native | **removed** | Deprecated, never wired. |

**Removed as unused (zero references in source, tests, native code; leftovers listed):**
- **Native packages:**
  - `@react-native-community/toolbar-android`.
  - `@react-native-community/viewpager` + `react-native-best-viewpager` (git). Also drop the `OperatorSetupWizard.test.tsx` mock.
  - `@react-native-firebase/crashlytics`. Also drop the classpath and its Xcode phase after `pod install`.
  - `@react-native-masked-view/masked-view`, `@react-navigation/stack`, `react-native-modal-datetime-picker`, `react-native-floating-action`, `react-native-keyboard-spacer`.
- **Redux leftovers:** `redux-thunk`, `redux-logger` (also its ambient module declaration), `redux-devtools-extension`, `react-navigation-redux-helpers`.
- **Other packages:** `moment`, `moment-timezone` (also three test mocks), `zod`, `minimist`, `@tanstack/react-query-devtools`, `sendgrid`, `@react-native-community/cli-plugin-metro`, `metro-react-native-babel-preset`, `@types/metro-config`, `@tsconfig/react-native`.
- **Moved, not removed:** `@firebase/rules-unit-testing` → devDependencies (rules tests use it).

### 5.5 Verification

1. **After each implementation phase:** `npm test -- --ci`, `npm run typecheck:ratchet` and `npx eslint` on changed files, all green, before committing.
2. **Characterization tests first** (TDD) where behavior is rewritten: the Firebase service wrappers (the same Firestore paths and payloads for representative calls), rent-reminder scheduling and cancelling, the notification channel setup, the `rats-modal` / `rats-checkbox` contract, and the document-picker cancel path.
3. **CI on the PR:** the regroup mobile test job and `maestro-smoke` `assembleDebug` (the Android compile gate). E2e variant compile (`assembleE2eEmulator`) is checked if CI time allows, or listed as unverified.
4. **Before merge, on a Mac (listed in the decision record):**
   - `pod install`, Debug and Release builds, and the `E2EEmulator` / `E2EStaging` configurations.
   - On a device or simulator: sign-in and sign-up, a Stripe test PaymentSheet payment, a foreground push, rent reminder scheduling (Android and iOS), document upload, CSV guest import, PDF export (Android), house search with location, both charts, chat keyboard, HouseSetup keyboard, a deep link / universal link, and edge-to-edge layouts on Android 15+.
5. **Snapshots.** Expected to change (react-test-renderer 19, icons). - **Snapshot updates.** Each one lands in the same commit as the change that causes it (so every commit stays green), made with `VERIFY_DIFF_APPROVED_SNAPSHOTS` naming exactly its files (§3), after reading the diff.
- **The label comes last.** It disables the whole CI test-tamper job, so it is applied only after a whole-branch verify-diff run, recorded in the PR description, shows `SNAPSHOT-CHURN` for the listed snapshot files as the only violation.
6. **Typecheck ratchet (*owner*: recommended approach).**
   - Kept green at **every commit**, because CI runs it before Jest.
   - Each task fixes the new errors it causes. Where an upgrade only re-words an existing entry, the same commit regenerates `.typecheck-baseline` (the script strips machine paths, so a local run matches CI). The total stays ≤ 137.
   - No baseline entry may be added in a file the Firebase migration touches.
   - The decision record maps each re-worded entry 1:1, with old and new line numbers.
7. **Keyboard (*owner*: be very careful; keep or improve the experience).**
   - Before changing anything, record the current keyboard behaviour of every screen with a text input. That covers which wrapper it uses (APSL `KeyboardAwareScrollView`, `rats-scroll-view`, `KeyboardAvoidingView`, none), whether IQKeyboardManager was active there (on unless chat disabled it; HouseSetup's 100-point distance), and the props in effect (`extraScrollHeight`, `keyboardShouldPersistTaps`, `enableOnAndroid`…).
   - Map each one to keyboard-controller with the same visible result: the focused field lands above the keyboard with the same offset, the same tap-to-dismiss and scroll-to-dismiss behaviour, chat's composer pinned to the keyboard, and Android's `adjustResize` replaced by keyboard-controller under edge-to-edge.
   - This table goes into the decision record, and the keyboard work lands before the Mac checkpoint so the owner can try the key screens on a device.

### 5.6 Risks and rollback

| Risk | Mitigation |
|---|---|
| Firebase migration changes a query or a write | Mechanical mapping table; line-by-line review on money and integrity paths; characterization tests; rules tests unchanged. |
| iOS can't be verified here | A Mac checklist gates merge; the iOS native diff stays minimal (ObjC++ kept, linkage unchanged). |
| notify-kit maturity | Usage is isolated behind one module; the payload contract is unchanged, so swapping to another Notifee-API library or expo-notifications later is local. |
| keyboard-controller + reanimated add a native layer | Versions pinned to the published RN 0.86–0.88 support range; worklets Babel plugin isolated from Jest. |
| Keyboard UX regresses (owner: hard-won) | Per-screen before/after table (§5.5.7), keyboard work before the Mac checkpoint, device pass on chat, HouseSetup and every form screen. |
| Android edge-to-edge visual regressions | safe-area-context everywhere; device check on Android 15+. |
| AGP 9 old-DSL libraries | `android.newDsl=false` per template; CI build is the proof; a targeted patch-package only where CI fails. |
| **Rollback** | The PR is a single squash commit. Revert it. No data migration is involved, since Firestore shapes are unchanged. |

## 6. The builder's calls

- The order of implementation phases and commits, as long as every committed state passes Jest, the ratchet and lint.
- The exact modular mock design in `jest.setup.js`.
- Kotlin file details, keeping the template's shape.
- Channel display names and descriptions.
- Exact-alarm permission handling (§5.3).
- Which keyboard wrapper to use per screen in the IQKeyboardManager audit.
- Ionicons v14 replacement names, chosen to match the current glyphs.
- Whether TS 6 or the newest 5.x (§5.1).

## 7. Calls made in this design (owner may override)

1. RNFirebase **26.4.1**, not 27 (toolchain conflicts in unverifiable areas).
2. **react-native-notify-kit** over expo-notifications (it keeps the server contract and adds no Expo).
3. Fix the Android channel bug as part of the swap.
4. **react-native-keyboard-controller** (+ reanimated/worklets) replacing keyboard-manager and keyboard-aware-scroll-view.
5. ~~RN `Modal` replacing react-native-modal~~. Superseded (*owner*): keep react-native-modal 13.0.2 with a minimal patch, behind `RatsModal` / `RatsLoadingModal`.
6. JS `rats-checkbox` replacing the native checkbox.
7. victory-native **37.3.7** (SVG line), not the Skia rewrite.
8. Keep RNTL 13.3.3; no async test migration.
9. Keep iOS ObjC++ and static linkage with CocoaPods Firebase.
10. react-native-webview **14.0.1** (npm `latest`), not 16.0.0 (`next`).
