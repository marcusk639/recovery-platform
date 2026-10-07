# Codebase Review — Re-verification + Delta

**Date:** 2026-10-07
**Base:** `origin/main` @ `a9f5eed`
**Mode:** Re-verify the 2026-05-31 register (`CODEBASE-REVIEW.md`) + delta for new code
**Scope:** Full monorepo — ~1,924 hand-written source files, 9 subprojects
**Elapsed since register:** 291 commits, 66 new source files

> Supersedes the status (not the detail) of `CODEBASE-REVIEW.md`. That file stays
> as the canonical description of findings C1–C8 / H1–H22 / M1–M26; this file
> records which of them are still true.

---

## Executive Summary

All eight CRITICAL findings from May are closed. The register's remaining open
items are concentrated in legacy mobile code and dependency debt, not in the
money path — regroup's billing surface was materially hardened (atomic +
idempotent balance decrement, cents migration, single pinned Stripe API version).

The most serious issue on the platform today was **not** in the old register.
`meetingInstances` is world-readable while storing attendee user IDs, which
exposes who attended a given 12-step meeting to anyone unauthenticated. It is
listed below as **N1 (CRITICAL)** and is the single highest-priority item.

| Severity | Verified | Fixed | Still open | Partial | Unverified |
| -------- | -------- | ----- | ---------- | ------- | ---------- |
| CRITICAL | 8        | 8     | 0          | 0       | 0          |
| HIGH     | 22       | 12    | 8          | 2       | 0          |
| MEDIUM   | 23       | 6     | 16         | 1       | 3 (M24–M26)|
| LOW      | 0        | —     | —          | —       | all        |
| **New**  | 5        | —     | 5          | —       | —          |

---

## N-series: New Findings (postdate the register)

### [N1] `meetingInstances` world-readable while storing attendee user IDs — CRITICAL

**Domain:** Security / Privacy · **Confidence:** 96

- `homegroups/firestore.rules:310` — `allow read: if true` on `meetingInstances`
  (and `:293` for `meetings`). Deploy path confirmed via `homegroups/firebase.json`.
- `meetingInstances.attendees` is `string[]` of raw user IDs, written by
  `homegroups/functions/src/callable/checkInToMeeting.ts:101`
  (`attendees: FieldValue.arrayUnion(userId)`), typed at
  `homegroups/mobile/src/types/schema.ts:383`.

Any unauthenticated caller can enumerate which user IDs attended a specific
AA/NA meeting instance. Attendance at a 12-step meeting is recovery-status PII,
and this directly contradicts the platform's first cross-cutting rule.
No deny-case rules test exists for either collection.

**Not auto-fixed, deliberately.** Firestore rules are document-level, so there is
no rule that hides `attendees` while keeping `attendeeCount` public. The fix is a
data-model decision, not a one-line rule change:

- **Option A** — move `attendees` into a subcollection (or a sibling private doc)
  and leave the public instance carrying only `attendeeCount`. Preserves public
  discovery.
- **Option B** — require auth to read `meetingInstances` and accept that
  unauthenticated meeting discovery loses per-instance data.

Either way, add deny-case rules tests; these two collections currently have none.

### [N2] `complianceExport` is sold but unreachable — HIGH

**Confidence:** 92 · `regroup/functions/src/callable/compliance.ts:362`

`complianceExport` is wired into `index.ts:27` and deployed, and is advertised as
a paid-tier feature on the public pricing page
(`regroup/web/src/app/components/pricing/pricing-one/pricing-one.component.html:93,149`,
gated on `tier.features.complianceExport`; flag set per tier in
`regroup/functions/src/config.ts:101-181`). **No client on web or mobile ever
invokes it.** Customers on Oxford Standard/Plus/Network and Trad
Professional/Enterprise are being sold a court-ready compliance export with no UI
to produce it.

`rentRoiMetrics` (`callable/analytics.ts:98`, 266 lines) likewise has zero callers.

### [N3] Paywall kill switch is inoperative on mobile — MEDIUM

**Confidence:** 94

