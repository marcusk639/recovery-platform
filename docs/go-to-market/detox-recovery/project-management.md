---
title: Detox-Recovery — Project Management
scope: detox-recovery
category: project-management
status: in_progress
last_verified: 2026-06-10
sources:
  - detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md
  - detox-recovery/docs/operations/manual-tasks/2026-05-21-external-service-setup.md
  - detox-recovery/docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md
  - detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md
  - detox-recovery/CLAUDE.md
supersedes: []
---

# Detox-Recovery — Project Management

The single launch-to-monetized plan for NextStep Recovery (`nextsteprecovery.io`).
Today only **Tier 2 (support call)** and **donations** are live and deliverable;
this doc is the path from there to the full ladder.

The completion plan splits cleanly into **Part A** (agent-executable code work)
and **Part B** (human-only external work — dashboards, DNS, payment providers,
`firebase deploy`). That split is preserved in the `track` column below
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md).

> Prices referenced by `DX-MON-n` into
> [`../_shared/pricing.md`](../_shared/pricing.md). Roadmap item IDs (`DX-RM-*`)
> live in [`roadmap.md`](roadmap.md). Status vocabulary:
> `done | in_progress | blocked | planned | not_started`.

---

## Current state (verified 2026-06-07)

Already done in the working tree (do not redo): Resend `from` double-wrap fix,
Lemon Squeezy **code** migration (vars are `LEMONSQUEEZY_*`), paid products
ungated in code, **and** the Part-A pricing single-source-of-truth refactor —
the support-call price now reads from `SERVICE_TIERS` (`lib/services-data.ts`),
the hero's hardcoded `$50 beta` string is gone
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#current-state-verified-2026-06-07).
What remains is the manual external launch work plus PDF authorship.

---

## Blockers

| id      | blocker                                                                   | severity | owner                      | track                               | status  | acceptance_check                                                                                  | source                                                                                                                                |
| ------- | ------------------------------------------------------------------------- | -------- | -------------------------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DX-PM-1 | Lead-magnet delivery broken — capture works, no MailerLite automations    | critical | Founder (manual)           | Part B (MailerLite)                 | blocked | Each of 3 lead magnets delivers its guide email within 5 min of signup                            | detox-recovery/docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md#context                                         |
| DX-PM-2 | Paid PDFs undeliverable — no PDFs authored, LS buy links are placeholders | critical | Founder + agent            | Part A + Part B (Lemon Squeezy)     | blocked | All 5 paid PDF CTAs open Lemon Squeezy **live** checkout; one purchase delivers the PDF in ≤2 min | detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#verification                                        |
| DX-PM-3 | Support-call price not single-sourced (hero hardcoded `$50`)              | high     | Agent                      | Part A (code)                       | done    | Support-call price reads from `SERVICE_TIERS` everywhere; no `$50` drift; drift-guard test green  | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-1-single-source-of-truth-pricing--support-call-price-raise  |
| DX-PM-4 | No analytics installed — funnel is unmeasurable                           | high     | Founder + agent            | Part A (code) + Part B (account)    | planned | Page views appear in Plausible within 24h; ≥3 conversion goals configured                         | DX-RM-P0-4 ([roadmap.md](roadmap.md)); orig: detox-recovery/docs/product/roadmap.md, archived                                         |
| DX-PM-5 | `apphosting.yaml` `RUNTIMEi` typo — newsletter signups silently failing   | high     | Agent                      | Part A (code)                       | planned | `apphosting.yaml` contains no `RUNTIMEi`; test signup lands in MailerLite newsletter group        | DX-RM-P0-1 ([roadmap.md](roadmap.md)); orig: detox-recovery/docs/product/roadmap.md, archived                                         |
| DX-PM-6 | Custom domain not wired — site on Firebase default URL                    | high     | Founder (manual)           | Part B (DNS)                        | planned | `https://nextsteprecovery.com` loads with valid SSL                                               | DX-RM-P0-3 ([roadmap.md](roadmap.md)); orig: detox-recovery/docs/product/roadmap.md, archived                                         |
| DX-PM-7 | Resend sending domain unverified (`from` points at `regroup-app.com`)     | medium   | Founder (manual)           | Part B (Resend)                     | planned | `/contact` email arrives, not spam, From header not double-wrapped                                | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#b1-resend-sending-domain                                         |
| DX-PM-8 | Product + lead-magnet PDFs not generated (8 source markdowns exist)       | high     | Agent (optional) + Founder | Part A (optional) / Part B (author) | blocked | 8 PDFs exist (5 paid + 3 lead-magnet); each renders correctly                                     | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-2-optional-generate-product--lead-magnet-pdfs-from-markdown |

