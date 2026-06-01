# Phase 06: Activities, RBAC, Utility Flows, and Suite Polish

This final phase completes the remaining test coverage areas — the activity system (logging and verifying activities), role-based access control (verifying that guests cannot access manager-only screens), meeting search, and profile update — then polishes the suite with a tag-based run strategy and a summary script. After this phase the Maestro suite is feature-complete and mirrors the full Detox reference coverage.

## Tasks

- [ ] Inspect and write `mobile/.maestro/activities/activity-system.yaml`:
  - Login as manager using `runFlow: ../_helpers/login-as-manager.yaml`
  - Call `mcp__maestro__inspect_screen` to discover the activities section (may be a tab, sub-section on the house screen, or a menu item)
  - Write the flow: navigate to activities → create a new activity (name/type, date, required attendance) → assert the activity appears in the activity list
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/activities/activity-verification.yaml`:
  - Login as guest using `runFlow: ../_helpers/login-as-guest.yaml`
  - Navigate to the activities list, find a pending activity, and mark attendance/verify the guest was present
  - Assert the activity status updates to verified/attended
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/rbac/authorization.yaml`:
  - This flow verifies that role boundaries are enforced in the UI — a guest account should not see manager-only controls
  - Login as guest, navigate through the main tabs, and assert that admin/manager-only screens or buttons (e.g., "Add Guest", "Manage House", "Create Dispute Response") are either not visible or not accessible
  - Login as manager, navigate the same screens, and assert that the manager controls ARE visible
  - The `test-multi-house@rats-e2e.com` account (admin on house-a, guest on house-b) can be used to verify role differences within the same account — document this in a YAML comment if used
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/utility/meeting-search.yaml`:
  - Login as guest or manager, navigate to the meeting search feature (Detox reference: `meeting-search.test.js`)
  - Call `mcp__maestro__inspect_screen` to discover the meeting search screen entry point and form fields
  - Write the flow: navigate to meeting search → enter a city or zip code → submit search → assert at least one meeting result appears
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/utility/profile-update.yaml`:
  - Login as guest, navigate to the profile/settings screen
  - Write the flow: tap profile → edit a field (e.g., phone number: `555-8888`) → save → assert the updated value is visible on the profile screen
  - Run via `mcp__maestro__run`, fix and save

- [ ] Finalize `mobile/package.json` scripts and add suite-level runners:
  - `"test:maestro:activities"`: `"maestro test mobile/.maestro/activities/"`
  - `"test:maestro:rbac"`: `"maestro test mobile/.maestro/rbac/"`
  - `"test:maestro:utility"`: `"maestro test mobile/.maestro/utility/"`
  - Ensure `"test:maestro:all"` runs all domain folders (exclude `_helpers/` by listing folders explicitly, or use `--exclude-tags wip` to skip incomplete flows)
  - Add `"test:maestro:smoke"` that runs only flows tagged `@smoke` — tag the login, house-setup-wizard, and guest-invitation flows with `tags: [smoke]` as the app's critical path

- [ ] Write a final suite validation run:
  - Call `mcp__maestro__run` with `dir: mobile/.maestro/` and `exclude_tags: [wip]`
  - Review the output: note pass/fail counts per domain in a YAML comment at the top of `mobile/.maestro/README.md`
  - For any flow that is still `@wip`, ensure the YAML has a `# TODO:` comment explaining the exact blocker (missing testID, missing seed data, unimplemented feature, etc.)
  - The suite is considered complete when: auth, operator, guest, resident, disputes, activities, rbac, and utility all have at least one non-wip passing flow
