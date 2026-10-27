# Security note — E2E test credentials

**Severity: HIGH at discovery; now resolved.** The literal was removed from the
repo and the affected accounts were rotated on 2026-10-20.

## The issue

A shared e2e test password was committed to this repository in dozens of tracked
files (seed fixtures, READMEs, docs, and every Maestro flow/subflow). The same
password unlocked the Homegroups test personas in the `homegroups-e2e` Firebase
project. An earlier version of this note said the Regroup personas
(`*@rats-e2e.com`, `operator@example.com`) also existed in production
`phoenix-cleanhouse`. A lookup on 2026-10-20 found none of them there, and none
of the Homegroups personas in production `recovery-connect-cad4b`.

## Current state

- The literal has been removed from every tracked file at `HEAD`. It remains in
  **git history** and must be treated as **compromised**. Do not reuse it
  anywhere, and do not rely on history rewriting to contain it.
- Every runner now reads the password from the `E2E_TEST_PASSWORD` environment
  variable and fails fast when it is unset. There is no committed fallback.
- 2026-10-20: the four `@homegroups-e2e.com` accounts in `homegroups-e2e` were
  given a new random password. No other project had any of the accounts.

## Where the new password lives

Never commit it. It is stored outside the repo:

- Regroup: `~/.config/regroup-e2e/e2e-test-password`
- Homegroups: `~/.config/homegroups-e2e/e2e-test-password`
- CI: the repository secrets `REGROUP_E2E_TEST_PASSWORD` and
  `HOMEGROUPS_E2E_TEST_PASSWORD`. Each Maestro job maps its secret to `E2E_TEST_PASSWORD`.

Local use:

```bash
export E2E_TEST_PASSWORD="$(cat ~/.config/regroup-e2e/e2e-test-password)"
```

## How each runner receives it

- Maestro flows pass `PASSWORD: ${E2E_TEST_PASSWORD}` to `subflows/login.yaml`
  (and type `${E2E_TEST_PASSWORD}` directly in signup/debug flows). Maestro
  resolves it from `-e E2E_TEST_PASSWORD=...` on the command line.
- `regroup/mobile` `maestro:*` npm scripts and `maestro/scripts/run-flows.sh`
  require `E2E_TEST_PASSWORD` and forward it with `-e`.
- `homegroups/scripts/seed-e2e.js` reads `process.env.E2E_TEST_PASSWORD` and
  throws if it is unset.
- `e2e/setup/testAccounts.json` no longer carries a password field; consumers
  must take it from `E2E_TEST_PASSWORD`.
- CI (`maestro-smoke` jobs) injects `${{ secrets.E2E_TEST_PASSWORD }}` via the
  Maestro Cloud action `env` input.

## Rotation checklist (user)

1. In the Firebase Console for `phoenix-cleanhouse` and `homegroups-e2e`
   Authentication, **delete** the e2e test users (preferred for production) or
   **reset their passwords** to the new value.
2. Store the new value at the paths above and in the `E2E_TEST_PASSWORD` CI
   secret.
3. Keep prod-writer scripts (`create-e2e-auth-users.js`, untracked) reading the
   password from the environment, never a literal.
4. Confirm `service-key.json` stays gitignored
   (`git check-ignore regroup/mobile/scripts/service-key.json`).
