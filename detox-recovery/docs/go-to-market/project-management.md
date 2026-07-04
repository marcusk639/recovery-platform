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
> [`../_shared/pricing.md`](../../../docs/go-to-market/_shared/pricing.md). Roadmap item IDs (`DX-RM-*`)
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

| id       | blocker                                                                   | severity | owner                      | track                               | status      | acceptance_check                                                                                  | source                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------- | -------- | -------------------------- | ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DX-PM-1  | Lead-magnet delivery broken — capture works, no MailerLite automations    | critical | Founder (manual)           | Part B (MailerLite)                 | blocked     | Each of 3 lead magnets delivers its guide email within 5 min of signup                            | detox-recovery/docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md#context                                                                                                                                                                 |
| DX-PM-2  | Paid PDFs undeliverable — no PDFs authored, LS buy links are placeholders | critical | Founder + agent            | Part A + Part B (Lemon Squeezy)     | blocked     | All 5 paid PDF CTAs open Lemon Squeezy **live** checkout; one purchase delivers the PDF in ≤2 min | detox-recovery/docs/operations/manual-tasks/2026-05-23-lemon-squeezy-migration.md#verification                                                                                                                                                                |
| DX-PM-3  | Support-call price not single-sourced (hero hardcoded `$50`)              | high     | Agent                      | Part A (code)                       | done        | Support-call price reads from `SERVICE_TIERS` everywhere; no `$50` drift; drift-guard test green  | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-1-single-source-of-truth-pricing--support-call-price-raise                                                                                                                          |
| DX-PM-4  | No analytics installed — funnel is unmeasurable                           | high     | Founder + agent            | Part A (code) + Part B (account)    | in_progress | Page views appear in Plausible within 24h; ≥3 conversion goals configured                         | Part A done 2026-07-04 — script wired in `app/layout.tsx` behind `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, no-op if unset; awaiting Part B (founder creates Plausible account, sets env var). DX-RM-P0-4 ([roadmap.md](roadmap.md))                                     |
| DX-PM-5  | `apphosting.yaml` `RUNTIMEi` typo — newsletter signups silently failing   | high     | Agent                      | Part A (code)                       | done        | `apphosting.yaml` contains no `RUNTIMEi`; test signup lands in MailerLite newsletter group        | verified fixed 2026-07-04; DX-RM-P0-1 ([roadmap.md](roadmap.md)); orig: detox-recovery/docs/product/roadmap.md, archived                                                                                                                                      |
| DX-PM-6  | Custom domain not wired — site on Firebase default URL                    | high     | Founder (manual)           | Part B (DNS)                        | planned     | `https://nextsteprecovery.com` loads with valid SSL                                               | DX-RM-P0-3 ([roadmap.md](roadmap.md)); orig: detox-recovery/docs/product/roadmap.md, archived                                                                                                                                                                 |
| DX-PM-7  | Resend sending domain unverified (`from` points at `regroup-app.com`)     | medium   | Founder (manual)           | Part B (Resend)                     | planned     | `/contact` email arrives, not spam, From header not double-wrapped                                | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#b1-resend-sending-domain                                                                                                                                                                 |
| DX-PM-8  | Product + lead-magnet PDFs not generated (8 source markdowns exist)       | high     | Agent (optional) + Founder | Part A (optional) / Part B (author) | blocked     | 8 PDFs exist (5 paid + 3 lead-magnet); each renders correctly                                     | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-2-optional-generate-product--lead-magnet-pdfs-from-markdown                                                                                                                         |
| DX-PM-9  | No Privacy Policy / Terms of Service pages                                | high     | Founder + agent            | Part A (content+code)               | done        | `/privacy` and `/terms` routes exist and are linked from the footer                               | done 2026-07-04 — content adapted from `regroup/docs/operations/legal/`, pages follow homegroups' page pattern; **not yet attorney-reviewed** (see in-page disclaimer); governing-law state left as a placeholder pending LLC formation. roadmap `DX-RM-P0-5` |
| DX-PM-10 | No sitemap.xml / robots.txt / OpenGraph / schema.org markup               | medium   | Agent                      | Part A (code)                       | in_progress | `sitemap.xml` and `robots.txt` resolve; OG tags present in page source                            | sitemap.xml + robots.txt done 2026-07-04 (confirmed via production build); OpenGraph + schema.org markup not yet added — remains open. roadmap `DX-RM-P2-7`                                                                                                   |

