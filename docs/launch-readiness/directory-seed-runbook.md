# Runbook: Seed the recovery-api meeting directory (Phase 1, full-US)

**Status:** Operator runbook — run by a human with prod credentials. Careful/intentional by design.
**Date:** 2026-06-21
**Owner action:** Marcus (recovery-platform admin)
**Prereq:** recovery-api is DEPLOYED (done — `findMeetings` live on `recovery-platform-e6cb3`, Node 22).

> **What this does:** backfills `directoryMeetings` (the cross-app shared directory) so
> regroup + homegroups `findMeetings` return real AA/CR/NA meetings immediately, instead
> of waiting for a manual sync to fill it.
> AA + Celebrate Recovery come from the **grid seed**; NA comes from **`npm run sync:na`**
> (see the last section).

## Corrections, 2026-11-08 (these override the sections below)

- **Refresh AA manually:** `MEETING_GUIDE_API_KEY=... npm run sync:meetings` sweeps all US land and writes `directoryMeetings`. It is a dry run until you add `-- --apply`. The key can instead go in `~/.config/recovery-platform/meeting-sync.env` as `MEETING_GUIDE_API_KEY=...`, either as issued (with `%3f`) or already URL-encoded (with `%253f`). Never put it in `recovery-api/.env`: a deploy sets every entry of that file on every function and uploads the file with the source. Never log the request URL: it contains the key.
- **First full AA sync, 2026-11-09:** two `--apply` runs wrote 133,893 AA rows, 25,329 of them online, with 0 failed cells and 0 rate limits. It ran from code older than the day-name change, so these rows hold integer days. More than 500 meetings share one point in downtown Los Angeles (34.0547, -118.2427), so some there are missing. The prune never deletes rows at that spot.
- **Run these in order:** deploy `recovery-api`, then do a dry run, then `--apply`. The older deployed `findMeetings` stops at 500 rows per geohash bound, so it would drop meetings once the directory is full. Deploying first changes nothing while the directory is small.
- **Read the coverage lines in a dry run before applying:** it prints meetings per state and a count near each of 23 places, mostly islands and barrier islands. A `WARNING no meetings found near` line means check that place. It may have none, or the sweep may have missed it. San Juan's count also hints at whether `language=en` is filtering out Spanish-language meetings, which hasn't been verified.
- **If the key stops working, the sync tells you:** it stops, prints a `MEETING GUIDE SYNC FAILED: ACTION NEEDED` banner, exits with code 2 and writes nothing. Set a new key in `MEETING_GUIDE_API_KEY` and run it again. The banner also covers a missing key, and 50 base cells failing in a row, which may be an outage rather than the key. The apps read Firestore, not this API, so a dead key leaves listings stale but working. Nothing checks the key between runs: you only find out when you run the sync.
- **Meeting Guide no longer works keyless.** `api.meetingguide.org/app/v2/request` returns 401 from both local machines and Cloud Functions, so the step 2 seed gets no AA rows. It has never been run on `recovery-platform-e6cb3`; AA rows come from `sync:meetings` instead.
- **Celebrate Recovery is failing too:** `locator.crgroups.info` has an expired TLS certificate. Don't disable certificate checks to get around it.
- **The snapshot import exists but has not been run:** `npm run import:snapshot` (step 3) replaces `migrate:na`. Each row carries `dataAsOf`, which the apps show as "Listing data from Mar 2023". The owner is holding the AA import until a live sync is proven. NA no longer uses it: the importer refuses NA, and NA comes from `npm run sync:na`.
- **`recovery-connect-cad4b` has billing off, and its linked billing account is closed.** Its free daily read quota is smaller than its `meetings` collection, and a full read on 2026-11-08 used it up and blocked all reads on the project until the quota reset. The script now refuses to scan a source with billing off. Check billing before any bulk read of a product's Firestore. Turning billing back on needs a different account and may restart its scheduled jobs, including the subscription reconciler and reminders.
- **No scheduled job updates meetings (owner decision, 2026-11-08).** Meeting sync runs manually through scripts until further notice, so ignore the cron references below. `refreshDirectory` is no longer exported, and `src/noScheduledJobs.test.ts` fails if a scheduled function touches meeting data (scheduled jobs for anything else are allowed). The live function and its Scheduler job were deleted on 2026-11-09.
- **The prune's index is deployed:** `directoryMeetings` (source, provider, lastSeenAt) went live on 2026-11-09. `pruneStale` fails without it, though it deletes nothing.
- **Functions deploys build first.** `firebase.json` now runs `npm run build` before a functions deploy, because it ignores `src` and ships whatever is in `lib/`. That rewrites the tracked `lib/`, so restore it afterwards rather than committing it.

