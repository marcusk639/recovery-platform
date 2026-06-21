# Speed-to-Market Execution Plan

**Date:** 2026-06-20
**Goal:** Reach paying customers as fast as possible by shipping what is **already
built**, and implementing only the code that **differentiates** us and **unlocks
revenue**. Defer everything else.
**Status:** Draft for approval — no code written yet.

> **Core insight driving this plan:** the revenue path is gated almost entirely by
> **ops/config tasks (Stripe Dashboard, App Store, legal)**, not by missing
> features. Most differentiators are already coded. So the fastest route is:
> (1) you unblock the ops-gated revenue in parallel, (2) I implement the one
> differentiating code workstream that's ready, plus small hardening wins.

---

## Track ownership

- **OPS/LEGAL (owner: you)** — cannot be done in code by the agent.
- **CODE (owner: agent)** — implementable now against the current tree.

The two tracks run in **parallel**. Revenue ships the moment Track A completes,
independent of Track B.

---

## Track A — Ship the revenue that's already built (OPS/LEGAL, highest priority)

These unlock live revenue with **zero new features**. Sequence them first.

| #   | Item                                                                                                                    | Why it's the fast path                                                                                                                   | Acceptance check                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A1  | **Homegroups: set default prices** on intergroup products A/B (and TC tiers) in the Stripe Dashboard                    | `getDefaultPriceForProduct()` throws without it (`homegroups/functions/src/utils/stripe.ts:168`) — all B2B checkout silently fails today | No "has no default price" throw in function logs; a test-mode checkout resolves a price         |
| A2  | **Regroup: create the 6 tier Price IDs** ($49/$89/$299 Oxford; $69/$129/$249 Traditional) and wire via `defineSecret()` | Tier-billing code is fully built + merged; only the live Stripe objects are missing                                                      | All 6 `STRIPE_PRICE_*` resolve to non-empty IDs at runtime                                      |
| A3  | **Live-card E2E** through every checkout path (HG group + intergroup A→B upgrade; RG subscription + 2% rent intent)     | No revenue path ships unvalidated                                                                                                        | One real card completes each path; webhook updates Firestore                                    |
| A4  | **App Store + Play submission** (both apps)                                                                             | Apple review is the 1–7 day long pole; every "download" CTA 404s until done                                                              | Both apps "In Review"; real App Store ID replaces `id0000000000`, iOS bundle off `com.rats.dev` |
| A5  | **Rotate + purge 3 leaked Regroup service-account keys** from git history                                               | Hard security gate — cannot launch with live leaked keys                                                                                 | Keys rotated; BFG history purge verified                                                        |
| A6  | **HIPAA / 42 CFR Part 2 BAA legal decision** (Regroup)                                                                  | Explicit "do not launch until clarified" gate                                                                                            | Documented legal sign-off                                                                       |

**Track A is the entire near-term revenue case.** Nothing in Track B is required
to take the first dollar.

### Track A status — code-readiness audit (2026-06-20)

Read-only audit of the code/config behind each Track A ops task, plus A2 progress.

| #   | Status                        | Findings / what's left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | ⚠️ BLOCKED (ops)              | Price-resolution code is correct & runtime-driven. **Gap:** `STRIPE_PRODUCT_ID_INTERGROUP_A/_B` are absent from `homegroups/functions/.env` → intergroup A/B **and** treatment-center checkout throw `"Intergroup product not configured"` regardless of any Dashboard price. TC has **no separate product** (bills on intergroup A/B). Each product also needs a Dashboard **default price**. CLI cannot do this — it's authenticated to the Regroup account only; do A1 in the Homegroups Stripe Dashboard + add the two prod IDs to `.env`. Minor: dead typo key `STRIPE_TEST_PRODCT_ID_GROUP` in `.env`.                                                                                                                                                              |
| A2  | 🟡 CODE/CONFIG DONE           | **6 live monthly prices created** (Oxford $49/$89/$299 on `prod_UhV71tzKC4XToy`; Traditional $69/$129/$249 on `prod_UhV6sgrWbOgsyg`) and written to `regroup/functions/.env` (`STRIPE_PRICE_OXFORD_*` / `STRIPE_PRICE_TRAD_*`). Code reads these via plain `process.env` (NOT `defineSecret()` — the original task assumption was wrong; no code change needed). **Left:** set `TIER_BILLING_ENABLED=true`, redeploy, then A3 live-card test. Flag left OFF intentionally (activates tier billing for new subs on deploy).                                                                                                                                                                                                                                                |
| A3  | ✅ CODE READY                 | Both products: webhook signatures verified against env/secret signing keys; every successful-payment event maps to the correct Firestore write; initiation callables exported. Preconditions (dashboard, not code): (1) HG default prices set (A1); (2) confirm Regroup's **platform** webhook endpoint is subscribed to `payment_intent.*` + `charge.dispute.created` (else rent fees silently don't post). Regroup webhook lives at `webhooks/stripeWebhook.ts`.                                                                                                                                                                                                                                                                                                        |
| A4  | 🟡 PARTIAL (commit `e18a1b9`) | **Done (safe, in-repo known-good values):** homegroups Play URL `com.homegroups`→`com.recoveryconnect` (`deepLinks.js:11`); regroup stale Play URLs `com.rats.dev`→`com.regroup.app` (`footer-one.component.ts:22`, `download.component.ts:20`). **Still needs owner-supplied values:** (1) homegroups real App Store ID — `id0000000000` placeholder at `deepLinks.js:9`; (2) regroup iOS **release** bundle is dev `com.rats.dev` in `ios/rats.xcodeproj/project.pbxproj:766` (reconcile vs live listing `id1502040260`); (3) two AASA files with conflicting Team IDs — `regroup/mobile/apple-app-site-association` (`D8K3FS4HAX`, matches pbxproj `DEVELOPMENT_TEAM`) vs `regroup/mobile/.well-known/apple-app-site-association` (`KQSSHWK7V7`, not in Xcode config). |
| A5  | ✅ DONE (commit `e18a1b9`)    | Code side closed. `homegroups/functions/.gitignore` now ignores `service-account.json` + `*.json.key` (mirrors monorepo-root convention). Correction to prior audit: `recovery-api/.gitignore` **already** had `service-account.json` + `*.json.key` — only homegroups/functions was missing it. No service-account key currently tracked or untracked in either package. Rotation + BFG history purge remain ops.                                                                                                                                                                                                                                                                                                                                                        |
| A6  | ⛔ LEGAL                      | HIPAA / 42 CFR Part 2 BAA decision — out of code scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Track B1 (hardening): DONE** — `findMeetings` input validation shipped (commit `8318576`); unauth-callable sweep found no safe code change remaining (see `b1-hardening-handoff.md`). **B2 (recovery-api `findMeetings` directory owner): NOT built** — only `DirectoryMeeting` + identity scheme exist; B3–B5 are blocked on B2.

