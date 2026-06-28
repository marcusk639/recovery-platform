# E2E Report — Splash gate + offline-sync crash unblocked

**Date:** 2026-06-27
**Device:** E2E-iPhone — iPhone 17 Pro, iOS 26.5 (`809BD7B9-D9D5-45D2-AEA8-12F885F54407`)
**App:** com.rats.dev (Debug, IS_E2E_TEST=1, JS served by Metro :8081)
**Backend:** Firebase emulators — Firestore :8080, Auth :9099 (Storage :9199 still NOT running)
**Follows:** `2026-06-26-smoke-run.md` (smoke blocked at Splash auth gate)

## Outcome

**Smoke flow PASSES.** The app launches, leaves the Splash screen, renders the
`DataProvider` tree without crashing, and reaches `initial-landing-screen`. Deep
navigation is confirmed working: a subsequent run reached `initial-landing-screen`
→ `sign-in-button` → `login-screen` (all COMPLETED) before hitting a separate
deeper issue (see Remaining).

Two distinct blockers were found and fixed.

## Blocker 1 — Splash auth gate (commit 8a3a751)

`withSplash` gated `appIsReady` on `user || invitation`. A clean E2E launch has
neither, so readiness depended on anonymous login populating a user — but anon
sign-in errors against the Auth emulator, trapping the app on Splash forever and
gating all flows.

**Fix:** treat a _resolved_ auth state as ready — `user || invitation ||
loginFailed`. Anonymous login still runs in the background (`loginIfNecessary`),
but the unauthenticated landing/browse experience is no longer gated behind it.
Regression test added for the `loginFailed → wrapped-component` path (17/17 green).

## Blocker 2 — offline-sync render crash (commit 5de258f)

Once past Splash, the app reached `DataProvider` and crashed:
`useFlushOfflineQueue is not a function` (`useOfflineSync.ts:61`).

**Root cause (traced via the served Metro bundle, not guessed):**
`useOfflineSync` does `require('@react-native-community/netinfo')` — a package
intentionally NOT installed. Metro statically collects that literal require as a
dependency slot it cannot resolve, drops it from the module's dependency map, and
shifts every sibling import after it. As a result the static `useFlushOfflineQueue`
import (local index 6) resolved through the short depMap to the `offlineQueue`
module (global id 1778), which has no such export → `undefined` → "is not a
function". The existing try/catch guarded a _runtime_ throw but not Metro's
_build-time_ dependency-map corruption.

Verified at the bundle level: module 1774 (`useOfflineSync`) depMap was
`[3,83,16,41,1,1775,1778]` (7 entries for 8 local indices). After the fix the
netinfo slot is gone and the flush-hook call site resolves to module 1775
(`useFlushOfflineQueue.ts`) correctly.

**Fix:** alias `require` to a value so Metro's static collector cannot see the
call. (A `const` string specifier is insufficient — Metro constant-folds it.) The
dependency map stays intact; the aliased require still throws at runtime for the
absent package and is caught. Also repaired the pre-existing `useOfflineSync` test
suite (14/14 failing since 6e0d615): its `jest.mock` targeted the old
`activityQueries` path instead of the extracted `useFlushOfflineQueue` module.

## Remaining (separate workstream)

- **Full 13-flow suite not yet green.** First deeper failure: on `guest-home`, the
  `login-screen` mounts but `email-input` (in `LoginFormView`) is not found within
  the tap timeout — the Login form inputs don't render in time. Needs its own
  investigation.
- **Seed data.** Guest/operator persona flows require `reset-and-seed.sh`
  (`maestro/seed-e2e-users.js`) to populate Auth + Firestore before each run.
- **Storage emulator (:9199) still down.** Any flow touching Storage will fail
  until it is started alongside firestore/auth.
- **Harness flakiness (environmental).** The XCUITest driver intermittently fails
  to connect (`Failed to connect to 127.0.0.1:<port>`) on back-to-back runs; a
  simulator reboot before a run clears it. Not app-related.

## Verification commands

```bash
# Metro (fresh cache once, then warm):
npx react-native start --reset-cache

# Smoke (passes):
maestro test -e APP_ID=com.rats.dev maestro/flows/smoke.yaml

# Unit:
npx jest src/screens/Splash src/hooks/useOfflineSync   # 17/17 + 14/14
```