---

## 0. Ground truth (verified from code, 2026-06-21)

| Thing             | Value                                                                                                                         | Source                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Grid bounds       | LAT 24.0→49.0, STEP 0.5° (continental US)                                                                                     | `recovery-api/src/lib/meetings/ingest.ts` `GRID_CONFIG` |
| Grid size         | ~6,000 cells (≈51 lat × ≈119 lon)                                                                                             | derived from `GRID_CONFIG`                              |
| AA source         | MeetingGuide API — **keyless**                                                                                                | `lib/meetings/sources/meetingGuide.ts`                  |
| CR source         | Celebrate Recovery — **keyless**                                                                                              | `lib/meetings/sources/celebrateRecovery.ts`             |
| Maps key          | `seedDirectory` **throws at entry if `GOOGLE_MAPS_API_KEY` unset** (NA-address geocode path)                                  | `scripts/seedDirectory.ts:56-58`                        |
| Resumable         | cursor doc `script_progress/seedDirectory` (`lastProcessedIndex`); cursor advances past failed cells                          | `scripts/seedDirectory.ts`                              |
| Idempotent        | upsert by deterministic id/geohash (`lib/meetings/identity.ts`) — safe to re-run                                              | ingest pattern                                          |
| NA source         | **BMLT aggregator**, through `npm run sync:na`, run by hand                                                                   | `scripts/syncNa.ts`                                     |
| Scheduled refresh | **None.** Removed by owner decision, 2026-11-08                                                                               | `src/noScheduledJobs.test.ts`                           |
| npm scripts       | `npm run seed` → `node lib/scripts/seedDirectory.js`; `npm run import:snapshot` → `node lib/scripts/importMeetingSnapshot.js` | `recovery-api/package.json`                             |

**Two things the cron does NOT do (why the manual seed matters):**

1. The cron fills AA/CR only **incrementally over ~7 days** — the manual seed gives full coverage now.
2. The cron does **not** touch NA at all (NA is not on any schedule — Phase 1B gap). NA enters only through `npm run sync:na`.

---

## Resolved blocker — NA migration source wiring

Applies only to the superseded NA migration, whose `npm run migrate:na` script is removed and whose entry point now refuses to run. Step 3's `import:snapshot` reads the right project.

`scripts/migrateNaMeetings.ts` `main()` currently calls
`runMigration({ sourceDb: db, destDb: db })` where `db` is the **default app**
(`recovery-platform-e6cb3`). But the NA data lives in the **product** Firestores
(`recovery-connect-cad4b` / `phoenix-cleanhouse`), so as-shipped `npm run migrate:na`
reads an **empty** source and migrates **nothing**.

The header comment says exactly this: the source/dest wiring is "an ops-time decision,
not baked in." **Before running the NA migration you must wire the source to the product
project** — initialize a second named Firebase app with that product's service-account
credentials and pass it as `sourceDb`. Options:

- **(A)** Edit `main()` to initialize a second app:
  `initializeApp({ credential: cert(<product-sa.json>) }, 'source')` and pass
  `getFirestore(getApp('source'))` as `sourceDb`, keeping `destDb` = default. (Then `npm run build`.)
- **(B)** Add a small dedicated wrapper script that does the two-app wiring and calls `runMigration`.

Run it **once per product** that holds NA data (homegroups, regroup). The migration is
idempotent (upsert by id) and guards `source:'app'` rows.

---

## 1. Pre-flight (do not skip)

