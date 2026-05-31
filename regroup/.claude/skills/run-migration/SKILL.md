---
name: run-migration
description: Safely run a Firestore migration script. Enforces build → dry-run → confirm → live sequence. Never skip the dry-run.
disable-model-invocation: true
---

# Run Migration

Safely execute a Firestore migration script using the enforced sequence:
**build → dry-run → review output → confirm → live run**

Never run a migration live without a successful dry-run first.

## Available Migrations

| Script                           | npm command (dry-run)       | npm command (live)      |
| -------------------------------- | --------------------------- | ----------------------- |
| `migrateGuestWeeks`              | `migrate:dry-run`           | `migrate:run`           |
| `migrateHouseSubscriptionStatus` | `migrate:house-sub:dry-run` | `migrate:house-sub:run` |

## Required Environment Variables

Both scripts require:

- `STRIPE_SECRET_KEY` — live or test key depending on target environment
- Firebase credentials via `GOOGLE_APPLICATION_CREDENTIALS` or `gcloud` ADC

## Sequence

### Step 1 — Build

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npm run build
```

Fix any TypeScript errors before proceeding.

### Step 2 — Dry Run

```bash
STRIPE_SECRET_KEY=<key> npm run migrate:<name>:dry-run
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
STRIPE_SECRET_KEY=<key> npm run migrate:<name>:run
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
- The `scriptBootstrap.ts` loader uses `service-key.json` locally; for CI, use `GOOGLE_APPLICATION_CREDENTIALS` instead
