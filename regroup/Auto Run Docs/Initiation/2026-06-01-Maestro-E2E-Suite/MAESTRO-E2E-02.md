# Phase 02: Auth Suite — Signup, Invite Signup, and Password Reset

With the login flow working, this phase completes authentication coverage by writing and validating three more flows: new user signup from scratch, invite-based signup (a guest accepting an email invite link), and the password reset request flow. These flows cover every entry point into the app. Each flow follows the same inspect-first pattern established in Phase 01 — use the Maestro MCP to observe real screen state before writing YAML, then run and fix until passing.

## Tasks

- [ ] Inspect and write `mobile/.maestro/auth/signup.yaml`:
  - Call `mcp__maestro__list_devices` and `mcp__maestro__inspect_screen` to observe the landing screen and the path to the signup screen
  - The Detox reference uses: `signup-screen`, `signup-email-input`, `signup-password-input`, `signup-first-name-input`, `signup-last-name-input`, `signup-button` — verify these testIDs are present or discover the actual selectors
  - Write the flow with `appId: com.rats.dev`, calling `../_helpers/launch.yaml` first
  - Happy path: navigate to signup, enter a unique timestamped email (`test-new-${timestamp}@rats-e2e.com`), fill all required fields, submit, assert post-signup screen loads (new-account-screen, house selection, or house-tab — use whichever appears first)
  - Validation path: submit with empty fields, assert at least one validation error is visible
  - Run via `mcp__maestro__run`, inspect failures, update and retry until the happy path passes

- [ ] Inspect and write `mobile/.maestro/auth/signup-via-invite.yaml`:
  - This flow covers a guest accepting an invite link. Based on the Detox reference (`signup-via-invite.test.js`), an invite arrives via email with a deep link into the app
  - Inspect the app to discover if there is an "Accept Invite" or "I have an invite code" path on the landing/login screens
  - Write the flow to navigate that path, enter the invite token/code (use a known test invite if one exists in the seed data, otherwise stub with a placeholder and document what seed data is needed)
  - If the deep-link path cannot be exercised without a real dynamic token, write the flow to cover the UI navigation up to the point of token entry, add a `# TODO: requires live invite token` comment at the token step, and mark the file with tag `@needs-seed-data`
  - Run the flow; any part that can be exercised should be validated

- [ ] Inspect and write `mobile/.maestro/auth/password-reset.yaml`:
  - Navigate to the login screen, tap the "Forgot password" link
  - The Detox reference uses: `forgot-password-link`, `forgot-password-modal`, `reset-email-input`, `send-reset-email-button` — verify or discover the actual selectors via inspect_screen
  - Happy path: enter `test-guest-a@rats-e2e.com`, submit, assert a success/confirmation message is visible
  - Invalid email path: enter `notanemail`, submit, assert a validation error is visible
  - Run via `mcp__maestro__run`, fix any selector mismatches, save the validated YAML

- [ ] Run the entire auth folder and confirm all three new flows execute without crashing:
  - `mcp__maestro__run` with `dir: mobile/.maestro/auth/` (or pass each file individually)
  - Any flow that cannot yet pass due to missing seed data or unimplemented UI should be tagged `@wip` using Maestro's tag syntax and have a clear `# TODO` comment explaining what is needed
  - Flows that are fully passing should have no `@wip` tag
  - Update `mobile/package.json` `test:maestro:auth` script if the folder path changed
