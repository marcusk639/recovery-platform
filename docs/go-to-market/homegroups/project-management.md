---
title: Homegroups — Project Management
scope: homegroups
category: project-management
status: in_progress
last_verified: 2026-06-10
sources:
  - homegroups/docs/operations/launch-blockers.md
  - homegroups/docs/operations/pre-launch-checklist.md
  - homegroups/docs/superpowers/plans/2026-05-26-go-live-revenue-growth.md
  - docs/launch-readiness/homegroups-launch-readiness.md
supersedes:
  - homegroups/docs/operations/launch-blockers.md
  - homegroups/docs/operations/pre-launch-checklist.md
---

# Homegroups — Launch-to-Monetized Plan

The single actionable plan from "today" to "live + fully monetized." Launch is
**activation-gated, not build-gated**: all **30/30 code items** on the
pre-launch checklist (items C-1 through C-30) are `done`; what remains is
infrastructure, App Store submission, revenue activation, and manual validation
(orig: homegroups/docs/operations/pre-launch-checklist.md, archived).

The two tracks are deliberately separated:

- **Code track — `done`.** 30/30 pre-launch code items shipped (Stripe key
  guard at `web/src/pages/SubscribePage.js#L22`, payment/join URL fixes,
  forgot-password mobile nav, V4.4 flag docs, brand rename to Homegroups,
  deep-link entitlements/App Links, stale-FCM-token cleanup, dedup guards, and
  cursor pagination — C-1 … C-30)
  (orig: homegroups/docs/operations/pre-launch-checklist.md, archived).
