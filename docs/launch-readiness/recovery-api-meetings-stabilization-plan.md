# Plan: Stabilize Meeting Seeding / Refresh / Storage / Retrieval (recovery-api directory)

**Status:** Execution-ready phased plan
**Date:** 2026-06-19
**Supersedes the implementation sections of:** `docs/launch-readiness/recovery-api-meetings-discovery-plan.md`
(that doc holds the rationale + scope decisions; THIS doc is the concrete, phase-by-phase build).

> **Authoring note for executors:** Each phase is self-contained and can run in a fresh
> chat context. Frame work as **COPY the cited pattern**, not "rewrite." Cite the exact
> source file:line listed in Phase 0 before writing code. If an API/method isn't in the
> Phase 0 "Allowed APIs" list, STOP and verify — do not invent it.

---

## Goal & guardrails

Make **recovery-api the system of record for the shared public meeting directory**, with:

1. **Seeding** — port homegroups' grid-sweep ingester into recovery-api.
2. **Refresh** — a scheduled job that keeps directory meetings current (the gap homegroups never closed).
3. **Storage** — one canonical `directoryMeetings` collection with a **frozen** doc-id + geohash scheme.
4. **Retrieval** — a cross-product read endpoint (geohash query against Firestore).

**Non-negotiable invariant — preserve each product's own meeting functionality.** This plan does
NOT change any product's client contract or product-specific behavior. Each product keeps:

- its own client-facing callable name + response shape (`regroup` → `RatsMeeting[]`,
  `homegroups` → `SerializedMeeting[]`);
- its own **custom-meeting store + CRUD** (both products: client-side writes to their own `meetings` collection);
- its own **attendance** model (regroup: `Activity.meetingId` projection; homegroups: `meetingInstances` + QR check-in);
- its own **product-private overlay** (homegroups: `groupId`/`groupName`/`venmo`/`square`/`paypal`/`verified`);
- its own **meeting→group synthesis** (homegroups only — stays product-side; it is the source of "orphaned meetings" and must NOT move into recovery-api).

recovery-api supplies the shared **directory** slice; each product **merges** its private/custom slice on top.

### Resolved decisions (carried from the discovery session)

| Decision                                 | Resolution                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| System of record                         | recovery-api `directoryMeetings` (full shared directory)                                                                                             |
| Read auth                                | **Unauthenticated** `onCall`/`onRequest` + rate-limit/cache; App Check as fast-follow. Data is public; cross-project end-user tokens are infeasible. |
| Write auth (user-created public meeting) | **Service-key via product function** (`requireServiceAuth` Phase-1: `X-Service-Key` + `X-App-Id` + `X-User-Uid`).                                    |
| Coverage strategy                        | **Grid sweep** (continental-US lat/lng grid), the only true coverage solution in-repo.                                                               |
| Idempotency                              | **Deterministic hashed doc id + `merge:true` upsert** + resumable cursor.                                                                            |
| Google Maps key                          | Lives ONLY in the ingester/refresh job, never on the read path.                                                                                      |

---

## Phase 0 — Documentation & "Allowed APIs" discovery (READ-ONLY, do first)

Consolidated from the 2026-06-19 discovery session. Re-confirm each file:line before copying.

### Patterns to COPY (canonical sources)