> **DX-PM-1 and DX-PM-2 are the monetization-blocking pair.** The lead-magnet
> funnel feeds the entire ladder, and the paid PDFs cannot earn until both the
> content exists and Lemon Squeezy delivery is wired. Both gate the move from
> "Tier 2 + donations only" to a monetized digital layer.
>
> **2026-07-04 monetization review proposes narrowing DX-PM-2's near-term scope**:
> ship only the flagship PDF (Family Survival Guide, [`DX-MON-4`](../../../docs/go-to-market/_shared/pricing.md))
> plus DX-PM-1 as the fastest path to first digital-product revenue, rather than
> blocking on all 5 PDFs + the full Lemon Squeezy migration at once — 8 source
> markdowns already exist per DX-PM-8, so this is a delivery-sequencing change,
> not new content work. Author PDFs 2–5 after the first sale validates the
> funnel. Proposed, not yet founder-confirmed — see decision gate `DP-3`.

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

| id      | blocker (milestone)                              | severity | owner           | track    | status  | acceptance_check                                                                                                                     | source                                                                                                                        |
| ------- | ------------------------------------------------ | -------- | --------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| DX-MS-1 | First paid support call                          | —        | Founder         | —        | done    | Tier 2 [`DX-MON-1`](../../../docs/go-to-market/_shared/pricing.md) transacted; proof of concept                                      | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)                                      |
| DX-MS-2 | First digital-product sale (PDF deliverable)     | —        | Founder + agent | Part A+B | blocked | A Lemon Squeezy sale of the flagship PDF (`DX-MON-4`) delivers; gated on `DX-PM-2` / `DX-PM-8` per `DP-3`'s scope                    | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates); scope updated 2026-07-04 per `DP-3` |
| DX-MS-3 | First B2B engagement closed                      | —        | Founder         | manual   | planned | One [`DX-MON-9`](../../../docs/go-to-market/_shared/pricing.md) engagement invoiced + paid                                           | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)                                      |
| DX-MS-4 | Tier 3 launched (60-min family call)             | —        | Founder + agent | Part A+B | planned | [`DX-MON-2`](../../../docs/go-to-market/_shared/pricing.md) bookable + payable end-to-end                                            | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)                                      |
| DX-MS-5 | $1,000/month run rate                            | —        | Founder         | —        | planned | Trailing-month revenue ≥ $1k; triggers Tier 3 ramp                                                                                   | orig: detox-recovery/docs/monetization/projections.md, archived (§13 Milestones & Gates)                                      |
| DX-MS-6 | VA PSS certification + Community Care enrollment | —        | Founder         | manual   | planned | PSS cert complete; VA Community Care provider status approved; [`DX-MON-12`](../../../docs/go-to-market/_shared/pricing.md) billable | orig: detox-recovery/docs/monetization/projections.md, archived (§7 Stream V1 VA Community Care)                              |

**Milestone order:** first paid call ✅ → first deliverable PDF sale → first B2B
→ Tier 3 → $1k/mo → VA certification. The first-paid-call milestone is already
achieved; the chain is otherwise blocked behind the delivery work (DX-PM-1,
DX-PM-2).

---

## Decision gates

