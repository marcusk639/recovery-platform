# Security note — E2E test credentials

**Severity: HIGH (production exposure).** Status: literal removed from the repo
(2026-10-20); **pending user rotation** of the accounts that used it.

## The issue

A shared e2e test password was committed to this repository in dozens of tracked
files (seed fixtures, READMEs, docs, and every Maestro flow/subflow). The same
password also unlocked the test personas in the **real `phoenix-cleanhouse`**
and **`homegroups-e2e`** Firebase projects, because the local helper scripts
provisioned those accounts using the same hardcoded constant.

## Current state

- The literal has been removed from every tracked file at `HEAD`. It remains in
  **git history** and must be treated as **compromised**. Do not reuse it
  anywhere, and do not rely on history rewriting to contain it.
- Every runner now reads the password from the `E2E_TEST_PASSWORD` environment
  variable and fails fast when it is unset. There is no committed fallback.
- Production and e2e Firebase test accounts that used the old value must be
  rotated (or deleted) by the user. Status: **pending user rotation**.

## Where the new password lives

Never commit it. It is stored outside the repo:

- Regroup: `~/.config/regroup-e2e/e2e-test-password`
- Homegroups: `~/.config/homegroups-e2e/e2e-test-password`
- CI: repository secret `E2E_TEST_PASSWORD`

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
- `e2e/screenshots.e2e.ts` and `homegroups/scripts/seed-e2e.js` read
  `process.env.E2E_TEST_PASSWORD` and throw if it is unset.
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
