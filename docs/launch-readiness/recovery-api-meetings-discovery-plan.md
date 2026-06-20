# Plan: Consolidate Meeting Discovery into recovery-api

**Status:** Draft plan (no code written)
**Date:** 2026-06-19
**Author:** engineering session
**Supersedes:** the H11 "route getResidentMeetingAttendance through recovery-api" approach (see Background)

---

## 1. Goal

Make **recovery-api the single owner of the meeting directory** — both
_discovery_ (retrieval of meetings by location/type/day/time) AND the
**user-created meetings** that products generate today. Both `homegroups` and
`regroup` become thin clients of one shared directory: they read from it for
search, and write to it when a user creates a public recovery meeting. This
replaces (a) the forked external-search logic and (b) the per-product custom
meeting stores that today make a meeting created in one app invisible to the other.

**In scope:**

1. **External directory search** (stateless) — AA, NA, AL-ANON, Religious,
   Celebrate Recovery — by location/type/day/time, plus geocoding helpers.
2. **User-created public meetings** (stateful) — meetings created in regroup or
   homegroups that represent real-world recovery meetings. These are reconciled
   into the shared directory so they are discoverable cross-product. recovery-api
   becomes their system of record (see §4a for the write-path options).

**Explicitly OUT of scope (product-owned, stateful):**

- **Attendance tracking.** Each product tracks its own users' attendance natively
  (regroup: Unified Activities per guest/week; homegroups: QR check-ins). Not shared.
- **Private / internal meetings.** A homegroup's private business meeting or a
  regroup house's internal resident meeting (`regroup:meeting` = a house meeting,
  a _different concept_ from a public 12-step meeting) must NOT enter the shared
  directory. The create flow must distinguish public-directory vs product-private.
- **Product-specific meeting metadata.** Group treasury/donation links (`venmo`,
  `square`, `paypal`), `groupId`/`houseId`, district/group internals — stay
  product-side and are not exposed cross-product even for a directory-public meeting.

**The reconciliation problem (the crux):** a created meeting has a _shared_ part
(name, location, type, day, time, format, online/link) and a _private_ part
(owner, payment links, internal IDs). The directory stores and serves the shared
part with provenance; the product keeps the private part keyed by the directory
meeting's id.

---

## 2. Background — why this replaces the H11 attendance work

This session originally "fixed" cross-product isolation (H11) by routing
`regroup.getResidentMeetingAttendance` through a new recovery-api proxy to
homegroups. Investigation then showed:

1. `getResidentMeetingAttendance` has **zero callers** in regroup (mobile/web/functions) — unwired/aspirational.
2. Regroup already tracks 12-step attendance **natively**; regroup residents and
   homegroups members are separate populations with separate stores.
3. The genuinely duplicated thing is **meeting discovery**, not attendance — a
   copy-paste fork of `findMeetings` + `util(s)/meetings.ts` across both products
   (corroborated by the 2026-06-06 duplication audit: "meeting-geo fork").

So the correct move is: **drop the attendance bridge/proxy** and consolidate
**discovery** instead.

### Cleanup to perform as part of this work

- Delete `regroup/functions/src/callable/homegroups.ts`
  (`getResidentMeetingAttendance`) and its test — unused.
- Revert the recovery-api attendance proxy added this session:
  `recovery-api/src/callable/meetingAttendance.ts` + `.test.ts`, its `index.ts`
  re-export, and the `RATS_API_KEY` / `HOMEGROUPS_MEETING_ATTENDANCE_URL`
  additions in `recovery-api/src/config.ts`.
- Revert regroup config additions made for that proxy:
  `RECOVERY_PLATFORM_API_KEY` / `RECOVERY_API_BASE_URL` in
  `regroup/functions/src/config.ts` — UNLESS the regroup client will reuse
  `RECOVERY_API_BASE_URL` to call the new discovery endpoint (likely yes; keep it).
- Revert the H11 "done" note in `docs/launch-readiness/TODO.md`; replace with a
  pointer to this plan.

---

## 3. Current state (ground truth)

| Product    | Discovery entry point                                         | Returns               | Validation         | Notes                                                                       |
| ---------- | ------------------------------------------------------------- | --------------------- | ------------------ | --------------------------------------------------------------------------- |
| regroup    | `callable/meetings.ts` → `findMeetings` (+ `userIsAtMeeting`) | `RatsMeeting[]`       | Zod (`parseInput`) | swallows errors → `[]`; supports "Celebrate Recovery"; geo-proximity check  |
| homegroups | `callable/findMeetings.ts`                                    | `SerializedMeeting[]` | none (raw cast)    | merges Firestore group/custom meetings; throws `HttpsError`; parallel fetch |

