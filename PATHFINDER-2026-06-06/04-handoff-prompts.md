# Pathfinder — Handoff Prompts

**Date:** 2026-06-06

Each block below is a ready-to-run `/make-plan` prompt for one unified system from `03-unified-proposal.md`. Copy a block verbatim. They are ordered by priority: **U1 (security) first**, then the safe cross-product extractions, then intra-product cleanups. Run them independently — none blocks another except where noted.

---

## U1 — Route cross-product attendance through recovery-api (CRITICAL / security)

```
/make-plan

Goal: Eliminate the cross-product isolation violation where regroup calls homegroups' Cloud Function directly. Route the resident meeting-attendance read through recovery-api (the platform integration bus), per recovery-platform/CLAUDE.md "Data isolation" rule.

Target unified component + single entry point:
- NEW recovery-api callable `getResidentMeetingAttendance` in recovery-api/src/callable/attendance.ts, gated by requireServiceAuth (recovery-api/src/middleware/auth.ts:22), mirroring the shape of recovery-api/src/callable/referrals.ts:72.

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md C1):
- regroup/functions/src/callable/homegroups.ts:8-10 — DELETE hardcoded URL `recovery-connect-prod/getMeetingAttendance` and the RATS_API_KEY env it sends.
- regroup/functions/src/callable/homegroups.ts:105 — replace the raw `fetch(RC_URL, { Authorization: Bearer RATS_API_KEY })` with a recovery-api client call carrying X-Service-Key + X-App-Id: phoenix-cleanhouse + X-User-Uid. KEEP the existing resident/house-admin check at homegroups.ts:80 (it gates who in regroup may ask).
- homegroups/functions/src/http/getMeetingAttendance.ts:39-53 — narrow the accepted caller to recovery-api only (a recovery-api-only token, not a secret shared with regroup); ADD the authorization it currently skips: verify the asserted X-User-Uid is a member of groupId before returning meetingInstances data (getMeetingAttendance.ts:69-75).
- recovery-api: add the new callable that holds the single credential to homegroups and forwards the read.
- regroup/functions/CLAUDE.md — correct the false claim that this bridge already routes "via recovery-api".

Decide alongside this (see report D1): recovery-api's referral API (referrals.ts:72/80/88) currently has ZERO live callers. Either wire detox-recovery's disabled fireReferral (app/api/contact/route.ts:28,36) + add a regroup referral client, OR delete the referral API until a consumer exists. Include a recommendation in the plan.

Flowcharts for context: PATHFINDER-2026-06-06/01-flowcharts/recovery-api.md, regroup-core.md, homegroups-core.md.

Anti-pattern guards:
- Do NOT keep the direct regroup→homegroups path behind a flag. Remove it.
- Do NOT introduce a generic "cross-product gateway" abstraction — add ONE callable matching the existing referrals.ts/users.ts pattern.
- recovery-api must hold the ONLY credential to homegroups; regroup must never hold a homegroups secret again.
- Treat attendance data as recovery-status-adjacent PII — apply the platform no-PII-logging rule end to end.
```

---

## U2 — Extract shared `meetings-geo` library (HIGH / safe dedup)

```
/make-plan

Goal: Replace the drifting verbatim fork of meeting-finder + geo code between homegroups and regroup with a single shared, credential-free TypeScript library. Delete both forks.

Target unified component + single entry point:
- NEW package shared/meetings-geo/ (plain TS, NO Firebase dependency). Exports: getDistance (haversine), getGeohashRange / getQueriesForDocumentsAround, locationIsInArea, getAddressFromGeocode, the MeetingTypeFilters union, AA/NA/Oxford/Celebrate feed adapters, and the Meeting + GeocodeResponse types. Single import surface: `@recovery/meetings-geo`.

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md D2):
- homegroups/functions/src/callable/findMeetings.ts:7-12 — import from the shared package instead of utils/meetings.ts + utils/location.ts.
- regroup/functions/src/callable/meetings.ts:7-14 — import from the shared package instead of util/meetings.ts + util/location.ts + util/geohash.ts.
- DELETE the forked copies after migration: homegroups/functions/src/utils/{location.ts,meetings.ts}; regroup/functions/src/util/{location.ts,meetings.ts,geohash.ts}.
- Reconcile to the SUPERSET: keep regroup's GeoFire bbox (geohash.ts, 210 lines) and getCelebrateMeetings as package functions; fix the shared `getNarcoticsAnoymousMeetings` misspelling once in the package.
- Google Maps API key stays a per-product secret PASSED INTO the library (library stays credential-free).

Flowchart for context: PATHFINDER-2026-06-06/01-flowcharts/homegroups-core.md (Meetings), regroup-core.md (Meetings).

Anti-pattern guards:
- Do NOT keep either fork "in case they diverge" — they query identical public AA/NA feeds; there is no specialization to preserve.
- Do NOT add a Firebase or Functions dependency to the shared lib — inputs (lat/lng, API key, filters) are passed in; outputs are plain data.
- Verify behavior parity with the existing geohash magic constants (0.0144927536231884 / 0.0181818181818182) — do not "clean them up".
```

