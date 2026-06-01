# Phase 05: Resident Payment and Dispute System

This phase covers two financially sensitive flows: a resident submitting a rent/fee payment, and the full dispute lifecycle (create → respond → resolve). These are the highest-stakes user journeys in the app. The Detox reference files are `resident-payment.test.js` and `dispute-system.test.js`. Payments involve Stripe test cards — use Stripe's test card `4242 4242 4242 4242` with any future expiry and CVC. For disputes, both manager and guest perspectives are needed.

## Tasks

- [ ] Inspect and write `mobile/.maestro/resident/resident-payment.yaml`:
  - Login as guest using `runFlow: ../_helpers/login-as-guest.yaml` (uses `test-guest-a@rats-e2e.com`)
  - Call `mcp__maestro__inspect_screen` to discover the payment entry point from the guest's home screen (look for a "Payments", "Pay Rent", or "Fees" tab/button)
  - Write the flow to: navigate to the payment screen → select or confirm the amount to pay → enter Stripe test card details (card: `4242 4242 4242 4242`, expiry: `12/28`, CVC: `123`, zip: `90210`) → submit payment → assert a success/confirmation message or receipt screen appears
  - If the payment form opens a Stripe-hosted sheet (a native modal overlay), use `tapOn` with the text labels Stripe uses ("Card Number", "Expiration Date", "Security Code") — do NOT use testIDs for Stripe's hosted elements
  - Add a failure path: enter a declined card (`4000 0000 0000 0002`), assert an error message is displayed
  - Run via `mcp__maestro__run`, fix and save; note any Stripe-specific interaction quirks in YAML comments

- [ ] Inspect and write `mobile/.maestro/disputes/create-dispute.yaml`:
  - Login as guest, navigate to the disputes section (call `mcp__maestro__inspect_screen` to discover the path)
  - Write the flow: tap "Create Dispute" or equivalent → fill in dispute details (title/subject and description) → submit → assert the dispute appears in the dispute list with a "pending" or "open" status
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/disputes/respond-dispute.yaml`:
  - Login as manager using `runFlow: ../_helpers/login-as-manager.yaml`
  - Navigate to the dispute the guest created (or a pre-existing test dispute if one exists in seed data)
  - Write the flow: find the open dispute → tap to view it → enter a manager response → submit the response → assert the response appears on the dispute detail screen
  - Run via `mcp__maestro__run`, fix and save

- [ ] Inspect and write `mobile/.maestro/disputes/resolve-dispute.yaml`:
  - Login as manager, navigate to the open dispute
  - Write the flow: open the dispute → tap "Resolve" or equivalent → confirm resolution → assert the dispute status changes to "resolved" or "closed"
  - Run via `mcp__maestro__run`, fix and save

- [ ] Update `mobile/package.json`:
  - `"test:maestro:resident"`: `"maestro test mobile/.maestro/resident/"`
  - `"test:maestro:disputes"`: `"maestro test mobile/.maestro/disputes/"`