`regroup/functions/src/util/entitlement.ts:132` reads `paywall/config` via the
admin SDK and fails closed — correct. But the mobile mirror
(`regroup/mobile/src/hooks/usePaywallKillSwitch`) reads the same doc as a client,
and there is **no `match /paywall/`** block in
`regroup/mobile/firebase/firestore.rules` (the catch-all is commented out at
`:94-95`). The read therefore always throws, the hook always returns
`enabled: true`, and the switch can never turn the paywall off on mobile.
Flipping it disables server enforcement while mobile keeps gating — and every
client calls `logException` on this every 5 minutes.

### [N4] Secret-hygiene defense-in-depth gaps — MEDIUM

**Confidence:** 90

- `.gitignore:28` matches only the literal `.env`. `secrets.env` /
  `prod-secrets.env` are **not** ignored (verified with `git check-ignore`).
  One such file is already committed — `regroup/scripts/stripe-prices.env`
  (benign: price IDs and config only; its one `sk_` hit is a placeholder in a
  comment on line 29).
- `scripts/git-hooks/pre-commit` `SECRET_PATTERNS` covers `sk_live_`, `sk-ant-`,
  `sk-or-v1-`, AWS, `ghp_`, private keys and `AIza`, but **not** `whsec_`,
  `sk_test_`, `rk_live_`, or Resend `re_` keys — all providers in active use
  (this repo handles Stripe webhook secrets directly, and detox-recovery uses Resend).
- The `ALLOWLIST` exempts `__tests__/` and `*.test.*` wholesale, so a real
  secret pasted into any test file is never scanned.

### [N5] `verifiedBy` attribution is unconstrained for admins — LOW

**Confidence:** 85

`regroup/mobile/firebase/firestore.rules:420` lets any house admin set
`verifiedBy` to an arbitrary uid (`verifyActivity` passes it straight from the
client, `regroup/mobile/src/services/activity.ts:755-760`). Impact is limited
because `verifiedBy` is not rendered in the export. Constrain it to
`request.auth.uid`.

---

## CRITICAL — all 8 closed

| ID | Finding | Verdict | Evidence |
| -- | ------- | ------- | -------- |
| C1–C4 | Four admin-claim callables lacked authorization | **FIXED** | `regroup/functions/src/callable/auth.ts:177,130,218,263` all call `assertCanGrantClaimForHouses`, which throws `permission-denied` (`util/authGuard.ts:79`) and requires `isOwner \|\| (callerIsExistingAdmin && isDelegation)` per house. Commit `c4a4dee`. |
| C5 | `fromApp` hardcoded `"detox-recovery"` | **FIXED** | `recovery-api/src/callable/referrals.ts:52` → `fromApp: context.appId`. |
| C6 | Google Maps key hardcoded in source | **FIXED (code)** | `homegroups/functions/src/api/api.ts:17` now reads `process.env.GOOGLE_MAPS_API_KEY` from Secret Manager and throws if unset. See follow-ups below. |
| C7 | `admins` world-readable | **FIXED** | `firestore.rules:128` → `isAdmin(resource.data.houseIds) \|\| isSameUser(adminId)`. |
| C8 | `houses` world-readable | **FIXED** | `firestore.rules:189` → `isGuestOrAdmin([houseId])`. |

**C6 follow-ups (console-side, cannot be verified from the repo):**
1. The key the old plan flagged for revocation now appears only in markdown and
   git history, never in executable source. Its revocation is still an unchecked
   box in `regroup/mobile/_legacy/.../docs-to-roadmap-05-24-2026.md:384` — **confirm it was actually revoked.**
2. A *different* Maps key is hardcoded at
   `homegroups/mobile/ios/RecoveryConnect/AppDelegate.mm:19`. Client Maps keys are
   extractable from any shipped binary, so this is normal practice — but confirm
   it is bundle-ID restricted in Google Cloud Console.
   (Verified by hash that the three `AIza` keys in the tree are mutually distinct.)

---

## HIGH — 12 fixed, 8 open, 2 partial