> **DX-PM-1 and DX-PM-2 are the monetization-blocking pair.** The lead-magnet
> funnel feeds the entire ladder, and the paid PDFs cannot earn until both the
> content exists and Lemon Squeezy delivery is wired. Both gate the move from
> "Tier 2 + donations only" to a monetized digital layer.

---

## Tracks

**Part A — agent-executable (code).** Pricing single-source refactor + support
call reprice (`DX-PM-3`, done), optional programmatic PDF generation (`DX-PM-8`),
`RUNTIMEi` fix (`DX-PM-5`), Plausible script install (`DX-PM-4` code portion),
and a pre-launch verification gate (typecheck + tests + build green) before
handoff
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#part-a--agent-executable-code-work).

**Part B — human-only (external).** Requires logins to Resend, MailerLite, Lemon
Squeezy, Stripe, DNS, and running `firebase deploy` from the operator's terminal:
B1 Resend domain (`DX-PM-7`), B2 MailerLite automations (`DX-PM-1`), B3 Lemon
Squeezy store + buy links (`DX-PM-2`), B4 deploy + live smoke test, B5 archive
old Stripe PDF links
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#part-b--manual--external-checklist-human-only).

The authoritative runbooks for Part B:

- Resend domain: `detox-recovery/docs/operations/manual-tasks/2026-05-21-external-service-setup.md`
  — **note: that runbook is self-marked STALE** (ConvertKit/Vercel era); use it
  only for the Resend-domain mechanics, not the ConvertKit/Vercel steps
  (source: detox-recovery/docs/operations/manual-tasks/2026-05-21-external-service-setup.md).
- MailerLite automations: `detox-recovery/docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md`
- Lemon Squeezy migration: `detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md`

---

## Milestones

| id      | blocker (milestone)                              | severity | owner           | track    | status  | acceptance_check                                                                                             | source                                                                                           |
| ------- | ------------------------------------------------ | -------- | --------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| DX-MS-1 | First paid support call                          | —        | Founder         | —        | done    | Tier 2 [`DX-MON-1`](../_shared/pricing.md) transacted; proof of concept                                      | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)         |
| DX-MS-2 | First digital-product sale (PDF deliverable)     | —        | Founder + agent | Part A+B | blocked | A Lemon Squeezy PDF sale delivers; gated on DX-PM-2 / DX-PM-8                                                | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)         |
| DX-MS-3 | First B2B engagement closed                      | —        | Founder         | manual   | planned | One [`DX-MON-9`](../_shared/pricing.md) engagement invoiced + paid                                           | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)         |
| DX-MS-4 | Tier 3 launched (60-min family call)             | —        | Founder + agent | Part A+B | planned | [`DX-MON-2`](../_shared/pricing.md) bookable + payable end-to-end                                            | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)         |
| DX-MS-5 | $1,000/month run rate                            | —        | Founder         | —        | planned | Trailing-month revenue ≥ $1k; triggers Tier 3 ramp                                                           | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)         |
| DX-MS-6 | VA PSS certification + Community Care enrollment | —        | Founder         | manual   | planned | PSS cert complete; VA Community Care provider status approved; [`DX-MON-12`](../_shared/pricing.md) billable | orig: detox-recovery/docs/monetization/projections.md, archived (§7 Stream V1 VA Community Care) |

**Milestone order:** first paid call ✅ → first deliverable PDF sale → first B2B
→ Tier 3 → $1k/mo → VA certification. The first-paid-call milestone is already
achieved; the chain is otherwise blocked behind the delivery work (DX-PM-1,
DX-PM-2).

---

## Decision gates

| Gate | Decision                                                                                      | Recommendation                                                                                    | Source                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DP-1 | Support-call repriced value (within the researched band)                                      | Resolved — applied in code (`SERVICE_TIERS`); canonical value [`DX-MON-1`](../_shared/pricing.md) | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary                                         |
| DP-2 | Generate PDFs programmatically (Part A `md-to-pdf` script) vs author by hand in a design tool | Generate now to unblock launch; polish later                                                      | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-2-optional-generate-product--lead-magnet-pdfs-from-markdown |

---

## Launch-done definition

Launch is complete when: support-call price reads from data everywhere (no `$50`
drift); typecheck + full test suite + production build all green; CI green on
`main`; contact-form email arrives correctly (not double-wrapped, not spam); each
of 3 lead magnets delivers within 5 min; all 5 paid PDF CTAs open Lemon Squeezy
**live** checkout; the 5 old Stripe PDF links are archived; and the recovery-api
referral relay remains **disabled** (partner agreement pending)
(source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#verification-checklist-launch-done-when-all-true).
