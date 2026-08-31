# E2E Test Report — iOS Simulator Pipeline Bring-Up

**Date:** 2026-07-17 18:55
**Device:** iPhone 17 simulator — iOS 26.5
**Toolchain:** Xcode 26.5, React Native 0.72.9, Maestro
**App:** Homegroups (`org.recoveryconnect`) → Firebase `recovery-connect-cad4b` (**production**)
**Goal of this run:** stand up the iOS E2E pipeline from a freshly-migrated Mac and validate it end-to-end with a safe, read-only smoke flow.

## Headline

The Homegroups iOS app **had never been buildable on this toolchain** — its committed dependency graph is internally inconsistent (RN 0.72.9 pinned with React Navigation 7 + react-native-screens 4, which require RN ≥ 0.82 / New Architecture). Getting to a passing smoke test required fixing a chain of native-build, dependency, linker, JS-runtime, and test-addressability issues. All are now fixed and the pipeline is validated.

## Results

| #   | Flow                                                                                                                   | Status      | Notes                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 01  | `smoke-app-boot` (safe, read-only)                                                                                     | **PASS**    | 11/11 steps: launch → skip onboarding → Create Account → AuthModal signup fields → Login tab → login fields. Zero writes. |
| —   | 7 persona flows (signup, group-creation, conscience-vote, invite-join, qr-checkin, admin-claim-pay, treasurer-handoff) | **BLOCKED** | Not run. Require seeded test data + a backend decision (see below).                                                       |

## Fixes applied to reach a green build + passing smoke

**Dependency graph (user-approved: align down to RN 0.72, not upgrade RN):**

- Downgraded React Navigation 7 → 6 (`@react-navigation/native@^6.1.18`, `/stack@^6.4.1`, `/bottom-tabs@^6.6.1`, `/native-stack@^6.11.0`) and `react-native-screens` 4.25.2 → `~3.37.0`. App uses zero v7-only APIs, so blast radius is minimal.

**Native build (Xcode 26.5 vs RN 0.72), in `ios/Podfile` / project:**

1. Yoga UDL `operator"" _pt` rejected by new clang → `-Wno-deprecated-literal-operator` on the Yoga target.
2. stripe-react-native 0.45.0 stale `STPPaymentStatus` header (NSUInteger vs NSInteger) → `patches/@stripe+stripe-react-native+0.45.0.patch`.
3. Removed deprecated `-Wl,-ld_classic` from the app target.
4. FirebaseFirestore abseil link failure → forced `CLANG_CXX_LANGUAGE_STANDARD=c++17` on **all** Pods targets (FirebaseFirestoreInternal pinned c++14 vs abseil c++17 → ABI-incompatible `absl::string_view`). Removed a stray unused SPM `firebase-ios-sdk` reference.

**JS runtime:** 5. Stale Metro cache after dep changes → restart with `--reset-cache`. 6. Missing `.env` (gitignored, lost in Mac migration) → `initStripe` got `undefined` publishable key → stripe-react-native force-cast `as! String` **crashed the app at launch**. Created a local gitignored `.env` with a **placeholder** `pk_test_` key to unblock. **Real homegroups `pk_test_` + Google Maps keys still required for payment E2E and real builds.**

**Test addressability:** 7. RN flattens the limited-mode home screen into one merged accessibility blob, so the "Sign in"/"Create Account" CTAs aren't matchable by visible text. Added `testID="limited-mode-create-account-button"` and `testID="limited-mode-signin-link"` in `MainTabNavigator.tsx`.

## Blocker for the persona suite: backend + seeded test data

The iOS build points at **production** Firebase (`recovery-connect-cad4b`). The 7 persona flows are **write-heavy** (create groups, cast votes, claim/pay, check in) and require pre-seeded personas (`test-admin@…`, `test-unclaimed-member@…`, `test-treasurer@…`) that do not exist in prod. Running them live would (a) fail at login for the seeded personas, and (b) pollute production data. The app has **no Firebase-emulator wiring**, so emulators aren't a cheap option. Decision required — see `maestro/CI-CLOUD-SETUP.md §0-1`:

- **A. Dedicated `homegroups-e2e` Firebase project** — debug-variant `GoogleService-Info.plist`, deploy rules/functions/indexes, seed personas. Clean isolation; more setup.
- **B. Disposable seeded accounts in prod** — a seeding script creates the 3 personas + required group state; accept + clean up prod writes; move the real password to a non-committed secret.

## Recommendations

1. Provide the real homegroups Stripe test publishable key + Google Maps key for `.env` (payment flows + real builds need them).
2. Decide A vs B above so the persona suite can run.
3. Update the shared login subflow + persona flows to tap `limited-mode-create-account-button` (testID) instead of the "Sign in" text.
4. Commit the native/dependency fixes — without them the app does not build on this toolchain (or in CI/Maestro Cloud).