Shared util fork (near-identical, same misspelling `getNarcoticsAnoymousMeetings`):

- regroup: `util/meetings.ts`, `util/location.ts`, entities `Meeting.ts`,
  `GeocodeResponse.ts`, `AAMeetingResponse.ts`, `NAMeetingResponse.ts`,
  `CelebrateRecoveryMeeting.ts`, `MeetingLocation.ts`.
- homegroups: `utils/meetings.ts`, `utils/meetingUtils.ts`, `api/meetings.json`
  (bundled dataset), entities `Meeting.ts`.

**Discovery item (Phase 0):** read both `util(s)/meetings.ts` to confirm the
external sources (AA/NA meeting-finder APIs, Google geocoding) and reconcile the
two forks into one canonical implementation. The response shapes differ
(`RatsMeeting` vs `SerializedMeeting`) — Phase 0 must define one canonical
`DirectoryMeeting` shape.

---

## 4. Target design

`recovery-api` gains a meeting-discovery service:

- **Endpoint:** `findMeetings` callable (consistent with existing recovery-api
  callables: `onCall` + `requireServiceAuth`). Service-key auth (Phase 1), so
  homegroups/regroup call it server-to-server with `X-Service-Key` / `X-App-Id`.
  - Alternative: keep it an end-user callable invoked directly from each mobile
    client (Firebase Auth), since discovery isn't sensitive. **Open question (Q1).**
- **Input:** `{ filters: { location {lat,lng}, day?, type }, criteria?: {...} }`
  — superset reconciling both products' current schemas; Zod-validated.
- **Output:** canonical `DirectoryMeeting[]` (one agreed shape; ISO date strings).
- **Internals:** the reconciled meeting-search utils (AA/NA/AL-ANON/Religious/
  Celebrate Recovery fetchers + geocoding). Holds the `GOOGLE_MAPS_API_KEY`
  secret centrally. Bundled `meetings.json` (if still needed) lives here.
- **Caching (optional, later):** central cache for external directory results to
  cut latency and external API load. Not required for v1.

Each product keeps a thin local callable that:

1. calls recovery-api `findMeetings` for external/directory results, and
2. merges in its own Firestore custom/group meetings (product-specific), and
3. maps to its existing client response shape (so mobile/web need no change in v1).

`userIsAtMeeting` (geo-proximity verification) is regroup-only and stateless —
either move it to recovery-api alongside discovery or leave it in regroup. **Q2.**

---

## 5. Phased implementation

**Phase 0 — Reconcile the fork (discovery + design).** Read both
`util(s)/meetings.ts`; document external sources, params, and the two response
shapes. Define canonical `DirectoryMeeting` + input schema. Decide auth model (Q1).
Output: a short design note appended here. _No behavior change._

**Phase 1 — Build recovery-api `findMeetings` (TDD).** Port the reconciled utils
into recovery-api (`callable/findMeetings.ts`, `lib/meetings/*`, entities). Add
`GOOGLE_MAPS_API_KEY` secret to recovery-api config. Unit-test search routing +
geocoding with injected fetch (mirror the existing recovery-api handler/deps test
pattern). Register in `index.ts`.

**Phase 2 — Repoint regroup.** Rewrite regroup `findMeetings` to call recovery-api
for directory results and merge regroup-owned custom meetings; preserve the
`RatsMeeting[]` client contract. Keep/confirm `RECOVERY_API_BASE_URL`. Delete
regroup's forked `util/meetings.ts` directory-fetch internals. Update tests.

**Phase 3 — Repoint homegroups.** Same for homegroups: call recovery-api for
directory results, merge homegroups Firestore group/custom meetings, preserve the
`SerializedMeeting[]` contract. Delete homegroups' forked directory-fetch
internals. Update tests.

**Phase 4 — Cleanup + verify.** Execute the §2 cleanup (delete attendance bridge +
proxy). Run typecheck + full Jest in all three packages. Update launch-readiness
docs.

**Phase 5 (optional, post-launch) — Caching layer** in recovery-api for directory
results.

---

## 6. Risks & considerations

- **Response-shape drift.** regroup (`RatsMeeting`) and homegroups
  (`SerializedMeeting`) differ. v1 keeps each product's client contract by mapping
  at the product's thin callable — mobile/web untouched. Don't try to unify the
  _client_ shape in v1.
- **External API keys / rate limits.** Centralizing in recovery-api means one
  `GOOGLE_MAPS_API_KEY` budget and one set of external-source credentials; verify
  recovery-api's project (`recovery-platform`) has/needs those keys.
