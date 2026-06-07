# React Native Firebase v21 / Firebase 11 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the iOS CocoaPods `nanopb` version conflict by completing the half-finished Firebase 11 migration — upgrade `@react-native-firebase` from v18 to v21.13.x and remove the manual SDK version overrides so RNFB owns the native Firebase SDK versions on both platforms.

**Architecture:** The conflict exists because the iOS Podfile forces Firebase iOS SDK 11.6.0 (needs nanopb 3.x) and Android uses Firebase BoM 33.1.1 (Firebase 11 era), but `@react-native-firebase` v18 is pinned to Firebase 10.20.0 / nanopb 2.x. RNFB 21.0.0 is the release that adopted Firebase iOS SDK v11; v21.13.x ships Firebase iOS 11.10.0 + Android BoM 33.11.0. We bump all 8 RNFB packages to a single `21.13.x` version and **delete** both manual overrides (`$FirebaseSDKVersion` in the Podfile, the explicit `firebase-bom` pin in Android) so RNFB supplies tested, consistent versions. The app's namespaced Firebase API (`firestore()`, `auth()`, …, 207 call sites) keeps working unchanged — deprecation warnings only begin in v22 — so **no JS rewrites are required**.

**Tech Stack:** React Native 0.72.9, `@react-native-firebase/*` 18.x → 21.13.x, Firebase iOS SDK 11.10.0, Firebase Android BoM 33.11.0, CocoaPods 1.16.2, Xcode 26.5, old architecture (`newArchEnabled=false`).

---

## Pre-flight facts (verified, do not re-litigate)

- Current RNFB versions in `package.json`: mixed `^18.7.3` (app, auth, functions) and `^18.9.0` (analytics, crashlytics, firestore, messaging, storage).
- `ios/Podfile:73`: `$FirebaseSDKVersion = '11.6.0'` ← root-cause override.
- `android/app/build.gradle:124`: `implementation platform('com.google.firebase:firebase-bom:33.1.1')` ← second override.
- iOS deployment target `16.0` (Podfile:15) ≥ RNFB 21 requirement `13.0`. ✓
- Android `minSdk 23`, `compileSdk 34`, `targetSdk 34`, `buildTools 34.0.0` — all meet RNFB 21.13 (`minSdk 21`, `compileSdk 34`). ✓
- No `resolutions`/`overrides` block in `package.json` to fight. ✓
- `@react-native-firebase/dynamic-links` is NOT a dependency (only a commented import at `src/services/firebase/config.ts:5`). ✓
- RNFB peer dep `react-native: *` — no hard block on RN 0.72.9. ✓
- Current branch is `main`; `ios/Podfile.lock` is already deleted in the working tree (per git status).

## Rollback anchor

Before any change, the safest rollback is `git restore` + reinstall at the old versions. Task 1 captures a clean baseline commit/branch so every later step is revertible with `git reset --hard <baseline>` followed by `npm install && (cd ios && pod install)`.

---

### Task 1: Create upgrade branch and capture baseline

**Files:**

- None (git only)

- [ ] **Step 1: Confirm working state and current versions**

Run:

```bash
cd /Users/marcus/dev/recovery-platform/homegroups/mobile
git status --short
grep -E '"@react-native-firebase' package.json
```

Expected: working tree shows the already-deleted `ios/Podfile.lock` and any in-progress edits; the 8 RNFB deps show `^18.7.3`/`^18.9.0`.

- [ ] **Step 2: Create a dedicated branch off current HEAD**

Run:

```bash
git checkout -b chore/rnfirebase-v21-firebase11
```

Expected: `Switched to a new branch 'chore/rnfirebase-v21-firebase11'`.

- [ ] **Step 3: Record the baseline commit SHA for rollback**

Run:

```bash
git rev-parse HEAD
```

Expected: a 40-char SHA. Note it — this is the rollback anchor referenced below.

---

### Task 2: Bump all RNFB packages to a single 21.13.x version

**Files:**

- Modify: `package.json` (the 8 `@react-native-firebase/*` dependency lines, currently 35-42)

- [ ] **Step 1: Edit the 8 RNFB dependency versions**

In `package.json`, set every `@react-native-firebase/*` entry to the same caret range `^21.13.0`. The block becomes exactly:

```json
    "@react-native-firebase/analytics": "^21.13.0",
    "@react-native-firebase/app": "^21.13.0",
    "@react-native-firebase/auth": "^21.13.0",
    "@react-native-firebase/crashlytics": "^21.13.0",
    "@react-native-firebase/firestore": "^21.13.0",
    "@react-native-firebase/functions": "^21.13.0",
    "@react-native-firebase/messaging": "^21.13.0",
    "@react-native-firebase/storage": "^21.13.0",
```

- [ ] **Step 2: Verify the edit (all 8 now 21.13.0, none on 18.x)**

Run:

```bash
grep -E '"@react-native-firebase' package.json
```

Expected: 8 lines, all `^21.13.0`. No `18.7.3` or `18.9.0` remain.

- [ ] **Step 3: Commit the manifest change**

