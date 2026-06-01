# Doc vs Code Audit Report

**Date:** 2026-05-31
**Project:** recovery-platform monorepo
**Docs reviewed:** 26 files (6 CLAUDE.md files, FUNCTION_AUDIT.md, architecture docs, detox-recovery/docs/\*, regroup/mobile/\*.md)
**Source files scanned:** ~1,920 across 8 sub-packages

---

## Summary

| Category                     | Count |
| ---------------------------- | ----- |
| Documented and Implemented   | 18    |
| Documented and Partial       | 3     |
| Documented but Missing       | 2     |
| Implemented but Undocumented | 2     |
| Stale Doc Sections (fixed)   | 5     |
| Stale Doc Sections (pending) | 1     |
| Requires Human Decision      | 4     |

---

## Findings

### Fully Aligned

1. `POST /api/referrals` endpoint — documented and implemented in `recovery-api/src/routes/referrals.ts`
2. `GET /api/referrals` endpoint — implemented with `referredBy == uid` filter _(description now corrected in docs)_
3. `GET /api/users/me` / `PUT /api/users/me` — documented and implemented in `recovery-api/src/routes/users.ts`
4. Firebase JWT auth model (`Authorization: Bearer <idToken>`) — implemented in `recovery-api/src/middleware/auth.ts`
5. `X-Service-Key` service-to-service auth — implemented, sets `uid = "system"`
6. homegroups callable functions (90 exported) — confirmed in `homegroups/functions/src/index.ts`
7. homegroups Firestore triggers (17 active) — confirmed _(count corrected in docs)_
8. homegroups Pub/Sub cron jobs (14) — confirmed in index.ts exports
9. homegroups legacy scheduled function (`scheduledAnnouncementPublisher`) — present
10. detox-recovery POST security pipeline (`checkOrigin → checkRateLimit → checkHoneypot`) — implemented and correct
11. `HoneypotInput` component — exists at `detox-recovery/components/forms/HoneypotInput.tsx`
12. Honeypot silent-success contract (returns `200 { success: true }`) — confirmed
13. `scope-of-practice.ts` clinical safety file and parity test — both present
14. regroup Stripe amounts in integer cents — convention present
15. Firebase emulator port conventions (8080/5001/9099) — consistent across all products
16. Data isolation between products — no cross-product Firestore imports found
17. `toApp` enum values (`treatment-center`, `phoenix-cleanhouse`, `homegroups`) — validated in recovery-api
18. 12-step group subscription at $12/year flat rate — consistent with Stripe callable code

---

### Partial Implementations

**1. recovery-api referral `fromApp` attribution**
Doc says the referral system supports cross-app referrals from any ecosystem product. Code hardcodes `fromApp: "detox-recovery"` for every caller.
Source: root `CLAUDE.md` (integration map) | Code: `recovery-api/src/routes/referrals.ts:27`
See CODEBASE-REVIEW.md [C5] — implementation fix required.

**2. homegroups HTTP function count**
`homegroups/CLAUDE.md` described HTTP functions in a way that implied 2 functions (grouping stripeWebhook + stripeConnectWebhook together). Three are deployed: `stripeWebhook`, `stripeConnectWebhook`, and `getMeetingAttendance`. All three are named in the doc; the ambiguity was in the phrasing only.
Source: `homegroups/CLAUDE.md` | Code: `homegroups/functions/src/index.ts`
Minor — no further action needed.

**3. Service-to-service caller identity**
Docs say service-to-service callers include `treatment-center`, `phoenix-cleanhouse`, and `homegroups`. All share `uid = "system"` — no per-caller identity or read isolation exists.
Source: `recovery-api/CLAUDE.md` (Auth model) | Code: `recovery-api/src/middleware/auth.ts:19`
Requires architectural decision (see Decisions section).

---

### Documented but Missing

**1. Per-app `fromApp` attribution in referrals**
The integration architecture assumes referrals carry accurate provenance. The `fromApp` field is documented as cross-app data, but every referral from any caller is falsely attributed to `detox-recovery`.
Source: `CLAUDE.md` integration map | Code: hardcoded in `referrals.ts:27`
Priority: CRITICAL. Fix: accept `fromApp` in request body, validated against an enum.

**2. Cross-product isolation for service-caller referral reads**
The architecture implies each product's referrals are scoped to that product. Any service-key holder can read all referrals from all other service callers (all share `uid='system'`).
Source: `CLAUDE.md` Cross-Cutting Rules (Data isolation) | Code: `referrals.ts:37-48`
Priority: HIGH. Fix: per-app service keys with distinct identities.

---

### Implemented but Undocumented

**1. `GET /api/referrals/:id` endpoint**
A single-referral lookup route with ownership enforcement exists in `recovery-api/src/routes/referrals.ts:51-60`. Not listed in any documentation.
Action taken: Added to root `CLAUDE.md` endpoint table and updated `recovery-api/CLAUDE.md` route listing.

