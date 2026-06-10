---
title: Detox-Recovery — Roadmap
scope: detox-recovery
category: roadmap
status: in_progress
last_verified: 2026-06-10
sources:
  - detox-recovery/docs/product/roadmap.md
  - detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md
  - detox-recovery/docs/monetization/projections.md
  - detox-recovery/CLAUDE.md
supersedes: []
---

# Detox-Recovery — Roadmap

NextStep Recovery (`nextsteprecovery.io`) launch-to-monetized roadmap. The site
is **code-complete but not publicly launched**; the gating work is delivery and
infrastructure, not features. Items below are filtered to MISSING / PARTIAL /
PLANNED — shipped scaffolding is pruned.

> Prices are referenced by `DX-MON-n` SKU into
> [`../_shared/pricing.md`](../_shared/pricing.md); no price values appear here.
> Launch-blocker execution detail lives in
> [`project-management.md`](project-management.md).

Status vocabulary: `done | in_progress | blocked | planned | not_started`.

## P0 — Launch blockers (active harm / revenue leak)

| id         | item                                                            | priority | status  | code_anchor                                                            | depends_on             | revenue_impact                                                                   | source                                                                        |
| ---------- | --------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| DX-RM-P0-1 | Fix `apphosting.yaml` `RUNTIMEi` → `RUNTIME` typo               | P0       | planned | `apphosting.yaml` (`MAILERLITE_GROUP_ID_NEWSLETTER`)                   | —                      | Stops silent newsletter-signup loss; recovers email-list attribution             | detox-recovery/docs/product/roadmap.md#critical-bugs                          |
| DX-RM-P0-2 | Wire paid-PDF delivery via Lemon Squeezy (or keep links hidden) | P0       | blocked | `lib/products-data.ts`; `apphosting.yaml` `NEXT_PUBLIC_LEMONSQUEEZY_*` | DX-RM-P1-1, DX-RM-P1-4 | Unblocks [`DX-MON-4`..`DX-MON-8`](../_shared/pricing.md); ends refund/trust risk | detox-recovery/docs/product/roadmap.md#paid-products-with-no-delivery         |
| DX-RM-P0-3 | Wire custom domain (`nextsteprecovery.com`)                     | P0       | planned | Firebase App Hosting console (`nextstep-recovery`)                     | —                      | Prerequisite for SEO indexing + all B2B/B2C credibility                          | detox-recovery/docs/product/roadmap.md#wire-custom-domain-nextsteprecoverycom |
| DX-RM-P0-4 | Install analytics (Plausible)                                   | P0       | planned | `app/layout.tsx`                                                       | DX-RM-P0-3             | Enables channel-ROI measurement → informs all acquisition decisions              | detox-recovery/docs/product/roadmap.md#install-plausible-analytics            |