| Gate | Decision                                                                                                                                                                                                                                                                                                            | Recommendation                                                                                                                                                                                                                                                                      | Source                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DP-1 | Support-call repriced value (within the researched band)                                                                                                                                                                                                                                                            | Resolved — applied in code (`SERVICE_TIERS`); canonical value [`DX-MON-1`](../../../docs/go-to-market/_shared/pricing.md)                                                                                                                                                           | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#pricing-research-summary                                         |
| DP-2 | Generate PDFs programmatically (Part A `md-to-pdf` script) vs author by hand in a design tool                                                                                                                                                                                                                       | Generate now to unblock launch; polish later                                                                                                                                                                                                                                        | detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#task-2-optional-generate-product--lead-magnet-pdfs-from-markdown |
| DP-3 | Ship all 5 paid PDFs together (current `DX-PM-2` scope) vs ship 1 flagship PDF first                                                                                                                                                                                                                                | Recommend: ship 1 first (Family Survival Guide, [`DX-MON-4`](../../../docs/go-to-market/_shared/pricing.md)) to validate the funnel before authoring the remaining 4                                                                                                                | 2026-07-04 monetization review                                                                                                        |
| DP-4 | B2B ask price: hold the $1,500–7,500 band or move the default ask to the $7,500 upper end sooner                                                                                                                                                                                                                    | Recommend: make $7,500 the default ask starting with the 3rd engagement — medication-navigation + veteran differentiators justify it, and verified market comps ($100–400/hr, $1,200–1,600/day independent healthcare consulting) support headroom above the current low-end anchor | 2026-07-04 monetization review                                                                                                        |
| DP-5 | Build a minimal `getReferrals` consumer in homegroups/regroup ahead of the recovery-api partner-agreement decision (today: zero call sites in either product, so an enabled referral would go unread)                                                                                                               | Recommend: defer — not launch-blocking for detox-recovery, and moot unless/until the existing partner-agreement gate opens. Revisit post-launch.                                                                                                                                    | 2026-07-04 cross-product integration review                                                                                           |
| DP-6 | Verify production Stripe/Lemon Squeezy env vars are actually configured — the technical audit found `NEXT_PUBLIC_STRIPE_*`/`NEXT_PUBLIC_LEMONSQUEEZY_*` unset in the checked-in `apphosting.yaml`, yet `DX-MS-1` records a paid call already transacted, implying they're set via Firebase secrets outside the repo | Founder to confirm in the Firebase console before treating Tier 2/donations as launch-ready; if genuinely unset, this is a P0 blocker, not just a documentation gap                                                                                                                 | 2026-07-04 technical launch audit                                                                                                     |

---

## Optimal launch sequence (2026-07-04)

Synthesized from the technical, monetization, marketing, and cross-product
audits above, plus a monorepo-wide reuse check (see reuse notes). Ordered by
what unblocks the most downstream work per unit of effort — not by blocker ID
order.

**Week 1 (Part A — agent-executable, fast wins):**

- `DX-PM-5` — fix `RUNTIMEi` typo (minutes; unblocks newsletter capture).
- `DX-PM-9` — Privacy Policy + ToS. **Reuse, don't draft from scratch:**
  `regroup/docs/operations/legal/privacy-policy.md` and `terms-of-service.md`
  are an existing 11-section, health-adjacent legal template (already covers
  a "Health-Adjacent Data" section) — adapt it rather than writing new, and
  follow `homegroups/web/src/pages/PrivacyPage.js` / `TermsPage.js` as the
  proven React page pattern (already has tests) for the Next.js route shape.
- `DX-PM-10` (robots/sitemap half) — copy `homegroups/web/public/robots.txt`
  verbatim (2 lines); hand-write `app/sitemap.ts` using Next.js 15's built-in
  convention (no existing pattern to copy — this one's genuinely new; only 6
  routes, trivial).
- `DX-PM-4` code portion — install Plausible script in `app/layout.tsx`.
- Verify `DP-6` — founder confirms in Firebase console whether Stripe/Lemon
  Squeezy env vars are actually set in production before anything downstream
  assumes Tier 2 checkout works.

