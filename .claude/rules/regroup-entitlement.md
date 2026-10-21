---
description: Regroup server-side paywall (entitlement gate) — what is gated, what must never be gated, how to test it
paths:
  - 'regroup/functions/src/**'
---

<!-- Extracted verbatim from regroup/functions/CLAUDE.md -->

### Server-side entitlement gate (paywall)

`util/entitlement.ts` is the only server-side paywall enforcement. Before it,
`castOxfordVote` was the sole callable that consulted `subscriptionStatus` — the
paywall was otherwise enforced only in the mobile client, so anyone calling the API
directly kept full access regardless of payment.

`enforceHouseEntitlement(house, houseId)` is the gate. Ladder: `active`/`trialing`
grant; `past_due` grants only while `guestGraceEndsAt` is in the future (an absent or
unparseable deadline counts as expired, not as unlimited grace); `canceled`/`unpaid`
deny; an unrecognized status denies.

**Phase A is in force:** a house with no `subscriptionStatus` is GRANTED access and
logs `entitlement.absent_status` with its house id. That measures how many houses a
fail-closed rollout would lock out. Flip the absent branch to a denial only once that
count reaches zero. `House.subscriptionStatus` defaults to `""`, so this is not rare.

**Kill switch:** `paywall/config.enabled`, read with the Admin SDK so it bypasses
security rules — there is no `match /paywall/...` block, so the mobile hook reading
the same doc is denied on every attempt. Fails closed in every failure mode (missing
doc, non-boolean field, throwing read). Cached 60s.

Gated today: `castOxfordVote`, `setOxfordEnabled`, `createInvitation`, and claim
**grants** via `assertCanGrantClaimForHouses({ enforceEntitlement: true })`.

Deliberately NOT gated — do not "fix" these:

- `createPaymentIntent` — residents must be able to pay rent while the operator is
  lapsed. Blocking it harms the resident and removes the operator's means of
  recovering.
- Claim **revocations** (`deleteAdminAuthorization`, `removePrivilegesForGuests`) —
  preventing an operator from removing someone's access is a safety problem.
- `redeemInvitation` — an invitee mid-accept should not be stranded because the
  operator lapsed after the invitation went out.
- Billing/auth escape hatches (`createOperatorSubscription`,
  `reactivateOperatorSubscription`, `createBillingPortalSession`,
  `updatePaymentInfo`, the Stripe Connect trio) — gating any of these deadlocks a
  lapsed operator out of paying.
- Reads (`listPayments`, `complianceExport`, `rentRoiMetrics`) — the gate covers
  writes; data is not held hostage.

**Testing note:** because Phase A grants on absent status, a test whose house fixture
omits `subscriptionStatus` passes whether or not the gate is wired at all. Assert the
gate was _called_, and verify by deleting the gate and confirming the test fails.
