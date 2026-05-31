# RATS Documentation Index

**Last Updated:** 2026-05-24

RATS (Regroup) is a React Native sober living house management app backed by Firebase. This index covers active documentation only — see [`archive/`](./archive/) for historical records.

---

## Quick Start

**What needs to be built right now?**
→ [`plans/ACTIVE_PLAN.md`](./plans/ACTIVE_PLAN.md) — single source of truth (May 2026)

**What is the current architecture?**
→ [`ARCHITECTURE.md`](./ARCHITECTURE.md) + [`.claude/architecture.md`](../.claude/architecture.md)

**What gaps remain before launch?**
→ [`GAP_ANALYSIS_PRODUCTION_READINESS.md`](./GAP_ANALYSIS_PRODUCTION_READINESS.md)

**What is the full platform vision?**
→ [`FULL_PLATFORM_REQUIREMENTS-summary.md`](./FULL_PLATFORM_REQUIREMENTS-summary.md) (summary) or the [full 1886-line doc](./FULL_PLATFORM_REQUIREMENTS.md)

---

## Strategy & Vision

| Doc                                                                                | Description                                              | Status  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| [`ECOSYSTEM_ROADMAP_2026.md`](./ECOSYSTEM_ROADMAP_2026.md)                         | Cross-product roadmap: RATS, Homegroups, RecoveryConnect | CURRENT |
| [`STRATEGIC_PLATFORM_ASSESSMENT_2026.md`](./STRATEGIC_PLATFORM_ASSESSMENT_2026.md) | Prioritized roadmap with blockers and pricing            | CURRENT |
| [`PRODUCT_STRATEGY_ASSESSMENT.md`](./PRODUCT_STRATEGY_ASSESSMENT.md)               | Market strategy, differentiation, GTM                    | CURRENT |
| [`FULL_PLATFORM_REQUIREMENTS.md`](./FULL_PLATFORM_REQUIREMENTS.md)                 | Dream end-state feature spec (Traditional + Oxford)      | AGING   |
| [`FULL_PLATFORM_REQUIREMENTS-summary.md`](./FULL_PLATFORM_REQUIREMENTS-summary.md) | [summary] Condensed version of above                     | CURRENT |
| [`FEATURE_PRIORITY_ROADMAP.md`](./FEATURE_PRIORITY_ROADMAP.md)                     | Feature rankings by market opportunity                   | AGING   |
| [`recovery-ecosystem-market-brief.md`](./recovery-ecosystem-market-brief.md)       | Competitive landscape and market intelligence            | CURRENT |

---

## Technical Reference

| Doc                                                                                                      | Description                                                               | Status   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                                                                   | End-to-end architecture: Redux, React Query, navigation, Firebase         | CURRENT  |
| [`FIRESTORE_DATA_MODEL.md`](./FIRESTORE_DATA_MODEL.md)                                                   | Firestore collection schemas and access patterns                          | CURRENT  |
| [`PERFORMANCE_SCALABILITY_ANALYSIS.md`](./PERFORMANCE_SCALABILITY_ANALYSIS.md)                           | Firestore query patterns, indexing, scale limits                          | CURRENT  |
| [`archive/CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md`](./archive/CODEBASE_ANALYSIS_REWRITE_VS_REFACTOR.md) | Historical: rewrite vs refactor decision (Nov 2025) — archived 2026-05-25 | ARCHIVED |

Also see the `.claude/` directory for conventions used by Claude Code:

- [`.claude/architecture.md`](../.claude/architecture.md) — canonical architecture facts (authoritative)
- [`.claude/firebase.md`](../.claude/firebase.md) — Firestore/Auth patterns
- [`.claude/testing.md`](../.claude/testing.md) — Jest setup and test patterns
- [`.claude/conventions.md`](../.claude/conventions.md) — naming, imports, gotchas

---

## Pricing & Revenue

| Doc                                                                            | Description                                 | Status  |
| ------------------------------------------------------------------------------ | ------------------------------------------- | ------- |
| [`PRICING_STRATEGY_OPTIONS.md`](./PRICING_STRATEGY_OPTIONS.md)                 | Six pricing models with revenue projections | AGING   |
| [`PRICING_STRATEGY_OPTIONS-summary.md`](./PRICING_STRATEGY_OPTIONS-summary.md) | [summary] Key recommendations condensed     | CURRENT |

Root-level supplementary docs (not canonical):

- [`../PRICING_STRATEGY.md`](../PRICING_STRATEGY.md)
- [`../FEATURE_PRIORITIZATION.md`](../FEATURE_PRIORITIZATION.md)
- [`../PRODUCT_ROADMAP.md`](../PRODUCT_ROADMAP.md)

---

## Legal & Compliance