**Week 1–2 (Part B — founder manual, external accounts):**

- B1 Resend sending-domain verification (`DX-PM-7`).
- Custom domain DNS (`DX-RM-P0-3`) — prerequisite for SEO indexing and for
  `DX-RM-P2-7`'s OG/schema work to mean anything.
- Lemon Squeezy store setup — but scoped to **one** flagship PDF per `DP-3`,
  not all 5.

**Week 2–3 (critical path — nothing downstream matters without this):**

- `DX-PM-1` — MailerLite automations for the 3 lead magnets. This is the
  single highest-leverage fix per the monetization review: the entire funnel
  (free magnet → email → paid ladder) is inert until this ships.
- Author the flagship PDF (Family Survival Guide, `DX-MON-4`) — 8 source
  markdowns already exist (`DX-PM-8`), so this is finishing, not starting
  from zero.

**Week 3–4 (soft launch):**

- Deploy; smoke-test the full contact → email → MailerLite path; confirm
  custom domain live with SSL.
- Begin Tier-1 discovery (per `discovery-strategy.md`): 5 directory listings,
  authentic Reddit participation in r/stopdrinking, r/opiatesrecovery,
  r/quitting7oh, r/quittingkratom; contact the 2 warm B2B relationships;
  referral one-pager for SBIRT/intake-coordinator outreach.

**Month 2:**

- SBIRT hospital-partnership outreach begins (2–5 referrals/mo expected once
  established).
- First SEO pillar article, plus the new pillar #6 ("How to Continue Your
  Sobriety After Detox," `DX-RM-P2-8`) — gated on `DX-RM-P2-7`'s sitemap/OG
  work actually shipping first, or it won't rank.
- TikTok account launch.
- Author PDFs 2–5 only after the flagship PDF's first sale validates the
  funnel (per `DP-3`).

**Month 3:**

- Tier 3 launch (`DX-RM-P2-1`).
- B2B guide + structured intake form (`DX-RM-P2-2`, `P2-3`); start asking
  $7,500 by the 3rd engagement per `DP-4`.
- Small-budget Reddit Ads test (the only paid channel not blocked by
  LegitScript) — treat as an experiment, not a committed spend.

**Independent of the above (decision-gated, not on the critical path):**

- Partner-agreement negotiation for the recovery-api referral relay — a
  business decision with its own timeline, not an engineering task.
- `DP-5` — minimal `getReferrals` consumer in homegroups/regroup — deferred
  until/unless the partner agreement closes.

(Reuse findings and sequencing: 2026-07-04 monorepo-wide codebase search
across homegroups/regroup for existing privacy/terms/robots/analytics
patterns, cross-referenced against the technical/monetization/marketing
audits above.)

---

## Launch-done definition

Launch is complete when: support-call price reads from data everywhere (no `$50`
drift); typecheck + full test suite + production build all green; CI green on
`main`; contact-form email arrives correctly (not double-wrapped, not spam); each
of 3 lead magnets delivers within 5 min; **at minimum the flagship PDF CTA**
(Family Survival Guide, `DX-MON-4`) opens Lemon Squeezy **live** checkout — see
`DP-3`; the 5 old Stripe PDF links are archived; and the recovery-api
referral relay remains **disabled** (partner agreement pending).

> **Supersedes the original all-5-PDF criterion.** The source plan below
> required all 5 paid PDF CTAs live before launch; the 2026-07-04
> monetization review (`DP-3`) recommends shipping only the flagship PDF
> first and treats the remaining 4 as a post-launch (Month 2) follow-on. This
> section reflects that recommendation. If the founder rejects `DP-3` and
> reinstates the all-5 requirement, revert this section and `DX-MS-2`'s
> acceptance check to the original all-5 wording
> (source: detox-recovery/docs/superpowers/plans/2026-06-07-detox-completion.md#verification-checklist-launch-done-when-all-true).