- **Latency / availability.** Adding a hop (product → recovery-api → external API).
  Discovery is not in a product's hot path the way attendance reads would be, and
  caching (Phase 5) mitigates. Acceptable.
- **Auth model (Q1).** Service-key (server-to-server) vs end-user callable changes
  the client wiring. Service-key keeps external creds off clients and matches the
  recovery-api pattern; end-user callable is simpler but exposes the endpoint
  directly to apps. Recommend service-key.
- **`meetings.json` ownership.** If homegroups' bundled dataset is a source, it
  moves to recovery-api; confirm regroup doesn't depend on a divergent copy.
- **Deprecation, not deletion, of duplicated callables.** Keep each product's
  `findMeetings` name/contract; only its _internals_ change. No client redeploy
  coupling.

## 7. Open questions

- **Q1 — RESOLVED (2026-06-19):** **service-key, via each product function** — not a direct end-user callable. A new requirement ("we need to know WHICH USERS hit the shared API") ruled out the unauthenticated/anonymous read path. Each product authenticates the end user against its OWN Firebase Auth, then calls recovery-api server-to-server with `X-Service-Key` + `X-App-Id` + `X-User-Uid`. recovery-api logs a per-request audit row (`appId` + **hashed** uid + query, **no email/PII**); attribution/audit only (no per-user rate-limit/authz). **No App Check** (clients never hit recovery-api directly). See stabilization plan Phase 4.
- **Q2:** Move `userIsAtMeeting` (geo-proximity) to recovery-api too, or leave in regroup?
- **Q3:** Are the external sources identical across the two forks, or has one
  product added sources the other lacks? (resolve in Phase 0)
- **Q4:** Does `recovery-platform` project already have the Google Maps / external
  meeting-API credentials provisioned?

## 7a. Code findings — meeting models (2026-06-19, partial)

From parallel read-only exploration of both functions codebases (stopped early on
session cost — items marked TODO still need confirming).

**homegroups** (`homegroups/functions`)

- Meetings persist in a flat `meetings` Firestore collection.
- Meeting shape: `name`, `time`, `day` ("0"–"6"), `type`
  (AA|NA|IOP|Religious|Celebrate Recovery|CUSTOM), location
  (`address`/`city`/`state`/`zip`/`lat`/`lng`/`geohash`), `online`/`link`/`onlineNotes`,
  and the **group/private overlay**: `groupId`, `groupName`, `venmo`, `square`,
  `paypal`, `verified`, `addedBy`, `createdAt`, `updatedAt`.
- **Group association:** one group → many meetings via the `groupId` field (no join
  collection). A group-hosted meeting is a _real directory meeting_ (e.g. an AA
  meeting the homegroup runs) carrying a homegroups-private overlay (which group
  owns it, donation links).
- Search utils composite external sources — AA (`getAAMeetings`), NA
  (`getNAMeetings`), Celebrate Recovery (`getCelebrateRecoveryMeetings`) — and merge
  Firestore CUSTOM meetings (`meetings` where `type == "Custom"`).
- TODO: the create/edit callable (addMeeting/saveMeeting?), the role of
  `api/meetings.json`, the `onGroupCreateFetchMeetings` trigger, and whether any
  public-vs-private flag exists.

**regroup** (`regroup/functions`)

- External 12-step results are **fetched live (no persistence)**; only CUSTOM
  meetings persist in Firestore (same `RatsMeeting` shape). Storage collection for
  custom meetings: TODO (in `api/firestore.ts` via `getMeetings()`).
- **No create/edit/delete meeting callable exists in functions** — only
  `findMeetings` + `userIsAtMeeting`. Custom meetings are created client-side or via
  another path. (Implication: the directory write-path can be _introduced_ in
  recovery-api without unwinding an existing regroup server create flow.)
- Same external sources (AAWS, NA World Services, Celebrate Recovery).
- TODO: how resident attendance references a meeting (id/snapshot vs doc link) — see
  `Week.ts`/`Day.ts`/activities.

**Design implications for §4/§4a**

- The two products share the meeting _shape_ but differ on persistence: homegroups
  persists everything in `meetings`; regroup persists only custom. A shared
  directory must hold the shared fields and let each product attach its private
  overlay (homegroups: group/payment; regroup: house) keyed by directory id.
- Group-hosted homegroups meetings are the clearest "created public meeting that
  must be discoverable cross-product" case — and the strongest test of the
  public-shared / private-overlay split.

## 8. Out of scope

Attendance tracking, identity reconciliation (regroup guest ↔ homegroups member),
unifying client-side meeting models, and any UI changes.