| Purpose                                                                                   | Copy from                                                                                                                          | Notes                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| recovery-api callable structure (pure `handle*(data, ctx, deps)` + thin `onCall` wrapper) | `recovery-api/src/callable/referrals.ts` (handler + wrapper at ~L20-100)                                                           | Deps (db/fetch) injected as last param.                                                                                 |
| recovery-api handler unit-test w/ injected deps                                           | `recovery-api/src/callable/referrals.test.ts` (mock `db` factory)                                                                  | For fetch-injected variant the now-reverted `meetingAttendance.test.ts` showed `makeFetch()` — re-derive, file deleted. |
| Service-key auth middleware                                                               | `recovery-api/src/middleware/auth.ts` `requireServiceAuth` (L29-64)                                                                | Phase-1 header path.                                                                                                    |
| App-id registry (SSOT)                                                                    | `recovery-api/src/config/apps.ts` (`homegroups`, `phoenix-cleanhouse` originators)                                                 |                                                                                                                         |
| Secret declaration                                                                        | `recovery-api/src/config.ts` (`defineSecret` from `firebase-functions/params`)                                                     | Add `GOOGLE_MAPS_API_KEY` here.                                                                                         |
| **Grid-sweep ingester**                                                                   | `homegroups/functions/scripts/populateMeetings.ts`                                                                                 | grid loop ~L421-425; batch upsert ~L514; cursor `script_progress/*` ~L362-391.                                          |
| Grid CONFIG (bounds/step/precision)                                                       | `homegroups/functions/scripts/shared-types.ts` L128-151                                                                            | `LAT 24→49, LON -125→-67, STEP 0.5`.                                                                                    |
| **Deterministic doc-id hash**                                                             | `homegroups/functions/scripts/shared-utils.ts` / `cleanMeetings.ts` L86-99                                                         | `sha1(name\|day\|time\|link\|formattedAddress).slice(0,24)`. Day deliberately in key.                                   |
| Meeting Guide API call                                                                    | `homegroups/functions/src/api/api.ts` `getAAMeetings`                                                                              | `https://api.meetingguide.org/app/v2/request?latitude=&longitude=` (no key).                                            |
| Celebrate Recovery fetch + XML parse                                                      | `homegroups/functions/src/api/api.ts` `getCelebrateRecoveryMeetings` + `regroup/functions/src/api/api.ts` (`xml2js`)               | `https://locator.crgroups.info/...` returns XML.                                                                        |
| Geocoding (Google)                                                                        | `regroup/functions/src/api/api.ts` (`GEOCODE`/`REVERSE_GEOCODE`/`PARTIAL_GEOCODE`/timezone)                                        | Uses `GOOGLE_MAPS_API_KEY`.                                                                                             |
| NA dataset query (geohash)                                                                | `homegroups/functions/src/api/firestore.ts` `getNaMeetings` + `regroup/functions/src/api/firestore.ts` `getNaMeetings`             | NA is a pre-seeded `na-meetings` Firestore collection, NOT a live API.                                                  |
| Geohash bounds read query                                                                 | `homegroups/functions/scripts/findMeetingsByLocation.ts` (geofire bounds)                                                          | Read pattern the new endpoint mirrors.                                                                                  |
| onSchedule (v2 cron) precedent                                                            | `homegroups/functions/src/triggers/pubsub/*` (14 cron jobs; e.g. `scheduledInstanceGenerator`)                                     | Use `firebase-functions/v2/scheduler` `onSchedule`.                                                                     |
| Per-product client contract (regroup)                                                     | `regroup/functions/src/callable/meetings.ts` `findMeetings` → `RatsMeeting[]`; client `regroup/mobile/src/services/meeting.ts`     | Keep contract identical.                                                                                                |
| Per-product client contract (homegroups)                                                  | `homegroups/functions/src/callable/findMeetings.ts` → `SerializedMeeting[]`; client `homegroups/mobile/src/models/MeetingModel.ts` | Keep contract identical.                                                                                                |

### Allowed APIs (verified to exist)

- `firebase-functions/v2/https`: `onCall`, `onRequest`, `HttpsError`, `CallableRequest`.
- `firebase-functions/v2/scheduler`: `onSchedule`.
- `firebase-functions/params`: `defineSecret`.
- `firebase-admin/firestore`: `getFirestore`, `collection().doc(id).set(data, {merge:true})`, batched writes (`db.batch()`), `where`, geohash range queries.
- `geofire-common`: `geohashForLocation`, `geohashQueryBounds`, `distanceBetween` (already used in homegroups).
- External: Meeting Guide `api.meetingguide.org/app/v2/request` (keyless); Celebrate Recovery `locator.crgroups.info` (keyless, XML); Google Maps Geocode/Timezone (keyed).

### Anti-patterns to AVOID (verified failure modes from homegroups)