---

## U3 — Seed `shared/` with product-agnostic types + PII-safe logging policy (MEDIUM)

```
/make-plan

Goal: Populate the empty shared/ package with (a) the product-agnostic types currently forked per product, and (b) a dependency-free PII-safe logging POLICY module to satisfy the platform-wide no-PII-logging rule. Fix the one known PII-logging drift.

Target unified components + single entry points:
- NEW shared/types/ — Meeting, GeocodeResponse, LatLng, MeetingTypeFilters ONLY. Do NOT move User or Referral (different meaning per product — legitimate specialization). Re-exported by shared/meetings-geo (coordinate with U2).
- NEW shared/logging/ — a POLICY module, not a logger binding: sanitizeError(err): string and a loggable-field allow-list / assertNoPII(fields). Each runtime imports the policy and feeds its own logger.

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md D3, D8):
- regroup/functions/src/util/notifications.ts:62-66 — STOP logging device tokens; route the error through sanitizeError.
- regroup/functions/src/callable/homegroups.ts:98,134 — stop logging {userId, groupId} raw; use the allow-list.
- recovery-api / homegroups / detox — adopt sanitizeError at API error boundaries (replace hand-rolled fixed strings where present).
- Forked Meeting/GeocodeResponse types in homegroups & regroup entities/ — re-point to shared/types.

Anti-pattern guards:
- Do NOT build a shared logger INSTANCE — the four runtimes (Functions v2, Functions v1, Next.js node/edge) differ; a binding forces a lowest-common-denominator dependency. Export POLICY (pure functions) only.
- Do NOT move product-specific entities (User, Referral) into shared/ — name collisions are real (see report D1).
```

---

## U4a — homegroups Functions: `requireGroupAdmin` + `getOrCreateStripeCustomer` (HIGH)

```
/make-plan

Goal: Extract two repeated server-side blocks in homegroups Cloud Functions into thin helpers, and fix a latent admin-field divergence bug while doing so.

Target unified components + single entry points:
- NEW homegroups/functions/src/utils/requireGroupAdmin.ts → requireGroupAdmin(request, groupId): { groupRef, groupData } (throws unauthenticated / not-found / permission-denied).
- NEW homegroups/functions/src/utils/stripeCustomer.ts → getOrCreateStripeCustomer(ref, data, email): customerId (idempotent).

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md HG-1, HG-2):
- requireGroupAdmin replaces the auth→group-load→admin-check preamble in the 19 group-scoped callables, including createStripeCheckoutSession.ts:34-64 and createGroupSubscription.ts:66-97. (grep `admins.includes`/`adminUids.includes` across functions/src/callable for the full list.)
- MUST FIX the divergence: createStripeCheckoutSession.ts:58 reads `admins || adminUids` but createGroupSubscription.ts:90 reads only `admins`. Standardize the helper on `admins || adminUids || []`.
- getOrCreateStripeCustomer replaces the get-or-create blocks at createStripeCheckoutSession.ts:66-78, createGroupSubscription.ts:111-126, createStripePaymentIntent.ts:61-71 (and createCustomerPortalSession.ts:55, setupSubscriptionPaymentMethod.ts:68). Standardize on the idempotency-key variant.

Flowchart for context: PATHFINDER-2026-06-06/01-flowcharts/homegroups-finance.md.

Anti-pattern guards:
- Thin extract-method only. requireGroupAdmin returns { groupRef, groupData } and throws; it does NOT become a decorator/middleware framework.
- Do NOT change any callable's external behavior except to FIX the admin-field reading consistently.
```

---

## U4b — homegroups mobile: `createApiThunk` / `callFunction` (HIGH / volume)

