# Task completion checklist

1. In each changed package: `npm test` (or `npm test -- --ci`), typecheck (`typecheck:ratchet` where present), `npm run lint` on changed files.
2. For mobile native changes: CI `maestro-smoke` / `homegroups-maestro-smoke` (`assembleDebug`) is the only Android build gate; iOS must be built on a Mac and stated as unverified otherwise.
3. Commit with hooks installed (pre-commit runs secret scan, 300-line rule, verify-diff). Never `--no-verify`.
4. pre-push runs `npm test` for changed recovery-api / detox-recovery / homegroups/functions / regroup/functions.
5. PR: description is the squash-commit record — list every behavioral/native change and intended test changes (test-tamper gate).