```bash
git add package.json
git commit -m "chore(mobile): bump @react-native-firebase to 21.13.x for Firebase 11"
```

---

### Task 3: Remove the iOS `$FirebaseSDKVersion` override

**Files:**

- Modify: `ios/Podfile:73`

- [ ] **Step 1: Confirm the exact line to remove**

Run:

```bash
grep -n "FirebaseSDKVersion" ios/Podfile
```

Expected: one match — `73:  $FirebaseSDKVersion = '11.6.0'` (line number may shift; match the content).

- [ ] **Step 2: Delete the override line**

Remove the entire line `$FirebaseSDKVersion = '11.6.0'` from `ios/Podfile`. Do not replace it with another version — RNFB 21.13 supplies Firebase iOS 11.10.0 via its podspec. Leave any surrounding comments only if they still make sense without the line; if the comment exclusively describes this override, remove it too.

- [ ] **Step 3: Verify the override is gone**

Run:

```bash
grep -n "FirebaseSDKVersion" ios/Podfile || echo "OVERRIDE REMOVED"
```

Expected: `OVERRIDE REMOVED`.

- [ ] **Step 4: Commit**

```bash
git add ios/Podfile
git commit -m "chore(ios): drop \$FirebaseSDKVersion override, let RNFB 21 manage Firebase SDK"
```

---

### Task 4: Align the Android Firebase BoM with RNFB 21.13

**Files:**

- Modify: `android/app/build.gradle:124`

- [ ] **Step 1: Confirm the current BoM pin**

Run:

```bash
grep -n "firebase-bom" android/app/build.gradle
```

Expected: `124:    implementation platform('com.google.firebase:firebase-bom:33.1.1')` (line may shift).

- [ ] **Step 2: Update the BoM to RNFB 21.13's tested version**

Change the version `33.1.1` to `33.11.0` so the line reads:

```gradle
    implementation platform('com.google.firebase:firebase-bom:33.11.0')
```

Rationale: RNFB 21.13's `sdkVersions.android.firebase` is `33.11.0`. We keep an explicit pin (rather than deleting it) so the manifest is self-documenting and matches RNFB's expectation exactly. Do not delete other `com.google.firebase:*` lines.

- [ ] **Step 3: Verify the edit**

Run:

```bash
grep -n "firebase-bom" android/app/build.gradle
```

Expected: shows `firebase-bom:33.11.0`.

- [ ] **Step 4: Commit**

```bash
git add android/app/build.gradle
git commit -m "chore(android): align firebase-bom to 33.11.0 for RNFB 21.13"
```

---

### Task 5: Install JS dependencies

**Files:**

- Modify: `package-lock.json` (regenerated by npm; do not hand-edit)

> Note: A PreToolUse hook blocks manual edits to lock files. `npm install` writing the lock is fine — just never open it in an editor.

- [ ] **Step 1: Clean the JS dependency tree and reinstall**

Run:

```bash
rm -rf node_modules
npm install
```

Expected: install completes without `ERESOLVE` peer-dependency errors. If `ERESOLVE` appears, capture the full message — do NOT add `--force`/`--legacy-peer-deps` reflexively; report it (likely another package pinning an old RNFB transitively).

- [ ] **Step 2: Verify the installed RNFB versions resolved to 21.13.x**

Run:

```bash
npm ls @react-native-firebase/app @react-native-firebase/firestore @react-native-firebase/auth 2>/dev/null | grep react-native-firebase
```

Expected: each resolves to `21.13.x`.

- [ ] **Step 3: Verify the firestore podspec now pins nanopb 3.x (the fix)**

Run:

```bash
grep -n "nanopb" node_modules/@react-native-firebase/firestore/RNFBFirestore.podspec
```

Expected: a `nanopb` line on the `3.x` line (e.g. `>= 3.30910.0, < 3.30911.0`) — NOT the old `2.30908.0` range. This is the direct confirmation the install-blocking conflict is resolved at the source.

- [ ] **Step 4: Verify RNFB's bundled Firebase iOS SDK version**

Run:

```bash
grep -n '"firebase"' node_modules/@react-native-firebase/app/package.json
```

Expected: `"firebase": "11.10.0"` under `sdkVersions.ios`.

- [ ] **Step 5: Commit the regenerated lock file**

```bash
git add package-lock.json
git commit -m "chore(mobile): regenerate package-lock for RNFB 21.13"
```

---

### Task 6: Install iOS Pods (the original failure point)

**Files:**

- Create: `ios/Podfile.lock` (regenerated by CocoaPods)

- [ ] **Step 1: Clear stale Pods state**

Run:

```bash
cd ios
rm -rf Pods Podfile.lock
```

Expected: removes any partial Pods install from the failed run.

- [ ] **Step 2: Install pods with repo update**

Run:

```bash
pod install --repo-update
```

Expected: `Pod installation complete!` with no `CocoaPods could not find compatible versions for pod "nanopb"` error.

