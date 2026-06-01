# Phase 03: Operator Flows — House Setup Wizard and Complete Setup

This phase covers the operator's primary onboarding journey: creating a new house through the 5-step setup wizard, then activating the house via the "Complete Setup" flow. These are the most structurally complex flows in the app (multi-step wizard with form data persisted across steps) and the most important for an operator's first-run experience. The Detox reference files are `house-setup.test.js` and `operator-complete-setup.test.js`. Use inspect_screen liberally between wizard steps — each step is a distinct screen.

## Tasks

- [ ] Prepare operator login helper and inspect the post-login operator screen:
  - Check whether `mobile/.maestro/_helpers/login-as-manager.yaml` correctly lands on the operator dashboard (org-setup-screen or house list). If the manager account (`test-manager@rats-e2e.com`) is already associated with a house, it may not land on the setup wizard — use a fresh operator account if one exists in the seed data, or document the precondition
  - Call `mcp__maestro__inspect_screen` after logging in as the manager to see what screen loads first
  - If a dedicated "new operator" account is needed (one with no houses), document the requirement in a `# NOTE:` comment inside the flow YAML

- [ ] Inspect and write `mobile/.maestro/operator/house-setup-wizard.yaml`:
  - The wizard has 5 steps: House Details → Manager Assignment → Phase Configuration → Chore Setup → Guest Setup
  - Use `mcp__maestro__inspect_screen` between each wizard step to capture actual element IDs before writing each step's YAML
  - Known testIDs from Detox reference: `org-setup-screen`, `add-house-button`, `house-setup-wizard`, `house-name-input`, `house-address-input`, `house-capacity-input`, `house-type-selector`, `next-step-button`, `previous-step-button`
  - Write the happy path: login as operator → tap Add House → fill Step 1 (name: "Serenity House E2E", address: "123 Main St, Los Angeles, CA 90001", capacity: "8") → tap Next → complete or skip Steps 2-5 (tap Next on each if optional fields allow) → assert wizard completes or returns to org-setup-screen
  - Add a validation path in a second scenario: tap Next on Step 1 without filling the name, assert an error or that the wizard does not advance
  - Run via `mcp__maestro__run`, fix failures step by step using inspect_screen after each tap

- [ ] Inspect and write `mobile/.maestro/operator/complete-setup.yaml`:
  - This flow covers the operator tapping "Complete Setup" after at least one house exists in their org
  - Known testIDs: `complete-setup-button` on the org-setup-screen
  - Precondition: the operator must have at least one house. If the house-setup-wizard flow from above fully completed and created a house, this flow can run after it. Use `runFlow` to call the wizard flow first if needed, or assume the test-manager account already has a house.
  - Write the flow: login as manager → navigate to org-setup or house list → tap Complete Setup → assert the main app loads (house-tab or a "setup complete" confirmation screen)
  - Run via `mcp__maestro__run`, fix and save

- [ ] Update `mobile/package.json` with operator test scripts:
  - `"test:maestro:operator"`: `"maestro test mobile/.maestro/operator/"`
