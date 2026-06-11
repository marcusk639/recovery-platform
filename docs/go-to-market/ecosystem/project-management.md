---
title: Ecosystem — Project Management
scope: ecosystem
category: project-management
status: in_progress
last_verified: 2026-06-10
sources:
  - docs/launch-readiness/cross-product-launch-roadmap.md
  - docs/launch-readiness/03-launch-roadmap.md
  - docs/launch-readiness/homegroups-launch-readiness.md
  - docs/launch-readiness/regroup-launch-readiness.md
  - regroup/docs/go-to-market/project-management.md
  - homegroups/docs/go-to-market/project-management.md
  - detox-recovery/docs/go-to-market/project-management.md
supersedes:
  - docs/launch-readiness/cross-product-launch-roadmap.md
  - docs/launch-readiness/03-launch-roadmap.md
---

# Ecosystem — Project Management

> The **cross-product launch hub**: the one place to see the sequence across all
> three products + the recovery-api bus, plus the platform-wide decision gates.
> It synthesizes (and **supersedes as the live SSOT**)
> `docs/launch-readiness/cross-product-launch-roadmap.md` — that file becomes a
> pointer/archive in Phase 6. **Per-product blocker detail lives in the
> per-product `project-management.md` files** (cross-linked below); this hub only
> sequences them and owns the cross-product coordination rows. No price values
> here — see [`../_shared/pricing.md`](../_shared/pricing.md).

Status vocabulary: `done | in_progress | blocked | planned | not_started`.
Severity: `P0` (go-live/monetization) · `P1` (ecosystem unlock) · `P2` (scale).
Tracks: `regroup` · `homegroups` · `detox` · `bridge` · `cross-product`.

---

## 1. The three per-product launch plans (owned elsewhere)

This hub does **not** restate per-product blockers. Each product's
launch-to-monetized plan is its own SSOT:

| Product        | Launch state (today)                                               | Plan (SSOT)                                                                          |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| regroup        | 5 live houses on legacy pricing; tier billing + Stripe IDs pending | [`../regroup/project-management.md`](../../../regroup/docs/go-to-market/project-management.md)               |
| homegroups     | Code 30/30 `done`; activation-gated (infra + App Store + R-1/R-2)  | [`../homegroups/project-management.md`](../../../homegroups/docs/go-to-market/project-management.md)         |
| detox-recovery | Tier 2 + donations live; digital/B2B blocked on delivery wiring    | [`../detox-recovery/project-management.md`](../../../detox-recovery/docs/go-to-market/project-management.md) |

(sources: the three per-product project-management docs, last_verified 2026-06-10)

---

## 2. Cross-product launch blockers (the hub's own rows)

Rows here are **coordination blockers** — sequencing, shared secrets, and
cross-app bridges that no single product owns. Per-product P0s roll up via the
"Per-product gate" references rather than being duplicated.

| id       | blocker                                                                     | severity | owner          | track         | status      | acceptance_check                                                                                                 | source                                                                                                                               |
| -------- | --------------------------------------------------------------------------- | -------- | -------------- | ------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ECO-PM-1 | Stripe revenue activation across both Connect products (TEST → LIVE)        | P0       | Owner          | cross-product | blocked     | TEST-mode dry run passes for HG + RG; then LIVE default prices set; no `getDefaultPriceForProduct` throw in logs | `homegroups/functions/src/utils/stripe.ts#L157` (orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived)              |
| ECO-PM-2 | End-to-end live-card payment validation (both products)                     | P0       | Owner + Eng    | cross-product | not_started | HG group+intergroup A→B and RG subscription+rent all complete with a live card; webhooks update Firestore        | orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived                                                                |
| ECO-PM-3 | Both apps submitted to App Store + Play                                     | P0       | Owner          | cross-product | not_started | RG iOS bundle production; HG `deepLinks.js:9` real ID post-approval; both `In Review`                            | orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived                                                                |
| ECO-PM-4 | `RATS_API_KEY` shared secret provisioned (gates the bridge)                 | P0       | Owner          | bridge        | not_started | `firebase functions:secrets:access RATS_API_KEY` returns value; `getMeetingAttendance` returns 200 not 401       | ../homegroups/project-management.md (HG-P0-5)                                                                                        |
| ECO-PM-5 | Cross-project bridge verified (Regroup → Homegroups `getMeetingAttendance`) | P1       | Eng            | bridge        | not_started | A Regroup CF calls `getMeetingAttendance` cross-project with the key and receives attendance records             | `homegroups/functions/src/http/getMeetingAttendance.ts` (orig: docs/strategy/roadmap.md, archived); [`roadmap.md`](roadmap.md) ECO-5 |
| ECO-PM-6 | Treatment-center facility dashboard shipped (B2B unlock)                    | P1       | Eng            | cross-product | not_started | Per-alumnus continuing-care view renders live bridge data; ≥1 facility onboarded for demo                        | ../homegroups/roadmap.md#hg-rm-3 ([`roadmap.md`](roadmap.md) ECO-6)                                                                  |
| ECO-PM-7 | recovery-api referral relay decision + enablement (D-10)                    | P2       | Owner (+legal) | cross-product | blocked     | D-10 model chosen + legal-cleared; partner agreement signed; relay enabled (today **disabled** by design)        | ../detox-recovery/project-management.md#launch-done-definition ([`monetization.md`](monetization.md) §3)                             |

> **Honesty guard.** ECO-PM-5/6 are `not_started` and ECO-PM-7 is `blocked` with
> the relay **intentionally disabled** today. The facility dashboard and aftercare
> pipeline are not built — see [`roadmap.md`](roadmap.md) §2 re-baseline ledger.

---

## 3. Cross-product launch sequence

