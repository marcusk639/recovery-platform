---
title: Detox-Recovery — Founder Manual Launch Guide
scope: detox-recovery
category: project-management
status: in_progress
last_verified: 2026-07-04
sources:
  - detox-recovery/docs/go-to-market/project-management.md
  - detox-recovery/docs/go-to-market/roadmap.md
  - detox-recovery/docs/product/discovery-strategy.md
supersedes: []
---

# Founder Manual Launch Guide

Every task in this doc requires **you specifically** — a login only you have, a
decision only you can make, or your actual voice/name. Everything that could
be automated (code, config, mechanical content reproduction, tooling
verification) has already been done and merged (PRs #41–#43) or is pending
merge (PR #44, a CI fix). This guide is sequenced for **fastest path to first
dollar and first user**, not alphabetically — do Section 1 in order; Sections
2–4 can interleave once Section 1's critical path is moving.

---

## 0. First: merge the open PR

**PR #44** (`fix/ci-secrets-context-in-job-if`) fixes a bug that's been
silently running **zero CI jobs** on every push/PR since 2026-06-28 — a full
week with no real CI signal on any product in the monorepo. Merge this first;
it's unrelated to detox-recovery specifically but affects everything.

---

## 1. Critical path — do these in order

This is the shortest path from "code is ready" to "first digital-product
dollar." Each step unblocks the next.

### 1.1 MailerLite automations (`DX-PM-1`) — ~30–60 min, one-time setup

The entire funnel (free guide → email → paid ladder) is dead until this
exists. Runbook: `detox-recovery/docs/operations/manual-tasks/2026-05-23-mailerlite-automation-setup.md`.

- [ ] Log into MailerLite, confirm the 4 group IDs already referenced in code exist and match:
  - `MAILERLITE_GROUP_ID_NEWSLETTER` (env var, currently `188194958278133227`)
  - `MAILERLITE_GROUP_ID_LEAD_MAGNET_UNSAFE` → `188194958591657681`
  - `MAILERLITE_GROUP_ID_LEAD_MAGNET_FAMILY` → `188194958890501182`
  - `MAILERLITE_GROUP_ID_B2B` → `188194959207171446`
- [ ] Build 3 automations (trigger: "subscriber added to group X" → send email with the matching PDF attached):
  1. Newsletter group → welcome email (no PDF)
  2. Lead-magnet-unsafe group → deliver `01-unsafe-withdrawal` PDF (welcome email copy already written in `docs/operations/lead-magnets/01-unsafe-withdrawal.md`)
  3. Lead-magnet-family group → deliver `02-helping-someone-in-withdrawal` PDF (welcome email copy already written in `docs/operations/lead-magnets/02-helping-someone-in-withdrawal.md`)
- [ ] Test: sign up through the actual `/resources` page form for each lead magnet, confirm the PDF arrives within 5 minutes.

### 1.2 Personalize the flagship PDF + 2 B2C lead magnets — ~3–4 hours

These are **not first drafts** — the content-completion audit (2026-07-04)
confirmed all 3 are 85%+ complete. What's left is specifically yours to
write (I can't fabricate your lived experience or sign your name):

- [ ] `docs/product/products/01-family-survival-guide.md` — personal note (page 2), closing line, resource-list additions. **~60–90 min.**
- [ ] `docs/operations/lead-magnets/01-unsafe-withdrawal.md` — 2 narrative paragraphs (lived-experience), closing line, your name. **~30–45 min.**
- [ ] `docs/operations/lead-magnets/02-helping-someone-in-withdrawal.md` — 1–2 sentence "why this exists," closing line, your name. **~20–30 min.**

Search each file for `[personalize` to find the exact insertion points.

### 1.3 Generate the PDFs — 10 minutes, already tested and working

```bash
cd detox-recovery
npm run pdfs
```

I ran this end-to-end on 2026-07-04 — all 8 PDFs generate cleanly, the
emergency-condition list renders correctly, and no internal/author-only notes
leak into the output. You do NOT need to debug this tooling; it works.
Output lands in `build/pdfs/` (gitignored, not meant to be committed).

### 1.4 Lemon Squeezy — flagship PDF only (`DX-PM-2`, scoped per `DP-3`)

- [ ] Create ONE product in your Lemon Squeezy store: Family Survival Guide, upload `build/pdfs/family-survival-guide.pdf`.
- [ ] Copy the real buy-link URL into `NEXT_PUBLIC_LEMONSQUEEZY_FAMILY_GUIDE_URL` in Firebase App Hosting's environment config (this is currently a placeholder in `apphosting.yaml` — `buy/placeholder`).
- [ ] **Decision needed (`DP-3`):** confirm you want to ship this 1 PDF first and validate before doing the other 4, or override and do all 5 now. My recommendation stands: ship 1 first — the remaining 4 are ~20–30 min each of the same personalization work, better done after the first sale proves the funnel.
- [ ] Test: buy your own flagship PDF, confirm checkout completes and the file delivers.

### 1.5 Confirm Stripe is actually live (already verified, spot-check only)

I confirmed via `git blame`/direct file inspection that `NEXT_PUBLIC_STRIPE_SUPPORT_CALL_URL` and `NEXT_PUBLIC_STRIPE_DONATION_URL` in `apphosting.yaml` are real, committed 2026-05-31 — not placeholders (`DP-6`, resolved). Just do a live click-through once deployed to be sure.

### 1.6 Deploy

```bash
firebase deploy
```

(Run this yourself — the Firebase CLI isn't in my shell's PATH per your CLAUDE.md.) Then smoke-test: contact form → email arrives, each lead magnet → PDF arrives within 5 min, flagship PDF purchase → checkout + delivery.

### 1.7 Custom domain + Resend domain — can run in parallel with 1.1–1.6

- [ ] `DX-PM-6`/`DX-RM-P0-3`: wire `nextsteprecovery.com` DNS to the Firebase App Hosting backend (`nextstep-recovery`). Prerequisite for SEO indexing.
- [ ] `DX-PM-7`: verify the Resend sending domain (runbook: `docs/operations/manual-tasks/2026-05-21-external-service-setup.md` — **ignore the ConvertKit/Vercel sections, those are stale**, only the Resend-domain mechanics apply).
- [ ] `DX-PM-4` Part B: create a free Plausible account, set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=nextsteprecovery.io` in Firebase App Hosting env config. The code is already live and waiting — this is a 5-minute signup.

---

## 2. Two decisions only you can make

Both are logged in `project-management.md`'s decision-gates table with my
recommendation, but neither is actionable by me — they need your sign-off:

- **`DP-3`**: ship 1 flagship PDF first (recommended) vs. all 5 at once.
- **`DP-4`**: start asking $7,500 (the band's upper end) by your 3rd B2B engagement instead of anchoring at the current low end — the medication-navigation and veteran differentiators support it, and verified market comps back the headroom.

---

## 3. Compliance — before you'd call the legal pages "final"

- [ ] Have an attorney review `/privacy` and `/terms` (`app/privacy/page.tsx`, `app/terms/page.tsx`) — they're a working draft adapted from a sibling product's reviewed template, not attorney-reviewed themselves.
- [ ] Form your LLC (or confirm your existing entity/state) and update the governing-law placeholder in `app/terms/page.tsx` (currently `[State — to be confirmed once the business entity is formed]`).

---

## 4. Marketing — sequenced for fastest first users

Full detail and citations in `docs/product/discovery-strategy.md` (already
researched, verified subreddit activity, etc.) — this is just the priority
order:

**Week 1 (do immediately, ~2–3 hrs total):**

- [ ] List on the 5 directories: peersupportlocator.com, facesandvoicesofrecovery.org, Psychology Today, Open Path Collective, National Harm Reduction Coalition.
- [ ] Start authentic (non-promotional) participation in r/stopdrinking, r/opiatesrecovery, r/quitting7oh, r/quittingkratom. Do NOT post links or promote — these communities ban for that within days.
- [ ] Contact your 2 warm B2B relationships about a referral arrangement.
- [ ] Write a 1-page referral card for treatment-center/SBIRT outreach.

**Weeks 2–4:**

- [ ] Identify and contact 2–3 hospital SBIRT program coordinators.
- [ ] Begin the first SEO pillar article (topic already chosen: "Alcohol Withdrawal at Home: What to Expect and When to Get Help"). This needs your peer/lived-experience voice — it's the documented content gap versus clinical-authority sites, and it's the whole differentiation strategy. Not something I should ghostwrite.

**Not launch-blocking, do when ready:**

- [ ] A real social-preview image (1200×630px) — `app/layout.tsx`'s OpenGraph metadata is wired but has no image yet.
- [ ] Sentry error monitoring — quick to add once you have a DSN: `npx @sentry/wizard@latest -i nextjs` (I deliberately didn't pre-install this without a real DSN — the Next.js Sentry plugin can complicate builds if configured against a placeholder).
- [ ] Reddit Ads small-budget test (the only paid channel not blocked by LegitScript) — verify current eligibility for a non-clinical advertiser before spending.
- [ ] PDFs 2–5 personalization, once the flagship's first sale validates the funnel.

---

## What I already did (for reference — don't redo)

Merged: privacy/terms pages, sitemap.xml/robots.txt, OpenGraph/Twitter/JSON-LD
metadata, Plausible analytics wiring (code), the 16-condition emergency list
reproduced into 4 PDF source docs, an author-only note converted to a
non-rendering comment, 4 stale tracker entries corrected (`RUNTIMEi` typo,
`/thank-you` page, `DP-6` Stripe verification), and the monorepo-wide CI fix
(pending merge in #44). Full detail in `project-management.md` and
`roadmap.md`.
