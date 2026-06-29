# Security note — E2E test credentials

**Severity: HIGH (production exposure).** Status: needs manual rotation in the
Firebase Console (see checklist).

## The issue

The E2E test password `TestPassword123!` is committed to the repository in **18
tracked files** (the seed fixture, the README, and every Maestro flow/subflow —
full list at the bottom). That password also unlocks the same test personas in
the **real `phoenix-cleanhouse` Firebase project**, because the local helper
`scripts/create-e2e-auth-users.js` (untracked) provisions those accounts in
production using the real `service-key.json` and the same hardcoded constant
(`const PASSWORD = 'TestPassword123!'`).

Net effect: anyone with read access to this repo has the production password for
the test personas — including `test-manager@rats-e2e.com`, which carries an
`admin` role claim.

## Risk assessment

- **Real exposure:** production test accounts in `phoenix-cleanhouse` are
  reachable with a repo-public password. Blast radius is bounded (scoped test
  personas, gated by Firestore rules), but the `admin` persona is non-trivial.
- **Not exposed:** the production **service-account key** (`service-key.json`)
  is gitignored and not in version control. The prod-writer scripts
  (`create-e2e-auth-users.js`, `seed-e2e-users.js`) are also untracked.
- **Emulator-only side:** the committed password unlocking the **local
  emulator** personas is low-risk on its own — those are throwaway accounts in a
  local Firebase emulator. The problem is the _reuse_ of that password for
  production, not the commit itself.

## Why we did NOT just gitignore `testAccounts.json`

Removing one file from tracking does not remove the secret: the same password is
committed in 17 other tracked files (every login flow). Gitignoring
`testAccounts.json` would give false assurance and break seeding on fresh clones
without reducing exposure. The effective fix is to **decouple production from the
committed test password and rotate production**, below.

## Remediation checklist

1. **Rotate or remove the production test accounts** (do this first):
   - In the Firebase Console for `phoenix-cleanhouse` → Authentication, either
     **delete** the `*@rats-e2e.com` test users (preferred — they should not live
     in production), or **reset their passwords** to a value that is NOT in the
     repo.
2. **Decouple the prod-writer from the committed password.** Change
   `regroup/mobile/scripts/create-e2e-auth-users.js` to require an env var with
   no committed default, so the repo password can never be pushed to prod again:

   ```js
   // before
   const PASSWORD = 'TestPassword123!';

   // after
   const PASSWORD = process.env.E2E_PROD_PASSWORD;
   if (!PASSWORD) {
     console.error(
       'Set E2E_PROD_PASSWORD (do not reuse the committed emulator password).',
     );
     process.exit(1);
   }
   ```

   Run it as: `E2E_PROD_PASSWORD='…' node scripts/create-e2e-auth-users.js`.

3. **Keep the emulator password committed — but only the emulator.** The
   `TestPassword123!` value in `testAccounts.json` and the Maestro flows is fine
   to keep in the repo _as long as it is never reused for a real project_. It
   only needs to satisfy Firebase's minimum password policy for the local
   emulator. Do not "rotate" it casually: it is coupled across 18 files (see
   below), so changing it means updating all of them together.
4. **Confirm guards stay in place:**
   - `service-key.json` remains gitignored (verify: `git check-ignore regroup/mobile/scripts/service-key.json`).
   - `reset-and-seed.sh` continues to call `seedTestData.js` (emulator) and
     **never** `create-e2e-auth-users.js` (prod).

## Where the emulator password lives (the coupled set)

If you ever change the emulator test password, update all of these together:

```
e2e/setup/testAccounts.json          # the seed fixture (source of truth)
e2e/README.md
e2e/screenshots.e2e.ts
maestro/subflows/login.yaml
maestro/flows/signup.yaml
maestro/flows/debug-login.yaml
maestro/flows/guest-home.yaml
maestro/flows/guest-log-chore.yaml
maestro/flows/guest-activity-dispute.yaml
maestro/flows/guest-payment-history.yaml
maestro/flows/guest-rent-payment.yaml
maestro/flows/operator-setup-wizard.yaml
maestro/flows/operator-applications.yaml
maestro/flows/operator-manage-guests.yaml
maestro/flows/operator-house-settings.yaml
maestro/flows/operator-disputes.yaml
maestro/flows/oxford-dashboard.yaml
maestro/flows/oxford-onboarding.yaml
```

A cleaner long-term design is to have the flows read the password from a Maestro
env var (`-e PASSWORD=…`) sourced from `testAccounts.json`, so there is a single
source of truth — but that is a refactor, not a security fix.
