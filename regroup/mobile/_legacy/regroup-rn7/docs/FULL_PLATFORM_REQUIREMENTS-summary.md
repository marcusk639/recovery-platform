> ⚠️ **Legacy document.** Carried over from the standalone `regroup-rn7` repository, archived on 2026-06-06. Historical reference only — may be outdated and is NOT part of current `mobile` documentation.

# RATS Full Platform Requirements — Summary

> **Full doc:** [FULL_PLATFORM_REQUIREMENTS.md](./FULL_PLATFORM_REQUIREMENTS.md) > **Last reviewed:** 2026-05-24
> **Audience:** developer, operator
> **Note:** Written Nov 2025 as a "dream end state" spec. Many features are partially or fully built; cross-reference [GAP_ANALYSIS_PRODUCTION_READINESS.md](./GAP_ANALYSIS_PRODUCTION_READINESS.md) for current status.

## Purpose

Defines every feature RATS should eventually have across both house models (Traditional and Oxford House). Use it to understand what the product is trying to become, not what it currently is.

## Key Concepts

- **Two house models**: Traditional (operator-managed with phases) and Oxford House (peer-run, democratic, EES pricing). These have fundamentally different governance and UI requirements.
- **Equal Expense Share (EES)**: Oxford Houses charge all residents the same weekly/monthly fee covering rent + utilities. RATS must calculate and collect this vs. traditional tiered pricing.
- **Three charter requirements** for Oxford compliance: democratically self-run, financially self-supporting, immediate expulsion for substance use.
- **Role hierarchy**: Super Admin → House Admin (traditional) / Elected Officers (Oxford: President, Treasurer, Secretary, Comptroller with ~6-month term limits) → Residents.
- **Phase system** (traditional only): residents advance through phases (typically Orientation → Phase 1 → Phase 2 → Phase 3) based on compliance and time. Oxford Houses have no phases — indefinite stay.
- **Activity tracking**: residents self-report meetings, chores, curfew, drug tests. Admins verify or dispute. This is the core compliance loop.

## Critical Decisions / Rules

- Oxford Houses must support **80% approval threshold** for new member votes (not simple majority).
- Oxford financial model is **transparent to all members** — residents see house finances; admin cannot hide them.
- Traditional disputes resolved by management; Oxford disputes resolved by **democratic house vote**.
- Zero tolerance = immediate expulsion for substance use (Oxford). No second chances, no dispute flow.

## Quick Reference

| Feature             | Traditional     | Oxford                              |
| ------------------- | --------------- | ----------------------------------- |
| Management          | Operator/staff  | Peer-elected officers               |
| Pricing             | Tiered by room  | Equal Expense Share                 |
| Phase system        | Yes             | No                                  |
| New member approval | Manager         | 80% house vote                      |
| Substance violation | Dispute/warning | Immediate expulsion                 |
| Meetings            | Optional        | Weekly business meeting (mandatory) |

## What's NOT Here

- Current implementation status (see `GAP_ANALYSIS_PRODUCTION_READINESS.md`)
- Specific UI mockups or screen flows (see `ARCHITECTURE.md`)
- Pricing strategy (see `PRICING_STRATEGY_OPTIONS.md`)
- API / Cloud Functions design (see `regroup-functions` repo)

---

_Last reviewed: 2026-05-24 | Audience: developer, operator | Type: reference_