```bash
cd recovery-api

# 1a. Application Default Credentials must point at recovery-platform-e6cb3 (DEST)
gcloud auth application-default login          # if not already
gcloud config set project recovery-platform-e6cb3
# (or export GOOGLE_APPLICATION_CREDENTIALS=/path/to/recovery-platform-sa.json)

# 1b. Maps key available locally for the seed entrypoint
export GOOGLE_MAPS_API_KEY="<your maps key>"   # same value set in Secret Manager

# 1c. Record the BEFORE count (expect ~0 / empty at launch)
#     Firebase console → Firestore → directoryMeetings  (or a quick admin query)

# 1d. Build once (npm run seed also builds, but confirm clean first)
npm run build
```

**Safety notes:**

- Run inside `tmux`/`screen` or with `nohup` — the full sweep is long (thousands of cells; plan for 1–3+ hrs). It's resumable, so an interrupt is safe: re-running continues from the cursor.
- Watch **Google Maps API** usage/billing and **Firestore write** quota while it runs. AA/CR fetches are keyless (free); Maps is only hit on the NA-address geocode path.
- This writes ONLY `source:'external'` rows; it never touches `source:'app'` (future user-created) rows.

---

## 2. Seed AA + Celebrate Recovery (full continental-US grid)

```bash
cd recovery-api
GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_API_KEY" npm run seed
# → builds, then runs node lib/scripts/seedDirectory.js
# Progress logs: "seedDirectory: cell N/total ..." and a final
#   "seedDirectory: complete. totalUpserted=... totalSkippedAppOwned=..."
```

- **Interrupted?** Just re-run the same command — it resumes from `script_progress/seedDirectory`.
- **Re-seed from scratch?** Delete the `script_progress/seedDirectory` doc first, then re-run.

---

## 3. Import a snapshot of AA

Dry run first. Your Application Default Credentials need read access to the source and write access to `recovery-platform-e6cb3`.

```bash
cd recovery-api
npm run import:snapshot -- --provider AA           # reads recovery-connect-cad4b/meetings; needs billing on
npm run import:snapshot -- --provider AA --apply
# Final log: "importMeetingSnapshot: complete {...}"
```

Check `read`, `skippedUnmappable`, `skippedLive` and the `dataAsOf` range before applying. A row with no `dataAsOf` counts as live, including one from the old `migrate:na`, so it is skipped and shows no age label; delete such rows first if you want them imported. Re-running is safe: rows a live source has confirmed and app-owned rows are never overwritten. Homegroups serves AA from its own Firestore plus the directory, listing a meeting found in both once.

The build rewrites the tracked `recovery-api/lib/`. Don't commit that.

---

## 4. Verify

- [ ] `directoryMeetings` count grew from the step-1c baseline (AA + CR + NA present).
- [ ] Authenticated probe returns meetings for a seeded metro (service key required):
  ```bash
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "X-Service-Key: <RECOVERY_PLATFORM_API_KEY>" \
    -H "X-App-Id: phoenix-cleanhouse" \
    -H "X-User-Uid: smoke-test" \
    -d '{"data":{"location":{"lat":40.7128,"lng":-74.0060},"type":"all"}}' \
    https://us-central1-recovery-platform-e6cb3.cloudfunctions.net/findMeetings
  # expect result.meetings to be non-empty
  ```
- [ ] regroup `findMeetings` and homegroups `findMeetings` return directory meetings (not just local) for a seeded region.
- [ ] `directoryMeetingRequests` audit rows are PII-safe (hashed uid only — no raw uid/email).
- [ ] Spot-check a few rows: correct `provider`, `day` (a lowercase name such as `tuesday`), `time` (HH:mm), nested `location`; no overlay fields.

---

## 5. After seeding — ongoing maintenance

