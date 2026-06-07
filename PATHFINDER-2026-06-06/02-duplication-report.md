# Pathfinder — Duplication Report

**Date:** 2026-06-06
**Method:** Two parallel agents (within-feature + cross-feature) read all 6 flowcharts and every seed file end-to-end, grep-verified cross-call wiring, and confirmed `shared/` is empty (0 files). Every claim below cites ≥2 `file:line` locations.

> **Framing.** The platform's stated future (root CLAUDE.md → Integration Map) is that **recovery-api becomes the integration bus** and all cross-product flows route through it. Measured against that intent, almost nothing does. Findings are split into **correctness/security** (not duplication), then **duplication** ranked by whether unification is safe. Two products on two Firebase projects with two billing models are **legitimate specialization** even when code rhymes — those are called out and left alone.

---

## CRITICAL — correctness / security (not duplication)

### C1. Cross-product isolation VIOLATION — regroup calls homegroups' Cloud Function directly, bypassing recovery-api

Root CLAUDE.md is explicit: _"Never cross-query Firestore across products. Cross-product data flows must go through recovery-api."_ regroup's own `functions/CLAUDE.md` claims this bridge routes "via recovery-api." **It does not.**

- **Caller:** `regroup/functions/src/callable/homegroups.ts:69` (`getResidentMeetingAttendance`). Target hardcoded at `:8-10` (`RC_MEETING_ATTENDANCE_URL ?? "https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance"`); outbound `fetch` at `:105` with `Authorization: Bearer ${RATS_API_KEY}` (`:106`).
- **Data crossing the boundary:** `userId` + `groupId` outbound (`:94-96`); response carries a resident's **meeting attendance history** — `checkIns[]` (`instanceId`, `meetingId`, `scheduledAt`, `attendeeCount`) (`homegroups.ts:24-30`). Recovery-status-adjacent PII flowing `recovery-connect-cad4b` → `phoenix-cleanhouse`.
- **Receiver:** `homegroups/functions/src/http/getMeetingAttendance.ts:39` (handler), exported `:108`. Auth = a single shared static secret `RATS_API_KEY` via constant-time compare (`:44-53`, `safeStringEqual:29`); queries homegroups' `meetingInstances` directly (`:69-75`).
- **Trust model:** one shared secret in both projects' Secret Manager gates the entire channel. No per-user token exchange, no recovery-api, no `X-Service-Key`/`X-App-Id` envelope. **homegroups performs no authorization of its own** — anyone holding `RATS_API_KEY` can read any resident's attendance.
- **regroup's own gate is over-broad (source-verified):** `assertCanAccessAttendance` (`homegroups.ts:41-53`) allows the resident themselves (`callerUid === targetUserId`) OR **any** house admin (`Object.keys(adminClaims).length > 0`, `:48`). There is no check that the admin manages a house the resident belongs to, nor that the resident is in `groupId` — so a house admin of house A can read attendance for a resident of house B. Fixing C1 must add house/group-scoped authz on **both** sides, not just relocate the hop.

**This is a security/correctness concern, not duplication** — and the single best candidate to be _replaced_ by a real recovery-api endpoint (recovery-api already has the auth-envelope machinery). The CLAUDE.md claim that it routes "via recovery-api" is factually wrong and must be corrected regardless.

### C1b. CONFIRMED authz bug (source-verified) — claim shape mismatch (writer arrays vs reader maps)

The writer and readers disagree on the shape of `admin`/`guest` custom claims, verified at source on 2026-06-07:

- **Writer — arrays of houseId strings.** `regroup/functions/src/util/claims.ts`: `parseCurrentClaims:14-16` normalizes `admin`/`guest`/`superAdmin` as `string[]`; `createClaims:32-35` writes `{ [role]: Array.from(new Set([...current, ...houseIds])) }` → e.g. `admin: ["houseA","houseB"]`.
- **Reader (under-permits) — `houseAuth.ts:74`** `assertHouseMemberFromClaims` does `houseId in adminClaims` (map semantics). `"houseA" in ["houseA"]` tests array **keys** (`"0"`, `"length"`, …), never values → **always false**. The claims-based member check is effectively broken; only `checkIsMember`'s Firestore ground-truth path (`:42-59`) saves legitimate admins/guests.
- **Reader (over-permits) — C1 bridge `homegroups.ts:48`** does `Object.keys(adminClaims).length > 0`. `Object.keys(["houseA"])` is `["0"]`, length 1 → **passes for any non-empty array**, but cannot scope to a house.

