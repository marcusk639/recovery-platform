# Plan: Make Meeting Functionality Work Across Apps

**Status:** Execution plan (phased, resumable in fresh contexts)
**Date:** 2026-06-21
**Scope:** Everything required for the shared meeting directory (recovery-api) to
actually deliver cross-app meeting discovery in production — from the code already
merged (B2/B3/B4) through deploy/ops, the missing write-path, cleanup, and E2E verify.

> **One-line problem statement:** the READ path is code-complete (regroup + homegroups
> `findMeetings` now call recovery-api), but (a) it is **not deployed/configured** and the
> directory is **empty**, and (b) there is **no write-path**, so meetings _created in_ one
> app are still invisible in the other. Both must be closed for "works across apps."

---

## Phase 0 — Discovery findings (ground truth, 2026-06-21)

Consolidated from this session's B2/B3/B4 work plus targeted greps. Cite these; do not re-assume.

### Read path (DONE in code)

- recovery-api READ callable: `recovery-api/src/callable/findMeetings.ts` — `onCall` + `requireServiceAuth`; pure Firestore geohash read of `directoryMeetings`; input `{location:{lat,lng}, day?:0-6, type?, radiusMeters?}`; returns `{ meetings: DirectoryMeeting[] }`.
- Canonical shape: `recovery-api/src/entities/DirectoryMeeting.ts` (`provider:'AA'|'NA'|'CELEBRATE_RECOVERY'|'CUSTOM'`, `day:number`, `time:"HH:mm"`, nested `location`).
- regroup client: `regroup/functions/src/api/recoveryApi.ts` (`X-App-Id: phoenix-cleanhouse`) → `callable/meetings.ts` orchestrates directory (AA/NA/CR) + Firestore custom; preserves `RatsMeeting[]`.
- homegroups client: `homegroups/functions/src/api/recoveryApi.ts` (`X-App-Id: homegroups`) → `callable/findMeetings.ts` orchestrates Firestore AA/Custom + directory NA/CR; preserves `SerializedMeeting[]`.
- Both clients read `process.env.RECOVERY_API_BASE_URL` + `process.env.RECOVERY_PLATFORM_API_KEY`; degrade to `[]` if unset.

### Directory ingestion (BUILT in code, NOT run — ops gap)

- Sources: `recovery-api/src/lib/meetings/sources/meetingGuide.ts` (AA — **keyless**), `celebrateRecovery.ts` (CR — **keyless**), `geocode.ts` (**needs `GOOGLE_MAPS_API_KEY`** — only NA-address geocoding path).
- Seed: `recovery-api/src/scripts/seedDirectory.ts` (resumable grid sweep; uses `GOOGLE_MAPS_API_KEY`).
- NA migration: `recovery-api/src/lib/meetings/migrateNaMeetings.ts` + `naDataset.ts`.
- Scheduled refresh: `recovery-api/src/triggers/refreshDirectory.ts` (`onSchedule` nightly weekly-grid cycle + `pruneStale`, never prunes `source:'app'`). AA+CR run keyless, so the scheduled refresh runs even without the Maps key.
- **GAP:** `recovery-api/package.json` has NO `seed`/`migrate` npm scripts — these are run ad-hoc (ts-node) and are an ops step.

### Seeding & scheduled refresh (the "stay consistently seeded" picture)

- **A cron already exists for the directory:** `recovery-api/src/triggers/refreshDirectory.ts` is a deployed `onSchedule('every day 03:00')` function (exported from `index.ts`). It reuses `ingestGridCell`/`gridCells` from `lib/meetings/ingest.ts` — the **same logic** `scripts/seedDirectory.ts` uses. Weekly grid cycle (`REFRESH_CYCLE_RUNS=7`), `pruneStale` after `STALE_PRUNE_DAYS=30` (never prunes `source:'app'`). So "reuse the seed-script logic inside a scheduled function" is **already done for AA + Celebrate Recovery**.
- **GAP — NA is not on the cron:** `refreshDirectory` is deliberately **keyless** (AA Meeting Guide + CR only; NOT bound to `GOOGLE_MAPS_API_KEY` — see its header comment). NA data only enters the directory via the one-off `lib/meetings/migrateNaMeetings.ts` + `naDataset.ts`. So NA goes stale and new NA meetings never appear without a manual re-migration.
- **GAP — homegroups keeps a SECOND AA store with no cron:** homegroups reads AA from its OWN `meetings` Firestore (B4 kept this), populated only by ad-hoc ts-node scripts `homegroups/functions/scripts/populateMeetings.ts` (+ `-fixed`/`-original` variants), `findMeetingsByLocation.ts`, `fetchAndCompareMeetings.ts`, `cleanMeetings.ts`. There is **no scheduled refresh** for it. The per-group `onGroupCreateFetchMeetings` trigger is commented out (`homegroups/functions/src/index.ts`, `triggers/firestore/onGroupCreate.ts`).
- **Net:** AA lives in TWO stores (directory + homegroups `meetings`) — double maintenance + drift. regroup depends entirely on the directory; homegroups depends on the directory for NA/CR and its own store for AA.