- **Nothing refreshes meetings on a schedule.** Rows stay as of the last manual sync. `pruneStale` removes stale rows only for a provider whose source answered for a full sweep, so an outage deletes nothing. It also deletes nothing for a provider when more than 10% of its rows would go, and logs `refreshDirectory: prune blocked` as an error instead. If you see that, work out why before acting: it may be a degraded source, or imported rows a recovered source no longer lists. `refreshSlice`'s grid sweep never prunes rows outside the old grid (Alaska, Hawaii, Puerto Rico), because it can't re-see them. `sync:meetings` covers all US land, so it can prune those. It deletes a meeting only after two healthy `--apply` sweeps in a row have missed it and it hasn't been seen for 30 days, so its first healthy run deletes nothing. It never prunes a row outside US land, or at a spot holding more meetings than one response returns.
- **NA updates only when someone runs `npm run sync:na`.** `pruneStale` never touches it, because the sync decides its own deletes. Rows keep their `dataAsOf` date until the next run.
- Do **not** run seeds from app clients; seeding is recovery-api-side (script/admin) only.

---

## Quick reference

```bash
# Only once the owner approves each step (the AA import is on hold):
cd recovery-api
gcloud config set project recovery-platform-e6cb3
npm run sync:na -- --apply
npm run import:snapshot -- --provider AA --apply   # needs billing on recovery-connect-cad4b
# then verify (section 4)
```

---

## NA meetings now come from `npm run sync:na`

This replaces everything above about migrating or importing NA. The snapshot importer refuses NA, because it would overwrite synced rows with March 2023 data. The source is the [BMLT](https://bmlt.app/) aggregator, which combines listings NA service bodies maintain themselves.

The command runs by hand from a terminal. Nothing runs on a schedule or in GCP, so the data is only as current as the last run. Run it from `recovery-api/`, signed in with `gcloud auth application-default login`.

```bash
npm run sync:na                                  # dry run: report what would change
npm run sync:na -- --region <sourceId> --apply   # one region, for a first try
npm run sync:na -- --apply                       # everything
```

**How old is the data?** Read `refreshState/naSync` in Firestore. `lastRunAt` is the last applied run, and `scope` says whether it covered all regions. Each row's `dataAsOf` is when BMLT last imported its region.

**Before the first `--apply`:**

1. Confirm `refreshDirectory` is gone from GCP with `firebase functions:list --project recovery-platform-e6cb3`. Its old deployed code could delete any row not stamped in 30 days, whatever its provider. Don't run `--apply` if it still exists.
2. Deploy `findMeetings` from a commit that includes this change: `firebase deploy --only functions:findMeetings --project recovery-platform-e6cb3`. Older versions return rows with no `id`, so people can't open or favorite them in the app.

**When a region is reported:**

- **`fetch_failed`, `count_mismatch` or `stale_import`:** the rows it returned are still saved, and nothing is deleted from it. Run again later. A region that returns no meetings is always treated this way, so if one has really emptied, its rows stay until it leaves BMLT.
- **"would lose too many rows":** nothing is deleted from it. A region can lose up to 5 rows or 10%, whichever is more. Check the region's own site, and if the removal is real, rerun with `--allow-deletes <sourceId>`. Use the same flag for a region that has left BMLT.

**To undo:** `npm run sync:na -- --purge` reports how many rows this sync created, and adding `--apply` deletes them. It leaves every other row alone.

## Meeting days are stored as names

`directoryMeetings.day` is a lowercase day name such as `tuesday`. Rows written by code older than that change, including the first AA sync's 133,893 rows, hold an integer 0–6 (0 = Sunday) until converted. `findMeetings` accepts either in a request and returns each day as stored, so a reader must handle both until the conversion in step 3.

Deploy and convert in this order, or the apps show directory meetings with no day:

1. Deploy `recovery-api`'s `findMeetings`. It accepts a day name or an integer in a request, and returns each day as stored, so the products' current code keeps working.
2. Deploy both products' functions. They read either form and send day names, and the old `recovery-api` would reject a name.
3. Convert stored rows, only after both product deploys have succeeded: `npm run migrate:day-names` reports what would change, and adding `--apply` changes only `day`. Don't run it alongside a sync, which could delete a row the migration then recreates with nothing but a day.

Don't run anything that writes `directoryMeetings` before step 2, including `sync:na --apply`, `sync:meetings --apply`, `npm run seed` and `import:snapshot --apply`. They all write names, and older product code shows those rows with no day.