Net: the same mismatch **under-permits** on one path (broken member check) and **over-permits** on another (unscoped admin gate). Pick **arrays-of-houseId** (the writer's shape) as the single source of truth and fix `houseAuth.ts:74` to `(adminClaims ?? []).includes(houseId)`, with a regression test proving a real admin passes the member check **and** is house-scoped. Tracked in handoff U4c.

---

## Duplication findings (ranked)

| #          | Concern                                                                 | Class                                    | Rank                           | Action                                                                          |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| **C1**     | regroup→homegroups direct call, bypasses recovery-api                   | Security/correctness                     | **CRITICAL**                   | Route through recovery-api; homegroups does no authz; fix false CLAUDE.md claim |
| **D2**     | Meeting finder / geo (`location.ts`, `meetings.ts`, `geohash.ts`)       | Accidental fork                          | **HIGH**                       | Extract shared `meetings-geo` package                                           |
| **D8**     | Duplicated entities + empty `shared/`                                   | Accidental (product-agnostic types only) | **MEDIUM**                     | Move `Meeting`/`GeocodeResponse`/geo types to `shared/`                         |
| **D3**     | PII-safe logging / error sanitization                                   | Reimplemented, no shared module          | **MEDIUM**                     | Extract policy module to `shared/`; fix regroup token-logging                   |
| **RG-1**   | regroup entities defined in functions AND mobile (drifting)             | Intra-product duplication                | **HIGH**                       | Single source of truth for regroup entities                                     |
| **HG-1**   | homegroups callable auth+group-load+admin-check preamble (19 callables) | Intra-product duplication                | **HIGH**                       | `requireGroupAdmin()` helper                                                    |
| **HG-3/4** | ~200 Redux thunk try/catch/rejectWithValue + httpsCallable bodies       | Intra-product duplication                | **HIGH (volume)**              | `createApiThunk()` / `callFunction()` wrappers                                  |
| **HG-2**   | get-or-create Stripe customer block                                     | Intra-product duplication                | MEDIUM                         | `getOrCreateStripeCustomer()` helper                                            |
| **RG-2/3** | regroup self-identity auth preamble (12+) + house-load preamble         | Intra-product duplication                | MEDIUM                         | `requireSelf()` / `loadHouseOrThrow()`                                          |
| **DX-1**   | detox POST-route security preamble + `EMAIL_RE`                         | Intra-product duplication                | MEDIUM                         | `guardPostRequest()` wrapper; export `EMAIL_RE`                                 |
| **D1**     | Referral fragmentation                                                  | Name collision + integration gap         | LOW/LEGIT                      | Don't unify; recovery-api referral API is **dead in prod** (decision needed)    |
| **D4**     | Stripe billing + webhook stacks                                         | Structural parallel                      | LOW/LEGIT                      | Leave stacks; optionally share `mapStripeError`                                 |
| **D5**     | Auth/claims (3 systems, 3 Firebase projects)                            | Specialization                           | LOW/LEGIT                      | Cannot share runtime; fix C1b shape bug                                         |
| **D6**     | Firebase Admin init                                                     | Trivial duplication                      | LOW                            | Leave (boilerplate, different SDK styles + quota workaround)                    |
| **D7**     | Push / FCM (different payload contracts)                                | Reimplemented                            | LOW (MEDIUM within homegroups) | Don't cross-unify; dedupe homegroups' ~20 inline sends                          |

---

### D2. Meeting finder / geo — ACCIDENTAL FORK (HIGH, safe to extract)

regroup's meeting code is a near-verbatim fork of homegroups'.

- Entry: `homegroups/functions/src/callable/findMeetings.ts:79` vs `regroup/functions/src/callable/meetings.ts:79`. Identical `MeetingTypeFilters` union (homegroups `findMeetings.ts:34-41`, regroup `meetings.ts:70-77`).
- Same source functions incl. the **same misspelling** `getNarcoticsAnoymousMeetings` (homegroups `findMeetings.ts:7-12` ← `utils/meetings.ts`; regroup `meetings.ts:7-14` ← `util/meetings.ts`) — near-proof of copy origin.
- `utils/location.ts` vs `util/location.ts` are the **same file modulo formatting**: same `getDistance` (haversine), `getGeohashRange`, identical magic constants `0.0144927536231884`/`0.0181818181818182` (both lines 14-110) and the identical comment _"For some stupid reason, pointInPolygon returns 0 or -1…"_.
- Both query **public** AA/NA feeds + Google Maps — no PII, no cross-project data. No trust-model reason for divergence.
- Divergence: regroup additionally vendors GeoFire bbox in `util/geohash.ts` (210 lines) and adds `getCelebrateMeetings`.

**Verdict:** ACCIDENTAL. Safe to extract a shared `meetings-geo` library because inputs are public and product-agnostic. Also the natural home for the data behind C1.

### D8. Duplicated entities / empty `shared/` — (MEDIUM, structural)

`shared/` = 0 files (confirmed). `Meeting` + `GeocodeResponse` exist as separate copies in homegroups and regroup `entities/` (ties to D2). `User` defined independently in all three backends. **Verdict:** ACCIDENTAL for product-agnostic types (`Meeting`, `GeocodeResponse`, lat/lng) — first inhabitants of `shared/`. LEGIT for `User`/`Referral` (different meaning per product) — keep separate.

### D3. PII-safe logging / error sanitization — REIMPLEMENTED EVERYWHERE (MEDIUM)

Platform-mandated, no shared implementation, `shared/` empty.

- recovery-api: sanitize-by-construction, fixed `HttpsError` strings (`referrals.ts:64,67`); no logger.
- homegroups: inline `logger` with hand-picked safe fields (`getMeetingAttendance.ts:90` logs `{method,path}` only).
- regroup: inline `logger.error(error)`; **`util/notifications.ts:62-66` logs device tokens** — a concrete drift; bridge logs `{userId,groupId}` freely (`homegroups.ts:98,134`).
- detox: explicit per-route discipline with comments (`subscribe/route.ts:110-111`).

**Verdict:** ACCIDENTAL, partial-overlap. Extract the _policy_ (loggable-field allow-list + `sanitizeError()`) as a tiny dependency-free TS module in `shared/` — not a logger binding (four runtimes differ). Fix regroup token-logging.

### RG-1. regroup entities in functions AND mobile (HIGH, intra-product, drifting)

`User`/`House`/`Guest`/`Meeting`/`OperatorSubscription`/`Roles`/`BaseEntity` defined in BOTH `regroup/functions/src/entities/*.ts` and `regroup/mobile/src/entities/*.tsx`. ~325 (functions) mirroring ~645 (mobile) lines. **Already drifted:** mobile `User.tsx:74` defaults `emailVerified=true`, functions `User.ts:14` defaults `false`. **Verdict:** consolidate to a single source of truth (regroup-local `shared-entities` or the platform `shared/`); layer yup/JSX extras on top of plain interfaces.

### HG-1 / HG-2 / HG-3 / HG-4. homegroups boilerplate (HIGH/MEDIUM, intra-product)

- **HG-1:** 19 group-scoped callables repeat auth → group-load → admin-check (`createStripeCheckoutSession.ts:34-64`, `createGroupSubscription.ts:66-97`). A latent bug the helper would fix: `createStripeCheckoutSession.ts:58` reads `admins || adminUids` but `createGroupSubscription.ts:90` reads only `admins`. → `requireGroupAdmin(request, groupId)`.
- **HG-2:** get-or-create Stripe customer block (`createStripeCheckoutSession.ts:66-78`, `createGroupSubscription.ts:111-126`, `createStripePaymentIntent.ts:61-71`). → `getOrCreateStripeCustomer()`.
- **HG-3/4:** ~200 `createAsyncThunk` bodies across 26 slices repeat `try/catch/rejectWithValue` + `httpsCallable` boilerplate (`treasurySlice.ts:46-130`, `adminRemovalSlice.ts:64-157`). → `createApiThunk()` / `callFunction()`.

### RG-2 / RG-3 / DX-1. (MEDIUM, intra-product)

- **RG-2:** regroup self-identity preamble at 12+ sites (`subscriptions.ts:159-171,274-281,…`; `payments.ts:96,183,236,283,307`) → `requireSelf()`.
- **RG-3:** house-load preamble in `payments.ts:111-114,382-386,513-517,614-618` → `loadHouseOrThrow()`.
- **DX-1:** detox `/api/contact` and `/api/subscribe` share a ~25-line security preamble + an **identical** `EMAIL_RE` (`contact/route.ts:49-83,81`; `subscribe/route.ts:29-64,58`) → `guardPostRequest()` + exported `EMAIL_RE`.

---

## Legitimate specialization — DO NOT unify

- **D1 Referrals:** homegroups "referral" = local refer-a-friend → Stripe trial extension (`referralSlice.ts:27,42,61`; conversion `stripeUtils.ts:712`). recovery-api referral = cross-app routing (`referrals.ts:72`). **Name collision, different entities.** The real finding: recovery-api's referral API has **zero live callers** (homegroups local-only, detox firing disabled at `contact/route.ts:36`, regroup none) → **dead in production. Decision needed: wire it up or delete.**
- **D4 Stripe:** subscription model (homegroups) vs Connect destination-charge rent (regroup) — different billing models, different API versions (`utils/stripe.ts:132` `2025-12-15` vs `util/stripe.ts:11` `2026-01-28`), different Secret-Manager-timing client-init strategies. Convergent patterns (webhook verify, idempotency doc, sub-doc-keyed-by-stripeSubscriptionId) are conventions, not copies. Optional micro-share: `mapStripeError`.
- **D5 Auth/claims:** three Firebase projects = three Auth instances = three claim namespaces with three trust models (service-key vs group-membership vs house-role). Claims minted by one project are not verifiable by another — **cannot share runtime.**
- **D6 Firebase init:** ~10 lines each, different SDK styles, regroup carries a project-specific vCPU-quota `setGlobalOptions` workaround (`init.ts:8-13`).
- **D7 FCM:** incompatible payload contracts (homegroups `notification:` blocks vs regroup `notifee` data-only) and different token fields (`fcmTokens` vs `messagingToken`). Cross-unification unwarranted; homegroups-internal `sendPush()` dedupe is the only opportunity (~20 inline `sendEachForMulticast`).

---

## Through-line

The platform names recovery-api as the integration bus, but (a) the one real cross-product flow **bypasses it insecurely** (C1), and (b) recovery-api's own referral API **has no live callers** (D1). The cleanest, safest consolidations are the product-agnostic, PII-free utilities — meeting/geo (D2) and shared types (D8). The Stripe and auth stacks are principled specialization and should stay separate. Most remaining wins are **intra-product** boilerplate helpers (RG-1, HG-1/2/3/4, RG-2/3, DX-1).
