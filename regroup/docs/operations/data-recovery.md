# Regroup data recovery (Firestore)

**Last updated:** 2026-11-06

How Regroup's production Firestore can be recovered, and what has to happen before any risky production write. The launch design (`docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` §6.1) refers to this doc.

## Current settings

| Project                       | Point-in-time recovery (PITR)            | Delete protection | Scheduled backups                                                       |
| ----------------------------- | ---------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `phoenix-cleanhouse` (prod)   | **On** since 2026-11-06, 7-day retention | Off               | None (manual exports go to `gs://phoenix-cleanhouse-firestore-exports`) |
| `regroup-e2e` (staging)       | Off                                      | Off               | None                                                                    |
| `demo-regroup-e2e` (emulator) | n/a                                      | n/a               | n/a                                                                     |

Check the live values with:

```sh
gcloud firestore databases describe --database='(default)' --project=phoenix-cleanhouse \
  --format='value(pointInTimeRecoveryEnablement,versionRetentionPeriod,earliestVersionTime)'
```

PITR keeps versions of the database for 7 days. Within the last hour you can read at any moment; older than that, at whole-minute timestamps back to the 7-day limit. It started on 2026-11-06, so the window only covers the full 7 days from 2026-11-13. It is billed as extra storage.

## Before a risky production write

This covers backfills, migration scripts and bulk deletes. Run the script's dry run, then:

1. Export the collections the script touches to the exports bucket, `gs://phoenix-cleanhouse-firestore-exports`.
   It was created 2026-11-06 (US multi-region, matching Firestore's `nam5`; uniform access; public access prevention enforced). Firestore's service agent `service-155667333239@gcp-sa-firestore.iam.gserviceaccount.com` has `roles/storage.admin` on it. A smoke export of `paywall` succeeded, and its folder was deleted.

   ```sh
   gcloud firestore export gs://phoenix-cleanhouse-firestore-exports/<YYYY-MM-DD>-<script> \
     --collection-ids=<collection>,<collection> --project=phoenix-cleanhouse
   ```

2. Note the UTC time just before the live run. That time is the PITR restore point.
3. Keep the script's log of changed document IDs (counts and IDs only, no PII). It makes a targeted restore possible.
4. **Delete the export when it is no longer needed.** It holds full production documents, including resident data. The retention rule is still to be decided (issue #177, before the first backfill).

## Recovering

The safest order: restore into a separate database, compare, then copy back only what's needed. Never overwrite `(default)` wholesale.

- **Within the PITR window, whole database:** clone the restore point into a new database, then inspect it.

  ```sh
  gcloud firestore databases clone \
    --source-database=projects/phoenix-cleanhouse/databases/'(default)' \
    --snapshot-time=<RFC3339 time, whole minute> --destination-database=<restore-db-id>
  ```

- **Within the PITR window, some collections:** export at the restore point, then import into a scratch database.

  ```sh
  gcloud firestore export gs://phoenix-cleanhouse-firestore-exports/restore-<time> \
    --snapshot-time=<RFC3339 time> --collection-ids=<collection> --project=phoenix-cleanhouse
  ```

- **From a pre-write export:** `gcloud firestore import gs://phoenix-cleanhouse-firestore-exports/<export-folder> --database=<restore-db-id>`. Import overwrites documents that have the same IDs, so import into a scratch database first.
- **Copying back:** write only the affected document IDs back to `(default)` with an Admin SDK script that follows the `functions/src/scripts/` pattern (dry run by default, no PII in logs).
- **Clean up** the restore database afterwards; it is billed while it exists.

## Server switches

Two Firestore documents change behavior without a deploy. Only the server writes them; set them with the script, from `regroup/functions`, with the dry run first. The script logs which project it targets; check that before `--apply`.

| Switch | Document | What it does |
| --- | --- | --- |
| Paywall kill switch | `paywall/config.enabled` | `false` lets every house in, on the server and in the app. Use it to undo a paywall mistake, such as houses wrongly behind "plan required" on launch day. `true` (or no document) enforces the paywall. |
| Sales open | `config/sales.open` | `true` lets new tier subscriptions start. Anything else, including no document, refuses checkout. Closed in production from the backend deploy until launch step 10.5. |

```bash
npm run switch:set -- --switch=paywall --value=false            # dry run: prints current and intended
npm run switch:set -- --switch=paywall --value=false --apply    # writes it, then prints the value read back
npm run switch:set -- --switch=sales --value=true --apply
```

Checkout reads the sales switch on every call, so closing it stops new subscriptions at once; the public tier catalog shows the change within a minute. The server reads the paywall switch with a one-minute cache.

## Not covered here

Stripe objects can't be restored this way. A canceled subscription can't be reactivated, and live prices can only be archived. The launch design §6.1 covers those.

### Canceling the legacy subscriptions (launch)

A canceled subscription can't be reactivated, so this runs only after the owner confirms the list, and before the backfill (a cancellation's webhook writes `canceled` to the operator's houses, which would overwrite the backfill's value). From `regroup/functions`, with `STRIPE_SECRET_KEY` set to a restricted live key (`rk_live_`, Subscriptions read and write only; revoke it afterwards):

```bash
npm run legacy:cancel                     # lists the legacy subscriptions and everything it won't touch
npm run legacy:cancel -- --apply --ids=sub_a,sub_b --record=$HOME/.config/regroup-launch/legacy-cancel.json
```

It refuses an ID it didn't list, and a record path inside the repo. It writes each subscription's ID, customer, status, items and metadata to the record file (mode 600, never overwritten) before any Stripe write. Each subscription is marked `regroup_launch_cancel: "true"` before it's canceled, so the webhook sends the operator no "canceled" push: the owner's notice explains the change.