---

## Track B — Implement the differentiator (CODE, agent)

The platform's defensible wedge is **cross-product meeting discovery** — a meeting
created in one app is discoverable in the other, via recovery-api as the single
directory. No competitor connects these. **Phase 1 (canonical `DirectoryMeeting` +
frozen identity scheme) is already built on the current branch.** The remaining
phases are specified in `recovery-api-meetings-discovery-plan.md` and ready to
execute.

### B1 — Hardening quick wins (do FIRST; small, cheap, ships safety)

| Item                                             | Anchor                                              | Change                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `findMeetings` input validation (Homegroups)     | `homegroups/functions/src/callable/findMeetings.ts` | Add Zod validation (mirror regroup's `parseInput`); reject malformed `request.data` instead of raw cast |
| Lock down 2 public unauth callables (Homegroups) | per `LAUNCH_BLOCKERS.md` #8                         | Add auth/App-Check gating or rate limiting; `notSpamming()` is currently a no-op                        |

**Acceptance:** typecheck + Jest green in homegroups/functions; malformed input
returns a clean validation error, not a crash.

### B2 — recovery-api `findMeetings` is the directory owner (verify Phase 1 done)

Phase 1 already landed `DirectoryMeeting` + `identity.ts` (sha1[:24] + geohash-10).
Confirm the recovery-api `findMeetings` callable exists and is service-key
authed before repointing products.

**Acceptance:** recovery-api `findMeetings` callable registered in `index.ts`;
unit tests green; returns canonical `DirectoryMeeting[]`.

### B3 — Repoint Regroup (discovery plan Phase 2)

Rewrite `regroup/functions/.../findMeetings` to call recovery-api for directory
results and merge regroup-owned custom meetings. **Preserve the `RatsMeeting[]`
client contract** so mobile/web need no change. Delete regroup's forked
directory-fetch internals (`util/meetings.ts`).

**Acceptance:** regroup `findMeetings` returns identical `RatsMeeting[]` shape;
existing tests pass; no client redeploy needed.

### B4 — Repoint Homegroups (discovery plan Phase 3)

Same for homegroups: call recovery-api for directory results, merge Firestore
group/custom meetings, **preserve the `SerializedMeeting[]` contract**. Delete
homegroups' forked directory-fetch internals.

**Acceptance:** homegroups `findMeetings` returns identical `SerializedMeeting[]`;
tests pass.

### B5 — Cleanup + verify (discovery plan Phase 4)

Execute §2 cleanup (confirm attendance bridge/proxy fully removed — already
deleted), run typecheck + full Jest in all three packages, update launch-readiness
docs.

**Acceptance:** all three packages green; one cross-product smoke test (meeting
created in app X visible via app Y's `findMeetings`).

---

## Monetization features to maximize (build/optimize when revenue funds it)

Not on the speed-to-market critical path, but the highest-leverage levers once live:

1. **Stripe Connect transaction fees (2% rent / 5% donation)** — the most scalable
   revenue; grows with customer volume, no new SKU. **Optimize:** drive all
   rent/donations through-platform; instrument and convert off-platform volume.
2. **Tier cap enforcement (Regroup, shipped)** — the ARPU lever; tune caps so
   growing houses hit them and get an in-product upgrade prompt at the cap moment.
3. **Oxford governance (EES/voting/officer-terms)** — the defensible niche; lead
   GTM with it, 30-day Standard trial; hold the $299 Network tier until a regional
   chapter signs.
4. **Treatment-center B2B continuing-care SKU (ECO-6/7)** — highest ceiling, but
   `not_started` and solo-infeasible; **fund with Track A revenue, do not gate
   launch on it.** Referral-bus monetization (ECO-8) stays deferred and
   counsel-gated (EKRA / patient-brokering risk).

---

## Suggested sequence

```
Week 1   Track A (A1–A4 in parallel)  +  Track B1 (hardening) , B2 (verify)
Week 2   Track A (A5–A6)              +  Track B3 (repoint regroup)
Week 3   Launch readiness verify      +  Track B4–B5 (repoint homegroups + cleanup)
Post-launch  Monetization optimization (#1–#3); B2B SKU when revenue funds it
```

Track A determines launch date. Track B ships the differentiator alongside, with no
launch dependency — if Track A finishes first, launch and merge Track B after.
