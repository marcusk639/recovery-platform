---
name: regroup-run-migration
description: Safely run a Firestore migration script. Enforces build → dry-run → confirm → live sequence. Never skip the dry-run.
disable-model-invocation: true
---

> **Unit:** `regroup/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup"` first.
# Run Migration

Safely execute a Firestore migration script using the enforced sequence:
**build → dry-run → review output → confirm → live run**

Never run a migration live without a successful dry-run first.

All paths below are relative to `regroup/` (this skill's unit — the directory containing `regroup/functions/`). If your shell is elsewhere, `cd` there first, e.g. `cd "${CLAUDE_PROJECT_DIR}/regroup"`.

## Available Migrations
> **Use the exact npm script names below — there is no `migrate:<name>:dry-run` pattern.**
> `migrateGuestWeeks` is plain `migrate:dry-run` / `migrate:run` with no name segment.
> `migrateBalanceToCents.ts` exists in `functions/src/scripts/` but has **no npm script at all**, so it has
> no dry-run path — do not run it without first adding one.


| Script                           | npm command (dry-run)       | npm command (live)      |
| -------------------------------- | --------------------------- | ----------------------- |
| `migrateGuestWeeks`              | `migrate:dry-run`           | `migrate:run`           |
| `migrateHouseSubscriptionStatus` | `migrate:house-sub:dry-run` | `migrate:house-sub:run` |

## Required Environment Variables

Both scripts require:

- `STRIPE_SECRET_KEY` — live or test key depending on target environment
- Firestore credentials: `regroup/functions/service-key.json`, keyed by `"phoenix-cleanhouse"`.
  `src/scripts/scriptBootstrap.ts` does an **unconditional** `require("../../service-key.json")["phoenix-cleanhouse"]`
  at module load, so Application Default Credentials are never consulted — `gcloud auth application-default login`
  and `GOOGLE_APPLICATION_CREDENTIALS` do **not** work here. The file is gitignored and is currently absent;
  without it every script throws `MODULE_NOT_FOUND` before reaching Firebase. Obtain it from the Firebase console first.

## Sequence

### Step 1 — Build

```bash
cd functions
npm run build
```

Fix any TypeScript errors before proceeding.

### Step 2 — Dry Run

```bash
cd functions   # if not already there from Step 1
STRIPE_SECRET_KEY=sk_test_<key> npm run <dry-run command from the table above>
```

Review the output carefully. Confirm:

- Row counts are as expected
- No error messages
- Proposed changes look correct

### Step 3 — Confirm with user

Ask the user to confirm before proceeding to live run. Show them:

- Number of documents that will be affected
- What will change on each document
- Which environment (dev vs prod) is targeted

### Step 4 — Live Run

Only after explicit user confirmation:

```bash
cd functions   # if not already there
STRIPE_SECRET_KEY=sk_live_<key> npm run <live command from the table above>
```

### Step 5 — Verify

After the live run:

- Spot-check 2-3 documents in Firestore Console
- Confirm the expected field changes are present
- Check for any error lines in the output

## Safety Rules

- **Never** pass `--force` or skip dry-run
- **Never** run against production with a test Stripe key (check `sk_live_` vs `sk_test_`)
- If the script exits non-zero during live run, do not re-run — investigate first
- `scriptBootstrap.ts` hard-requires `functions/service-key.json` at module load. There is **no** ADC / `GOOGLE_APPLICATION_CREDENTIALS` fallback, in CI or anywhere else — CI must provide the file itself.