| Doc                                            | Description         | Status  |
| ---------------------------------------------- | ------------------- | ------- |
| [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md)     | User privacy policy | CURRENT |
| [`TERMS_OF_SERVICE.md`](./TERMS_OF_SERVICE.md) | Terms of service    | CURRENT |

---

## Production Readiness

| Doc                                                                                                                | Description                               | Status  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------- |
| [`GAP_ANALYSIS_PRODUCTION_READINESS.md`](./GAP_ANALYSIS_PRODUCTION_READINESS.md)                                   | Gaps to launch: auth, payments, App Store | CURRENT |
| [`manual-tasks/2026-05-21-app-store-launch-checklist.md`](./manual-tasks/2026-05-21-app-store-launch-checklist.md) | App Store / Play Store submission steps   | CURRENT |

---

## Implementation Plans

Active plans live in `superpowers/plans/` — these are the current execution artifacts.

**Active (2026-05):**

- [`superpowers/plans/2026-05-20-guest-lifecycle-and-operations.md`](./superpowers/plans/2026-05-20-guest-lifecycle-and-operations.md)
- [`superpowers/plans/2026-05-20-payment-ux-and-reporting.md`](./superpowers/plans/2026-05-20-payment-ux-and-reporting.md)
- [`superpowers/plans/2026-05-20-resident-application-workflow.md`](./superpowers/plans/2026-05-20-resident-application-workflow.md)
- [`superpowers/plans/2026-05-21-app-store-fastlane.md`](./superpowers/plans/2026-05-21-app-store-fastlane.md)
- [`superpowers/plans/2026-05-21-payment-failure-recovery.md`](./superpowers/plans/2026-05-21-payment-failure-recovery.md)
- [`superpowers/plans/2026-05-21-stripe-product-setup.md`](./superpowers/plans/2026-05-21-stripe-product-setup.md)
- [`superpowers/plans/2026-05-22-admin-reporting-dashboard.md`](./superpowers/plans/2026-05-22-admin-reporting-dashboard.md)
- [`superpowers/plans/2026-05-22-chore-rotation-photo-evidence.md`](./superpowers/plans/2026-05-22-chore-rotation-photo-evidence.md)
- [`superpowers/plans/2026-05-22-document-management.md`](./superpowers/plans/2026-05-22-document-management.md)
- [`superpowers/plans/2026-05-22-offline-payment-pending-indicator.md`](./superpowers/plans/2026-05-22-offline-payment-pending-indicator.md)
- [`superpowers/plans/2026-05-23-migration-completions.md`](./superpowers/plans/2026-05-23-migration-completions.md)

**Current source of truth for what to work on next:**
→ [`plans/ACTIVE_PLAN.md`](./plans/ACTIVE_PLAN.md)

---

## Specifications

| Doc                                                                                                                            | Description                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| [`superpowers/specs/2026-05-23-current-roadmap.md`](./superpowers/specs/2026-05-23-current-roadmap.md)                         | Current roadmap (May 2026)    |
| [`superpowers/specs/2026-05-20-roadmap-from-docs-analysis.md`](./superpowers/specs/2026-05-20-roadmap-from-docs-analysis.md)   | Docs-derived roadmap analysis |
| [`superpowers/specs/2026-05-19-subscription-paywall-design.md`](./superpowers/specs/2026-05-19-subscription-paywall-design.md) | Paywall design spec           |
| [`superpowers/specs/2026-05-19-release-readiness-audit.md`](./superpowers/specs/2026-05-19-release-readiness-audit.md)         | Release readiness audit       |

---

## E2E Testing Docs

See [`e2e/`](./e2e/) for E2E test plans, status reports, and blocker logs.
Key doc: [`e2e/E2E_TESTING_GUIDE.md`](./e2e/E2E_TESTING_GUIDE.md)

---

## Archive

Historical records are in [`archive/`](./archive/). These are **not authoritative** — they document past decisions and completed work. Notable archived docs:

| Archived Doc                           | Why Archived                           |
| -------------------------------------- | -------------------------------------- |
| `ACTIVITY_SYSTEM_MIGRATION.md`         | Migration M1–M3 complete               |
| `IMPLEMENTATION_PLAN.md`               | Superseded by ACTIVE_PLAN.md           |
| `CLOUD_FUNCTIONS_REVIEW.md`            | CF code fully rewritten                |
| `DOCUMENTATION_ARCHITECTURE_REVIEW.md` | One-off meta-doc, no longer actionable |

---

## Naming Conventions

- Active docs: `SCREAMING_SNAKE_CASE.md` (established project convention)
- New docs: prefer `kebab-case.md` (e.g., `recovery-ecosystem-market-brief.md`)
- Plans: `YYYY-MM-DD-feature-name.md` prefix (preserve as-is)
- Summaries: `ORIGINAL_NAME-summary.md`

---

_Last reviewed: 2026-05-24 | Audience: developer | Type: reference_
