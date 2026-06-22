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

## ⚠️ KNOWN BLOCKER — NA migration source wiring (read before step 3)

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

## 3. Migrate NA (once per product) — AFTER wiring the source (see blocker above)

```bash
cd recovery-api
# Only after main() is wired to read the PRODUCT's na-meetings as sourceDb.
# Run once with homegroups (recovery-connect-cad4b) creds as source,
# then once with regroup (phoenix-cleanhouse) creds as source.
npm run migrate:na
# Final log: "migrateNaMeetings: complete. read=.. upserted=.. skippedUnmappable=.. skippedAppOwned=.."
```

Confirm `read > 0` and `upserted > 0`. `read=0` means the source wiring is still pointing
at the (empty) default project — fix the wiring and re-run.

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

- `refreshDirectory` (daily 03:00) keeps **AA/CR** fresh and prunes stale `external` rows. No action.
- **NA goes stale** until Phase 1B adds `refreshNaDirectory` (monthly, Maps-key-bound). Until then,
  re-run the NA migration manually when the product `na-meetings` datasets change.
- Do **not** run seeds from app clients; seeding is recovery-api-side (script/admin) only.

---

## Quick reference

```bash
# Full sequence (after NA source wiring is done):
cd recovery-api
gcloud config set project recovery-platform-e6cb3
export GOOGLE_MAPS_API_KEY="<key>"
npm run seed          # AA + CR, full US grid (resumable, long)
npm run migrate:na    # NA, once per product source (read>0 expected)
# then verify (section 4)
```
