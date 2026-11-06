# Regroup data recovery (Firestore)

**Last updated:** 2026-11-06

How Regroup's production Firestore can be recovered, and what has to happen before any risky production write. The launch design (`docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` §6.1) refers to this doc.

## Current settings

| Project                       | Point-in-time recovery (PITR)            | Delete protection | Scheduled backups |
| ----------------------------- | ---------------------------------------- | ----------------- | ----------------- |
| `phoenix-cleanhouse` (prod)   | **On** since 2026-11-06, 7-day retention | Off               | None              |
| `regroup-e2e` (staging)       | Off                                      | Off               | None              |
| `demo-regroup-e2e` (emulator) | n/a                                      | n/a               | n/a               |

Check the live values with:

```sh
gcloud firestore databases describe --database='(default)' --project=phoenix-cleanhouse \
  --format='value(pointInTimeRecoveryEnablement,versionRetentionPeriod,earliestVersionTime)'
```

PITR keeps versions of the database for 7 days. Within the last hour you can read at any moment; older than that, at whole-minute timestamps back to the 7-day limit. It started on 2026-11-06, so the window only covers the full 7 days from 2026-11-13. It is billed as extra storage.

## Before a risky production write

This covers backfills, migration scripts and bulk deletes. Run the script's dry run, then:

1. Export the collections the script touches to the exports bucket. It doesn't exist yet: create `gs://phoenix-cleanhouse-firestore-exports` (or similar) before the first export, then record its name here.

   ```sh
   gcloud firestore export gs://<exports-bucket>/<YYYY-MM-DD>-<script> \
     --collection-ids=<collection>,<collection> --project=phoenix-cleanhouse
   ```

2. Note the UTC time just before the live run. That time is the PITR restore point.
3. Keep the script's log of changed document IDs (counts and IDs only, no PII). It makes a targeted restore possible.

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
  gcloud firestore export gs://<exports-bucket>/restore-<time> \
    --snapshot-time=<RFC3339 time> --collection-ids=<collection> --project=phoenix-cleanhouse
  ```

- **From a pre-write export:** `gcloud firestore import gs://<exports-bucket>/<export-folder> --database=<restore-db-id>`. Import overwrites documents that have the same IDs, so import into a scratch database first.
- **Copying back:** write only the affected document IDs back to `(default)` with an Admin SDK script that follows the `functions/src/scripts/` pattern (dry run by default, no PII in logs).
- **Clean up** the restore database afterwards; it is billed while it exists.

## Not covered here

Stripe objects can't be restored this way. A canceled subscription can't be reactivated, and live prices can only be archived. The launch design §6.1 covers those.
