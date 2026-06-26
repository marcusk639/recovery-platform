# E2E Readiness Report — Regroup (Maestro)

**Date:** 2026-06-26
**Scope:** Pre-run preparation after PR #36 merged to `main`. Static validation +
backend-harness verification. **On-device flow execution was NOT run** — see Blocker.
**App version:** regroup-mobile (codename `rats`), `com.rats.dev` (iOS debug)

## Summary

| Area                                       | Status                                            |
| ------------------------------------------ | ------------------------------------------------- |
| Maestro CLI                                | ✅ 2.6.0 installed                                |
| Firebase CLI                               | ✅ 15.19.0                                        |
| JDK 21 (emulator)                          | ✅ present                                        |
| Flow YAML validity                         | ✅ 16/16 valid (14 flows + 2 subflows)            |
| testID coverage (flow → source)            | ✅ 64/64 referenced testIDs resolve (1 gap fixed) |
| Backend harness (emulator → seed → assert) | ✅ verified end-to-end                            |
| **iOS simulator run**                      | ⛔ **BLOCKED — no iOS runtime installed**         |

## Pre-flight

```
maestro --version              → 2.6.0
firebase --version             → 15.19.0
xcrun simctl list runtimes     → NO iOS RUNTIME
xcrun simctl list devices      → (no iPhone/iPad simulators)
JDK 21                         → present
```

## Static validation (sim-independent)

- **YAML:** all 16 `maestro/flows/*.yaml` + `maestro/subflows/*.yaml` parse cleanly.
- **testID cross-check:** extracted all 64 static `id:` selectors referenced by the
  flows and verified each exists in `src/` (literal or dynamic `${...}` template).
  - 4 of the initially-flagged 5 were dynamic IDs with real source templates
    (`activity-item-${id}`, `app-row-${id}`, `dispute-item-${id}`,
    `edit-house-button-${house.id}`).
  - **1 real gap found + fixed:** `guest-payment-history.yaml` asserts
    `payment-history-screen` and `payment-history-empty`, but `PaymentHistory.tsx`
    (the screen `payment-history-card` navigates to) had neither — only
    `payment-row-${id}` / `export-csv-button`. Added `testID="payment-history-screen"`
    to the root view and `testID="payment-history-empty"` to the empty state
    (additive, no behavior change). Without this the flow would have failed at the
    first `assertVisible`.

## Backend harness (sim-independent, verified)

Brought up the Firestore + Auth emulators from `regroup/mobile/firebase/`
(the canonical config — it carries both the `emulators` block and `firestore.rules`;
the `regroup/` root and `regroup/mobile/firebase.json` are not the right ones).

- **Seed:** `node e2e/setup/seedTestData.js` → all fixtures created (test houses,
  Oxford house + oxford-enabled operator, guests/activities, 3 disputes, 1 pending
  application).
- **Assert (`assert-firestore.js`):** all PASS —
  - `houses/test-house-123` → `id=test-house-123`
  - `houses/test-house-oxford` → `houseType=oxford`, `oxfordOnboardingComplete=true`
  - `houses/test-house-123/applications/test-app-1` → `status=pending`
  - `disputes/test-dispute-123` → `status=pending`

This confirms the emulator-switch + persistence-assertion loop (the part of task (c)
that does not need a simulator) works end-to-end.

### Note: seed/assert project id

`seedTestData.js` hardcodes `projectId: 'phoenix-cleanhouse'` and
`assert-firestore.js` defaults to the same. This is correct and consistent with the
app (which connects to the emulator under its real `phoenix-cleanhouse` project id in
`IS_E2E_TEST` mode) — but it means the emulator MUST be queried under
`phoenix-cleanhouse`, NOT a `demo-*` project. If you start the emulator with
`--project demo-*`, the seed still writes to the `phoenix-cleanhouse` namespace; query
it with `GCLOUD_PROJECT=phoenix-cleanhouse`.

## Blocker — on-device run

There is **no iOS simulator runtime installed** (`xcrun simctl list runtimes` →
no iOS; zero iPhone simulators). Android is not an option either — the `IS_E2E_TEST`
launch arg is iOS-only (NSUserDefaults), unimplemented on Android.

**To unblock (one-time, interactive / large download):**

1. Install an iOS runtime: Xcode → Settings → Components → download an iOS platform
   (or `xcodebuild -downloadPlatform iOS`; multi-GB, may need sudo / interactive auth).
2. Create + boot a simulator: `xcrun simctl create "iPhone 15" <devicetype> <runtime>`
   then `xcrun simctl boot "iPhone 15"` (or open Simulator.app).
3. Then run task (c) per `NEXT-SESSION.md`:
   - Terminal A: `cd regroup/mobile/firebase && firebase emulators:start --only firestore,auth`
     (JDK-21 PATH) → `cd regroup/mobile && npm run seed-e2e`
   - Terminal B: `npm run ios` (builds + installs the debug app on the booted sim)
   - `npm run maestro:smoke:ios` (asserts `initial-landing-screen`) → `assert-firestore`
     to prove the emulator switch engaged → `npm run maestro:ios` for the full suite.

## Recommendations / next steps

1. **Install the iOS runtime** (above) — the single remaining blocker to a live run.
   Everything else is green and waiting.
2. Once a sim is up, the highest-value first step is `maestro:smoke:ios` + an
   `assert-firestore` read — proves the whole harness before running the 14-flow suite.
3. Carry-over known gotchas (from `NEXT-SESSION.md`, still apply): `login.yaml`
   `hideKeyboard` may mistype on iOS; `guest-rent-payment.yaml` stops before Stripe
   (not emulated); seeded activities are keyed by account-id while guest docs are keyed
   by Auth uid — `guest-home`/`activity` data asserts may read empty until the seed
   keys activities by uid.