- ❌ **Drifting hash recipe / geohash precision** across writers — homegroups used precision 5/8/9/10 in different scripts → duplicate + orphan docs. **Freeze ONE recipe and ONE precision.**
- ❌ **Skip-if-exists ingestion** — `populateMeetings.ts` only inserts new docs, so it never refreshes changed data. The refresh job MUST update + stamp `lastRefreshedAt`.
- ❌ **Coupling ingestion with meeting→group synthesis** — that coupling produced "orphaned meetings." Keep them separate; synthesis stays product-side.
- ❌ `ngeohash` used but not imported (the `meetingUtils.ts` ReferenceError bug) — verify imports.
- ❌ Casing split `"Custom"` (query) vs `"CUSTOM"` (enum) and `day` as `"0".."6"` vs weekday-name — pick ONE canonical representation in the directory shape.
- ❌ Putting the Google Maps key on the read path. Reads must be pure Firestore.

**Phase 0 output:** a one-page "Allowed APIs + Copy-from" sheet (the table above), re-verified.

---

## Phase 1 — Canonical `DirectoryMeeting` shape + frozen id/geohash scheme

**What to implement (recovery-api):**

1. `recovery-api/src/entities/DirectoryMeeting.ts` — one canonical interface reconciling `RatsMeeting` ⟷ `SerializedMeeting`:
   - **Public fields only:** `id` (hashed), `source: 'external' | 'app'`, `externalId?`, `provider: 'AA'|'NA'|'CELEBRATE_RECOVERY'|'CUSTOM'`, `name`, `type`, `day` (**canonical: integer 0–6**), `time` (`"HH:mm"`), `format?`, `location { address?, city?, state?, zip?, lat, lng, geohash }`, `online?`, `link?`, `onlineNotes?`, `timezone?`, `createdByApp?`, `createdByUid?`, `lastRefreshedAt`, `lastSeenAt`, `createdAt`, `updatedAt`.
   - **NO product-private fields** (`venmo`/`square`/`paypal`/`groupId`/`houseId`/`verified`/`addedBy`). Those stay product-side.
2. `recovery-api/src/lib/meetings/identity.ts` — FROZEN helpers (copy hash recipe from `cleanMeetings.ts:86-99`):
   - `directoryMeetingId(m)` = `sha1(name|day|time|link|formattedAddress).slice(0,24)`.
   - `directoryGeohash(lat,lng)` = `geohashForLocation([lat,lng])` (geofire-common default precision — pick once, document it).
   - A single `GEOHASH_PRECISION` constant + single normalization (`normalizeDay`, `normalizeTime`).

**Verification checklist:**

- [ ] `directoryMeetingId` is pure + deterministic (unit test: same input → same id; day change → different id).
- [ ] `day`/`time` normalizers cover numeric + weekday-name + `HH:MM:SS` inputs (the formats both products emit).
- [ ] No private-overlay field appears in `DirectoryMeeting`.
- [ ] `tsc --noEmit` green in recovery-api.

**Anti-pattern guards:** grep recovery-api for any second hashing/geohash helper — there must be exactly one of each.

---

## Phase 2 — Directory storage + seeding (grid-sweep ingester)

**What to implement (recovery-api):**

1. `recovery-api/src/lib/meetings/sources/` — port the external fetchers (COPY from homegroups/regroup `api/api.ts`):
   - `meetingGuide.ts` (AA), `celebrateRecovery.ts` (XML via `xml2js`), `geocode.ts` (Google, behind `GOOGLE_MAPS_API_KEY`).
   - NA is NOT fetched live — see Phase 2b.
2. `recovery-api/src/lib/meetings/ingest.ts` — `ingestGridCell(lat, lng, deps)`: fetch → map to `DirectoryMeeting` (`source:'external'`) → upsert `directoryMeetings/{directoryMeetingId}` with `merge:true`, stamp `lastRefreshedAt`/`lastSeenAt`. Batch writes (`BATCH_SIZE=500`).
3. `recovery-api/src/scripts/seedDirectory.ts` — one-off grid sweep (COPY `populateMeetings.ts` grid loop + `script_progress`/`refreshState` resumable cursor). Continental-US bounds from `shared-types.ts:128-151`.
4. Add `GOOGLE_MAPS_API_KEY = defineSecret(...)` to `recovery-api/src/config.ts`.

**Verification checklist:**

- [ ] Re-running `ingestGridCell` on the same cell produces **zero new docs** (idempotent upsert) — integration test with injected fetch + Firestore mock/emulator.
- [ ] Upsert updates `lastSeenAt`/`lastRefreshedAt` on existing docs (NOT skip-if-exists).
- [ ] `source:'app'` docs are never touched by ingestion (guard + test).
- [ ] Seed script resumes from cursor after interruption.

