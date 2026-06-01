# Phase 04: Test Reliability, QR Check-In & Subscription Flows

With CI running and core flows covered, the final phase hardens the suite against flakiness and adds coverage for the two most complex — and highest-risk — features: QR code meeting check-in and Stripe subscription checkout. Flaky tests erode trust faster than missing tests, so retry logic and failure screenshots come first. The QR and subscription flows follow because they involve multi-step state changes that are impossible to validate with visibility checks alone.

## Tasks

- [ ] Add retry wrapper and automatic failure screenshots to `e2e/helpers.js`:
  - Add `async retryAction(fn, maxAttempts = 3, delayMs = 500)` — wraps any async action, retries on throw with exponential backoff, re-throws after `maxAttempts`
  - Add `async captureScreenshot(name)` — calls `device.takeScreenshot(name)` with a timestamp suffix so screenshots don't overwrite each other: `device.takeScreenshot(\`${name}-${Date.now()}\`)`
  - Update `waitAndTap` and `waitAndType` in helpers to use `retryAction` internally (keeps all call sites clean)

- [ ] Add global `afterEach` failure hook to `e2e/init.js`:
  - After each test, check `jasmine.currentSpec.failedExpectations.length > 0` (or the Detox adapter equivalent)
  - On failure: call `helpers.captureScreenshot(jasmine.currentSpec.fullName.replace(/\s+/g, '-'))`
  - This gives every CI failure a screenshot without modifying any individual spec file

- [ ] Add emulator state reset between test files:
  - In `e2e/init.js` `beforeAll` (which runs once per spec file in Detox's Jest runner), when `USE_EMULATOR=true`, call the Auth emulator clear-accounts endpoint: `DELETE http://localhost:9099/emulator/v1/projects/{projectId}/accounts`
  - Add `E2E_FIREBASE_PROJECT_ID` to `e2e/.env.e2e.example` (needed for the emulator REST path)
  - Re-seed the test user after clearing so each spec file starts with a clean, known auth state

- [ ] Write `e2e/screens/homegroup/qr-checkin.spec.js` — QR code meeting check-in flow:
  - Before writing, read `src/screens/homegroup/MeetingQRCodeScreen.tsx` to understand testId attributes used
  - Also read `mobile/CLAUDE.md` QR Check-In section for the deep link format and trust model
  - Test structure:
    - `describe('QR Code Check-In')` with `beforeAll` that logs in and navigates to a group with a meeting scheduled today
    - `it('should display QR code for today\'s meeting')`: navigate to Secretary Toolkit → Meeting QR Code screen, assert `qr-code-image` (or equivalent testId) is visible
    - `it('should show live attendee count')`: assert attendee count element is visible and contains a numeric value
    - `it('should check in via deep link')`: use `device.openURL({ url: 'recoveryconnect://checkin?groupId=TEST_GROUP_ID&meetingId=TEST_MEETING_ID&date=TODAY' })` with env vars `E2E_TEST_GROUP_ID` and `E2E_TEST_MEETING_ID`; assert app returns to group screen without crash
  - Add `E2E_TEST_GROUP_ID`, `E2E_TEST_MEETING_ID` to `e2e/.env.e2e.example`

- [ ] Write `e2e/screens/subscription/subscription.spec.js` — Stripe group subscription flow:
  - Before writing, read `e2e/screens/admin/admin.spec.js` to understand existing admin test patterns
  - This flow uses Stripe test mode — requires a test account with no active subscription
  - Test structure:
    - `describe('Group Admin Subscription')` with `beforeAll` that logs in as an admin user who has no active subscription (use a separate env var `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` for a second test fixture account)
    - `it('should show subscription prompt for unsubscribed admin')`: navigate to group settings or admin area, assert subscription-prompt or paywall element is visible
    - `it('should navigate to checkout')`: tap the subscribe/upgrade button, assert the Stripe payment sheet or web checkout loads (assert a payment-related screen testId or web view appears)
    - Note at top of file: full Stripe checkout completion is not automated (requires real card interaction in native payment sheet); this test covers the entry path only
  - Add `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` to `e2e/.env.e2e.example` with a comment explaining this account needs no active subscription

- [ ] Final sweep: update `e2e/README.md` with the complete picture:
  - Add **Test Accounts** section explaining the two fixture accounts (`E2E_TEST_EMAIL` = regular member, `E2E_ADMIN_EMAIL` = group admin without subscription)
  - Add **Failure Artifacts** section: where Detox saves screenshots on failure locally (`artifacts/`) and in CI (GitHub Actions artifact panel)
  - Add **Adding New Tests** section: checklist reminding future authors to (1) use `helpers.retryAction` for flaky interactions, (2) avoid hardcoding any credentials, (3) add new env vars to `.env.e2e.example`
