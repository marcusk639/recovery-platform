# RG-TRACK — Rent-Collection ROI Dashboard

**Status:** v1 shipped (`rentRoiMetrics` callable: collected-gross $, outstanding $, overdue count) — GitHub issue [#32](https://github.com/marcusk639/recovery-platform/issues/32). Deferred: on-time %, hours-saved, refund-netting, UI (see caveats).
**Tier:** Professional / Plus and higher (value-ladder capability `analytics`)
**Source rationale:** [regroup-pricing-justification.md §6c](../../launch-readiness/regroup-pricing-justification.md) · [regroup-pricing-revision-plan.md Phase 5](../../launch-readiness/regroup-pricing-revision-plan.md)

---

## Problem

Cost-sensitive operators churn when a subscription's value isn't visible. A
rent-collection ROI dashboard makes the subscription _visibly_ pay for itself —
"you collected $X, on-time rate Y%, saved Z hours" — which is the strongest
retention lever for the segment most likely to cancel.

## Scope

This is a **tracking issue only**. No UI is built in the pricing plan. The
deliverable here is to fix the metric definitions and the data sources so the
build can start from a settled contract.

## Metrics (definitions)

| Metric                    | Definition                                                        | Notes                                                                                                            |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Collected $**           | Sum of successful rent payments (cents) over the period.          | Net of refunds/disputes. From payment records.                                                                   |
| **On-time rate %**        | `on_time_payments / due_payments` for the period.                 | "On time" = paid on/before the rent due date. Requires a due date per charge.                                    |
| **Hours saved**           | Estimated admin hours avoided via automated collection/reminders. | Heuristic: `automated_collections × minutes_per_manual_collection`. Document the constant; label as an estimate. |
| **Outstanding balance $** | Unpaid/overdue rent at period end.                                | Secondary metric.                                                                                                |

## Data sources (already captured)

- **Payment records** — successful rent payments + amounts (cents) from the Stripe
  payment flow (`callable/payments.ts`, scheduled rent in
  `scheduled/scheduledRentCollection.ts`).
- **Rent schedule / due dates** — per-house / per-guest rent config and due dates
  (needed for on-time rate; confirm the due-date field exists or add it).
- **Automated-collection events** — count of scheduled/automated collections vs
  manual, to back the "hours saved" estimate.

## Acceptance criteria (full build — out of scope here)

- [ ] Operator dashboard shows collected $, on-time %, and hours-saved for a
      selectable period, per house and aggregate.
- [ ] Metrics match the definitions above; "hours saved" is labeled an estimate
      with its constant documented.
- [ ] Gated by the `analytics` capability (Professional/Plus+).
- [ ] No resident PII in aggregate views beyond what the operator already sees.

## Open questions

- Is a per-charge **due date** persisted today? On-time rate depends on it.
- Aggregation home: compute in a callable on demand vs a periodic rollup doc.
- "Hours saved" constant — pick a defensible minutes-per-manual-collection value.
