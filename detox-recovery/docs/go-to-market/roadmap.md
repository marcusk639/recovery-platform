---
title: Detox-Recovery — Roadmap
scope: detox-recovery
category: roadmap
status: in_progress
last_verified: 2026-06-10
sources:
  - detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md
  - detox-recovery/lib/services-data.ts
  - detox-recovery/lib/products-data.ts
  - detox-recovery/CLAUDE.md
supersedes:
  - detox-recovery/docs/product/roadmap.md
---

# Detox-Recovery — Roadmap

NextStep Recovery (`nextsteprecovery.io`) launch-to-monetized roadmap. The site
is **code-complete but not publicly launched**; the gating work is delivery and
infrastructure, not features. Items below are filtered to MISSING / PARTIAL /
PLANNED — shipped scaffolding is pruned.

> Prices are referenced by `DX-MON-n` SKU into
> [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md); no price values appear here.
> Launch-blocker execution detail lives in
> [`project-management.md`](project-management.md).

Status vocabulary: `done | in_progress | blocked | planned | not_started`.

## P0 — Launch blockers (active harm / revenue leak)

| id         | item                                                            | priority | status  | code_anchor                                                                                     | depends_on             | revenue_impact                                                                                           | source                                                                                  |
| ---------- | --------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| DX-RM-P0-1 | Fix `apphosting.yaml` `RUNTIMEi` → `RUNTIME` typo               | P0       | planned | `apphosting.yaml` (`MAILERLITE_GROUP_ID_NEWSLETTER`)                                            | —                      | Stops silent newsletter-signup loss; recovers email-list attribution                                     | orig: detox-recovery/docs/product/roadmap.md, archived (Critical Bugs)                  |
| DX-RM-P0-2 | Wire paid-PDF delivery via Lemon Squeezy (or keep links hidden) | P0       | blocked | `detox-recovery/lib/products-data.ts` L15,27-68; `apphosting.yaml` `NEXT_PUBLIC_LEMONSQUEEZY_*` | DX-RM-P1-1, DX-RM-P1-4 | Unblocks [`DX-MON-4`..`DX-MON-8`](../../../docs/go-to-market/_shared/pricing.md); ends refund/trust risk | orig: detox-recovery/docs/product/roadmap.md, archived (Paid Products with No Delivery) |
| DX-RM-P0-3 | Wire custom domain (`nextsteprecovery.com`)                     | P0       | planned | Firebase App Hosting console (`nextstep-recovery`)                                              | —                      | Prerequisite for SEO indexing + all B2B/B2C credibility                                                  | orig: detox-recovery/docs/product/roadmap.md, archived (Infrastructure Gaps)            |
| DX-RM-P0-4 | Install analytics (Plausible)                                   | P0       | planned | `app/layout.tsx`                                                                                | DX-RM-P0-3             | Enables channel-ROI measurement → informs all acquisition decisions                                      | orig: detox-recovery/docs/product/roadmap.md, archived (Infrastructure Gaps)            |
| DX-RM-P0-5 | Add Privacy Policy + Terms of Service pages                     | P0       | planned | `app/privacy/page.tsx`, `app/terms/page.tsx` (new)                                              | —                      | Legal/compliance gap for a site collecting name/email/message via forms; also a YMYL trust signal        | new finding: 2026-07-04 technical launch audit                                          |

