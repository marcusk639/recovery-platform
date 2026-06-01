# Documentation Index

**Last updated:** May 2026
**Status:** V4 complete — launch phase

---

## Business & Strategy

| Document                                                       | Purpose                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| [Business Model](./BUSINESS_MODEL.md)                          | Pricing, revenue projections, break-even, risk factors   |
| [Revenue Opportunities](./REVENUE_OPPORTUNITIES.md)            | Prioritized backlog of revenue fixes and new streams     |
| [Roadmap](./ROADMAP.md)                                        | Current launch priorities and 90-day success criteria    |
| [Launch Blockers](./LAUNCH_BLOCKERS.md)                        | Manual actions required before and during launch         |
| [Market Intelligence](./MARKET_INTELLIGENCE.md)                | Market sizing, competitive landscape, 3-year projections |
| [Financial Projections](./financial-projections-2026-04-15.md) | 3-year financial model — MRR, ARR, burn, fundraising     |

## Product Reference

| Document                                                              | Purpose                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Homegroups Platform](./02-recoveryconnect-homegroups.md)             | Full product overview — features, architecture, monetization           |
| [RATS Sober Living](./01-rats-sober-living.md)                        | Full product overview — features, architecture, commercial positioning |
| [Treatment Center Integration](./03-integration-treatment-centers.md) | Sales narrative, pricing, objection handling, implementation roadmap   |
| [Product Requirements](./PRODUCT_REQUIREMENTS.md)                     | Canonical MVP scope, core principles, target users                     |

## Engineering Reference

| Document                                                | Purpose                                |
| ------------------------------------------------------- | -------------------------------------- |
| [Development Setup](./DEVELOPMENT.md)                   | Local environment setup                |
| [Architecture](./ARCHITECTURE.md)                       | System architecture overview           |
| [Security Rules](./SECURITY_RULES.md)                   | Firestore security rules — full detail |
| [Security Rules Quickref](./SECURITY_RULES_QUICKREF.md) | Deployment checklist, common errors    |
| [Security Audit](./SECURITY_AUDIT.md)                   | Security audit findings                |
| [Messaging Engineering](./MESSAGING_ENGINEERING.md)     | Chat system architecture               |
| [Billing & Payments](./BILLING_AND_PAYMENTS.md)         | Stripe integration — technical detail  |
| [Deep Linking](./deep-linking.md)                       | Universal Links, invite codes          |


## Code Audits

Codebase-layer audits produced by code-explorer agents. Each file covers one architectural layer.

| Document | Scope | Date |
|----------|-------|------|
| [Mobile Components](../.audit/layer-mobile-components.md) | `mobile/src/components/` — 57 files, all subdirs | 2026-05-25 |
| [Mobile Screens (non-homegroup)](../.audit/layer-mobile-screens-other.md) | `mobile/src/screens/` (excluding `homegroup/`) | 2026-05-25 |
| [Mobile Slices](../.audit/layer-mobile-slices.md) | `mobile/src/store/slices/` — Redux Toolkit slices | 2026-05-25 |
| [Mobile Models](../.audit/layer-mobile-models.md) | `mobile/src/models/` — Firestore data-access layer | 2026-05-25 |
| [Cloud Functions: Callable](../.audit/layer-functions-callable.md) | `functions/src/callable/` | 2026-05-25 |
| [Cloud Functions: Firestore Triggers](../.audit/layer-functions-firestore-triggers.md) | `functions/src/triggers/firestore/` | 2026-05-25 |
| [Mobile Homegroup Screens](../.audit/layer-mobile-homegroup-screens.md) | `mobile/src/screens/homegroup/` — 67 files | 2026-05-25 |
| [Web Pages](../.audit/layer-web-pages.md) | `web/src/pages/` | 2026-05-25 |

## Implementation Plans

Completed plans live in `docs/plans/`. See [`plans/README.md`](./plans/README.md) for the full list with PR references.

## Archive

Superseded analyses and historical docs are in `docs/archive/`. They remain for reference but are no longer maintained.

---

## By Role

### Product / Strategy

1. [Revenue Opportunities](./REVENUE_OPPORTUNITIES.md) — what to build next for revenue
2. [Business Model](./BUSINESS_MODEL.md) — pricing, projections, risks
3. [Roadmap](./ROADMAP.md) — current priorities and success criteria
4. [Launch Blockers](./LAUNCH_BLOCKERS.md) — manual actions blocking growth
5. [Treatment Center Integration](./03-integration-treatment-centers.md) — highest-ARPU revenue path

### Sales / GTM

1. [Treatment Center Integration](./03-integration-treatment-centers.md) — pitch, pricing, objection handling
2. [Homegroups Platform](./02-recoveryconnect-homegroups.md) — product reference for demos
3. [RATS Sober Living](./01-rats-sober-living.md) — product reference for sober living pitch
4. [Market Intelligence](./MARKET_INTELLIGENCE.md) — market size, competitors, pricing benchmarks

### Developer / Engineer

1. [Development Setup](./DEVELOPMENT.md) — start here
2. [Security Rules Quickref](./SECURITY_RULES_QUICKREF.md) — Firestore access control
3. [Messaging Engineering](./MESSAGING_ENGINEERING.md) — chat system
4. [Billing & Payments](./BILLING_AND_PAYMENTS.md) — Stripe integration
5. [Revenue Opportunities](./REVENUE_OPPORTUNITIES.md) — P0 fixes with file-level guidance
6. [Homegroup Screens Audit](../.audit/layer-mobile-homegroup-screens.md) — bugs, anti-patterns, and action items across 67 screens
