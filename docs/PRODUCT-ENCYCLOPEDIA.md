# Recovery Platform — Product Encyclopedia

> **Purpose:** Comprehensive reference synthesizing all product management, strategy, monetization,
> and roadmap documentation across the recovery platform monorepo.
> **Created:** 2026-06-02 via full corpus analysis
> **Scope:** All docs under `docs/`, `homegroups/docs/`, `regroup/docs/`,
> `detox-recovery/docs/`, `recovery-api/docs/`, and relevant root-level files.

---

## Table of Contents

1. [Document Index](#1-document-index)
2. [Platform Overview](#2-platform-overview)
3. [Homegroups](#3-homegroups)
4. [Regroup — Sober Living Platform](#4-regroup--sober-living-platform)
5. [NextStep Recovery (detox-recovery)](#5-nextstep-recovery-detox-recovery)
6. [Recovery API](#6-recovery-api)
7. [Cross-Product Ecosystem Strategy](#7-cross-product-ecosystem-strategy)
8. [Monetization Strategy](#8-monetization-strategy)
9. [Financial Projections](#9-financial-projections)
10. [Market Opportunity](#10-market-opportunity)
11. [Competitive Landscape](#11-competitive-landscape)
12. [Go-To-Market Strategy](#12-go-to-market-strategy)
13. [Current Implementation Status & Roadmap](#13-current-implementation-status--roadmap)
14. [Key Risks & Mitigations](#14-key-risks--mitigations)

---

## 1. Document Index

### Root / Ecosystem Layer

| Path                                  | Type       | Summary                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/INDEX.md`                       | Navigation | AI-optimized doc navigation hub. Routes by task type (feature dev, monetization, roadmap, ecosystem context, deployment). Health check dashboard for doc freshness.                                                                                                                                             |
| `docs/strategy/roadmap.md`            | Strategy   | **Primary ecosystem roadmap.** Cross-verified against codebase. Covers P0–P3 priorities with scored growth axes (Usability / Acquisition / Revenue), revenue timeline Month 1–12, implementation plans for P0.A–P1.C, integration bridge status table, and confidence notes per item.                           |
| `docs/strategy/monetization.md`       | Strategy   | Cross-platform business model: Homegroups $12/yr consumer SaaS, Regroup B2B SaaS, Aftercare B2B enterprise. 3-year revenue projections (Moderate: $290K → $1.43M → $4.38M ARR). Break-even analysis, key metrics, and risk factors.                                                                             |
| `docs/strategy/market-opportunity.md` | Strategy   | **Merged market brief.** Covers ecosystem TAM/SAM/SOM, 3-year revenue by scenario, key macro tailwinds (behavioral health software CAGR 19.85%), ASAM Continuum of Care positioning, and Next Step Recovery TAM (~$40M). Competitive gap narrative: no competitor connects all three recovery phases digitally. |
| `docs/ecosystem/vision.md`            | Ecosystem  | **Stub — no content yet.** Placeholder for platform mission, success definition, and long-term vision.                                                                                                                                                                                                          |
| `docs/ecosystem/product-map.md`       | Ecosystem  | **Comprehensive product descriptions for all three products.** Regroup feature set (beds, activities, payments, Oxford governance), Homegroups feature set (13 modules), and the integrated treatment center offering narrative with implementation roadmap (Phases 0–4).                                       |
| `docs/ecosystem/integration.md`       | Ecosystem  | Recovery-api integration model. Endpoints (`/api/referrals`, `/api/users/me`), auth model (JWT + service keys), `toApp` values, and future state as integration bus.                                                                                                                                            |
| `docs/ecosystem/vocabulary.md`        | Ecosystem  | Cross-product vocabulary disambiguation (meeting, group, member, house, guest, referral) with product-prefixed forms for ambiguous usage.                                                                                                                                                                       |
| `CLAUDE.md` (root)                    | Context    | Full monorepo context for AI agents: product table, integration map, auth model, cross-cutting rules (PII, errors, secrets, emulator ports, data isolation).                                                                                                                                                    |
| `readiness-report.md`                 | Ops        | Harness engineering readiness report.                                                                                                                                                                                                                                                                           |
| `CODEBASE-REVIEW.md`                  | Quality    | Codebase review findings.                                                                                                                                                                                                                                                                                       |
| `DOC-CODE-AUDIT.md`                   | Quality    | Documentation-code discrepancy audit.                                                                                                                                                                                                                                                                           |

### Homegroups

| Path                                                                   | Type         | Summary                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `homegroups/docs/product/roadmap.md`                                   | Roadmap      | **Homegroups primary roadmap.** Revenue model ($12/yr), feature version status (MVP–V4.4 all complete behind feature flags), P0 manual launch actions, P1 code work (Facility Dashboard, getMeetingAttendance), P2 SEO/conversion, P3 backlog. 90-day success criteria. 12-month ecosystem sequencing diagram.                                                                                                                      |
| `homegroups/docs/product/requirements.md`                              | Requirements | MVP product requirements. Goal, target users, core principles (privacy-first, anonymity, reliability), MVP scope (meetings, groups, communication, treasury, governance), monetization model, and explicit non-goals.                                                                                                                                                                                                               |
| `homegroups/docs/product/decisions.md`                                 | Decisions    | Audit wave follow-up tracking. TypeScript CI issues, victory-native downgrade, resolved type errors per file. CI gate re-enablement status.                                                                                                                                                                                                                                                                                         |
| `homegroups/docs/monetization/model.md`                                | Monetization | **Full billing & payments system doc.** Subscription model (group $12/yr, intergroup Tier A/B, treatment center tiers), Stripe webhook event handlers, auth flows (custom token, magic link), payment flows (iOS WebView, Android SDK, Customer Portal), environment variables, Regroup integration endpoint, treatment center checkout flow.                                                                                       |
| `homegroups/docs/monetization/projections.md`                          | Financials   | **Master 3-year financial model (all products).** Month-by-month Year 1, quarterly Year 2–3 by product. Unit economics (LTV:CAC), scenario analysis, headcount plan, cash flow (bootstrap and seeded), funding requirements ($250K seed recommended), Series A trigger criteria.                                                                                                                                                    |
| `homegroups/docs/monetization/market-intelligence.md`                  | Market       | **Full market intelligence brief with footnotes.** 13 sections: ecosystem overview, market context, competitive landscape (treatment center and sober living software), Oxford House GTM strategy, Aftercare business case, revenue projections, technical architecture requirements, sprint-by-sprint sober living feature build plan, 12-step app monetization strategy, GTM sequencing, competitive positioning, and risk table. |
| `homegroups/docs/monetization/revenue-opportunities.md`                | Revenue      | Actionable revenue backlog with completion status. P0 (Stripe interval verification), P1 (trial/renewal notifications — done), P2 (treatment center landing, intergroup pricing, meeting attendance API), P3 (treasury gate, year-end trigger, donation promotion, QR check-in). Priority summary table with effort/impact/status.                                                                                                  |
| `homegroups/docs/plans/2026-04-13-recovery-ecosystem-12-month-plan.md` | Plan         | 12-month cross-product implementation plan. Current state of all three products, feature gap analysis for rats-v2 (Sprint 1/2/3), month-by-month execution sequence, revenue timeline, success criteria.                                                                                                                                                                                                                            |
| `homegroups/docs/plans/2026-02-26-reduce-feature-bloat.md`             | Plan         | Feature bloat reduction plan.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `homegroups/docs/operations/launch-blockers.md`                        | Ops          | Manual actions blocking launch: Stripe key verification, Firebase Auth domains, email sender, App Store submission.                                                                                                                                                                                                                                                                                                                 |
| `homegroups/docs/operations/pre-launch-checklist.md`                   | Ops          | Pre-launch checklist.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `homegroups/docs/technical/architecture.md`                            | Technical    | Homegroups architecture.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `homegroups/docs/technical/security-audit.md`                          | Technical    | Security audit findings.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `homegroups/docs/technical/push-notifications.md`                      | Technical    | FCM push notification implementation.                                                                                                                                                                                                                                                                                                                                                                                               |
| `homegroups/docs/technical/messaging-engineering.md`                   | Technical    | Group chat and DM engineering.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `homegroups/docs/technical/development.md`                             | Technical    | Local development setup.                                                                                                                                                                                                                                                                                                                                                                                                            |
| `homegroups/docs/technical/deep-linking.md`                            | Technical    | Deep link scheme inventory.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `homegroups/docs/archive/`                                             | Archive      | Feb 2026 analysis, specifications, reviews, plans. Historical context only.                                                                                                                                                                                                                                                                                                                                                         |
| `homegroups/docs/superpowers/plans/`                                   | Plans        | Implementation plans May 2026 (go-live revenue growth, treasury report gate, facility dashboard, feature flags, legal pages, subscription gate fixes).                                                                                                                                                                                                                                                                              |

### Regroup

| Path                                                                            | Type         | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `regroup/docs/product/roadmap.md`                                               | Roadmap      | **Regroup feature priority roadmap.** Market opportunity (27,500 houses, <0.1% penetration), 4-tier feature scoring matrix. Tier 1 critical (Oxford Foundation — model selector, officer roles, EES, business meetings, voting, charter compliance). Tier 2 high priority (Stripe, reporting, mobile UX, 2FA). Tier 3 growth (network directory, photo verification, analytics, marketing tools). Tier 4 advanced (alumni network, integrations, white-label). Quarterly revenue targets. |
| `regroup/docs/product/requirements.md`                                          | Requirements | Core sober living management requirements sourced from operator research. Resident management, accountability tooling, payments/admin, and communication.                                                                                                                                                                                                                                                                                                                                 |
| `regroup/docs/monetization/model.md`                                            | Monetization | **Regroup pricing strategy analysis.** Current state ($10+$1 — unsustainable at $60K ARR). 6 pricing model options with revenue projections. **Recommended: Balanced Option 2** (Traditional $69–$249, Oxford $49–$299, Network $299/chapter). 3-year projection to $1.7M ARR at 1,000 houses. Implementation roadmap (grandfather period, migration sequence, sample emails).                                                                                                            |
| `regroup/docs/technical/architecture.md`                                        | Technical    | Regroup architecture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `regroup/docs/technical/development.md`                                         | Technical    | Development setup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `regroup/docs/technical/gap-analysis-production-readiness.md`                   | Technical    | Production readiness gaps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `regroup/docs/operations/manual-tasks/2026-05-21-app-store-launch-checklist.md` | Ops          | App Store submission checklist.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `regroup/docs/operations/legal/privacy-policy.md`                               | Legal        | Regroup privacy policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `regroup/docs/operations/legal/terms-of-service.md`                             | Legal        | Regroup terms of service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `regroup/docs/technical/mobile/`                                                | Technical    | Firestore data model, Oxford UX patterns, wizard conventions, UX improvements, E2E test docs.                                                                                                                                                                                                                                                                                                                                                                                             |

### NextStep Recovery (detox-recovery)

| Path                                                | Type         | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detox-recovery/docs/product/roadmap.md`            | Roadmap      | **NextStep roadmap.** Source of truth verdict table for all 17 docs. Implementation status matrix (P0 critical bugs, P1 paid product gaps, P2 infrastructure, P3 growth/SEO, P4 B2B pipeline). P0–P3 prioritized roadmap with growth scores and effort estimates. Revenue impact summary per gap.                                                                                                                                                                   |
| `detox-recovery/docs/product/discovery-strategy.md` | Strategy     | **Customer discovery strategy.** Pull vs. push discovery modes. Tier 1 channels (SBIRT hospital partnerships, treatment center intake network, directory listings, Reddit). Tier 2 (SEO content, TikTok). Tier 3 (harm reduction orgs, podcasts). 90-day action plan with monthly targets. B2C/B2B flywheel mechanics.                                                                                                                                              |
| `detox-recovery/docs/product/requirements.md`       | Requirements | NextStep product requirements.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `detox-recovery/docs/product/decisions.md`          | Decisions    | Product decisions log.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `detox-recovery/docs/product/products/`             | Products     | 5 planned PDF products: Family Survival Guide ($19.99), Appointment Prep Worksheet ($9.99), Withdrawal Safety Checklist ($9.99), Treatment Comparison Worksheet ($9.99), Relapse Prevention Plan ($9.99). All blocked on content writing.                                                                                                                                                                                                                           |
| `detox-recovery/docs/monetization/model.md`         | Monetization | **Multi-product monetization strategy.** Part 1: Stripe manual setup (payment link inventory, success URLs, Tier 3/4 creation, PDF → Lemon Squeezy migration, B2B invoicing). Part 2: Next Step revenue architecture (service ladder, near-term unlock sequence, capacity ceiling). Parts 3–5: Homegroups, Regroup, and regroup-web/functions monetization models. Part 6: Cross-ecosystem flywheel with referral flow table and shared infrastructure investments. |
| `detox-recovery/docs/monetization/projections.md`   | Financials   | **Master financial model v2.0.** Month-by-month Year 1 ($18K base), quarterly Year 2 ($56K), quarterly Year 3 ($139K). Full 3-scenario analysis (Conservative/Base/Optimistic). Veteran pathway financial model (VA Community Care, VSO workshops, grants). Unit economics. Cash flow. Headcount plan. Year 4–5 projections. Revenue opportunity map (all gaps). Financial milestone/decision gate table.                                                           |
| `detox-recovery/docs/technical/architecture.md`     | Technical    | Next.js 15 App Router architecture, components, API routes, security pipeline.                                                                                                                                                                                                                                                                                                                                                                                      |
| `detox-recovery/docs/technical/api.md`              | Technical    | API documentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `detox-recovery/docs/technical/pdf-delivery.md`     | Technical    | PDF delivery decision: Lemon Squeezy selected over Stripe for VAT + delivery automation.                                                                                                                                                                                                                                                                                                                                                                            |
| `detox-recovery/docs/technical/development.md`      | Technical    | Development setup.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `detox-recovery/docs/operations/manual-tasks/`      | Ops          | Lemon Squeezy migration runbook (17 steps), MailerLite automation setup, external service setup.                                                                                                                                                                                                                                                                                                                                                                    |
| `detox-recovery/docs/operations/lead-magnets/`      | Ops          | Lead magnet content specs for 3 guides (unsafe withdrawal, family support, detox trust loss).                                                                                                                                                                                                                                                                                                                                                                       |
| `detox-recovery/docs/_archive/`                     | Archive      | Financial model, business case, financial projections, market opportunity analysis (May 2026 — superseded by v2.0 projections).                                                                                                                                                                                                                                                                                                                                     |
| `detox-recovery/docs/superpowers/plans/`            | Plans        | Launch blockers plan, service page polish, initial website build, feature completion, post-launch improvements.                                                                                                                                                                                                                                                                                                                                                     |

### Recovery API

| Path                                   | Type  | Summary                                                                                                     |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `recovery-api/docs/superpowers/plans/` | Plans | Firebase migration plan (Functions v2), regroup mobile services integration, regroup functions integration. |
| `recovery-api/docs/superpowers/specs/` | Specs | Recovery platform Cloud Functions design (v2 callable architecture).                                        |

---

## 2. Platform Overview

### Mission

The recovery platform serves individuals and organizations across the full addiction recovery continuum — from people in acute withdrawal, to sober living house operators, to 12-step group administrators. It is the only platform that connects all three phases of the recovery journey (treatment discharge → sober living → community recovery) through operational software with real data.

### The Three Products + Integration Layer

| Product           | Directory         | Marketed As       | Primary Customer                   | Revenue Model                                     |
| ----------------- | ----------------- | ----------------- | ---------------------------------- | ------------------------------------------------- |
| Homegroups        | `homegroups/`     | Homegroups        | 12-step group admins and members   | $12/year per group admin (consumer SaaS)          |
| Regroup           | `regroup/`        | Regroup           | Sober living house operators       | $49–$299/month B2B SaaS                           |
| NextStep Recovery | `detox-recovery/` | NextStep Recovery | Individuals/families in withdrawal | Service calls + digital products + B2B consulting |
| Recovery API      | `recovery-api/`   | (internal)        | Cross-app integration              | Platform fee on cross-product flows               |

### The ASAM Continuum Mapping

```
Detox → Residential → PHP → IOP → Outpatient
                                        ↓
                              [NextStep Recovery]
                              Withdrawal navigation
                              (detox-recovery)
                                        ↓
                              [Regroup]
                              Sober living management
                              (regroup)
                                        ↓
                              [Homegroups]
                              12-step community
                              (homegroups)
                                        ↑
                              [Future Aftercare System]
                              Post-discharge outcomes
                              bridges all three
```

No competitor in the market digitally connects these three phases. All existing treatment center software (Kipu Health, Sunwave, LightningStep, Opus EHR) treats the patient journey as ending at discharge.

### Firebase Projects

| Product                            | Firebase Project ID                         |
| ---------------------------------- | ------------------------------------------- |
| Homegroups (homegroups)            | `recovery-connect-cad4b`                    |
| Regroup (regroup)                  | `phoenix-cleanhouse`                        |
| NextStep Recovery (detox-recovery) | `nextstep-recovery`                         |
| Recovery API                       | `recovery-platform` (service accounts only) |

---

## 3. Homegroups

### What It Is

Homegroups is a privacy-first mobile (React Native) and web (React) platform for running 12-step recovery groups (AA, NA, and similar fellowships). It replaces paper ledgers, GroupMe chats, and Seventh Tradition envelopes with a single, anonymity-preserving system of record.

Core principle: **group autonomy + member anonymity.** No real names required (first name + last initial default). Each group controls its own data, treasury, positions, and moderation. No global social graph.

### Target Users

- **Members:** Accurate meeting info, in-group chat, push notifications for celebrations/announcements — all under anonymous display name.
- **Group secretary/admin:** Position tracking with term dates, one-tap pinned announcements, invite-code onboarding.
- **Treasurer:** Categorized income/expenses, balance + prudent reserve, recurring transactions, formal handoff workflow.
- **Sponsor/sponsee:** Step work tracking, cross-group sponsor links, scoped DMs.
- **Intergroup/service body:** V4.4 cross-group announcements, data export, facility-level stats.
- **Treatment center:** Verified groups, invite flow, engagement signals.

### Feature Set (13 Modules)

1. **Authentication** — Email/password, Google, Apple, Facebook SSO.
2. **Profile & privacy** — Display name, sobriety date, per-group privacy toggles.
3. **Meetings** — Geolocated finder (100K+ pre-seeded meetings) with filters, map/directions, online links.
4. **Groups** — Discovery, create/join/leave, member directory, admin edits.
5. **Service positions** — Define roles, assign with term dates, rotation tracking.
6. **Treasury** — Income/expenses with categories, balance, prudent reserve, monthly totals, treasurer handoff, recurring transactions.
7. **Announcements** — Admin-only authoring, pinning, FCM push delivery.
8. **Group chat & DMs** — Real-time messaging, @mentions, reactions, replies, attachments, admin deletion.
9. **Sobriety tracking** — Live counter, milestone medallions (24hr → multi-year), celebration animations, group announcements.
10. **Governance** — Conscience votes, elections, business-meeting minutes, moderation/reporting.
11. **Sponsorship** — Cross-group sponsor/sponsee links, step-work companion, scoped DMs.
12. **Literature & resources** — Daily reflections, bookmarks, meeting topics, contributed literature.
13. **Advanced** — Deep-link invite codes, Stripe subscriptions ($12/year), intergroup (V4.4), white-label branding (V4.4), referral program, group-health dashboard.

> **V4.1–V4.4 mobile UI status:** Cloud Functions backend and Firestore schema are implemented. All mobile UI entry points are **hidden behind feature flags** (all `false` in `featureFlags.ts`). End users cannot access any V4.x feature. Flip individual flags to enable.

### Technical Stack

| Component | Stack                                                                      |
| --------- | -------------------------------------------------------------------------- |
| Mobile    | React Native (TypeScript), Redux Toolkit (26 slices), React Navigation     |
| Functions | Node 22, TypeScript, Firebase Admin, Stripe SDK, SendGrid, geofire-common  |
| Web       | React — marketing site + deep-link landings + `apple-app-site-association` |

90 callable Cloud Functions + 16 Firestore triggers + 14 scheduled jobs + HTTP webhooks.

### Monetization (Homegroups)

**Core pricing:**

- **Free:** Members (non-admin) — meeting search, group chat, sobriety tracker, join groups.
- **Group admin:** $12/year flat rate — treasury, meeting management, announcements, service positions, member management.
- **Additional groups:** $8/year per group beyond the first (multi-group discount).
- **Intergroup/district/area:** Tier A (up to 10 groups) or Tier B (unlimited) — price TBD, checkout wired, needs Stripe price set.
- **Treatment center:** Same as Tier A/B via `createIntergroup({ type: "treatment_center" })`.

**Why $12/year:** Accessible ($0.60/person for 20-member group), fair (flat rate), low friction (annual billing), positioned correctly (group operating expense, not personal subscription). Revenue ceiling at 5,000 groups = $60K ARR. B2B is the path beyond that.

**Trial:** 7 days free with no payment method required at start.

**Revenue conversion hooks (all implemented as of May 2026):**

- Day 5 trial push notification (scheduled CF)
- 30-day pre-renewal reminder (scheduled CF)
- Subscription gates on Treasury and Announcements screens
- "Ask admin to upgrade" modal from member screens
- Year-end treasury summary as November conversion trigger
- Donation platform fee promotion (5% on group donations via Stripe Connect)

**Launch blockers (P0 — manual, no code):**

1. Run claim-and-pay flow end-to-end in incognito
2. Verify Stripe production key on deployed web (`pk_live_`)
3. Configure Firebase Auth authorized domains
4. Fix Firebase email sender spam issue
5. Submit to App Store and Google Play

**Code blockers:**

- `PAYMENT_BASE_URL` placeholder in `SubscriptionWebView.tsx:37` (no user can subscribe)
- `JOIN_BASE_URL` hardcoded to `homegroups.app/join` in `InviteShareSheet.tsx:34`

### Current Status

- MVP through V4: **complete**
- Revenue infrastructure (subscriptions, trial/renewal, gates): **complete as of May 2026**
- Treatment center checkout: **complete**
- Intergroup upgrade flow: **complete**
- **Needs:** P0 manual launch actions, Facility Dashboard (P1 code), Stripe intergroup prices set (manual)

---

## 4. Regroup — Sober Living Platform

### What It Is

Regroup (Recovery Activity Tracking System) is a full-stack platform for running sober living homes. It replaces paper binders, group chats, spreadsheets, and Venmo requests with a single system of record for residents, compliance, rent, and house governance.

Supports two operating models in one codebase:

1. **Manager-operated houses** — staff owner enforces rules, collects rent, resolves disputes, signs off on compliance.
2. **Oxford Houses** — democratically self-governed homes with elected officers, weekly business meetings, Equal Expense Share (EES) accounting, and formal voting.

### Target Users

| Stakeholder          | Problem Today                                                      | Regroup Solution                                                                          |
| -------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| House operator/owner | Rent, compliance, incident logs scattered; liability hard to prove | Stripe-powered rent, auditable activity logs, dispute records, drug-test history          |
| House manager        | Tracking chores, meetings, work, medication is manual              | Unified Activities module with one tap per event                                          |
| Resident             | Proving program compliance is tedious and adversarial              | Self-service activity logging; transparent history they own                               |
| Oxford House chapter | Officer rotation, business meetings, EES math done on paper        | Officer roles with term reminders, business-meeting minutes, vote tallying, automated EES |
| Treatment center     | No visibility into whether placed clients are engaging             | Admin/super-admin role with cross-house reporting                                         |

### Feature Set

- **Bed & room management** — house layout, bed assignments, move-in/move-out.
- **Guest (resident) profiles** — personal info, phase, supporters, emergency contacts.
- **Phase advancement** — structured phases with activity thresholds.
- **Disputes, complaints, issues** — logged, attributable, resolvable.
- **Chores** — assignable, trackable, rotatable.
- **Activities** — unified model covering meetings, chores, work, medication, supporter visits.
- **Rent & payments** — Stripe Connect Express; destination charges; payment history; idempotent payment intents.
- **Drug testing** — test recording, result history, per-resident attribution.
- **Oxford House governance (gated)** — elected officer positions, business meetings, voting, EES tracker and transfers.
- **Communication** — direct messaging, house-wide chat, push notifications (FCM + Notifee).
- **Billing (web portal)** — marketing site, subscription management, Stripe portal.

### Technical Stack

| Repo                                     | Role                        | Stack                                                     |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------- |
| `regroup/mobile/` (rats-v2)              | iOS + Android app           | React Native 0.72, TypeScript, Redux Toolkit, React Query |
| `regroup/web/` (rats-web)                | Marketing site + web portal | Angular 9, Angular Universal SSR, Firebase Hosting        |
| `regroup/functions/` (regroup-functions) | Shared backend              | Node 22, Firebase Functions v1, Stripe, SendGrid          |

**Firebase project:** `phoenix-cleanhouse`

**Key backend surface:**

- Callable CFs: house CRUD, meeting creation, subscription linking, `createPaymentIntent`, `listPayments`, `listHousePayments`, EES calculations
- HTTP: Stripe Connect OAuth, Angular SSR proxy
- Webhook: `stripeEvents` (charge succeeded/failed/refunded)
- Scheduled: officer term reminders, weekly payment/compliance batches

### Monetization (Regroup)

**Current pricing (unsustainable):** $10/house + $1/resident (~$20/month average)

**Recommended pricing (Option 2 — Balanced):**

- Traditional Starter: $69/month (≤10 residents)
- Traditional Professional: $129/month (≤20 residents)
- Traditional Enterprise: $249/month (unlimited)
- Oxford Standard: $49/month (≤15 residents)
- Oxford Plus: $89/month (≤25 residents)
- Oxford Network/Chapter: $299/month (regional chapter)

**Revenue math at recommended pricing, 250 houses:** $314K ARR — can afford full team by Year 2.

**Revenue streams:**

1. Monthly SaaS subscriptions (per-house)
2. Stripe payment processing fee (2% application fee on rent collection — already coded)
3. Oxford chapter tier ($200–$500/month)
4. Enterprise operators (10+ houses): $1,200/month

**Implementation plan:**

- Immediate: New pricing for new customers
- Months 1–6: Grandfather existing customers
- Month 6–7: Migration with "founder pricing" (20–30% discount)
- Month 7–12: Optimize tier distribution, add annual billing, add-ons

### Oxford House Strategy

**Market:** ~4,324 Oxford Houses nationally (35,796 beds, 47 states). 100% currently underserved by technology solutions. No existing sober living software supports Oxford's democratic governance model.

**GTM approach:**

1. **Free core tier** for individual houses — treasury management, EES calculator, service positions, meeting minutes. Removes budget objection; rotation-driven virality.
2. **Premium at chapter level** — $200–$500/chapter/month for multi-house roll-ups. Paid from chapter dues, not house budgets.
3. **OHI enterprise partnership** — pitch Oxford House Inc. leadership. Annual World Convention (August/September) as GTM venue.
4. **State association pilots** — target NC (320+ houses), VA, TX first.

**Design principle for Oxford:** Traditional software assumes an operator/owner. Oxford Houses have no such person — buying decisions require a majority house vote, budgets are razor-thin, and roles rotate every 6 months. Regroup is the only platform built for this.

### Current Status (May 2026 — P0–P3 items remaining)

**Confirmed MISSING:**

- Oxford onboarding wizard, Oxford network directory, shareable charter compliance PDF
- Resident TodayView (daily accountability dashboard)
- Automated rent reminders (scheduled CF)
- App Store / Play Store download buttons on regroup-web
- Stripe checkout flow on regroup-web (subscribe page is email-only)
- Operator testimonials + house count on web

**Confirmed DESIGN ISSUE:**

- `oxfordEnabled` dual source of truth (house doc vs. user subscriptionMetadata) — billing arbitrage hole

**Verified DONE (codebase-confirmed):**

- `createPaymentIntent`, `listPayments`, `listHousePayments` CFs
- 2% application fee already computed in code
- RTDB rules already deny-all
- Pricing is env-var driven (not hardcoded)

---

## 5. NextStep Recovery (detox-recovery)

### What It Is

A Next.js 15 marketing and lead-capture website for **non-clinical peer support detox navigation.** The practitioner helps individuals and families navigate the acute withdrawal crisis — the most dangerous, least-supported moment in recovery — and connects them to appropriate next steps (sober living, treatment, community recovery).

**Non-clinical scope:** Not a therapist, not a clinical service. The site includes 16 defined red-flag conditions that trigger immediate escalation to emergency/medical care.

### Services (The Ladder)

| Tier   | Product                        | Price    | Status            |
| ------ | ------------------------------ | -------- | ----------------- |
| Free   | 15-min fit check               | $0       | Live              |
| Tier 2 | 30-min withdrawal support call | $50      | Live              |
| Tier 3 | 60-min family/navigation call  | $150     | Launching Q3 2026 |
| Tier 4 | 2-week navigation package      | $450 avg | Q2 2027           |
| Tier 5 | Sliding-scale slots            | Variable | Year 2            |

### Digital Products (5 PDFs)

All Stripe payment links live but delivery blocked on content writing:

1. Family Survival Guide — $19.99
2. Appointment Prep Worksheet — $9.99
3. Withdrawal Safety Checklist — $9.99
4. Treatment Comparison Worksheet — $9.99
5. Relapse Prevention Plan — $9.99

**Delivery platform:** Lemon Squeezy (handles file delivery, VAT, confirmation email). Do NOT create new Stripe links for PDFs.

### Lead Magnets (3 — capture live, content missing)

1. "What to Do When Withdrawal Starts Feeling Unsafe" — highest-intent (maps to 16 red-flag conditions)
2. "How to Help Someone in Withdrawal Without Making It Worse" — family audience, higher ARPU
3. "10 Ways Detox Programs Lose Patient Trust" — B2B audience, consulting pipeline

### B2B Consulting

| Buyer Type            | Entry Point                      | Price Range         |
| --------------------- | -------------------------------- | ------------------- |
| Detox center / IOP    | Patient-experience training      | $1,500–$3,000       |
| Hospital SUD unit     | Journey mapping + staff training | $3,000–$5,000       |
| Recovery startup      | Product advisory (ongoing)       | $1,500–$3,500/month |
| Behavioral health org | Communication workshops          | $2,000–$4,000       |

Sales motion: Direct outreach → fit call → scoped proposal → Stripe invoice (manual).

### Veteran Pathway

The practitioner has military background, unlocking:

- VA Community Care billing (~$30/session, Year 2 post-PSS certification)
- VSO-sponsored workshops ($500–$2,500/event)
- SAMHSA + veteran foundation grants ($25K–$100K, non-dilutive)

### Technical Stack

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Firebase App Hosting. All content in static typed data files (no CMS). Security pipeline (origin allowlist + honeypot + rate limiting) on all POST routes.

**Firebase project:** `nextstep-recovery`

### Current P0 Blockers

1. **`apphosting.yaml` `RUNTIMEi` typo** — newsletter subscribers silently failing since launch
2. **5 Stripe PDF links live with no delivery** — refund exposure on real payments
3. **Custom domain not wired** (`nextsteprecovery.com` still on Firebase default URL)

---

## 6. Recovery API

### What It Is

A Hono.js REST API running on Cloud Run, designed as the cross-app integration bus for the future. Currently Phase 1: service-key auth for service-to-service requests.

### Endpoints

| Method | Path                 | Purpose                                      |
| ------ | -------------------- | -------------------------------------------- |
| POST   | `/api/referrals`     | Create a cross-app referral                  |
| GET    | `/api/referrals`     | List referrals by calling service for a user |
| GET    | `/api/referrals/:id` | Fetch single referral (ownership enforced)   |
| GET    | `/api/users/me`      | Fetch authenticated user profile             |
| PUT    | `/api/users/me`      | Update authenticated user profile            |

### Auth Model

- **End-user:** Firebase JWT (`Authorization: Bearer <idToken>`)
- **Service-to-service:** `X-Service-Key` header (sets uid = "system") + `X-App-Id` + `X-User-Uid`

**Phase 2 (future):** Firebase custom token auth with `appId` claim.

### `toApp` Values

| Value                | Product                   |
| -------------------- | ------------------------- |
| `treatment-center`   | detox-recovery (NextStep) |
| `phoenix-cleanhouse` | regroup (Regroup)         |
| `homegroups`         | homegroups (Homegroups)   |

**Cross-cutting rule:** All cross-product data flows must go through recovery-api. Direct Firestore cross-queries are forbidden.

---

## 7. Cross-Product Ecosystem Strategy

### The Ecosystem Flywheel

```
nextsteprecovery.io
(withdrawal navigation → treatment referral)
        ↓ refers to sober living
    Regroup
(sober living management)
        ↓ residents attend meetings
    Homegroups
(12-step community engagement)
        ↑ members in crisis contact
nextsteprecovery.io
```

**B2B2C acceleration:** Treatment centers adopt Aftercare System (B2B) → patients onboarded to sober living app and 12-step app (B2C) → sober living homes want referral volume → homes adopt Regroup → more homes in directory makes Aftercare more valuable → more treatment centers adopt → repeat.

### Integration Bridges

| Bridge                                              | Status                                        | Enables                                                   |
| --------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `getMeetingAttendance` HTTP endpoint (RC → Regroup) | EXISTS — cross-project callability UNVERIFIED | Regroup meeting compliance; treatment center outcome data |
| `createPaymentIntent` with Stripe Connect (Regroup) | EXISTS — end-to-end UNVERIFIED                | Rent collection; 2% platform fee (wired in code)          |
| Oxford network directory API (Regroup)              | MISSING (P2)                                  | Public house listing; referral entry point                |
| Treatment Center Facility Dashboard (RC)            | MISSING (P1)                                  | Enterprise sales demo; B2B unlock                         |
| Regroup directory → Aftercare referrals             | Future                                        | Month 8 Aftercare system                                  |

### 12-Month Ecosystem Sequencing

```
Now → Month 1: P0 manual launch actions (RC + Regroup audits)
Month 1–7:   Revenue activation (payment CF verification, Oxford toggle, getMeetingAttendance bridge)
Month 2:     App Store / Google Play submission (RC)
Month 2–5:   Regroup Oxford feature completion (wizard, directory, TodayView)
Month 6:     Oxford pilot — free tier for individual houses; chapter premium ($200–$500/month)
Month 8:     Aftercare Management System development begins
             (Next.js, GCP Cloud Run, PostgreSQL, HIPAA BAA)
Month 10:    Enterprise sales push — 3–5 treatment centers @ $800–$3K/month
             Requires: Facility Dashboard + getMeetingAttendance + Regroup Oxford live
Month 12:    Target $5,000–$10,000 combined MRR
```

### Why the Integrated Offering is Defensible

Five moats:

1. **Data moat** — 100K+ pre-seeded meetings + growing sober living directory
2. **Network effects** — TCs need home volume → homes need referral volume → patients need meeting data
3. **Oxford model exclusivity** — first and only software for peer-run democratic governance (4,324 houses, zero real competitors)
4. **Longitudinal outcomes data** — only platform tracking patients from treatment through sober living through community recovery
5. **42 CFR Part 2 + FHIR architecture** — compliance built in from day one creates enterprise sales moat

---

## 8. Monetization Strategy

### Revenue Model by Product

**Homegroups**

| Tier                  | Price               | Who Pays                           |
| --------------------- | ------------------- | ---------------------------------- |
| Free                  | $0                  | Members                            |
| Group admin           | $12/year            | Group admin                        |
| Additional groups     | $8/year             | Same admin (multi-group discount)  |
| Intergroup / facility | TBD ($99–$249/year) | Intergroup orgs, treatment centers |
| Donations             | 5% platform fee     | Groups via Stripe Connect          |

Break-even at ~500 groups ($6K ARR). Sustainable at 2,000 groups ($24K ARR). Revenue ceiling (consumer only): ~5,000 groups ($60K ARR). **B2B treatment center tier is the path beyond $60K ARR.**

**Regroup**

Current (legacy, unsustainable): $10/house + $1/resident  
Target: $49–$299/month by tier (see Section 4)  
Additional: 2% fee on all rent collected via Stripe Connect (already coded)

**NextStep Recovery**

Service ladder: $50 → $150 → $450 per engagement. Digital products $9.99–$19.99. B2B consulting $4,000/engagement. VA Community Care ~$30/session. Grants (Year 2+).

**Aftercare System (planned)**

- Partner: $800/month (<50 beds, single facility)
- Network: $1,500/month (alumni program, unlimited partner houses)
- Enterprise: $3,000+/month (multi-site, SSO, BAA, custom exports)

### Revenue Levers by Impact

1. **Treatment center sales velocity** — 1 TC deal at $3K/month = 3,000 individual group subscriptions. Prioritize above all else once Aftercare ships.
2. **Regroup operator acquisition rate** — monthly house acquisition determines when self-sustaining; target 10 new operators/month by Month 6.
3. **Oxford House chapter tier adoption** — $300/month chapter is a 4× ARPU multiplier; OHI partnership could unlock 2,500+ houses simultaneously.
4. **Homegroups intergroup tier** — high-leverage referral source for TC enterprise sales validation.
5. **Homegroups trial-to-paid conversion** — target 15%; every 1% improvement adds ~15 paying groups per 150 trials.

---

## 9. Financial Projections

### Full Ecosystem — Base Case (3-Year)

| Metric              | Year 1     | Year 2      | Year 3      |
| ------------------- | ---------- | ----------- | ----------- |
| **Total MRR**       | $8,000     | $42,000     | $130,000    |
| **ARR**             | $96,000    | $504,000    | $1,560,000  |
| **Paying Accounts** | ~330       | ~1,400      | ~3,800      |
| **Gross Margin**    | 82%        | 83%         | 85%         |
| **Burn Rate**       | ~$3,500/mo | ~$18,000/mo | ~$65,000/mo |

_Source: homegroups/docs/monetization/projections.md_

### Revenue Timeline (Monthly MRR by Product)

| Month          | Homegroups | Regroup | Aftercare | Total MRR   |
| -------------- | ---------- | ------- | --------- | ----------- |
| Apr 2026 (M1)  | $5         | $225    | $0        | **$230**    |
| Jun 2026 (M3)  | $25        | $600    | $0        | **$625**    |
| Sep 2026 (M6)  | $76        | $1,950  | $0        | **$2,026**  |
| Jan 2027 (M10) | $185       | $5,475  | $1,500    | **$7,160**  |
| Mar 2027 (M12) | $241       | $7,875  | $4,500    | **$12,616** |

### Revenue Scenarios

| Scenario     | Year 1 MRR | Year 2 MRR | Year 3 MRR | Year 1 ARR | Year 2 ARR | Year 3 ARR |
| ------------ | ---------- | ---------- | ---------- | ---------- | ---------- | ---------- |
| Conservative | $4,200     | $18,000    | $50,000    | $50K       | $216K      | $600K      |
| **Base**     | $8,500     | $42,000    | $130,000   | $102K      | $504K      | $1.56M     |
| Optimistic   | $16,500    | $90,000    | $280,000   | $198K      | $1.08M     | $3.36M     |

### Unit Economics

| Product                   | ARPU         | CAC    | LTV:CAC    | Payback    |
| ------------------------- | ------------ | ------ | ---------- | ---------- |
| Homegroups (group admin)  | $1/month     | $20    | 3.5× (Y1)  | 20 months  |
| Regroup individual houses | $75/month    | $300   | 11.1× (Y1) | 4 months   |
| Treatment centers         | $1,500/month | $8,000 | 23.9× (Y1) | 5.3 months |

Regroup LTV:CAC of 11:1 is exceptionally strong. Treatment center LTV:CAC at 24:1 makes it the highest-leverage revenue category.

### Funding

- **Bootstrap (no raise):** Viable; Regroup MRR > $5K is the hiring self-funding trigger; limited TC sales speed.
- **Recommended seed:** $250K at ~$1.5M pre-money. Buys: 18+ months runway, first two hires, HIPAA audit, TC sales push. Expected Series A readiness at Month 22–26 (~$500K ARR).
- **Series A trigger:** $500K–$800K ARR, 15+ paying treatment centers, Oxford network effects proven, FHIR R4 live.

### NextStep Recovery Standalone (Base Case)

| Year   | Revenue  | Net Contribution |
| ------ | -------- | ---------------- |
| Year 1 | $18,063  | ~$10,700         |
| Year 2 | $55,925  | ~$37,300         |
| Year 3 | $139,250 | ~$98,500         |

_Self-funding from Month 3–4. No external capital required at any scenario._

---

## 10. Market Opportunity

### U.S. Substance Use Disorder Market

| Segment                               | Size            | Growth                        |
| ------------------------------------- | --------------- | ----------------------------- |
| U.S. substance abuse treatment market | $143.62B (2024) | 12.3% CAGR → $408B by 2033    |
| Behavioral health software            | $4.13B (2025)   | 19.85% CAGR → $20.79B by 2034 |
| Behavioral health EHR segment         | $3.56B (2024)   | 14.85% CAGR → $14.22B by 2034 |

### Addressable Segments

- ~17,353 licensed SUD treatment facilities in the U.S.
- ~17,900+ recovery residences serving ~275,000 people at any time
- ~4,324 Oxford Houses with 35,796 beds across 47 states
- 1.5 million treatment admissions annually (~7 discharges/month per facility)
- 52.6 million people needed SUD treatment in 2024; only 10.2M received it

### Macro Tailwinds

- AI adoption in behavioral health: 17% (2024) → 27% (2025), 59% YoY increase
- CMS mandates FHIR R4 interoperability by mid-2026
- Relapse rates reach 85% in first year post-discharge; 80% of clinicians never measure post-discharge outcomes
- Value-based care contracts increasingly require outcome documentation

### TAM/SAM/SOM by Product

**NextStep Recovery (detox-recovery)**

- Combined TAM: ~$40M (withdrawal support + family education + B2B consulting)
- SAM: ~$10M
- SOM Year 3 (Base): $130K–$300K

**Full Ecosystem (Market Intelligence Brief)**

- Moderate Year 3 ARR: $5.78M
- Implied valuation at 8–15× ARR multiples: **$46M–$87M**

---

## 11. Competitive Landscape

### Treatment Center Software (Future Aftercare Competitors)

| Platform                  | Customers                | Pricing              | Key Weakness                                              |
| ------------------------- | ------------------------ | -------------------- | --------------------------------------------------------- |
| Kipu Health               | 1,800+, 6,000+ locations | Custom enterprise    | No post-discharge integration; expensive                  |
| Sunwave Health            | 400+ est.                | From ~$30/user/month | Limited post-discharge depth; no sober living integration |
| LightningStep             | 200+ est.                | $49+/user/month      | 36-month contracts; mixed UI reviews                      |
| Opus EHR                  | 150+ est.                | $79/user/month       | Implementation delays; limited breadth                    |
| CaredFor (ContinuumCloud) | 75+ est.                 | Custom               | Communication-only; no real sober living/meeting data     |
| Team Recovery             | 110+ partner apps        | Custom white-label   | No sober living or meeting integration                    |

**Critical competitive gap:** Every incumbent treats the patient journey as ending at discharge. None connect treatment centers to sober living homes or 12-step communities through operational software.

### Sober Living Software (Direct Regroup Competitors)

| Platform          | Rating | Pricing    | Key Weakness                                              |
| ----------------- | ------ | ---------- | --------------------------------------------------------- |
| Sobriety Hub      | 5.0    | Listed     | Dead-simple UX; no Oxford model support                   |
| Behave Health     | 4.9    | Custom     | Complex for SL-only operators; expensive                  |
| One Step Software | 4.6    | Custom     | Losing market share (3× operators switching away from it) |
| OathTrack         | —      | Free trial | Limited features                                          |

**Key finding:** No existing sober living software supports Oxford House democratic governance. Regroup has an uncontested market of 4,324 houses.

### 12-Step App Competitors

No direct feature-equivalent competitor for group treasury, service positions, and the combined meeting finder + governance stack. Indirect competitors are general social apps and SMS groups.

### NextStep Recovery Competitors

| Competitor      | Model                                        | Differentiation                                |
| --------------- | -------------------------------------------- | ---------------------------------------------- |
| Tempest         | Expert-led coaching + community ($41/month)  | Sustained sobriety focus, not acute withdrawal |
| Sober Grid      | Geolocation peer network + coaching          | Community model, not navigation specialist     |
| WEconnect       | Peer-led meetings + 1:1 coaching ($40/month) | Subscription model, general recovery           |
| Marigold Health | 24/7 peer group support                      | Groups, not individual navigation calls        |

NextStep differentiator: **withdrawal-specific focus, navigation role, clear non-clinical scope, and B2B patient experience consulting** — no direct competitor in that adjacent market.

---

## 12. Go-To-Market Strategy

### Homegroups GTM

**Year 1 focus — high-touch, zero-cost:**

1. Attend 3 intergroup meetings in metro area (treasury handoff demo = 3–5 candidate admin leads per meeting)
2. 30-group pilot outreach via direct email with group's public page URL
3. Call every admin who activates in Week 1 of trial
4. Flip `noindex` → `index` on unclaimed group pages at ≥100 claimed groups (unlocks SEO on 62K+ pre-seeded group pages)

**Key distribution lever:** QR check-in at meetings → members join app instantly → member adoption drives group stickiness → renewal rates rise.

### Regroup GTM

1. **Oxford House pilot** — free core tier removes budget objection; rotation-driven virality
2. **OHI (Oxford House Inc.) enterprise partnership** — Annual World Convention as GTM venue; 26 outreach workers as multipliers
3. **State association pilots** — NC (320+ houses), VA, TX
4. **Treatment center referral pipeline** — once treatment center integration is live, facilities pipe residents into Regroup at discharge

### NextStep Recovery GTM

**Year 1 priority: Push channels first (immediate conversions + B2B pipeline):**

1. SBIRT hospital program partnerships (ER peer recovery coaches need referral resources)
2. Treatment center intake coordinator network (starts as B2C referral, evolves to B2B consulting)
3. Directory listings (5 directories, Week 1, 30–60 min total)
4. Reddit community presence (r/stopdrinking, r/opiatesrecovery — 5× participation spike at withdrawal Day 0)

**Year 1 Pull channels (build now, yield at 6–18 months):** 5. SEO pillar content (5 articles targeting acute-crisis + family-support query clusters) 6. TikTok educational content (7× Instagram engagement rate; build email list, not direct bookings)

**The B2C/B2B flywheel:** Every intake coordinator referral relationship is simultaneously a B2B consulting prospect. The referral conversation that starts "can you take our overflow patients" naturally evolves to "can you consult on our patient experience."

### Ecosystem GTM Sequence

| Phase           | Timeline    | Milestone                                          |
| --------------- | ----------- | -------------------------------------------------- |
| Consumer wedge  | Months 1–3  | 30+ Homegroups in trial, 10+ Regroup operators     |
| Oxford pilot    | Month 6     | Free tier launched; first chapter conversions      |
| B2B bridge      | Month 10    | Facility Dashboard + getMeetingAttendance verified |
| Enterprise push | Month 10    | 3–5 treatment centers at $800–$3K/month            |
| Aftercare dev   | Month 8     | New product in development                         |
| Series A ready  | Month 22–26 | $500K ARR, 15+ TCs, Oxford network effects proven  |

---

## 13. Current Implementation Status & Roadmap

### P0 — Do Immediately (Survival and Unblocking)

| Item                                                   | Product    | Time           | Priority                            |
| ------------------------------------------------------ | ---------- | -------------- | ----------------------------------- |
| Fix `apphosting.yaml` `RUNTIMEi` typo                  | NextStep   | 5 min + deploy | CRITICAL — revenue leak             |
| Hide 5 Stripe PDF links with no delivery               | NextStep   | 1 hr           | CRITICAL — refund exposure          |
| Wire custom domain `nextsteprecovery.com`              | NextStep   | 30 min + DNS   | CRITICAL — credibility              |
| Run claim-and-pay flow end-to-end (RC)                 | Homegroups | 2 hrs          | CRITICAL — funnel test              |
| Verify Stripe production key on web (RC)               | Homegroups | 30 min         | CRITICAL — payments broken if wrong |
| Configure Firebase Auth authorized domains (RC)        | Homegroups | 30 min         | CRITICAL — Google OAuth broken      |
| Fix Firebase email sender spam issue (RC)              | Homegroups | 1 hr           | CRITICAL — activation lost          |
| Audit deployed Stripe Price IDs in prod (Regroup)      | Regroup    | 30 min         | CRITICAL — wrong pricing            |
| Count houses with `stripeStatus == "active"` (Regroup) | Regroup    | 1 hr           | Baseline for rent revenue           |

### P1 — Revenue Activation (Days 7–30)

| Item                                                                | Product    | Effort                  |
| ------------------------------------------------------------------- | ---------- | ----------------------- |
| Write lead magnet "Unsafe Withdrawal" guide + MailerLite automation | NextStep   | 1–2 days writing + 1 hr |
| Install Plausible analytics                                         | NextStep   | 30 min                  |
| Build `/thank-you` page                                             | NextStep   | 1–2 hrs                 |
| Migrate 5 PDFs to Lemon Squeezy (after content written)             | NextStep   | 2.5 hrs technical       |
| Verify payment CFs end-to-end in test mode (Regroup)                | Regroup    | 1 day                   |
| `oxfordEnabled` unification via CF (Regroup)                        | Regroup    | 2–3 days                |
| Treatment Center Facility Dashboard (RC)                            | Homegroups | 3–7 days                |
| Set Stripe prices for intergroup Tier A + Tier B (RC)               | Homegroups | Manual — 1 hr           |
| Submit to App Store + Google Play (RC)                              | Homegroups | Manual                  |
| Add App Store / Play Store buttons to regroup-web                   | Regroup    | 1 hr                    |
| Wire MailerLite automations + Lemon Squeezy webhook                 | NextStep   | 1 day                   |

### P2 — Oxford Acquisition + Retention (Days 30–60)

| Item                                               | Product    |
| -------------------------------------------------- | ---------- |
| Oxford onboarding wizard                           | Regroup    |
| Oxford network directory                           | Regroup    |
| Resident TodayView daily dashboard                 | Regroup    |
| Push notification accountability loop (6 triggers) | Regroup    |
| Automated rent reminders (scheduled CF)            | Regroup    |
| Flip `noindex` → `index` at ≥100 claimed groups    | Homegroups |
| Evaluate trial-to-paid conversion                  | Homegroups |
| B2B guide + MailerLite automation                  | NextStep   |
| Launch Tier 3 (60-min family call at $150)         | NextStep   |
| SEO pillar article #1 (alcohol withdrawal)         | NextStep   |

### P3 — Payment Expansion + Long-Term (Days 60–120+)

| Item                                       | Product     |
| ------------------------------------------ | ----------- |
| Auto-pay / recurring rent enrollment       | Regroup     |
| Custom domain setup (`homegroups-app.com`) | Homegroups  |
| Angular 9 → 17+ upgrade                    | Regroup web |
| Regroup-web Stripe checkout flow           | Regroup web |
| Aftercare Management System (new product)  | New         |
| Enterprise sales push                      | All         |

---

## 14. Key Risks & Mitigations

### Business / Strategy Risks

| Risk                                                                    | Severity | Probability | Mitigation                                                                 |
| ----------------------------------------------------------------------- | -------- | ----------- | -------------------------------------------------------------------------- |
| Solo founder bandwidth — can't close all three products simultaneously  | HIGH     | HIGH        | Strict product sequencing per 12-month plan; hire earlier with seed        |
| Oxford House World Services builds competing tool or blocks partnership | HIGH     | LOW         | Approach as partner; offer revenue share; official endorsement path        |
| Homegroups conversion rate < 10% (trial-to-paid)                        | MEDIUM   | MEDIUM      | Fix known blockers (subscription gating, Day 5 push, money-back guarantee) |
| Regroup pricing increase causes churn among existing operators          | MEDIUM   | LOW         | Grandfather existing; new pricing only for new operators                   |
| Aftercare HIPAA audit delayed / blocked                                 | HIGH     | MEDIUM      | Budget $30K, 3 months lead time; defer to Month 10 if needed               |
| Apple App Store IAP compliance — Homegroups WebView subscription        | HIGH     | MEDIUM      | Consult legal team; B2B organization subscription has carve-out precedent  |
| Treatment center sales cycles > 6 months                                | MEDIUM   | HIGH        | Lead with < 50-bed facilities; outcome demo is key                         |
| PDF delivery still broken at launch (NextStep)                          | HIGH     | Confirmed   | Fix this week — Stripe charges with no delivery = refund + trust damage    |

### Technical Risks

| Risk                                                               | Severity | Current State                                |
| ------------------------------------------------------------------ | -------- | -------------------------------------------- |
| `getMeetingAttendance` not callable cross-project                  | HIGH     | UNVERIFIED — P1 verification required        |
| Deployed Regroup Stripe Price IDs may be wrong ($9.99 not $49)     | HIGH     | UNVERIFIED — P0 audit required               |
| `oxfordEnabled` dual source of truth (billing arbitrage hole)      | HIGH     | CONFIRMED — P1 fix required                  |
| Stripe intergroup checkout silently broken (no default price set)  | HIGH     | CONFIRMED — requires manual price setting    |
| RC — `PAYMENT_BASE_URL` is TODO placeholder                        | HIGH     | CONFIRMED — no user can subscribe via mobile |
| Regroup `stripeWebhook` may not persist `payment_intent.succeeded` | MEDIUM   | UNVERIFIED                                   |
| No rate limiting on Regroup HTTP Cloud Functions                   | MEDIUM   | CONFIRMED MISSING                            |

### Compliance / Legal Risks

| Risk                                          | Severity | Note                                                                                   |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| 42 CFR Part 2 compliance for Aftercare        | HIGH     | More restrictive than standard HIPAA; requires explicit patient consent per disclosure |
| HIPAA for Aftercare                           | HIGH     | Budget $15–30K audit; GCP HIPAA BAA required before production                         |
| App Check gap (RC)                            | MEDIUM   | Documented in CLAUDE.md and LAUNCH_BLOCKERS.md                                         |
| NextStep scope-of-practice regulatory concern | LOW      | Existential risk; maintain explicit non-clinical framing; consult attorney Year 1      |
| Homegroups About page: fictional founder bios | HIGH     | FTC risk; blocks any public marketing (D-11 in roadmap)                                |
| Privacy + Terms pages dated Jan 2023 (RC)     | HIGH     | Must be rewritten before launch to reflect actual data flows                           |

---

_Generated: 2026-06-02 | Source: full corpus analysis of all docs/ and product subdirectory docs | Update cadence: major product releases, quarterly strategy reviews_
