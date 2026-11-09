# Runbook: Seed the recovery-api meeting directory (Phase 1, full-US)

**Status:** Operator runbook — run by a human with prod credentials. Careful/intentional by design.
**Date:** 2026-06-21
**Owner action:** Marcus (recovery-platform admin)
**Prereq:** recovery-api is DEPLOYED (done — `findMeetings` + `refreshDirectory` live on `recovery-platform-e6cb3`, Node 22).

> **What this does:** backfills `directoryMeetings` (the cross-app shared directory) so
> regroup + homegroups `findMeetings` return real AA/CR/NA meetings immediately, instead
> of waiting ~7 days for the scheduled `refreshDirectory` cron to fill it incrementally.
> AA + Celebrate Recovery come from the **grid seed**; NA comes from a **one-off migration**
> of each product's existing `na-meetings` Firestore collection.

## Corrections, 2026-11-08 (these override the sections below)

- **Meeting Guide no longer works keyless.** `api.meetingguide.org/app/v2/request` returns 401 from both local machines and Cloud Functions, so the step 2 seed gets no AA rows. It has never been run on `recovery-platform-e6cb3`.
- **Celebrate Recovery is failing too:** `locator.crgroups.info` has an expired TLS certificate. Don't disable certificate checks to get around it.
- **The snapshot import exists but has not been run:** `npm run import:snapshot` (step 3) replaces `migrate:na`. Each row carries `dataAsOf`, which the apps show as "Listing data from Mar 2023". The owner is holding both imports as of 2026-11-08: AA until a live sync is proven, NA pending a decision on data last written in March 2023.
- **`recovery-connect-cad4b` has billing off, and its linked billing account is closed.** Its free daily read quota is smaller than its `meetings` collection, and a full read on 2026-11-08 used it up and blocked all reads on the project until the quota reset. The script now refuses to scan a source with billing off. Check billing before any bulk read of a product's Firestore. Turning billing back on needs a different account and may restart its scheduled jobs, including the subscription reconciler and reminders.
- **`refreshDirectory` could not finish a run before this fix:** every run hit the 60s timeout, so the cursor stayed at 853 from June 22. The fix lets it finish and saves progress as it goes.
- **Deploy order:** deploy the `firestore.indexes.json` index first and wait until it is READY, then the function. Pruning needs that index.
- **Build before deploying functions.** `firebase.json` has no build step and ignores `src`, so a deploy ships whatever is in `lib/`. Run `npm run build` first, or you deploy the stale tracked copy, then restore `lib/` afterwards.

---

## 0. Ground truth (verified from code, 2026-06-21)

| Thing             | Value                                                                                                                                                               | Source                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Grid bounds       | LAT 24.0→49.0, STEP 0.5° (continental US)                                                                                                                           | `recovery-api/src/lib/meetings/ingest.ts` `GRID_CONFIG` |
| Grid size         | ~6,000 cells (≈51 lat × ≈119 lon)                                                                                                                                   | derived from `GRID_CONFIG`                              |
| AA source         | MeetingGuide API — **keyless**                                                                                                                                      | `lib/meetings/sources/meetingGuide.ts`                  |
| CR source         | Celebrate Recovery — **keyless**                                                                                                                                    | `lib/meetings/sources/celebrateRecovery.ts`             |
| Maps key          | `seedDirectory` **throws at entry if `GOOGLE_MAPS_API_KEY` unset** (NA-address geocode path)                                                                        | `scripts/seedDirectory.ts:56-58`                        |
| Resumable         | cursor doc `script_progress/seedDirectory` (`lastProcessedIndex`); cursor advances past failed cells                                                                | `scripts/seedDirectory.ts`                              |
| Idempotent        | upsert by deterministic id/geohash (`lib/meetings/identity.ts`) — safe to re-run                                                                                    | ingest pattern                                          |
| NA source         | **products' `na-meetings` Firestore** (NOT recovery-platform, NOT a live API)                                                                                       | `scripts/migrateNaMeetings.ts` header                   |
| Scheduled refresh | `refreshDirectory` daily 03:00, full grid over 7 days (`REFRESH_CYCLE_RUNS=7`), prunes only `source:'external'` >30d (`STALE_PRUNE_DAYS=30`) — **already deployed** | `triggers/refreshDirectory.ts`                          |
| npm scripts       | `npm run seed` → `node lib/scripts/seedDirectory.js`; `npm run migrate:na` → `node lib/scripts/migrateNaMeetings.js` (added this session)                           | `recovery-api/package.json`                             |

**Two things the cron does NOT do (why the manual seed matters):**

1. The cron fills AA/CR only **incrementally over ~7 days** — the manual seed gives full coverage now.
2. The cron does **not** touch NA at all (NA is not on any schedule — Phase 1B gap). NA only enters via the one-off migration below.

---

## Resolved blocker — NA migration source wiring

Applies only to the superseded `migrate:na`. Step 3's `import:snapshot` reads the right project.

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

# 1d. Build once (npm run seed/migrate:na also build, but confirm clean first)
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

## 3. Import snapshots of AA and NA

Dry run first. Your Application Default Credentials need read access to the source and write access to `recovery-platform-e6cb3`.

```bash
cd recovery-api
npm run import:snapshot -- --provider NA           # reads phoenix-cleanhouse/na-meetings
npm run import:snapshot -- --provider NA --apply
npm run import:snapshot -- --provider AA           # reads recovery-connect-cad4b/meetings; needs billing on
npm run import:snapshot -- --provider AA --apply
# Final log: "importMeetingSnapshot: complete {...}"
```

Check `read`, `skippedUnmappable` and the `dataAsOf` range before applying. Re-running is safe: rows a live source has confirmed and app-owned rows are never overwritten. Homegroups' own `na-meetings` is empty, so NA comes only from Regroup. Homegroups serves AA from its own Firestore, so imported AA rows reach Regroup only.

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
- [ ] Spot-check a few rows: correct `provider`, `day` (0–6), `time` (HH:mm), nested `location`; no overlay fields.

---

## 5. After seeding — ongoing maintenance

- `refreshDirectory` (daily 03:00) keeps **AA/CR** fresh when their sources answer. It prunes stale rows only for a provider whose source answered for a full sweep, so an outage deletes nothing. It also deletes nothing for a provider when more than 10% of its rows would go, and logs `refreshDirectory: prune blocked` as an error instead. If you see that, work out why before acting: it may be a degraded source, or imported rows a recovered source no longer lists. Rows outside the sweep's grid (Alaska, Hawaii, Puerto Rico) are never pruned, because a sweep can't re-see them.
- **NA has no live source**, so it is never pruned and stays frozen at its `dataAsOf` date until Phase 1B adds `refreshNaDirectory`.
- Do **not** run seeds from app clients; seeding is recovery-api-side (script/admin) only.

---

## Quick reference

```bash
# Only once the owner approves each import (both are on hold):
cd recovery-api
gcloud config set project recovery-platform-e6cb3
npm run import:snapshot -- --provider NA --apply
npm run import:snapshot -- --provider AA --apply   # needs billing on recovery-connect-cad4b
# then verify (section 4)
```