### Config / deploy (NOT done)

- recovery-api region: `us-central1` (`recovery-api/src/config.ts` `setGlobalOptions`). Deployed callable URL: `https://us-central1-recovery-platform.cloudfunctions.net/findMeetings`.
- `RECOVERY_PLATFORM_API_KEY` is a `defineSecret` in recovery-api `config.ts` (global) AND now in both products.
- **Each product must set:** `RECOVERY_API_BASE_URL=https://us-central1-recovery-platform.cloudfunctions.net` and the `RECOVERY_PLATFORM_API_KEY` secret (same value as recovery-api). recovery-api must also have `GOOGLE_MAPS_API_KEY` set.

### Write-path (DOES NOT EXIST — the real cross-app gap for user-created meetings)

- homegroups creates/edits meetings in its OWN `meetings` Firestore collection via `triggers/firestore/onMeetingCreate.ts` / `onMeetingUpdate.ts` / `onMeetingDelete.ts` and group flows (`createGroupWithSubscription.ts`, `onGroupCreate.ts`). None write to recovery-api `directoryMeetings`.
- regroup custom meetings are created **client-side** (`regroup/mobile/src/state/queries/meetingQueries.ts`, `state/slices/meetingsSlice.ts`); no server create callable; nothing writes to the directory.
- **Consequence:** only externally-ingested AA/NA/CR meetings are shared. A group-hosted homegroups meeting or a regroup custom meeting is NOT discoverable in the other app until a write-path exists.

### Cleanup status

- Attendance bridge/proxy: fully removed from recovery-api + regroup (grep `getResidentMeetingAttendance`/`meetingAttendance` → none). (homegroups `http/getMeetingAttendance.ts` is a separate RATS_API_KEY bearer endpoint, unrelated.)
- Dead external wrappers: regroup `functions/src/api/api.ts` and homegroups equivalents — `getAAMeetings`/`getNAMeetings`/`getCelebrateRecoveryMeetings` now have **zero importers** in either product; orphaned entities (`AAMeetingResponse`/`NAMeetingResponse`/`CelebrateRecoveryMeeting`) and deps (`xml2js`, `moment`) likely removable.

### Allowed APIs (use these; do not invent)

- Call directory via the existing `fetchDirectoryMeetings(input, caller, deps?)` clients — do NOT add a second HTTP path.
- Service-to-service only: `X-Service-Key` + `X-App-Id` + `X-User-Uid` (+ `X-User-Email`). Clients NEVER hit recovery-api directly; no App Check.
- Directory IDs/geohash: use `recovery-api/src/lib/meetings/identity.ts` (the frozen recipe) — never re-derive.
- Stored app refs use canonical app-ids (`resolveAppId()`), never display names.

### Confidence + gaps

- HIGH on read path, config, ingestion file inventory, cleanup (all grep/file verified this session).
- MEDIUM on exact write-path entry points: confirmed _where_ meetings are created, but the create callable/trigger payload→`DirectoryMeeting` field mapping and the public-vs-private flag (which created meetings belong in the shared directory) need a focused read in Phase 2.
- Open: does recovery-api `directoryMeetings` already have any seeded data in the live `recovery-platform` project? (Assume EMPTY until Phase 1 ingestion is run.)

---

## Phase 1 — Make the read path LIVE (deploy + ingest). HIGHEST PRIORITY.

Without this, both apps' `findMeetings` return only their local meetings (regroup: only custom; homegroups: only Firestore AA/Custom) and the cross-app directory is empty.

**What to do:**

