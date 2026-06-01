# Phase 03: GitHub Actions CI + Core Flow Coverage

There is currently zero CI for E2E tests — PRs merge with no automated check that the app even launches. This phase adds a GitHub Actions workflow that builds the iOS simulator binary and runs the full Detox suite on every PR, then rewrites the shallowest specs (which only assert element visibility) into real user-flow tests that would actually catch regressions. By the end, every PR gets automated E2E coverage and the five highest-value flows have behavioral assertions instead of just "element exists" checks.

## Tasks

- [ ] Create `.github/workflows/e2e-ios.yml` at the `homegroups/` level (or monorepo root if that's where CI lives — check for any existing `.github/` directory first with `find /Users/marcus/dev/recovery-platform -name "*.yml" -path "*/.github/*" 2>/dev/null`):
  - Trigger: `pull_request` targeting `main`, path filter `homegroups/mobile/**`
  - Runner: `macos-14` (Apple Silicon, has Xcode 15 + iOS simulators)
  - Steps:
    1. `actions/checkout@v4`
    2. `actions/setup-node@v4` with node version from `.nvmrc` or `18.x`
    3. Cache `node_modules` keyed on `mobile/package-lock.json`
    4. `npm ci` inside `homegroups/mobile/`
    5. Cache `ios/build` keyed on `ios/Podfile.lock`
    6. `cd ios && pod install` if cache miss
    7. `npm run test:e2e:build` to compile the simulator binary
    8. Boot iPhone 15 simulator explicitly before test run
    9. `npm run test:e2e:test` with env vars injected from GitHub Secrets:
       - `E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}`
       - `E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}`
    10. Upload Detox artifacts (screenshots, logs) via `actions/upload-artifact@v4` on failure
  - Add a `README` comment at the top of the workflow listing which GitHub Secrets must be configured

- [ ] Audit all 18 spec files for assertion quality and add a coverage gap comment to each weak spec:
  - Read every file under `e2e/screens/` and classify each `it()` block as:
    - **VISIBILITY** — only calls `waitForElement` (no interaction, no state assertion)
    - **NAVIGATION** — taps and asserts a new screen appears
    - **BEHAVIORAL** — interacts, mutates state, asserts the result
  - For each spec file, add a single-line comment block at the top listing counts, e.g.:
    `// Coverage: 3 visibility, 2 navigation, 0 behavioral — needs behavioral tests`
  - This becomes the roadmap for Phase 04 without requiring a separate analysis document

- [ ] Rewrite `e2e/screens/homegroup/groups.spec.js` with behavioral flow tests:
  - Keep existing visibility/navigation tests as-is
  - Add new `describe('Group Creation Flow')` block:
    - Creates a new group by tapping `group-list-create-button`, filling in group name, submitting
    - Asserts the new group appears in the list (`group-list` contains the new name)
    - Navigates into it and asserts `group-info-section` shows the correct group name
  - Add `describe('Join Group via Invite Code')` block:
    - Taps `group-list-invite-code-button`, enters a known test invite code from env (`E2E_TEST_INVITE_CODE`)
    - Asserts success state or error state depending on code validity
  - Add `E2E_TEST_INVITE_CODE` to `e2e/.env.e2e.example` with a comment

- [ ] Rewrite `e2e/screens/homegroup/group-overview.spec.js` with deeper behavioral assertions:
  - Keep existing navigation tests
  - Add `describe('Group Overview Content')` block:
    - After navigating into a group, assert the group name text is visible (not just the container)
    - Assert member count badge shows a number > 0
    - Navigate to Members via tile, assert at least one member row is visible, navigate back
    - Navigate to Announcements via tile, assert list or empty-state is visible, navigate back

- [ ] Rewrite `e2e/screens/messages/messages.spec.js` with a send-and-receive flow:
  - Before writing: read the current file to understand existing assertions
  - Add `describe('Send Message Flow')`:
    - Navigate to Messages tab, open first conversation thread
    - Type a unique message (include timestamp to avoid false matches): `Test message ${Date.now()}`
    - Tap send button
    - Assert the message text appears in `chat-message-list`
    - This is a true behavioral assertion — tests the send pipeline end-to-end

- [ ] Rewrite `e2e/screens/meetings/meetings.spec.js` with a meeting view flow:
  - Before writing: read the current file to understand existing assertions
  - Add `describe('Meeting List Interaction')`:
    - Navigate to a group's meetings section
    - Assert at least one meeting card is visible OR an empty-state element is visible
    - If meetings exist: tap the first meeting card, assert meeting detail view appears, assert time/location fields are visible
    - Navigate back and assert the meetings list is restored
