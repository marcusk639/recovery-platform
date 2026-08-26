# Next-Session Brief — Regroup E2E (Maestro)

**Branch:** `test/e2e-launch-prep` | **Working dir:** `regroup/mobile/`
**Context:** read `docs/e2e/reports/2026-06-27-staging.md` for full session findings.

---

## State as of 2026-06-27 (end of session)

### What's working

- ✅ Smoke: `initial-landing-screen` asserts PASS (9s) — Splash fix `8a3a751` confirmed
- ✅ offlineQueue Metro crash fixed (`b53de99`) — try/catch now runs; no more crash overlay
- ✅ `login.yaml` timing fix applied (`b53de99`) — `extendedWaitUntil email-input 10s`
- ✅ Firebase emulators running (Firestore :8080, Auth :9099, UI :4000)
- ✅ `E2E-iPhone` iOS 26.5 simulator exists (UDID `809BD7B9-D9D5-45D2-AEA8-12F885F54407`)
- ✅ App `com.rats.dev` installed (built 2026-06-27 12:37, has all fixes)
- ✅ Seed script works: `npm run maestro:seed` populates all test accounts + Oxford house + application

### Known remaining blocker

Local XCTest driver crashes after 2–4 sequential `maestro test` invocations
(`Connection refused` / `iOS driver not ready in time`). Requires kill + sim reboot
to recover. This prevents running the 14-flow suite one-file-at-a-time reliably.

---

## Task 1 — Create `maestro/flows/run-all.yaml` (TOP PRIORITY)

**Goal:** Chain all 14 flows in a single `maestro test` invocation so the XCTest
session is held open for the entire suite (no per-flow restart, no driver crashes).

**Pattern (from mobile-e2e skill `references/maestro-templates.md`):**

```yaml
# maestro/flows/run-all.yaml
appId: ${APP_ID}
tags:
  - suite
---
- runFlow: smoke.yaml
- runFlow: signup.yaml
- runFlow: guest-home.yaml
- runFlow: guest-log-chore.yaml
- runFlow: guest-activity-dispute.yaml
- runFlow: guest-payment-history.yaml
- runFlow: guest-rent-payment.yaml
- runFlow: operator-setup-wizard.yaml
- runFlow: operator-applications.yaml
- runFlow: operator-manage-guests.yaml
- runFlow: operator-house-settings.yaml
- runFlow: operator-disputes.yaml
- runFlow: oxford-dashboard.yaml
- runFlow: oxford-onboarding.yaml
```

**Steps:**

1. Create `maestro/flows/run-all.yaml` as above
2. Add `npm run maestro:suite:ios` script to `package.json`:
   `maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml`
3. Boot simulator if needed: `xcrun simctl boot 809BD7B9-D9D5-45D2-AEA8-12F885F54407`
4. Seed: `npm run maestro:seed`
5. Run: `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000 /Users/marcusklein/.maestro/bin/maestro test -e APP_ID=com.rats.dev maestro/flows/run-all.yaml 2>&1`
6. On first failure: check screenshot in `~/.maestro/tests/<latest>/` and fix
7. Produce report at `docs/e2e/reports/2026-06-27-suite.md`

**Also verify in this run:**

- `login.yaml` `extendedWaitUntil email-input` fix actually gets through credentials
- Optional: add `tapOn: text: "Dismiss"  optional: true` in `login.yaml` after
  login-screen appears to clear the Splash error toast before typing credentials

**Commit as:** `test(regroup-mobile): add run-all.yaml suite + verify login flow`

---

## Notes / gotchas carry-over

- `maestro/flows/` is excluded from workspace auto-run via `config.yaml` `flows: - flows/*`
  when run as a directory — it parallelizes and kills the driver. Always run via
  a single file (`run-all.yaml`) or with `-e APP_ID=...` on one file.
- Metro is running with `--reset-cache` (pid 48787); do NOT restart it unless it crashes.
- Firebase Functions emulator (:5001) is NOT running — flows touching callables will fail.
  `guest-rent-payment.yaml` intentionally stops before Stripe anyway.
- The `[OfflineQueue] warn` toast on the login screen is expected and harmless.