1. Set recovery-api secrets in the `recovery-platform` project: `firebase functions:secrets:set RECOVERY_PLATFORM_API_KEY` and `GOOGLE_MAPS_API_KEY`. Deploy recovery-api: `cd recovery-api && npm run build && firebase deploy --only functions`.
2. Confirm the deployed callable URL: `https://us-central1-recovery-platform.cloudfunctions.net/findMeetings`.
3. Configure regroup: set `RECOVERY_PLATFORM_API_KEY` secret (same value) + `RECOVERY_API_BASE_URL=https://us-central1-recovery-platform.cloudfunctions.net` env; redeploy `findMeetings`.
4. Configure homegroups: same two values; redeploy `findMeetings`.
5. **Populate the directory** (ops): add `seed` + `migrate:na` npm scripts to `recovery-api/package.json` wrapping `scripts/seedDirectory.ts` + `lib/meetings/migrateNaMeetings.ts` (ts-node), then run a seed sweep for the launch regions + the NA migration. Verify rows land in `directoryMeetings`. Confirm `triggers/refreshDirectory.ts` is deployed/scheduled.

**Verification checklist:**

- [ ] `firebase functions:secrets:access RECOVERY_PLATFORM_API_KEY` returns the key in all three projects (recovery-api + both products' env).
- [ ] Direct service-key POST to the deployed `findMeetings` URL with a known lat/lng returns a non-empty `result.meetings`.
- [ ] regroup `findMeetings` (type `all`) and homegroups `findMeetings` (type `all`) return directory meetings (not just local) for a seeded region.
- [ ] `directoryMeetings` collection is non-empty; `directoryMeetingRequests` audit rows appear (hashed uid only, no PII).

**Anti-pattern guards:** do NOT hardcode the URL/key in source; do NOT put `GOOGLE_MAPS_API_KEY` on the read path (read is pure Firestore); do NOT bypass `RECOVERY_API_BASE_URL` with a literal.

---

## Phase 1B — Keep Firebase consistently seeded (single store + scheduled refresh)

**Goal:** one continuously-refreshed source of external meeting data feeding BOTH apps,
with no manual re-runs and no dual-store drift. The scheduled-function approach the user
wants already exists for AA/CR (`refreshDirectory`); this phase closes the NA gap, unifies
homegroups onto the directory, and makes the one-time seed reliably runnable.

### Decision (resolve FIRST) — unify on the directory vs. keep dual stores

| Option                      | What it means                                                                                                                                                                                                  | Seeding cost                                                           | Recommendation                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Unify (RECOMMENDED)** | Repoint homegroups' AA read from its own `meetings` collection to the recovery-api directory (mirror regroup B3). homegroups `meetings` then holds only group-hosted/custom (`source:'app'`) overlay meetings. | ONE seeded store (`directoryMeetings`), ONE cron (`refreshDirectory`). | Cleanest "consistently seeded" answer; matches the single-directory differentiator; deletes homegroups' bespoke `populateMeetings` maintenance. |
| **B — Dual + add HG cron**  | Keep homegroups reading its own AA store; convert `scripts/populateMeetings.ts` into a homegroups `onSchedule` function.                                                                                       | TWO seeded stores, TWO crons, ongoing AA drift between them.           | Fallback only — more moving parts, drift risk.                                                                                                  |

**Recommended: Option A.** Tradeoff: homegroups AA depends on the directory being seeded
for homegroups' coverage regions — mitigated by running the initial seed (below) for those
regions BEFORE flipping the read. If launch timing can't absorb that, ship Option B as a
stopgap and migrate to A post-launch.

### What to implement (Option A path)

1. **Repoint homegroups AA → directory.** In `homegroups/functions/src/callable/findMeetings.ts`, route `type:"AA"` (and the AA slice of `"all"`) through `fetchDirectoryMeetings` filtered to `provider:"AA"` (COPY the exact pattern already in the same file for NA/CR). Keep `getCustomMeetings` (Firestore custom/group). Now homegroups' own `meetings` AA rows are no longer the read source.
2. **Close the NA refresh gap.** Add a SECOND scheduled function in recovery-api — `refreshNaDirectory` — that re-ingests the NA dataset on a slower cadence (NA World Services data is comparatively static; monthly is reasonable). COPY the structure of `refreshDirectory.ts` (`onSchedule` + thin wrapper delegating to a pure fn), but bind `GOOGLE_MAPS_API_KEY` (NA needs geocoding) and reuse `lib/meetings/migrateNaMeetings.ts` + `naDataset.ts` logic. Export from `index.ts`. Keep AA/CR on the existing keyless daily `refreshDirectory`.
3. **Make the initial seed reliably runnable (not just ts-node).** Either (a) add `seed` + `migrate:na` npm scripts to `recovery-api/package.json` wrapping `scripts/seedDirectory.ts` / `migrateNaMeetings.ts` for documented one-off ops runs, OR (b) add an admin-only HTTPS/callable `seedDirectoryRegion` that calls `ingestGridCell` over a bounded region (service-key gated). Run the initial backfill for launch regions, then let the crons maintain it.
4. **Retire the homegroups ad-hoc ingest path.** Once Option A is live, the homegroups `scripts/populateMeetings*.ts` and the commented `onGroupCreateFetchMeetings` are superseded — do NOT re-enable the per-group fetch; group-hosted meetings flow through the Phase 2 write-path instead. (Archive/delete in Phase 3.)

### Documentation references (COPY these patterns)

- Scheduled-function shape: `recovery-api/src/triggers/refreshDirectory.ts` — `onSchedule('every day 03:00')`, thin wrapper → pure `refreshSlice`/`pruneStale`, `REFRESH_*` constants, never prunes `source:'app'`.
- Shared ingest logic: `recovery-api/src/lib/meetings/ingest.ts` (`gridCells`, `ingestGridCell`, `GRID_CONFIG`) — the single source the seed script AND the cron both call.
- NA ingest logic: `recovery-api/src/lib/meetings/migrateNaMeetings.ts` + `naDataset.ts`.
- homegroups read pattern to mirror for AA: the NA/CR directory branch already in `homegroups/functions/src/callable/findMeetings.ts` (post-B4).

### Verification checklist

- [ ] homegroups `findMeetings` (type `AA`) returns directory AA for a seeded region; its own `meetings` AA rows are no longer the read source (grep: no `type=="AA"` Firestore read remains on the AA path).
- [ ] `refreshDirectory` (daily) and `refreshNaDirectory` (monthly) are both deployed and listed in `firebase functions:list`; both appear in `recovery-api/src/index.ts` exports.
- [ ] After a manual trigger (or scheduled run), `directoryMeetings` row count grows and `lastRefreshedAt`/`lastSeenAt` advance; `refreshState/directory` cursor advances through the weekly cycle.
- [ ] NA rows carry recent `lastRefreshedAt` after `refreshNaDirectory` runs (NA no longer stale).
- [ ] `pruneStale` removes only `source:'external'` rows older than 30d; `source:'app'` rows untouched.
- [ ] recovery-api `npx tsc --noEmit` + `npx jest` green (add tests for `refreshNaDirectory` mirroring `refreshDirectory.test.ts`).

### Anti-pattern guards

- Do NOT bind `GOOGLE_MAPS_API_KEY` to the AA/CR `refreshDirectory` (it's keyless by design) — only the NA refresh needs it.
- Do NOT re-enable `onGroupCreateFetchMeetings` or keep two AA stores once Option A ships — that reintroduces drift.
- Do NOT re-derive ids/geohash in the new NA cron — reuse `lib/meetings/identity.ts` and the existing migrate logic.
- Do NOT run seeds from app clients — seeding is recovery-api-side (script or service-key admin function) only.
- Do NOT let the cron prune `source:'app'` rows (the write-path's user-created meetings).

---

## Phase 2 — Build the directory WRITE-path (true cross-app for user-created meetings)

This is the missing half of the differentiator. Until a created public meeting is written to `directoryMeetings`, it is invisible cross-app.

**Design first (read, don't assume):** read `recovery-api/src/lib/meetings/ingest.ts` (`ingestGridCell`, `source:'app'` guard), `identity.ts`, and the homegroups create/edit/delete triggers (`onMeetingCreate/Update/Delete.ts`) + regroup mobile create (`meetingQueries.ts`). Decide the **public-vs-private flag**: only meetings representing real-world public recovery meetings enter the directory; private/internal (homegroup business meetings, regroup house meetings) and overlay fields (groupId/houseId/venmo/square/paypal) NEVER do.

**What to implement (COPY the existing recovery-api ingest pattern, `source:'app'`):**

1. recovery-api: add a service-key WRITE callable (e.g. `upsertDirectoryMeeting` / `deleteDirectoryMeeting`) that maps a product payload → `DirectoryMeeting` (`source:'app'`, `createdByApp`/`createdByUid`), using `identity.ts` for the id/geohash. Mirror `callable/findMeetings.ts` for auth + Zod + audit. Register in `index.ts`. TDD against `ingest.test.ts` patterns.
2. homegroups: in `onMeetingCreate.ts`/`onMeetingUpdate.ts`/`onMeetingDelete.ts`, when a meeting is public-directory-eligible, call the recovery-api write callable via the existing `api/recoveryApi.ts` client (extend it with `upsert`/`delete`). Keep the homegroups-private overlay in its own `meetings` doc keyed by the directory id.
3. regroup: add the write call at its custom-meeting create path (server callable preferred over client, for service-key auth). Preserve the `RatsMeeting` private fields locally.
4. On read, each product de-dupes its own `app`-sourced directory rows against its local copy (avoid double-listing).

**Verification checklist:**

- [ ] Create a public meeting in homegroups → it appears in `directoryMeetings` with `source:'app'`, `createdByApp:'homegroups'`, no overlay fields.
- [ ] That meeting is returned by regroup `findMeetings` for the same area (cross-app visible).
- [ ] Private/internal meetings do NOT enter the directory.
- [ ] Edit/delete propagate; `pruneStale` never removes `source:'app'`.

**Anti-pattern guards:** no direct cross-product Firestore writes — go through the recovery-api write callable; never write overlay/PII fields to the directory; never re-derive the geohash/id outside `identity.ts`.

---

## Phase 3 — Cleanup (B5) + dead-code removal

**What to do:**

- Delete now-dead external wrappers: regroup & homegroups `api/api.ts` `getAAMeetings`/`getNAMeetings`/`getCelebrateRecoveryMeetings` (zero importers — grep-verified) and orphaned entities (`AAMeetingResponse`/`NAMeetingResponse`/`CelebrateRecoveryMeeting`). Remove unused deps (`xml2js`, `moment`) from each `functions/package.json` if nothing else uses them (grep first).
- Confirm attendance proxy stays gone (already removed).
- Update launch-readiness docs (`speed-to-market-plan.md` B3/B4 → DONE; mark B5).

**Verification checklist:**

- [ ] `grep -rn "getAAMeetings\|getNAMeetings\|getCelebrateRecoveryMeetings\|xml2js\|require(\"moment\")" <product>/functions/src` → no matches after removal.
- [ ] `npx tsc --noEmit` clean in all three packages.
- [ ] `npx jest` green in all three packages.

**Anti-pattern guards:** grep for importers BEFORE deleting any symbol/dep; do not remove `partialGeocode`/geocode helpers still used by `geocodeNAMeeting`/`userIsAtMeeting`; do not remove `identity.ts`, `generateMeetingHash`, or geohash utils still referenced.

---

## Phase 4 — End-to-end verification

**What to do:**

1. Typecheck + full Jest in recovery-api, regroup/functions, homegroups/functions (expect: recovery-api 122+, regroup 574+, homegroups 659+).
2. **Cross-product smoke test (the acceptance for "works across apps"):** create a public meeting in app X (homegroups) → call app Y's (regroup) `findMeetings` for that location → confirm the meeting appears with the correct mapped client shape (`RatsMeeting` / `SerializedMeeting`), no overlay/PII leakage.
3. Read-only directory check: a seeded region returns AA/NA/CR via both products; audit rows are PII-safe (hashed uid only).
4. Maestro/E2E (optional): run the existing meeting-discovery flows against emulators wired to a seeded directory.

**Verification checklist:**

- [ ] All three suites green; both client contracts (`RatsMeeting[]`, `SerializedMeeting[]`) unchanged.
- [ ] Cross-app create→discover smoke test passes end-to-end.
- [ ] No PII in `directoryMeetingRequests`; no overlay fields in `directoryMeetings`.
- [ ] `speed-to-market-plan.md` updated; this plan's phases checked off.

---

## Suggested sequence

```
Phase 1  (deploy + initial seed)   ← unblocks all cross-app READ; do first
Phase 1B (seeding strategy)        ← unify HG AA onto directory + NA cron + reliable seed
Phase 2  (write-path)              ← unblocks cross-app for user-CREATED meetings
Phase 3  (cleanup/B5)              ← low-risk; retire HG populateMeetings scripts here
Phase 4  (E2E verify)              ← gates "works across apps" sign-off
```

Phase 1 is pure ops/deploy (no new app code) and delivers the bulk of the value
(shared external AA/NA/CR discovery). **Phase 1B is what keeps the data consistently
seeded going forward** — one store, daily AA/CR cron (already built) + a new monthly NA
cron, and homegroups unified onto the directory so there's no second AA store to maintain.
Phase 2 is the remaining engineering work for user-created meetings and is the larger build.
