---
description: Regroup complianceExport / rentRoiMetrics money and PHI handling, payment amount units
paths:
  - 'regroup/functions/src/callable/compliance.ts'
  - 'regroup/functions/src/callable/analytics.ts'
  - 'regroup/functions/src/webhooks/**'
---

<!-- Extracted verbatim from regroup/functions/CLAUDE.md (Tier capabilities section) -->

**Read-only money/PHI note:** both `complianceExport` and `rentRoiMetrics` are
read-only and log only ids + aggregate counts (never names, test results, or
amounts per resident). `payments` docs store `amount` in **dollars** (webhook
divides by 100) — convert to cents when aggregating; `guests.rentOwed` is integer
cents. `rentRoiMetrics` returns `collectedGrossCents`, `refundedCents`,
`collectedNetCents` (gross − refunds), `outstandingCents`, `overdueResidentCount`,
and `onTimeRatePct`/`duePaymentCount`. Refunds are recorded by the
`charge.refunded` webhook handler as `payments.refundedAmountCents` (cents);
on-time uses `payments.dueDate`, the guest's `rentDueDate` captured at charge time
in `handlePaymentIntentSucceeded` (an approximation — no per-charge schedule
history). Hours-saved remains deferred (#32 caveats).
