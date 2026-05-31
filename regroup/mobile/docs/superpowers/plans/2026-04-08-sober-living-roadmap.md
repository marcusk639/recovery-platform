# Sober Living App — Implementation Roadmap

> **Source:** [Recovery Ecosystem — Product & Market Intelligence Brief](../../Recovery%20Ecosystem%20—%20Product%20%26%20Market%20Intelligence%20Brief.md)
>
> This document maps the brief's feature requirements to implementation plans, prioritized by GTM sequencing.

## Current State Summary

| Feature Area                      | Status                                                                      | Priority                  |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------- |
| **Sprint 1 — Table Stakes**       |                                                                             |                           |
| Resident intake & profiles        | PARTIAL — basic guest profiles, no application/screening/waitlist           | P0                        |
| Billing & rent collection         | PARTIAL — Stripe card payments only, no ACH/cash/invoices/receipts          | P0                        |
| Outstanding balance dashboard     | PARTIAL — house-wide metrics, no per-resident aging                         | P1                        |
| Drug testing module               | MISSING                                                                     | P0                        |
| Mobile-responsive UI              | BUILT (React Native)                                                        | Done                      |
| Resident mobile portal            | PARTIAL — can pay rent, no maintenance requests                             | P1                        |
| **Sprint 2 — Competitive Parity** |                                                                             |                           |
| Phase/program tracking            | PARTIAL — phases configured, no auto-advancement                            | P1                        |
| Chore management                  | PARTIAL — basic tracking, no rotation/photo evidence                        | P2                        |
| Accountability scoring            | PARTIAL — health score exists, no composite                                 | P2                        |
| Automated consequence workflows   | MISSING                                                                     | P1                        |
| Incident reporting                | PARTIAL — complaints/issues exist, no escalation/export                     | P2                        |
| Compliance reports                | PARTIAL — compliance checking, no NARR/state reports                        | P2                        |
| Multi-house dashboard             | PARTIAL — overview exists, no revenue/occupancy rollup                      | P2                        |
| **Sprint 3 — Differentiation**    |                                                                             |                           |
| Oxford House mode                 | PARTIAL — EES/voting/officers built, no treasurer dashboard/chapter rollups | P1                        |
| Directory & public listing        | PARTIAL — search exists, no public web profiles                             | P2                        |
| Treatment center referral portal  | MISSING                                                                     | P3 (Aftercare dependency) |
| 12-step meeting integration       | PARTIAL — search + logging, no auto-attendance                              | P2                        |
| Outcomes analytics dashboard      | MISSING                                                                     | P1                        |

## Plan Breakdown

Each sprint gets its own detailed implementation plan:

| Plan                             | File                                 | Status      | GTM Phase               |
| -------------------------------- | ------------------------------------ | ----------- | ----------------------- |
| **Sprint 1: Table Stakes**       | `2026-04-08-sprint1-table-stakes.md` | Written     | Phase 1 (Now → Month 3) |
| **Sprint 2: Competitive Parity** | TBD                                  | Not started | Phase 1-2 (Month 2-5)   |
| **Sprint 3: Differentiation**    | TBD                                  | Not started | Phase 2-3 (Month 3-6)   |
| **Oxford Treasury & Chapter**    | TBD                                  | Not started | Phase 2 (Month 3-6)     |
| **Outcomes Analytics**           | TBD                                  | Not started | Phase 2-3               |
| **12-Step App Enhancements**     | TBD                                  | Not started | Parallel track          |
| **Aftercare System**             | TBD                                  | Not started | Phase 2-3 (Month 6-12)  |

## Execution Order

1. **Sprint 1** — Complete table-stakes features that operators will pay for. This unblocks revenue.
2. **Oxford Treasury** — Deepens the Oxford House moat (4,324 unserved houses).
3. **Sprint 2** — Competitive parity with Sobriety Hub / One Step.
4. **Outcomes Analytics** — Data story for treatment center sales.
5. **Sprint 3** — Differentiation features including directory & referral portal.
6. **Aftercare System** — Highest-revenue product, requires sober living app maturity first.