> **Blocker dependency:** PDF delivery (`DX-RM-P0-2`) cannot complete until the
> PDFs are authored (`DX-RM-P1-4`) and the lead-magnet guides exist. Until then
> the 5 paid PDF links must stay hidden/`coming-soon` — charging for an
> undeliverable product is the headline revenue-leak risk
> (source: detox-recovery/docs/monetization/projections.md#14-risk-register).

## P1 — Funnel activation + measurement baseline

| id         | item                                                                                   | priority | status  | code_anchor                                                 | depends_on | revenue_impact                                                                       | source                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| DX-RM-P1-1 | Write "What to Do When Withdrawal Starts Feeling Unsafe" guide + MailerLite automation | P1       | planned | `lib/safety-data.ts`; MailerLite group `188194958591657681` | —          | Activates the highest-intent B2C lead-magnet funnel                                  | detox-recovery/docs/product/roadmap.md#p1--next-sprint-funnel-activation--measurement-baseline                                |
| DX-RM-P1-2 | Build `/thank-you` page                                                                | P1       | planned | `app/thank-you/page.tsx`                                    | —          | Recovers post-purchase UX + email-capture for every Stripe/LS sale                   | detox-recovery/docs/product/roadmap.md#build-thank-you-page                                                                   |
| DX-RM-P1-3 | Write "How to Help Someone in Withdrawal Without Making It Worse" + automation         | P1       | planned | MailerLite group `188194958890501182`                       | —          | Family funnel; upsell into Family Survival Guide [`DX-MON-4`](../_shared/pricing.md) | detox-recovery/docs/product/roadmap.md#write-how-to-help-someone-in-withdrawal-without-making-it-worse--mailerlite-automation |
| DX-RM-P1-4 | Author the 5 paid PDFs + migrate to Lemon Squeezy                                      | P1       | blocked | `docs/product/products/01-05`; Lemon Squeezy store          | DX-RM-P1-1 | Unblocks `DX-RM-P0-2`; turns [`DX-MON-4`..`DX-MON-8`](../_shared/pricing.md) live    | detox-recovery/docs/product/roadmap.md#migrate-5-paid-pdfs-to-lemon-squeezy                                                   |
| DX-RM-P1-5 | MailerLite welcome sequence for newsletter subscribers                                 | P1       | planned | MailerLite `MAILERLITE_GROUP_ID_NEWSLETTER`                 | DX-RM-P0-1 | Converts captured list → calls/PDFs                                                  | detox-recovery/docs/product/roadmap.md#p2--next-60-days                                                                       |

## P2 — Service-ladder + B2B + SEO (next 60 days)

| id         | item                                                             | priority | status  | code_anchor                                                                        | depends_on | revenue_impact                                                        | source                                                                  |
| ---------- | ---------------------------------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| DX-RM-P2-1 | Launch Tier 3 (60-min family/navigation call)                    | P2       | planned | `lib/services-data.ts` (`id: "family-call"`); `NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL` | DX-RM-P1-2 | Activates [`DX-MON-2`](../_shared/pricing.md); +higher-ARPU call rung | detox-recovery/docs/product/roadmap.md#p2-items-concise                 |
| DX-RM-P2-2 | Write B2B guide "10 Ways Detox Programs Lose Trust" + automation | P2       | planned | MailerLite group `188194959207171446`                                              | —          | Feeds B2B consulting pipeline [`DX-MON-9`](../_shared/pricing.md)     | detox-recovery/docs/product/roadmap.md#p2-items-concise                 |
| DX-RM-P2-3 | B2B structured intake form (org-size, program-type)              | P2       | planned | `app/consulting`; separate from `/contact`                                         | DX-RM-P2-2 | Improves B2B close rate                                               | detox-recovery/docs/product/roadmap.md#b2b-pipeline                     |
| DX-RM-P2-4 | SEO pillar article #1 + blog scaffold                            | P2       | planned | `app/articles/[slug]/page.tsx` (new)                                               | DX-RM-P0-3 | Organic traffic ramp (3–6 mo); feeds email list → digital revenue     | detox-recovery/docs/product/roadmap.md#p2-items-concise                 |
| DX-RM-P2-5 | Error monitoring (Sentry)                                        | P2       | planned | `apphosting.yaml` (Sentry DSN)                                                     | —          | Surfaces silent broken flows                                          | detox-recovery/docs/product/roadmap.md#p2-items-concise                 |
| DX-RM-P2-6 | Pre-call intake questionnaire                                    | P2       | planned | Calendly confirmation → Typeform/Form                                              | —          | Improves first-call quality                                           | detox-recovery/docs/product/roadmap.md#services--no-bookingpayment-flow |

## P3 — Expansion (backlog / future)

| id         | item                                      | priority | status  | code_anchor                                    | depends_on | revenue_impact                                                      | source                                                     |
| ---------- | ----------------------------------------- | -------- | ------- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| DX-RM-P3-1 | Launch Tier 4 (2-week navigation package) | P3       | planned | `lib/services-data.ts` (`id: nav-package`)     | DX-RM-P2-1 | Activates [`DX-MON-3`](../_shared/pricing.md); top call-ladder rung | detox-recovery/docs/product/roadmap.md#p3--backlog--future |
| DX-RM-P3-2 | Group workshop for families               | P3       | planned | (content + cohort tooling)                     | DX-RM-P1-3 | New seat-based revenue; needs 50+ email list                        | detox-recovery/docs/product/roadmap.md#p3--backlog--future |
| DX-RM-P3-3 | SEO pillar articles #2–5                  | P3       | planned | `app/articles/[slug]/page.tsx`                 | DX-RM-P2-4 | Compounding organic acquisition                                     | detox-recovery/docs/product/roadmap.md#p3-backlog-summary  |
| DX-RM-P3-4 | Tier 5 sliding-scale slots                | P3       | planned | `lib/services-data.ts` (`id: "sliding-scale"`) | —          | Mission access; donation/grant-funded                               | detox-recovery/docs/product/roadmap.md#p3-backlog-summary  |
| DX-RM-P3-5 | Case studies page                         | P3       | planned | `app/consulting` (new section)                 | DX-RM-P2-2 | B2B social proof after first engagement                             | detox-recovery/docs/product/roadmap.md#p3-backlog-summary  |
| DX-RM-P3-6 | UTM / referral tracking (`?ref=`)         | P3       | planned | analytics layer                                | DX-RM-P0-4 | Measures referral-channel ROI                                       | detox-recovery/docs/product/roadmap.md#growth--seo         |

## Sequencing

```
P0: typo fix + hide/deliver PDF links + custom domain + analytics
        ↓
P1: write guides (content) → MailerLite automations → lead-magnet funnel live
        ↓ (parallel)
P1: /thank-you page → measure funnel
        ↓
P1: author 5 PDFs → migrate to Lemon Squeezy (unblocks DX-RM-P0-2)
        ↓
P2: launch Tier 3 → B2B guide + intake → SEO ramp begins
        ↓
P3: Tier 4 → family workshop → Tier 5 sliding-scale
```

(Source: detox-recovery/docs/product/roadmap.md#section-5-cross-product-sequencing.)

**Out of scope (do not enable):** recovery-api referral relay — code-complete but
intentionally disabled pending partner agreement
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#out-of-scope-explicitly-not-in-this-plan).
