---
name: homegroups-test-rules
description: Run Firestore and Storage security rules tests for homegroups via the Firebase emulator. Use when asked to test security rules, verify firestore.rules or storage.rules, or check rules changes before deploying them.
---

> **Unit:** `homegroups/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/homegroups"` first.
# Test Security Rules (homegroups)

Security rules changes affect every user, so root `CLAUDE.md` classes this as Tier A.

All paths are relative to `homegroups/` (the directory containing `firebase.json`).
If your shell is elsewhere: `cd "${CLAUDE_PROJECT_DIR}/homegroups"`.

## Do NOT start an emulator first

`test:rules` is `firebase emulators:exec --only firestore 'npm run test'`.
`emulators:exec` **starts its own emulator, runs the command, then tears it down.**
Starting one yourself beforehand makes the run fail with a port-8080 conflict.

So the prerequisite is the opposite of what it looks like: **port 8080 must be FREE.**

## Steps

1. **Confirm 8080 and 9199 are free** — abort if either is held:

   ```bash
   for p in 8080 9199; do
     if lsof -iTCP:$p -sTCP:LISTEN -t >/dev/null 2>&1; then
       echo "PORT $p BUSY — stop that emulator first (see .claude/skills/monorepo-run-check)"
     else
       echo "port $p free"
     fi
   done
   ```

   If a port is busy, resolve the owner before continuing — another product's
   emulator on 8080 would otherwise be tested against instead of this one's rules.

2. **Run the Firestore rules tests:**

   ```bash
   cd functions && npm run test:rules -- --testPathPattern=security-rules
   ```

3. **Run the Storage rules tests** — a separate emulator, so it is a separate run:

   ```bash
   cd functions && npm run test:rules:storage -- --testPathPattern=security-rules-storage
   ```

4. **Report results**: pass/fail counts per suite, and the specific assertions that failed.

## Notes

- Test files: `functions/src/tests/security-rules.test.ts` (Firestore) and
  `functions/src/tests/security-rules-storage.test.ts` (Storage). They use
  `@firebase/rules-unit-testing`.
- **Without the `--testPathPattern` filter, `test:rules` runs the ENTIRE Jest suite
  inside the emulator** (`test:rules` → `npm run test` → `jest --detectOpenHandles`),
  which is much slower and reports counts for every test, not just rules.
- Rules sources are `firestore.rules` and `storage.rules`, both in `homegroups/`.
- **Passing tests do not mean the rules are live.** `storage.rules` has been fixed
  but left undeployed before. After tests pass, deploy and verify:

  ```bash
  firebase deploy --only firestore:rules,storage --project recovery-connect-cad4b
  ```

  `homegroups/.firebaserc` also defines an `e2e` alias (`homegroups-e2e`), so always
  pass `--project` explicitly rather than trusting ambient `firebase use` state.