```
PHASE 0  Decision gates (resolve first — unblock everything downstream)
         D-1 ✅ HG group price · D-5 ✅ RG 2% fee · D-9 ✅ RG grandfather
         D-10 ⛔ referral model · D-11 ⛔ RG IAP · D-12 ⛔ RG HIPAA
                         │
PHASE 1  Revenue activation (P0) ── ECO-PM-1
         RG: tier code → 6 Stripe Price IDs   (../regroup/... RG-P0-1/2)
         HG: intergroup A/B default prices     (../homegroups/... HG-P0-1/2, R-1/R-2)
                         │
PHASE 2  E2E payment validation (P0) ── ECO-PM-2   (live card, both products)
                         │
PHASE 3  App Store + Play submission (P0) ── ECO-PM-3   ← Apple review is the long pole; start day 0
                         │
         (detox runs its own Part A/Part B track in parallel — DX-PM-1/2 delivery wiring)
                         │
PHASE 4  Bridge verification (P1) ── ECO-PM-4 (key) → ECO-PM-5 (cross-project call)
                         │
PHASE 5  Facility dashboard (P1, B2B unlock) ── ECO-PM-6   (depends on PHASE 4)
                         │
PHASE 6  Aftercare pipeline + referral-bus monetization (P2)
         ECO-7 (new product) · ECO-PM-7 / D-10 (referral relay)
```

The governing principle (from the cross-product roadmap): **each phase is
dependency-ordered; do not start a phase until the prior phase's checks pass.
Decision gates in Phase 0 unblock everything downstream — resolve them first**
(orig: docs/launch-readiness/cross-product-launch-roadmap.md, archived).

App Store is the long pole platform-wide — submit (ECO-PM-3) in parallel from day
0 while revenue activation and validation proceed
(source: ../homegroups/project-management.md#minimum-viable-launch-sequence).

---

## 4. Decision gates (platform-wide)

Per-product-only gates (D-9 grandfather, D-11 IAP, D-12 HIPAA, DP-1/DP-2 detox)
live in the owning product's plan; the gates that affect **cross-product**
sequencing are summarized here. All gates are recorded in
[`../_shared/decisions-log.md`](../_shared/decisions-log.md).

| gate | decision                                                     | status      | gates                                                            | owner            |
| ---- | ------------------------------------------------------------ | ----------- | ---------------------------------------------------------------- | ---------------- |
| D-1  | Homegroups group price ([`HG-MON-1`](../_shared/pricing.md)) | done        | HG revenue activation (ECO-PM-1)                                 | Owner            |
| D-5  | Regroup rent platform fee (keep 2%)                          | done        | RG fee reconcile (already shipped)                               | Owner            |
| D-9  | Regroup legacy 5-house grandfather (6-month window)          | done        | RG migration (../regroup/... RG-P0-4)                            | Owner            |
| D-10 | recovery-api referral-monetization model                     | not_started | Referral relay + ECO-8 ([`monetization.md`](monetization.md) §3) | Owner (+legal)   |
| D-11 | Regroup IAP vs. web-only billing                             | not_started | RG Stripe product setup (../regroup/... RG-P0-2)                 | Owner (+legal)   |
| D-12 | Regroup HIPAA / BAA surface                                  | not_started | RG privacy-policy publish (../regroup/... RG-P0-10)              | Owner (+counsel) |

> **D-10 framing (recommendation carried from [`monetization.md`](monetization.md) §3):**
> options are O-1 flat per-referral fee, O-2 rev-share on converted referral, O-3
> B2B treatment-center seat. **Recommended: O-3 strategically, with O-1 as a
> bridge until the facility dashboard (ECO-6) ships.** Open until the partner
> agreement + legal review (anti-kickback) clear.

---

## 5. Owners

- **Owner (single founder, "Marcus" on homegroups rows):** Stripe activation,
  App Store/Play submission, security cleanup, all business/legal decisions
  (D-10/D-11/D-12), partner agreements, field validation.
- **Eng:** tier-billing code, cross-project bridge (ECO-PM-5), facility dashboard
  (ECO-PM-6), webhook seeding.
- **Counsel (external):** HIPAA/BAA opinion (D-12), anti-kickback review (D-10).

---

## 6. Milestones (cross-product)

| id       | milestone                                       | gate                           | status      |
| -------- | ----------------------------------------------- | ------------------------------ | ----------- |
| ECO-MS-1 | First live paid transaction on **each** product | ECO-PM-1, ECO-PM-2 per product | not_started |
| ECO-MS-2 | Both consumer apps live in both stores          | ECO-PM-3 approved              | not_started |
| ECO-MS-3 | First verified cross-project bridge call        | ECO-PM-4, ECO-PM-5             | not_started |
| ECO-MS-4 | First treatment-center facility-dashboard demo  | ECO-PM-6                       | not_started |
| ECO-MS-5 | First monetized referral (D-10 model live)      | ECO-PM-7, ECO-MS-4 (if O-3)    | not_started |

---

## See also

- Vision / why the continuum: [`vision.md`](vision.md)
- Cross-platform model + D-10 detail: [`monetization.md`](monetization.md)
- Phased roadmap + re-baseline ledger: [`roadmap.md`](roadmap.md)
- Per-product launch plans: [`../regroup/project-management.md`](../../../regroup/docs/go-to-market/project-management.md) · [`../homegroups/project-management.md`](../../../homegroups/docs/go-to-market/project-management.md) · [`../detox-recovery/project-management.md`](../../../detox-recovery/docs/go-to-market/project-management.md)
- Decisions log: [`../_shared/decisions-log.md`](../_shared/decisions-log.md)
- Superseded source (archived in Phase 6): `docs/launch-readiness/cross-product-launch-roadmap.md`