- **Infra / App Store / revenue / validation track — pending.** 7 infra, 3 App
  Store, 3 revenue, 2 validation items remain `not_started`
  (source: docs/launch-readiness/homegroups-launch-readiness.md#1-executive-summary).

> No price values appear here — they live in
> [`../_shared/pricing.md`](../_shared/pricing.md). The roadmap items these
> blockers feed are in [`roadmap.md`](roadmap.md). Owner is **Marcus** for all
> rows unless noted (single-founder product)
> (source: homegroups/docs/operations/launch-blockers.md).

---

## P0 — blocks shipping a paying customer

| id       | blocker                                                       | severity | owner  | track      | status      | acceptance_check                                                                                                                                                | source                                                                                                              |
| -------- | ------------------------------------------------------------- | -------- | ------ | ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| HG-P0-1  | Default price set on intergroup Tier A product (R-1)          | critical | Marcus | revenue    | blocked     | Stripe Dashboard shows a default price on `STRIPE_PRODUCT_ID_INTERGROUP_A`; `getDefaultPriceForProduct` resolves without throwing                               | code: homegroups/functions/src/utils/stripe.ts#L157; orig: …/pre-launch-checklist.md (§4 revenue), archived         |
| HG-P0-2  | Default price set on intergroup Tier B product (R-2)          | critical | Marcus | revenue    | blocked     | Stripe Dashboard shows a default price on `STRIPE_PRODUCT_ID_INTERGROUP_B`; tier-A→B upgrade checkout completes                                                 | code: homegroups/functions/src/utils/stripe.ts#L157; orig: …/pre-launch-checklist.md (§4 revenue), archived         |
| HG-P0-3  | iOS submitted to App Store Connect                            | critical | Marcus | app-store  | not_started | App build accepted for review in App Store Connect (1–7 day review)                                                                                             | orig: homegroups/docs/operations/pre-launch-checklist.md (§3 app-store critical path), archived                     |
| HG-P0-4  | Android submitted to Google Play Console                      | critical | Marcus | app-store  | not_started | App build accepted for review in Play Console (1–3 day review)                                                                                                  | orig: homegroups/docs/operations/pre-launch-checklist.md (§3 app-store critical path), archived                     |
| HG-P0-5  | `RATS_API_KEY` uploaded to Cloud Secret Manager + uncommented | high     | Marcus | infra      | not_started | `firebase functions:secrets:access RATS_API_KEY` returns value; secret uncommented in `index.ts` `setGlobalOptions`; `getMeetingAttendance` returns 200 not 401 | code: homegroups/functions/src/http/getMeetingAttendance.ts; orig: …/launch-blockers.md (#5 RATS_API_KEY), archived |
| HG-P0-6  | Run full claim-and-pay funnel as real first customer (E2E)    | critical | Marcus | validation | not_started | Funnel completed incognito web + mobile; `isClaimed: true` in Firestore; admin access confirmed on mobile; friction list captured                               | orig: homegroups/docs/operations/launch-blockers.md (#1 claim-and-pay E2E), archived                                |
| HG-P0-7  | Firebase Auth authorized domains include deployed domain      | high     | Marcus | infra      | not_started | `recovery-connect-cad4b.web.app` + `.firebaseapp.com` listed; Google OAuth popup succeeds                                                                       | orig: homegroups/docs/operations/launch-blockers.md (#3 Firebase Auth domains), archived                            |
| HG-P0-8  | Email sender configured (verification not in spam)            | high     | Marcus | infra      | not_started | Test verification email lands in Gmail inbox, not Spam; "From" name set to Homegroups                                                                           | orig: homegroups/docs/operations/launch-blockers.md (#4 email sender config), archived                              |
| HG-P0-9  | Firebase Hosting deployed                                     | high     | Marcus | infra      | not_started | `firebase deploy --only hosting` returns `Deploy complete!`; live pages render                                                                                  | orig: homegroups/docs/operations/pre-launch-checklist.md (§2 infrastructure), archived                              |
| HG-P0-10 | Real App Store ID replaces placeholder in `deepLinks.js:9`    | high     | Marcus | app-store  | not_started | `id0000000000` placeholder replaced with live numeric App Store ID after approval                                                                               | orig: homegroups/docs/operations/pre-launch-checklist.md (§3 app-store critical path), archived                     |
| HG-P0-11 | `privacy@` / `info@` inboxes confirmed active                 | medium   | Marcus | infra      | not_started | Both inboxes (listed in Privacy/Terms pages) receive test mail                                                                                                  | orig: homegroups/docs/operations/pre-launch-checklist.md (§2 infrastructure), archived                              |

## P1 — unblock revenue beyond the first 10 groups

| id      | blocker                                                   | severity | owner  | track      | status      | acceptance_check                                                                   | source                                                                                                                     |
| ------- | --------------------------------------------------------- | -------- | ------ | ---------- | ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| HG-P1-1 | Verify production Stripe publishable key is `pk_live_`    | critical | Marcus | revenue    | not_started | DevTools Network shows `pk_live_…` (not `pk_test_…`) on deployed `/subscribe`      | code: homegroups/web/src/pages/SubscribePage.js#L22 (key guard); orig: …/launch-blockers.md (#6 Stripe prod key), archived |
| HG-P1-2 | Custom domain decision (`homegroups-app.com` vs Firebase) | medium   | Marcus | infra      | not_started | Decision recorded; if adopting custom domain, all 9 origin files flipped in one PR | code: homegroups/web/src/lib/deepLinks.js (`WEB_ORIGIN`); orig: …/launch-blockers.md (#5 custom domain), archived          |
| HG-P1-3 | Attend 3 intergroup meetings, demo treasury handoff       | high     | Marcus | validation | not_started | 3 meetings attended in 2 weeks; ≥1 GSR walked the claim flow on their phone        | orig: homegroups/docs/operations/launch-blockers.md (#7 attend 3 intergroup meetings), archived                            |
| HG-P1-4 | 30-group pilot outreach started                           | high     | Marcus | validation | not_started | Outreach tracker populated; first cohort of admins contacted                       | orig: homegroups/docs/operations/launch-blockers.md (#8 30-group pilot outreach), archived                                 |

## P2 — hygiene before 100 groups

| id      | blocker                                                   | severity | owner  | track | status      | acceptance_check                                                                                                        | source                                                                                                                     |
| ------- | --------------------------------------------------------- | -------- | ------ | ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| HG-P2-1 | App Check rollout (monitor → enforce on Stripe callables) | low      | Marcus | infra | not_started | App Check installed client+server; metrics show legit traffic ~1 week; then `enforceAppCheck: true` on Stripe callables | code: homegroups/firestore.rules#L98 (`notSpamming()` no-op); orig: …/launch-blockers.md (#13 App Check / D-35), archived  |
| HG-P2-2 | Rate limiting on `getPublicGroupProfile`                  | low      | Marcus | infra | not_started | Per-IP throttle added (e.g. `firebase-functions-rate-limiter`)                                                          | code: homegroups/functions/src/callable/getPublicGroupProfile.ts; orig: …/launch-blockers.md (#10 rate limiting), archived |

---

## Tracks at a glance

| Track            | State                     | Items                                                                   |
| ---------------- | ------------------------- | ----------------------------------------------------------------------- |
| **Code (30/30)** | `done`                    | All pre-launch code items shipped (C-1…C-30)                            |
| Revenue          | `blocked` (R-1/R-2)       | HG-P0-1, HG-P0-2, HG-P1-1                                               |
| Infra            | `not_started`             | HG-P0-5, HG-P0-7, HG-P0-8, HG-P0-9, HG-P0-11, HG-P1-2, HG-P2-1, HG-P2-2 |
| App Store        | `not_started` (long pole) | HG-P0-3, HG-P0-4, HG-P0-10                                              |
| Validation       | `not_started`             | HG-P0-6, HG-P1-3, HG-P1-4                                               |

---

## Minimum-viable launch sequence

The shortest path to a real paying customer. App Store is the **long pole**
(Apple review 1–7 days, rejection resets the clock) — start HG-P0-3/HG-P0-4
immediately, in parallel with everything else. The source checklist's minimum
viable launch sequence is `C-15 → I-1 → I-2 → I-3 → I-5 → I-6 → A-1/A-2`, with
everything else following while App Store review is in progress
(orig: homegroups/docs/operations/pre-launch-checklist.md, archived).

```
(code 30/30 = done)
  → HG-P0-9 (deploy hosting)
  → HG-P0-7 (auth domains)
  → HG-P0-8 (email sender)
  → HG-P1-1 (verify pk_live_)
  → HG-P0-6 (claim-and-pay E2E)
  → HG-P0-3 / HG-P0-4 (App Store / Play submit)  ← start in parallel from day 0
```

Everything else (HG-P0-5 RATS secret, HG-P0-1/HG-P0-2 B2B prices, HG-P1-3/HG-P1-4
field validation) can proceed while App Store review is in progress. The group
tier ([`HG-MON-1`](../_shared/pricing.md)) can transact as soon as the sequence
above completes; **B2B revenue stays `blocked` until HG-P0-1/HG-P0-2 clear**.

---

## Milestones

| Milestone                                  | Gate                                      | Status      |
| ------------------------------------------ | ----------------------------------------- | ----------- |
| First real claim-and-pay (group tier live) | MVL sequence complete (HG-P0-6)           | not_started |
| Apps live in both stores                   | HG-P0-3 + HG-P0-4 approved; HG-P0-10 done | not_started |
| B2B checkout able to transact              | HG-P0-1 + HG-P0-2 (R-1/R-2) cleared       | blocked     |
| 30-group pilot in trial                    | HG-P1-3 + HG-P1-4                         | not_started |
| Conversion evaluated (>30% → scale)        | 30 groups through trial window            | not_started |
| Facility dashboard shipped (B2B unlock)    | [`roadmap.md`](roadmap.md) `HG-RM-3`      | not_started |

---

## Decision gates

- **D-1** — group price ($24/year). Resolved; see
  [`monetization.md`](monetization.md) and
  [`../_shared/decisions-log.md`](../_shared/decisions-log.md). Does not block
  shipping (the group product can transact at its configured default price);
  activating $24 is part of revenue-track work.
- **R-3 / custom-domain decision** — open (HG-P1-2). Not launch-blocking;
  Firebase default works today.

## See also

- Monetization narrative + R-1/R-2 detail: [`monetization.md`](monetization.md)
- Roadmap (facility dashboard B2B unlock): [`roadmap.md`](roadmap.md)
- Pricing rows: [`../_shared/pricing.md`](../_shared/pricing.md)