> **Network flakiness heads-up:** Prior sessions saw the git clone of `BoringSSL-GRPC` / `StripePayments` stall during `pod install`. If this command hangs for >5 min with low CPU, abort it (`Ctrl+C`), and re-run `pod install` from a **plain terminal outside the agent** to avoid bandwidth contention. This is an environment issue, not a plan defect — the dependency graph itself is now satisfiable.

- [ ] **Step 3: Confirm nanopb + Firebase resolved in the lockfile**

Run:

```bash
grep -nE "nanopb|FirebaseCore \(|Firebase/Firestore" Podfile.lock | head
cd ..
```

Expected: `nanopb` resolves to a `3.30910.x` version and Firebase pods resolve to `11.10.x`.

- [ ] **Step 4: Commit the regenerated Podfile.lock**

```bash
git add ios/Podfile.lock
git commit -m "chore(ios): regenerate Podfile.lock with Firebase 11.10 / nanopb 3.x"
```

---

### Task 7: Static verification (TypeScript + Jest)

**Files:**

- None (verification only)

- [ ] **Step 1: TypeScript still compiles against RNFB 21 types**

Run:

```bash
npx tsc --noEmit
```

Expected: exits 0. RNFB 21 keeps namespaced type signatures, so no errors are expected. If errors appear, they will be in RNFB call sites — capture them; they indicate a type-level signature change to address (do not blanket-`@ts-ignore`).

- [ ] **Step 2: Unit tests pass (Firebase is mocked in `jest.setup.js`)**

Run:

```bash
npm test -- --watchAll=false
```

Expected: the suite passes as before. Firebase modules are mocked, so RNFB version changes should not affect test outcomes. If a mock references a removed export, capture it.

- [ ] **Step 3: Lint clean**

Run:

```bash
npm run lint
```

Expected: no new errors introduced by the upgrade.

---

### Task 8: iOS runtime smoke test

**Files:**

- None (manual runtime verification)

- [ ] **Step 1: Build and launch on the iOS simulator**

Run:

```bash
npx react-native run-ios
```

Expected: the app compiles, installs, and boots on the simulator without a native Firebase crash on startup.

- [ ] **Step 2: Exercise each Firebase surface used by the app**

Manually verify, watching Metro/Xcode logs for native exceptions:

- **Auth (84 sites):** sign in, observe `onAuthStateChanged` resolves a user.
- **Firestore (70 sites):** open a screen that reads a collection; confirm documents render and a write (e.g. profile edit) persists.
- **Functions (53 sites):** trigger one `httpsCallable` flow (e.g. a subscription/intergroup callable) and confirm it returns.
- **Messaging:** confirm FCM token retrieval doesn't throw on launch.
- **Storage:** load one image/asset backed by Storage.
- **Crashlytics/Analytics:** confirm no init errors in logs on startup.

Expected: all flows behave as on v18. Note any regression with the screen + log excerpt.

- [ ] **Step 3: Record the smoke-test result**

No code change. If all surfaces pass, proceed. If any fails, capture the failing surface, the log, and stop for triage (see Rollback below).

---

### Task 9: Android runtime smoke test

**Files:**

- None (manual runtime verification)

- [ ] **Step 1: Build and launch on the Android emulator**

Run:

```bash
npx react-native run-android
```

Expected: Gradle resolves `firebase-bom:33.11.0`, the app builds and boots without a native Firebase crash.

- [ ] **Step 2: Repeat the Firebase surface checks from Task 8 Step 2 on Android**

Expected: parity with iOS. Note any Android-only regression.

---

### Task 10: Finalize

**Files:**

- None (git only)

- [ ] **Step 1: Confirm all intended files are committed and tree is clean**

Run:

```bash
git status --short
git log --oneline chore/rnfirebase-v21-firebase11 -8
```

Expected: clean tree; log shows the Task 1-6 commits (manifest, Podfile, build.gradle, lockfiles).

- [ ] **Step 2: Push the branch (only when the user asks)**

Do not push automatically. When the user confirms, run:

```bash
git push -u origin chore/rnfirebase-v21-firebase11
```

---

## Rollback procedure (if a smoke test fails irrecoverably)

1. `git reset --hard <baseline SHA from Task 1 Step 3>`
2. `rm -rf node_modules ios/Pods ios/Podfile.lock`
3. `npm install`
4. `cd ios && pod install` — note this returns to the **original failing state** (the nanopb conflict). To get a working pre-upgrade build you must also restore the old override OR drop iOS to Firebase 10.x (the Option A path). Document why B was rolled back before retrying.

## Self-Review checklist (completed by plan author)

- **Coverage:** Every element of the recommended change set (RNFB bump, iOS override removal, Android BoM alignment, reinstall, verification) maps to Tasks 2-6 / 7-9. ✓
- **Placeholders:** None — every code/edit step shows exact content and exact commands with expected output. ✓
- **Consistency:** Single target version `21.13.0` used in every task; `33.11.0` BoM matches RNFB 21.13's `sdkVersions.android.firebase`; `11.10.0` iOS matches `sdkVersions.ios.firebase`. ✓