**Anti-pattern guards:** grep for `.add(` in ingestion (must be `.doc(id).set(...,{merge:true})`); grep for skip-if-exists logic and confirm it's gone.

---

## Phase 2b — NA dataset migration (seed once)

**What to implement:** migrate the `na-meetings` dataset into recovery-api as canonical `directoryMeetings` (`provider:'NA'`, `source:'external'`).

- COPY the NA shape from `homegroups/functions/src/api/firestore.ts` / entities; map to `DirectoryMeeting`.
- One-off migration script reading the existing `na-meetings` collection (the bulk NA World Services import). NA refreshes rarely → manual/seasonal, not on the cron.

**Verification checklist:**

- [ ] NA docs queryable by geohash in `directoryMeetings`.
- [ ] Count parity vs source `na-meetings` (allowing dedupe on hashed id).
- [ ] Each product still has its own `na-meetings` until repointed (Phases 4/5) — do NOT delete source data yet.

**Anti-pattern guard:** do not cross-query a product's Firestore from recovery-api at runtime — this is a one-off migration, run with explicit per-project admin credentials, not a live cross-project read.

---

## Phase 3 — Scheduled refresh (the part that was missing)

**What to implement (recovery-api):**

1. `recovery-api/src/triggers/refreshDirectory.ts` — `onSchedule` (copy a homegroups pubsub cron for structure). Each run:
   - reads `refreshState` cursor, processes a **slice** of grid cells (bounded per run), calls `ingestGridCell`, advances cursor; a full cycle completes over the configured period (**default: weekly, sliced nightly**).
   - stamps `lastRefreshedAt`/`lastSeenAt`.
2. **Stale prune** — a step (or sibling scheduled job) that removes/flags `directoryMeetings` where `source:'external'` AND `lastSeenAt` older than N full cycles. **Never prune `source:'app'`.**
3. Bind `GOOGLE_MAPS_API_KEY` to the scheduled function only.

**Verification checklist:**

- [ ] Cursor advances and wraps; a full cycle covers the whole grid (unit test the slicing math).
- [ ] Refresh updates an existing doc's fields + `lastRefreshedAt` (test with a changed external record).
- [ ] Prune deletes only stale `source:'external'`; a stale `source:'app'` doc survives (test).
- [ ] Key is bound on the scheduled fn, absent from the read endpoint.

**Anti-pattern guards:** grep the read endpoint module for `GOOGLE_MAPS_API_KEY` / external URLs — must be none.

---

## Phase 4 — Cross-product read endpoint (retrieval)

**What to implement (recovery-api):**

1. `recovery-api/src/callable/findMeetings.ts` — handler `handleFindMeetings(data, deps)` + thin wrapper (COPY referrals structure, but **no service-key on the read** — public). Input: `{ location {lat,lng}, day?, type?, radiusMeters? }` (Zod-validated). Query `directoryMeetings` by `geohashQueryBounds` + distance filter (COPY `findMeetingsByLocation.ts`). Output: `DirectoryMeeting[]`.
2. **Rate-limit/cache:** add a lightweight per-cell result cache (Firestore-doc or in-memory TTL) + basic IP/quota guard (none exists in-repo — build minimal). Document App Check as fast-follow.

**Verification checklist:**

- [ ] Returns directory results for a known seeded location; respects `day`/`type` filters.
- [ ] No auth required; no external API hit on read (pure Firestore) — test with external fetch mock asserting **zero** calls.
- [ ] Handler unit-tested with injected Firestore (mirror referrals.test.ts).

**Anti-pattern guards:** confirm endpoint does not import any `sources/` fetcher.

---

## Phase 5 — Repoint regroup (preserve `RatsMeeting[]` contract + nuances)

**What to implement (regroup, behavior-preserving):**