**2. regroup direct call to homegroups Cloud Functions**
`regroup/functions/src/callable/homegroups.ts` exports `getResidentMeetingAttendance`, which calls `https://us-central1-recovery-connect-prod.cloudfunctions.net/getMeetingAttendance` directly. This cross-product integration contradicts the "cross-product data flows via recovery-api only" rule and is not documented anywhere.
Action needed: Requires human decision (see Decisions section).

---

### Stale Documentation — Fixed

| Doc                                 | Stale section                                                     | Fix applied                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `homegroups/CLAUDE.md:54`           | Trigger count: "16 active + 1 commented out"                      | Updated to "17 active + 2 commented out: onGroupAdminUpdate, onGroupCreateFetchMeetings"      |
| `homegroups/functions/CLAUDE.md:23` | Trigger count: "18 triggers"                                      | Updated to "17 active + 2 commented out"                                                      |
| root `CLAUDE.md`                    | `GET /api/referrals` had no scope qualifier                       | Updated: "list referrals submitted by the authenticated user (filtered by referredBy == uid)" |
| root `CLAUDE.md`                    | Missing `GET /api/referrals/:id`                                  | Added to endpoint table                                                                       |
| `recovery-api/CLAUDE.md`            | Route file comment listed only POST/GET                           | Updated to list all three referral endpoints                                                  |
| `regroup/FUNCTION_AUDIT.md`         | References `/Users/marcusklein/dev/rats-v2` (path does not exist) | Added STALE header with explanation and current path                                          |

---

### Stale Documentation — Pending Human Decision

**API service name inconsistency**
The shared API has three names across the codebase:

- Directory name: `recovery-api/`
- Startup log (`recovery-api/src/index.ts:31`): `"recovery-shared-api listening..."`
- detox-recovery `docs/architecture.md`: `recovery-shared-api`
- detox-recovery env var: `SHARED_API_URL`
- Root CLAUDE.md: `recovery-api`

Awaiting decision: Which name is canonical? Recommendation: `recovery-api` (matches directory). Requires updating startup log, detox-recovery architecture docs, and env var (`SHARED_API_URL` to `RECOVERY_API_URL`).

---

## Decisions — Resolved

| # | Decision | Choice | Status |
|---|----------|--------|--------|
| 1 | regroup direct homegroups call | Route through recovery-api — add `GET /api/meeting-attendance` proxy | Needs implementation |
| 2 | Service-caller identity | Per-app service keys mapped to distinct `fromApp` principals | Needs implementation |
| 3 | API canonical name | `recovery-api` — startup log, architecture docs, CLAUDE.md files updated | Done |
| 4 | Env var rename | `SHARED_API_URL` to `RECOVERY_API_URL` | Needs coordinated deploy |

### Implementation work remaining

**Decision 1 — recovery-api meeting-attendance proxy**
- Add `GET /api/meeting-attendance` to `recovery-api/src/routes/` (proxies to homegroups Cloud Function)
- Update `regroup/functions/src/callable/homegroups.ts` to call the recovery-api URL instead of the homegroups Cloud Function URL directly

**Decision 2 — per-app service keys**
- Each caller app gets its own key env var (e.g. `REGROUP_SERVICE_KEY`, `HOMEGROUPS_SERVICE_KEY`)
- Update `recovery-api/src/middleware/auth.ts` to map each key to a `fromApp` value (replaces shared `"system"` uid)
- Update `recovery-api/src/routes/referrals.ts` to derive `fromApp` from caller identity — fixes CODEBASE-REVIEW.md [C5] simultaneously
- Update each product's env vars and deployment config

**Decision 4 — env var rename**
- Add `RECOVERY_API_URL` alongside `SHARED_API_URL` in `detox-recovery/.env.example` and `apphosting.yaml`
- Update `detox-recovery/app/api/contact/route.ts` to read `RECOVERY_API_URL ?? SHARED_API_URL`
- After deploy, remove `SHARED_API_URL`

## Actions Taken



- [x] Fixed `homegroups/CLAUDE.md` — trigger count (16 to 17 active, 1 to 2 commented out)
- [x] Fixed `homegroups/functions/CLAUDE.md` — trigger count (18 to 17 active + 2 commented out)
- [x] Fixed root `CLAUDE.md` — added `GET /api/referrals/:id`, scoped GET /api/referrals description
- [x] Fixed `recovery-api/CLAUDE.md` — updated route file comment to list all 3 referral endpoints
- [x] Marked `regroup/FUNCTION_AUDIT.md` as stale with explanation and current path
- [ ] Awaiting decision: regroup direct homegroups call (Decision 1)
- [ ] Awaiting decision: service-caller identity design (Decision 2)
- [ ] Awaiting decision: API canonical name (Decision 3)
- [ ] Awaiting decision: env var rename (Decision 4)

---

## Next Steps

1. Decision 1 first — the regroup direct call is an undocumented cross-product dependency; resolve before it spreads.
2. Decisions 2 and 3 together — fix `fromApp` attribution (CODEBASE-REVIEW.md [C5]) in the same PR as the service-caller identity design; they touch the same code.
3. Decision 4 — env var rename is a housekeeping task; do it in a non-breaking coordinated deploy.
4. Re-run `/doc-code-audit` after decisions are implemented to verify docs stay in sync.