```
/make-plan

Goal: Collapse ~200 repeated Redux createAsyncThunk bodies (try/catch/rejectWithValue + httpsCallable) across 26 slices into two thin wrappers.

Target unified components + single entry points:
- NEW homegroups/mobile/src/store/apiThunk.ts → createApiThunk(name, payloadFn, fallbackMsg) and callFunction<TIn,TOut>(name, params).

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md HG-3, HG-4):
- Representative slices to migrate first: treasurySlice.ts:46-130, membersSlice.ts:80-122, adminRemovalSlice.ts:64-157. Then sweep the remaining 23 slices in store/slices/.
- callFunction replaces the `functions().httpsCallable('name')(params); return result.data` idiom seen in adminRemovalSlice.ts:108-157, groupsSlice.ts, referralSlice.ts, intergroupSlice.ts.

Anti-pattern guards:
- Keep per-slice state shapes (lastFetched maps, entity adapters) — do NOT force them into a generic store. Only the thunk body is shared.
- Do NOT migrate extraReducers pending/fulfilled/rejected triads in this plan (report HG-5 — partly legitimate; out of scope).
- Migrate incrementally; verify each slice's tests pass before the next.
```

---

## U4c — regroup: single entity source of truth + auth guards (HIGH + MEDIUM)

```
/make-plan

Goal: (RG-1) Eliminate the regroup entity definitions duplicated across functions/ and mobile/, which have ALREADY drifted. (RG-2/RG-3) Extract repeated callable auth/house-load preambles.

Target unified components + single entry points:
- ONE entity source of truth for User/House/Guest/Meeting/OperatorSubscription/Roles/BaseEntity (regroup/shared-entities, or shared/ if coordinating with U3). Plain interfaces as the core; layer mobile yup schemas + JSX extras ON TOP — do not push them into the backend copy.
- NEW regroup/functions/src/util/guards.ts → requireSelf(request, claimedUid) and loadHouseOrThrow(houseId).

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md RG-1, RG-2, RG-3):
- Entity twins to merge (cite drift): functions/src/entities/User.ts:14 (emailVerified=false) vs mobile/src/entities/User.tsx:74 (emailVerified=true) — reconcile to one definition + one default. Same for House, Guest, Meeting, OperatorSubscription, Roles, BaseEntity.
- requireSelf replaces the self-identity preamble at subscriptions.ts:159-171,274-281,312-319,352-359,441-448,557-563 and payments.ts:96,183,236,283,307.
- loadHouseOrThrow replaces the house-load preamble at payments.ts:111-114,382-386,513-517,614-618.

ALSO FIX (report C1b — latent authz bug): util/claims.ts:32-35 writes admin/guest claims as ARRAYS but util/houseAuth.ts:74 + homegroups.ts:48 read them as OBJECTS/maps. Reconcile to one shape across writers and readers.

Anti-pattern guards:
- Do NOT keep two entity copies "synced" — pick one source; the build must fail if a field drifts.
- guards are thin throwing helpers, not a middleware framework.
- The claims-shape fix is security-sensitive: write a test proving admin/guest claims round-trip identically through writer and reader before refactoring.
```

---

## U4d — detox-recovery: `guardPostRequest` + exported `EMAIL_RE` (MEDIUM / security-contract)

```
/make-plan

Goal: Replace the duplicated ~25-line security preamble and the identical EMAIL_RE across the two POST routes with one wrapper that ENFORCES the documented security contract for all future routes.

Target unified component + single entry point:
- NEW detox-recovery/lib/post-guard.ts → guardPostRequest(req, bucket): { body } | Response (runs origin → rate-limit → parse → honeypot in the mandated order). Export EMAIL_RE from lib/abuse-protection.ts.

Exact call sites to rewrite (evidence from PATHFINDER-2026-06-06/02-duplication-report.md DX-1):
- app/api/contact/route.ts:49-83 — replace the inline preamble with guardPostRequest; import EMAIL_RE (currently redefined at :81).
- app/api/subscribe/route.ts:29-64 — same; import EMAIL_RE (currently redefined at :58).
- Keep route-specific logic LOCAL: contact's name/message validation + fireReferral; subscribe's tag/group validation.

Flowchart for context: PATHFINDER-2026-06-06/01-flowcharts/detox-recovery.md (Abuse-Protection Pipeline).

Anti-pattern guards:
- Preserve the EXACT ordering (origin → rate-limit → parse → honeypot) — it is a documented security contract (detox-recovery/CLAUDE.md).
- Do NOT consolidate the two in-memory rate limiters (edge middleware.ts + handler checkRateLimit) — they are intentionally layered; leave both.
- guardPostRequest returns either a parsed body or a Response; the handler must early-return the Response unchanged.
```

---

## Suggested order

1. **U1** — security violation; do first. Decide D1 (referral wire-up vs delete) with it.
2. **U2 + U3** — safe cross-product dedup; U3's shared/types coordinates with U2.
3. **U4a–U4d** — independent intra-product cleanups; parallelizable across products.
