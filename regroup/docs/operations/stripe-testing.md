# Testing the Stripe workflows

How to exercise regroup's payment paths, in increasing order of cost and fidelity.
Read [Known gaps](#known-gaps) before you trust a passing run — several things are
broken in ways a test will not tell you about.

Regroup is a **Connect marketplace**. Residents pay rent through the app, the
platform is merchant of record, and funds transfer to each house's connected
account with a platform fee retained. Everything below follows from that.

---

## The workflows

| Workflow | Entry point | Shape |
|---|---|---|
| Resident pays rent | `createPaymentIntent` (callable) | Destination charge, `transfer_data.destination` + `application_fee_amount` |
| Scheduled auto-pay | `scheduledRentCollection` (cron) | Same, but `confirm: true` + `off_session: true` |
| Connect onboarding | `connectStripeAccount` → `stripeConnectReauth` / `stripeConnectReturn` | AccountLinks, Stripe-hosted |
| Account status sync | `handleStripeConnectWebhook` | `account.updated` (`account.application.deauthorized` is handled as a legacy safety net; not expected for API-created house accounts, v1 or v2) |
| Payment outcomes | `stripeWebhook` | `payment_intent.succeeded`, `payment_intent.payment_failed`, refunds, disputes |
| Operator subscriptions | `createOperatorSubscription`, `cancelUserSubscription` | Ordinary platform subscriptions — **not** a Connect flow |
| Payment reads | `listPayments`, `listHousePayments`, `getStripeAccountStatus` | Stripe API reads, not Firestore |

---

## Layer 1 — unit and integration tests

Fastest, and where most regressions should be caught. No Stripe account needed;
the SDK is mocked.

```bash
cd regroup/functions
npm test                 # jest --runInBand
npm run test:coverage
npx tsc --noEmit         # must exit 0
```

Existing Stripe coverage, by file:

| File (under `src/__tests__/`) | Tests |
|---|---|
| `payments.test.ts` | 93 |
| `callable/subscriptions.test.ts` | 54 |
| `callable/oxford.test.ts` | 27 |
| `http/stripeConnect.test.ts` | 16 |
| `api/createTierSubscription.test.ts` | 11 |
| `api/cardValidation.test.ts` | 9 |
| `callable/createPaymentIntent.test.ts` | 8 |
| `callable/getTierCatalog.test.ts` | 7 |
| `callable/listHousePayments.test.ts` | 6 |

**Write the test so it fails without the fix.** A passing test proves nothing
until you have seen it fail: revert the production change, run the suite, watch
it break, restore. Several money-path guards in this codebase were found to be
unpinned exactly this way — the test existed and the mutation survived it.

---

## Layer 2 — emulator plus Stripe CLI

Use this to exercise webhook handlers against real Stripe event payloads.
Test mode only works here: the deployed functions run in live mode and refuse
test-mode events by design (`util/verifyStripeWebhook.ts`), so there are no
test-mode webhook endpoints in the Stripe Dashboard.

All commands run from `regroup/functions`:

```bash
# Once: make the emulator a TEST deployment. In .secret.local, STRIPE_SECRET_KEY
# must be an sk_test_ key for the same Stripe account the CLI is logged into.

# Put the `stripe listen` signing secret where the verifier looks for it
# (STRIPE_TEST_WEBHOOK_SECRET and STRIPE_CONNECT_TEST_WEBHOOK_SECRET). Rerun
# after `stripe login` to a different account.
npm run stripe:listen:secret

# Shell 1: the emulator (do not run two products' emulators at once)
npm run serve

# Shell 2: forward platform and Connect events to the local handlers
npm run stripe:listen
```

Putting the listen secret in `STRIPE_WEBHOOK_SECRET` (the live secret) makes
every forwarded event fail with a 400: a test-mode event only verifies against
the test secrets.

Single events from Stripe's fixtures:

```bash
npm run stripe:trigger:payment-succeeded
npm run stripe:trigger:payment-failed
npm run stripe:trigger:account-updated
```

**Refunds and disputes need real destination charges.** `stripe trigger
charge.refunded` creates a charge with no transfer to a house, so the
transfer-reversal code only logs "nothing to reverse". These scenarios create
rent the way the app does ($500, $15 platform fee) and need
`STRIPE_TEST_HOUSE_ACCOUNT=acct_…`, a test connected account with transfers
active, in the environment or `.secret.local`:

```bash
npm run stripe:scenario:refund       # expect a $485.00 reversal on the transfer
npm run stripe:scenario:dispute      # expect a $485.00 reversal on the transfer
npm run stripe:scenario:dispute-won  # then, on close, $485.00 transferred back
```

**Idempotency is worth testing deliberately.** The handler claims each event by
id (`webhookEvents/{eventId}`), so redelivering the same event must be a no-op.
Replay one from the Dashboard, or `stripe events resend <evt_…>`, and confirm the
second delivery short-circuits rather than double-applying a rent decrement.

---

## Layer 3 — end-to-end in a sandbox

Full fidelity. Use a [sandbox](https://docs.stripe.com/sandboxes), not the shared
test-mode account, so settings and data stay isolated.

### Test cards

Verified against Stripe's destination-charges testing table.

| Card | Scenario |
|---|---|
| `4242424242424242` | Succeeds, no authentication |
| `4000002500003155` | Requires authentication (SCA) |
| `4000000000009995` | Declined, `insufficient_funds` |

For **auto-pay**, which charges `off_session`, the on-session cards above are the
wrong tool. Use these:

| Card | Scenario |
|---|---|
| `4000003800000446` | Already set up — off-session charges succeed |
| `4000008260003178` | Declines `insufficient_funds` even after setup |
| `4000002500003155` | Authenticates unless set up for future payments |

`4000008260003178` is the one that exercises the failure path properly: a
resident whose saved card stops working, which is what `markRentAttemptFailed`
and the reconciliation sweep exist for.

Any future expiry, any CVC, any postal code.

### Rent payment, end to end

1. Onboard a house through `connectStripeAccount` and finish Stripe's hosted flow.
2. Confirm `houses/{id}.stripeStatus` becomes `active` — this is driven by the
   `account.updated` webhook, not by the return page.
3. Pay rent from the app with `4242424242424242`.
4. Check `payment_intent.succeeded` arrived and `rentOwed` decremented **once**.
5. In the Dashboard, confirm the application fee and the transfer to the
   connected account match the table below.

### Expected fee split

The application fee is platform margin **plus** recovered Stripe cost, because
on destination charges Stripe debits processing from the platform.

> Requires PR #88. Before it lands the fee is margin only — 0.75% on card
> against ~2.9% + 30c paid — so the platform loses roughly $11 on a $500 card
> payment. If you are testing against `main`, expect the margin-only figures and
> no `RENT_FEE_STRIPE_*` variables.

| Method | $500 rent | Application fee | House receives | Platform nets |
|---|---|---|---|---|
| Card | $500.00 | $18.55 | $481.45 | $3.75 |
| ACH | $500.00 | $6.00 | $494.00 | $2.00 |

If the platform's net is not its stated margin, the Stripe-cost recovery has been
disabled — check the four `RENT_FEE_STRIPE_*` values.

---

## Configuration that changes behaviour

Set in `regroup/functions/.env` (deploy-time; the CLI bakes it into the Cloud Run
service — editing it changes nothing until you redeploy).

| Variable | Effect when testing |
|---|---|
| `TIER_BILLING_ENABLED` | `true` enables the 6-tier model; subscription tests behave differently when false |
| `RENT_FEE_CARD_PLATFORM_RATE` | Platform margin on card (default 0.0075) |
| `RENT_FEE_STRIPE_CARD_RATE` / `_FIXED_CENTS` | Recovered Stripe cost (#88 onward); **zero these and rent collection is loss-making again** |
| `RENT_FEE_ACH_FLAT_CENTS` | ACH margin (default 200) |
| `STRIPE_API_VERSION` | Pinned. Changing it changes returned object shapes — treat as its own change |
| `CONNECT_BASE_URL` | Required. Connect redirect origin; must match the Hosting rewrites |

`GCLOUD_PROJECT`, `GCP_PROJECT` and `GOOGLE_CLOUD_PROJECT` are **reserved** — the
Firebase CLI rejects them in `.env` and injects them itself.

---

## Known gaps

Things that are already broken, or untestable. A green suite does not cover these.

**Resident payment history returns nothing.** `firestore.rules` gates reads on
`resource.data.guestUserId == auth.uid`, and no Cloud Function ever writes
`guestUserId` — the webhook writes `guestId`, the guest *document* id. Since
`getPaymentHistory` is a direct client query, Firestore rejects the whole query
rather than filtering. Do not read an empty history as "no payments".

**"Resolve failed payment" cannot work.** `markPaymentResolvedOffline` does a
client-side update against a rule that sets `update: false`.

**`payments.amount` carries two units.** Dollars from the webhook, cents from
mobile writers, into one collection. Analytics multiplies by 100 assuming
dollars. See issue #82 — a cash payment is reported at 100× until it is fixed.

**Duplicate webhook endpoints.** Four are registered live, two generations deep,
on three different API versions. Every event is delivered twice in different
payload shapes; dedup keys on `event.id` so correctness holds, but which shape
gets processed is nondeterministic. Testing a webhook against production will
show you two deliveries.

**The CSP is report-only with no reporting endpoint.** Violations appear only in
each visitor's own devtools. Validate by loading billing, signup and the
deep-link redirect with devtools open.

**Android smoke tests are red on every PR.** Unrelated to payments; see #87.
`main` reads green only because those jobs are skipped there.

**Not reproducible locally:** `process.cwd()` behaviour in the deployed runtime,
real payout timing, dispute flows, and Hosting rewrites. Those need a deploy.

---

## Before you call it tested

- [ ] `npm test` and `npx tsc --noEmit` clean in `regroup/functions`
- [ ] Each new guard seen failing with the production change reverted
- [ ] A redelivered webhook event is a no-op, not a double-apply
- [ ] The fee split matches the table for both card and ACH
- [ ] `rentOwed` decremented exactly once per successful payment
- [ ] No resident PII in any log you added — names, contact details, health or
      recovery status. This rule is absolute and a reviewer will check it