> **Blocker dependency:** PDF delivery (`DX-RM-P0-2`) cannot complete until the
> PDFs are authored (`DX-RM-P1-4`) and the lead-magnet guides exist. Until then
> the 5 paid PDF links must stay hidden/`coming-soon` — charging for an
> undeliverable product is the headline revenue-leak risk (rated High likelihood
> with refund/trust impact in the model's risk register)
> (orig: detox-recovery/docs/monetization/projections.md, archived — §14 Risk
> Register).
>
> **Code-state caveat (verified).** The links are **not** currently gated: no
> product in `detox-recovery/lib/products-data.ts` sets `availability: "coming-soon"`
> (the field is defined but never assigned), so all 5 PDFs render **live buy-buttons
> with dead `#` `ctaHref`s**. "Hide the links" is therefore more urgent than the
> prose implies — it is an unshipped one-line guard, not a future step. Note the
> IAP / merchant-of-record sub-point is a **red herring here: NextStep is a website,
> not an app**, so no app-store commission applies.

## P1 — Funnel activation + measurement baseline

| id         | item                                                                                   | priority | status  | code_anchor                                                                | depends_on | revenue_impact                                                                                               | source                                                      |
| ---------- | -------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| DX-RM-P1-1 | Write "What to Do When Withdrawal Starts Feeling Unsafe" guide + MailerLite automation | P1       | planned | `detox-recovery/lib/safety-data.ts`; MailerLite group `188194958591657681` | —          | Activates the highest-intent B2C lead-magnet funnel                                                          | orig: detox-recovery/docs/product/roadmap.md, archived (P1) |
| DX-RM-P1-2 | Build `/thank-you` page                                                                | P1       | planned | `app/thank-you/page.tsx`                                                   | —          | Recovers post-purchase UX + email-capture for every Stripe/LS sale                                           | orig: detox-recovery/docs/product/roadmap.md, archived (P1) |
| DX-RM-P1-3 | Write "How to Help Someone in Withdrawal Without Making It Worse" + automation         | P1       | planned | MailerLite group `188194958890501182`                                      | —          | Family funnel; upsell into Family Survival Guide [`DX-MON-4`](../../../docs/go-to-market/_shared/pricing.md) | orig: detox-recovery/docs/product/roadmap.md, archived (P1) |
| DX-RM-P1-4 | Author the 5 paid PDFs + migrate to Lemon Squeezy                                      | P1       | blocked | `docs/product/products/01-05`; Lemon Squeezy store                         | DX-RM-P1-1 | Unblocks `DX-RM-P0-2`; turns [`DX-MON-4`..`DX-MON-8`](../../../docs/go-to-market/_shared/pricing.md) live    | orig: detox-recovery/docs/product/roadmap.md, archived (P1) |
| DX-RM-P1-5 | MailerLite welcome sequence for newsletter subscribers                                 | P1       | planned | MailerLite `MAILERLITE_GROUP_ID_NEWSLETTER`                                | DX-RM-P0-1 | Converts captured list → calls/PDFs                                                                          | orig: detox-recovery/docs/product/roadmap.md, archived (P2) |

## P2 — Service-ladder + B2B + SEO (next 60 days)

| id         | item                                                             | priority | status  | code_anchor                                                                                           | depends_on | revenue_impact                                                                                      | source                                                                |
| ---------- | ---------------------------------------------------------------- | -------- | ------- | ----------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| DX-RM-P2-1 | Launch Tier 3 (60-min family/navigation call)                    | P2       | planned | `detox-recovery/lib/services-data.ts` L43 (`id: "family-call"`); `NEXT_PUBLIC_STRIPE_FAMILY_CALL_URL` | DX-RM-P1-2 | Activates [`DX-MON-2`](../../../docs/go-to-market/_shared/pricing.md); +higher-ARPU call rung       | orig: detox-recovery/docs/product/roadmap.md, archived (P2)           |
| DX-RM-P2-2 | Write B2B guide "10 Ways Detox Programs Lose Trust" + automation | P2       | planned | MailerLite group `188194959207171446`                                                                 | —          | Feeds B2B consulting pipeline [`DX-MON-9`](../../../docs/go-to-market/_shared/pricing.md)           | orig: detox-recovery/docs/product/roadmap.md, archived (P2)           |
| DX-RM-P2-3 | B2B structured intake form (org-size, program-type)              | P2       | planned | `app/consulting`; separate from `/contact`                                                            | DX-RM-P2-2 | Improves B2B close rate                                                                             | orig: detox-recovery/docs/product/roadmap.md, archived (B2B Pipeline) |
| DX-RM-P2-4 | SEO pillar article #1 + blog scaffold                            | P2       | planned | `app/articles/[slug]/page.tsx` (new)                                                                  | DX-RM-P0-3 | Organic traffic ramp (3–6 mo); feeds email list → digital revenue                                   | orig: detox-recovery/docs/product/roadmap.md, archived (P2)           |
| DX-RM-P2-5 | Error monitoring (Sentry)                                        | P2       | planned | `apphosting.yaml` (Sentry DSN)                                                                        | —          | Surfaces silent broken flows                                                                        | orig: detox-recovery/docs/product/roadmap.md, archived (P2)           |
| DX-RM-P2-6 | Pre-call intake questionnaire                                    | P2       | planned | Calendly confirmation → Typeform/Form                                                                 | —          | Improves first-call quality                                                                         | orig: detox-recovery/docs/product/roadmap.md, archived (Services gap) |
| DX-RM-P2-7 | Add sitemap.xml, robots.txt, OpenGraph + schema.org markup       | P2       | planned | `app/sitemap.ts`, `app/robots.ts` (new), `app/layout.tsx`                                             | DX-RM-P0-3 | Zero crawl/social optimization today; blocks the SEO ramp (`DX-RM-P2-4`) from ever paying off       | new finding: 2026-07-04 technical launch audit                        |
| DX-RM-P2-8 | SEO pillar #6: "How to Continue Your Sobriety After Detox"       | P2       | planned | `app/articles/[slug]/page.tsx`                                                                        | DX-RM-P2-4 | Fills a real gap — the existing 5 pillars stop at acute withdrawal; this is additive, not redundant | 2026-07-04 marketing/discovery research                               |

> **Founder-requested SEO topics evaluated (2026-07-04):** "most effective detox methods" and "best detox services" are **not recommended** — high commercial/clinical search intent dominated by treatment-center and clinical-authority sites (WebMD/Healthline), and framing risks reading as clinical guidance, which conflicts with the site's non-clinical scope-of-practice constraint (`lib/scope-of-practice.ts`). "Things most people don't know about detox" should be folded into the existing "When Is Withdrawal Dangerous?" pillar rather than standing alone. Net: of the 4 founder-requested topics, 2 are cut, 1 is merged, 1 (`DX-RM-P2-8`) is added.

## P3 — Expansion (backlog / future)

| id         | item                                      | priority | status  | code_anchor                                                                              | depends_on | revenue_impact                                                                              | source                                                                |
| ---------- | ----------------------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| DX-RM-P3-1 | Launch Tier 4 (2-week navigation package) | P3       | planned | `detox-recovery/lib/services-data.ts` (`id: "nav-package"` — not yet in `SERVICE_TIERS`) | DX-RM-P2-1 | Activates [`DX-MON-3`](../../../docs/go-to-market/_shared/pricing.md); top call-ladder rung | orig: detox-recovery/docs/product/roadmap.md, archived (P3)           |
| DX-RM-P3-2 | Group workshop for families               | P3       | planned | (content + cohort tooling)                                                               | DX-RM-P1-3 | New seat-based revenue; needs 50+ email list                                                | orig: detox-recovery/docs/product/roadmap.md, archived (P3)           |
| DX-RM-P3-3 | SEO pillar articles #2–5                  | P3       | planned | `app/articles/[slug]/page.tsx`                                                           | DX-RM-P2-4 | Compounding organic acquisition                                                             | orig: detox-recovery/docs/product/roadmap.md, archived (P3)           |
| DX-RM-P3-4 | Tier 5 sliding-scale slots                | P3       | planned | `detox-recovery/lib/services-data.ts` L67 (`id: "sliding-scale"`)                        | —          | Mission access; donation/grant-funded                                                       | orig: detox-recovery/docs/product/roadmap.md, archived (P3)           |
| DX-RM-P3-5 | Case studies page                         | P3       | planned | `app/consulting` (new section)                                                           | DX-RM-P2-2 | B2B social proof after first engagement                                                     | orig: detox-recovery/docs/product/roadmap.md, archived (P3)           |
| DX-RM-P3-6 | UTM / referral tracking (`?ref=`)         | P3       | planned | analytics layer                                                                          | DX-RM-P0-4 | Measures referral-channel ROI                                                               | orig: detox-recovery/docs/product/roadmap.md, archived (Growth & SEO) |

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

(Sequencing orig: detox-recovery/docs/product/roadmap.md, archived — §5
Cross-Product Sequencing.)

**Out of scope (do not enable):** recovery-api referral relay — code-complete but
intentionally disabled pending partner agreement
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#out-of-scope-explicitly-not-in-this-plan).
