# Phase 04: Guest Management — Invitation, Stats, and Medication

This phase covers the manager's guest management workflows: inviting a new guest to the house, viewing a guest's recovery stats, and logging/reviewing medication. These flows require the manager to be logged in and a house to exist. The Detox reference files are `guest-invitation.test.js`, `guest-stats.test.js`, and `guest-medication.test.js`. The guest invitation flow is foundational — guest-stats and medication build on an existing guest record.

## Tasks

- [ ] Inspect and write `mobile/.maestro/guest/guest-invitation.yaml`:
  - Login as manager using `runFlow: ../_helpers/login-as-manager.yaml`, then navigate to the guest tab
  - Call `mcp__maestro__inspect_screen` on the guest list screen to discover the "Add Guest" button selector (the Detox reference notes this may need an `add-guest-button` testID on a header/nav element)
  - Known testIDs for the create guest form (from Detox reference): `create-guest-screen`, `guest-first-name-input`, `guest-last-name-input`, `guest-email-input`, `guest-phone-number-input`, `guest-sobriety-date-input`, `create-guest-button`
  - Write the happy path: navigate to guest tab → tap Add Guest → fill form (first: "E2E", last: "Guest", email: `test-new-guest@rats-e2e.com`, phone: `555-9999`) → submit → assert success (guest appears in list or success toast)
  - Write a validation path: submit with empty fields, assert at least one validation error
  - Run via `mcp__maestro__run`, fix using inspect_screen after each navigation step

- [ ] Inspect and write `mobile/.maestro/guest/guest-stats.yaml`:
  - Login as manager, navigate to guest tab, tap on the existing test guest (`test-guest-a@rats-e2e.com` / "Test GuestA") to open their profile
  - Call `mcp__maestro__inspect_screen` to discover the stats section element IDs (sobriety counter, days sober, compliance metrics, etc.)
  - Assert that key stats elements are visible on the guest detail/profile screen
  - If stats are behind a sub-tab (e.g., a "Stats" tab on the guest detail screen), navigate to it before asserting
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/guest/guest-medication.yaml`:
  - Login as manager, navigate to the guest detail screen for `test-guest-a@rats-e2e.com`
  - Call `mcp__maestro__inspect_screen` to discover the medication section: look for a "Medication" tab, "Add Medication" button, or similar entry point
  - Write the flow to: navigate to medication section → add a medication (name: "Vitamin D", dosage: "1000mg", frequency: "Daily") → assert the medication appears in the list
  - If a medication record already exists for the test guest, the flow should assert it is visible rather than creating a duplicate
  - Run via `mcp__maestro__run`, fix and save

- [ ] Update `mobile/package.json`:
  - `"test:maestro:guest"`: `"maestro test mobile/.maestro/guest/"`