**Fixed:** H1 (`isHouseAdmin` guard; now dead code, zero call sites),
H2 (balance decrement atomic **and** idempotent — `stripeWebhook.ts:407-422`,
`runTransaction` + `FieldValue.increment` + per-payment `rentApplied` flag, PR #74),
H4, H5 (float dollars gone; `migrateBalanceToCents.ts` → integer cents; dollars
only at display boundary), H6, H8, H11 (`callable/homegroups.ts` deleted),
H15, H17 (19 audit fields now `serverTimestamp()`), H18 (SSR function is Node 22 /
firebase-functions 7 — this *is* the live SSR config), H19, H22.

| ID | Still open | Evidence |
| -- | ---------- | -------- |
| H3 | In-memory rate limiter | `detox-recovery/lib/abuse-protection.ts:34` — `new Map()`, used live by `app/api/contact/route.ts` and `app/api/subscribe/route.ts`. Ineffective across Cloud Run instances. |
| H7 | `paymentIntentParams: any` on live payment path | `homegroups/functions/src/callable/createStripePaymentIntent.ts:76`, untouched. |
| H9 | 22 screens bypass model/thunk with direct `firestore()` | All 22 surviving named files confirmed. |
| H10 | `auth().currentUser` | `regroup/mobile/src/screens/Personal/TwoFactorSetup.tsx:31`; `src/services/users.tsx:110,180,184`. |
| H13 | Stale closure in chat listener | `GroupChatScreen.tsx:289` deps omit `markNewMessagesAsRead`; that callback's own deps (`:323`) also omit `currentUser` — staleness is double-layered. |
| H14 | `useEffect` empty deps reading reactive state | `GroupListScreen.tsx:63-74`. |
| H16 | `deleteUserAccount` unbounded `collectionGroup` | `deleteUserAccount.ts:136,218`, zero `.limit()`, no timeout override. |
| H21 | Angular 9 + Firebase SDK v7 EOL | `regroup/web/package.json` — `@angular/core ~9.1.0`, `firebase ^7.14.2`. |

| ID | Partial | Note |
| -- | ------- | ---- |
| H20 | axios | Fixed in `homegroups/functions` and `homegroups/scripts` (`^1.9.0`); **still `0.19.2`** in `regroup/functions/package.json:28`, actively imported by `src/api/api.ts`. **Keep HIGH** — live in the production Stripe/API layer. |
| H12 | Service identity | Bulk cross-app enumeration fixed (`referrals.ts:73-74,93` scope by `referredBy` + `referredByApp`). Still open: `recovery-api/src/middleware/auth.ts:38-64` Phase 1 trusts a caller-supplied `X-App-Id` against one shared global key, so targeted impersonation of a known `(uid, appId)` pair remains. **Recommend HIGH → MEDIUM.** |

---

## MEDIUM — 6 fixed, 16 open, 1 partial, 3 unverified

**Fixed:** M1, M2 (both now house-scoped with deny-case tests), M11 (`@ts-ignore`
on Stripe `apiVersion` gone; single `STRIPE_API_VERSION` constant — PR #64 closed a
real version-drift bug, not a lint nit), M15 (init now crashes loudly by design),
M20 (`role="alert"` + text, not colour alone), M22 (`stripeApiVersion.ts:43-54`
pins `2026-01-28.clover`, no non-null assertion anywhere).

**Still open:** M3 → superseded by **N1**, escalated to CRITICAL · M4 (got worse:
`GroupChatScreen` 1803 lines, `GroupTreasuryScreen` 1126) · M5 (~20–21 module-level
`Dimensions.get` sites; regroup largely remediated, homegroups is now the bulk) ·
M6 (`GroupListScreen.tsx` ScrollView:245 → FlatList:288 with `scrollEnabled={false}`) ·
M8 (count rose to 13 occurrences across 12 files) · M9 · M10 (third unpinned git dep
found: `detox-mcp`) · M12 (files are under **homegroups**, not regroup — register
path was wrong) · M13 (`scheduledInstanceGenerator` no longer uses `collectionGroup`,
but now does an uncapped top-level query + unthrottled `Promise.all` fan-out) ·
M14 · M16 · M17 · M18 · M19 (gap widened to v21 vs v17, not v18 vs v17) · M21 · M23.

**Partial:** M7 — migrated to React Query, but the `DataContext` value object
(`:222-230`) is still one unmemoized 7-field bundle behind a single `useData()`
with no per-field selector; 10 consumers re-render on any field change.

**Unverified:** M24, M25, M26 and the entire LOW section. The agent covering that
slice was truncated mid-report and `SendMessage` was unavailable to resume it.

---

## Docs ↔ Code

### Auto-fixed in this run

| Doc | Change |
| --- | ------ |
| `CLAUDE.md:110` | Stale-branch gotcha rewritten — the main checkout no longer sits on `feat/regroup-tier-billing`, and PRs #54–#61 are all on `main` (salvaged by #68). |
| `CLAUDE.md:17` | `shared/` row corrected — the directory does not exist (0 tracked files, never committed). |
| `homegroups/CLAUDE.md:59` | HTTP function list was missing `googlePlacesProxy` (`functions/src/index.ts:132`) — 4 deployed, not 3. |

### Verified already correct

D2–D5, D7 (`FUNCTION_AUDIT.md` now machine-generated with a CI drift check).
All six documented recovery-api callables exist; `callable/identity.ts` is
correctly described as a non-deployed Phase 2 scaffold.

### Requires a decision

| Finding | Detail |
| ------- | ------ |
| D6 | Residual `recovery-shared-api` / `SHARED_API_URL` naming only in non-live docs (`recovery-api/docs/superpowers/specs/...`, `detox-recovery/_legacy/...`). Live code is standardized. **Severity down** — affects no executing code. Delete or annotate the legacy docs? |
| Undocumented subsystem | recovery-api gained a meetings-ingestion pipeline (`src/lib/meetings/` — NA dataset, Meeting Guide, Celebrate Recovery, geocode) and a `refreshDirectory` scheduled job (`triggers/refreshDirectory.ts:236`, daily 03:00, `STALE_PRUNE_DAYS=30`). Root `CLAUDE.md` describes `findMeetings` but never says how the directory is populated or pruned. |
| `FUNCTION_AUDIT.md:8` | Records its source commit as being on `feat/regroup-tier-billing` — the branch the docs say never to merge. Provenance is confusing even though the content regenerated clean on 2026-10-02. |

---

## Non-findings (checked, deliberately not reported)

- `compliance.ts` at 488 lines is **not** a gate bypass — it landed 2026-06-26,
  three weeks before the 300-line hook (`ea3ad4d`, 2026-07-16). 431 files exceed
  the cap; all are pre-existing legacy, which the hook warns on rather than blocks.
- `regroup/scripts/stripe-prices.env` contains no secrets.
- The `sk_live_abc` hits in `__tests__/util/stripeWebhookSecrets.test.ts` are
  obviously-fake fixtures.
- **Stripe price-ID correctness was not assessed.** A prior session manufactured a
  false P0 by comparing truncated price IDs that share an 11-character prefix.
  Any such claim needs full-length comparison.

---

## Recommended Next Steps

1. **N1** — decide Option A vs B for `meetingInstances`, then ship with deny-case
   rules tests. Unauthenticated recovery-status PII is the only CRITICAL open.
2. **N2** — either build a client for `complianceExport` or remove the feature
   flag from the pricing page. It is currently a billed promise that cannot be met.
3. **H20** — bump `axios` in `regroup/functions` (last vulnerable live instance).
4. **C6 follow-ups** — confirm the old key was revoked and the iOS key is
   bundle-restricted. Both are console-side.
5. **N4** — widen `.gitignore` to `*.env` and add `whsec_` / `sk_test_` / `rk_live_` /
   `re_` to the scanner; reconsider the blanket test-file allowlist.
6. Re-run the M24–M26 + LOW slice, which went unverified this pass.

---

## Method notes

- Verdicts were reached by reading production code paths, not test results —
  this repo has twice had tests ratify the exact defect they should have caught.
- Five parallel agents re-verified the register by slice; CRITICAL verdicts and
  every finding escalated or auto-fixed here were independently re-derived.
- Two agents reported that the harness injected a `<context_window_protection>`
  block into their prompts naming `ctx_*` tools absent from their toolsets; one
  correctly treated it as a possible injection. Worth knowing when reading agent
  transcripts.