1. Rewrite `regroup/functions/src/callable/meetings.ts` `findMeetings` internals to: call recovery-api `findMeetings` for the **directory** slice, then **merge regroup's own custom meetings** (`getCustomMeetings` from the regroup `meetings` collection — UNCHANGED), map directory results → `RatsMeeting`, preserve the existing error-swallow-→`[]` behavior and `"Celebrate Recovery"` handling.
2. **Keep intact:** `userIsAtMeeting` (geo proximity, regroup-only); client-side CRUD in `regroup/mobile/src/services/meeting.ts` (`addMeeting`/`updateMeeting`/`deleteMeeting` direct to `meetings`); attendance `Activity.meetingId` projection; client-side filtering/sort in `MeetingResultsList.tsx`; check-in gating.
3. Delete only the **forked directory-fetch internals** that recovery-api now owns (regroup `util/meetings.ts` AA/CR fetchers), NOT the custom-meeting path.
4. Reuse `RECOVERY_API_BASE_URL` (re-add if needed) for the recovery-api call.

**Verification checklist:**

- [ ] `findMeetings` still returns `RatsMeeting[]`; mobile untouched.
- [ ] Custom meetings still appear in results; CRUD still works.
- [ ] `userIsAtMeeting` unchanged; attendance check-in unchanged.
- [ ] regroup functions Jest green.

**Anti-pattern guards:** grep regroup for direct Meeting-Guide/CR fetch calls — should be gone; custom-meeting + na-meetings paths remain until fully migrated.

---

## Phase 6 — Repoint homegroups (preserve `SerializedMeeting[]` + overlay/group nuances)

**What to implement (homegroups, behavior-preserving):**

1. Rewrite `homegroups/functions/src/callable/findMeetings.ts` internals to: call recovery-api `findMeetings` for the **directory** slice, then **merge homegroups' product-owned meetings** (Firestore `meetings` group/custom rows — UNCHANGED query), serialize to `SerializedMeeting` (overlay fields `groupId`/`groupName`/`venmo`/`square`/`paypal`/`verified` filled from the product row), preserve `HttpsError` semantics. Keep the search response's `groupId`/"claimed" marker.
2. **Keep intact:** `meetingInstances` + QR check-in; `createGroupWithSubscription` meeting writes; meeting→group synthesis (seeding/orphan scripts) — **all stay product-side**; group-screen overlay (`group.paymentLinks`).
3. Delete only the forked directory-fetch internals recovery-api now owns. Fix the casing/`day` normalization at the product↔directory boundary.

**Verification checklist:**

- [ ] `findMeetings` still returns `SerializedMeeting[]`; overlay fields present where the product owns them.
- [ ] Group/custom meetings still merge; QR check-in + `meetingInstances` unchanged.
- [ ] homegroups functions Jest green; rules tests green.

**Anti-pattern guards:** grep homegroups for the disabled `onGroupCreateFetchMeetings` — leave disabled (do not wire ingestion into homegroups; recovery-api owns it now). Confirm group-synthesis scripts untouched.

---

## Phase 7 — Verification & cleanup

1. **Typecheck + full Jest** in recovery-api, regroup/functions, homegroups/functions — all green.
2. **Anti-pattern sweep (grep):** single hash recipe + single geohash precision repo-wide in the directory path; no Google key on read path; no skip-if-exists in refresh; `source:'app'` never pruned/clobbered; product client contracts unchanged.
3. **Idempotency proof:** run seed twice against the emulator → doc count stable.
4. **Refresh proof:** simulate a changed external record → `lastRefreshedAt` advances, fields update.
5. **Nuance regression:** smoke each product's findMeetings (directory + custom merge), attendance, regroup `userIsAtMeeting`, homegroups QR check-in.
6. Update `docs/launch-readiness/TODO.md` and tidy `regroup/functions/CLAUDE.md` (still references the deleted `callable/homegroups.ts`).
7. Migration cutover: only after products read from recovery-api and parity is confirmed, retire each product's duplicated `na-meetings`/directory data (keep a rollback window).

---

## Open items to confirm before/within execution

- **Refresh cadence** default: full grid weekly, sliced nightly (adjustable). NA: manual/seasonal.
- **Geohash precision** value to freeze (recommend matching the read query precision used in `findMeetingsByLocation.ts`).
- **App Check**: fast-follow after launch (greenfield on both mobile apps).
- **User-created public-meeting WRITE path (§4a of the discovery doc):** service-key product-function → recovery-api `upsertDirectoryMeeting`. Can be a follow-on phase once read consolidation is stable.

## Out of scope

Attendance tracking, identity reconciliation, client-side meeting-model unification, UI changes, and meeting→group synthesis (stays product-side).
