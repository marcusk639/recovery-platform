# Regroup Launch P6 Payments: Subscription and Rent Suites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove both money flows end to end, edge cases included, so Regroup can go live with real houses: operators paying Regroup for a subscription, and residents paying rent to their operator.

**Architecture:** Three layers, and each case goes in the cheapest layer that can prove it.

1. **Server suite (most edge cases).** Jest against the Firebase emulators and a **local Stripe sandbox with no webhook endpoints**. Stripe objects are real. Their events are fetched from Stripe and **delivered to the emulator by the test** with a locally signed header, so a test controls duplicates, ordering and delay, and needs no public URL. Test clocks move Stripe's time only; the app's own deadlines are tested by seeding them (see Global Constraints).
2. **Client suites.** Playwright drives web checkout and the portal. Maestro drives the resident payment sheet and what each role sees in each billing state.
3. **Staging round trip.** A few scenarios with real webhook delivery, proving the deployed wiring.

**Tech Stack:** Jest and `firebase emulators:exec` (`regroup/firebase.e2e.json`, project `demo-regroup-e2e`), `stripe` Node SDK (`testHelpers.testClocks`, `events.list`, `webhooks.generateTestHeaderString`), `@playwright/test` and `firebase-admin` (both added to `regroup/e2e`, on TypeScript 5; `regroup/web` is on TypeScript 3.8), Maestro.

**Spec:** `docs/superpowers/specs/2026-11-06-regroup-launch-reboot-design.md` §3.2, §4.1, §4.3, §6, §7. Roadmap: P6. This plan adds rows and a layer. It refines one spec decision, by owner decision on 2026-11-08: grace is measured from the failed invoice's Stripe time, not from when the webhook arrives.

## Global Constraints

- See the roadmap. Nothing touches `phoenix-cleanhouse`.
- **Two sandboxes, by owner decision.** The server suite and emulator flows use only the local sandbox (`assertLocalSandbox`, Task 2). It has no webhook endpoints, because the e2e sandbox's endpoints point at `regroup-e2e` and every test event would write quarantined records into staging. Only Task 8 uses the e2e sandbox (`assertSandboxAccount`).
- **Time.** A test clock moves Stripe's time, not `Date.now()` in the functions or the app. A test may assert a deadline Stripe's time sets, but tests expiry by writing a past deadline to Firestore. No test sleeps past a real deadline.
- **Grace (owner decision).** `guestGraceEndsAt` = the first failed invoice's `status_transitions.finalized_at` + 7 days. A retry of that invoice can't change it, and neither can late delivery. An operator already in grace keeps the earlier deadline. This is a P4 fix, and `SUB-021` and `SUB-048` are its failing tests.
- **Nothing real goes out.** Fixture emails use `@rats-e2e.invalid`, and the run refuses a real SendGrid key in `regroup/functions/.secret.local`. It checks the prefix and never prints the value.
- Every row here has Guard `money`, so it can't be deferred (spec §4.3).
- Spec values are fixed: 7-day trial, 7-day grace from the first failed payment for everyone, residents keep read-only access to their own data, rent is never gated on the operator's subscription.
- No `.skip`, `.only` or `.todo`. A test that fails because of a known defect stays red on purpose and its row stays `fail`. The suite runs on demand, not in CI (spec §4.3).
- No secret values in git or in output. Keys live in `~/.config/regroup-e2e/` and the gitignored `.secret.local`; the owner creates those files.
- New files ≤ 300 lines. Test data is fake (no PII).
- An independent reviewer, reasoning from how the money should move and not from the code, reviews this suite (root `CLAUDE.md`, spec §6).

## Needs the owner first

Before Task 2:

1. Create a second sandbox in the Stripe dashboard (name it `regroup-local`), with Connect enabled and its default API version set to the pinned `2026-01-28.clover`. Add **no webhook endpoints**.
2. Put its secret key in `~/.config/regroup-e2e/stripe-local-secret-key.txt` (mode 600), and any long random `whsec_`-prefixed value in `~/.config/regroup-e2e/stripe-local-webhook-secret.txt`.
3. In `regroup/functions/.secret.local`, set `STRIPE_SECRET_KEY` to that key and `STRIPE_TEST_WEBHOOK_SECRET` to that value, and remove any real `SENDGRID_API_KEY`. Manual emulator testing then uses this sandbox too.
4. Give the executor the sandbox's account id, which isn't a secret. It goes in the code as `E2E_LOCAL_SANDBOX_ACCOUNT_ID`.

## Gates

| Tasks | Can start when                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | Now                                                                                                                       |
| 2–4   | The local sandbox exists. Test code only: no deploy, so no effect on the freeze. Legacy rows wait for P4's legacy fixture |
| 5     | Task 4 has run and D1–D5 are settled. Mobile parts need #160 merged. Landing a functions fix starts the deploy freeze     |
| 6     | P3 round trip done, P4 sales-open switch in                                                                               |
| 7     | #160 merged, with its form-modal fix (#183 item 1), because several of these screens depend on it                         |
| 8     | P4 and Task 5 fixes done, staging web and app builds deployed                                                             |
| 9     | Everything above has run                                                                                                  |

**Expected red:** rows that hit a defect in spec §3.2 or the grace rule fail until P4 fixes them. They are P4's failing tests, and Task 3 lists them. Rent rows that go red are Task 5's.

## Owner decisions

**Settled by the owner on 2026-11-08: all five recommendations stand.** They decide expected results. Row `SUB-034` depends on D5, and Task 5 builds D2, D3 and D4.

| #   | Question                                                                                   | What the code does today                                                                                                                         | Decision                                                                                                              |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Does a **refund** put the rent back owed?                                                  | No. It records the refund and reverses the house's transfer; `rentOwed` is untouched                                                             | No. The operator chose to refund, and may have settled it another way. Show the refund in the history                 |
| D2  | Does a **lost chargeback** put it back?                                                    | No                                                                                                                                               | Yes. The house lost the money and nobody chose that. Restore `rentOwed` and notify the operator                       |
| D3  | Can a resident pay **more than they owe**?                                                 | Yes, up to $100,000. `rentOwed` goes negative                                                                                                    | Refuse above the balance when the intent is created. Still handle a negative balance, since a manual payment can race |
| D4  | Which **payment history** is the truth?                                                    | Pay Rent reads Firestore `payments`; Payment History reads Stripe charges, so they can disagree                                                  | Firestore `payments`, with the daily reconciliation catching drift. Stripe stays the audit source                     |
| D5  | What happens **over the tier's resident limit**, on a downgrade or when adding a resident? | `residentCapacity.ts` refuses a new resident at the limit, and allows one when the limit can't be resolved. Nothing states what a downgrade does | Keep everyone already there, remove no data, and refuse new residents until under the limit                           |

## Review Focus

1. **A captured card with nothing recorded:** the webhook is late, fails, or the app died after confirming. The balance and history must end up correct exactly once, once delivery succeeds (`RENT-020`, `RENT-021`, `RENT-022`).
2. **The same money applied twice or to the wrong place:** duplicate events, double taps, a card and a manual payment together, another house's id (`RENT-010`, `RENT-023`, `RENT-024`, `RENT-030`).
3. **Lapse punishing the wrong person:** a resident blocked from paying or from their own history while the operator's plan is lapsed, or an operator's data lost (`SUB-024`, `RENT-014`, `RENT-050`).
4. **A status reached by the wrong route:** out-of-order events restoring access after a cancel, or a retry extending grace (`SUB-021`, `SUB-041`, `SUB-042`).
5. **A second legitimate payment refused:** the idempotency key is per resident, house, day and amount, so paying the same amount twice in a day reuses a finished intent (`RENT-012`).

---

## Case catalog

Each row becomes a matrix row in Task 1. Layer: **S** server, **W** Playwright, **M** Maestro, **G** staging, **D** device. Rows marked _legacy_ use the fixture shaped like production (spec §4.3), and the rest use `clean`. Existing `BILL`, `STG`, `RES`, `OPS` and `XROLE` rows stay and are covered by the same tasks.

### Operator subscription

| ID        | Case                                                                          | Expected                                                                                                                  | Layer |
| --------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| `SUB-001` | Subscribe on each of the 6 tiers, monthly and annual                          | Status `trialing`, right price, `trial_end` 7 days out, `currentPeriodEnd` stored                                         | S     |
| `SUB-002` | Clocked helper vs the real callable                                           | Same metadata and `subscriptions/{id}` shape as `createOperatorSubscription`                                              | S     |
| `SUB-003` | `TIER_BILLING_ENABLED` not `"true"`                                           | Refused; no silent fallback to the legacy shape                                                                           | S     |
| `SUB-004` | Unknown or inactive price, and a tier not in the catalog                      | Refused; no Stripe subscription left behind                                                                               | S     |
| `SUB-005` | Sales-open switch closed                                                      | Checkout refused server-side, not only hidden                                                                             | S, W  |
| `SUB-006` | Catalog unreachable                                                           | No price or trial figure shown; checkout not offered                                                                      | W, M  |
| `SUB-010` | Same checkout submitted twice, and in two tabs                                | One subscription, one customer                                                                                            | S, W  |
| `SUB-011` | Checkout abandoned, or card declined at signup                                | No entitlement; no orphan user or active subscription; can retry                                                          | W     |
| `SUB-012` | 3DS required at checkout: passed, then failed                                 | Passed subscribes; failed leaves no entitlement                                                                           | W     |
| `SUB-020` | Trial converts to paid at day 7 (clock)                                       | `active`; house status follows                                                                                            | S     |
| `SUB-021` | Card fails at trial end, and at renewal                                       | `past_due`; `guestGraceEndsAt` is the invoice's `finalized_at` + **7 days**; a retry doesn't change it; operator notified | S, G  |
| `SUB-022` | Payment recovered during grace                                                | `active`; grace cleared; access unchanged                                                                                 | S, G  |
| `SUB-023` | Grace ended unpaid (past deadline written to Firestore)                       | `evaluateEntitlement` denies; operator plan required; residents blocked except their own data                             | S, M  |
| `SUB-024` | Past grace: operator's houses, residents, and payment data                    | All intact; resident reads own history and documents; rent still payable                                                  | S, M  |
| `SUB-025` | Dunning exhausted (`unpaid`), then a new card pays                            | Blocked, then unblocked; no duplicate subscription                                                                        | S     |
| `SUB-030` | Cancel at period end                                                          | Access until period end, then blocked; no new houses after                                                                | S, W  |
| `SUB-031` | Cancel immediately                                                            | Blocked at once; `users.subscriptionMetadata.status` updated; `createHouses` refuses                                      | S, W  |
| `SUB-032` | Re-subscribe or reactivate after cancel                                       | Entitled again; same customer; data intact; no second trial                                                               | S     |
| `SUB-033` | Upgrade and downgrade, with proration                                         | Right price and invoice; tier features follow                                                                             | S, W  |
| `SUB-034` | Downgrade below the tier's `maxResidents` (D5)                                | Existing residents and data stay; adding another is refused until under the limit                                         | S, W  |
| `SUB-037` | Add a resident at the tier's `maxResidents` (10, 20, 15, 25 by tier)          | Refused with an upgrade message; unlimited tiers never refuse                                                             | S, M  |
| `SUB-038` | Account deleted with an active subscription                                   | Subscription canceled at once, as the Delete account screen says; later events are harmless                               | S     |
| `SUB-035` | Change payment method in the portal, then a failed invoice retried            | New card charged; status recovers                                                                                         | W, G  |
| `SUB-036` | Switch between traditional and Oxford                                         | Refused; price, house and operator unchanged (owner, 2026-11-10, #225)                                                    | S, M  |
| `SUB-040` | Same event delivered twice, and concurrently                                  | Applied once; concurrent delivery backs off with 500, not success                                                         | S     |
| `SUB-041` | Events out of order: `updated(active)` after `deleted`                        | Stays canceled                                                                                                            | S     |
| `SUB-042` | `payment_failed` arrives after `payment_succeeded` for a later invoice        | Stays active; no grace started                                                                                            | S     |
| `SUB-043` | Handler throws once, then redelivery                                          | 500, claim released, second delivery applies                                                                              | S     |
| `SUB-044` | Bad, missing or wrong-mode signature                                          | 400; nothing written                                                                                                      | S     |
| `SUB-045` | Houses created the normal way (random `adminIds`)                             | Webhook updates every one of the operator's houses (spec §3.2 item 1)                                                     | S     |
| `SUB-046` | Event for a subscription or customer nobody knows                             | Logged and marked done, not retried forever; other operators untouched                                                    | S     |
| `SUB-047` | `trial_will_end`, `payment_action_required`, `subscription.created`           | Handled per P4; `payment_action_required` tells the operator                                                              | S     |
| `SUB-048` | First `invoice.payment_failed` delivered 2 days late                          | Deadline unchanged: still the invoice's `finalized_at` + 7 days                                                           | S     |
| `SUB-050` | Paywall kill switch on and off                                                | Readable under the rules; entitlement follows                                                                             | S, M  |
| `SUB-060` | _Legacy:_ subscription with no `metadata.userId`, linked only by `customerId` | Webhooks find the operator; status reaches the user and every house                                                       | S     |
| `SUB-061` | _Legacy:_ active $0 subscription with no houses renews                        | No error; state matches the backfill rule (plan required)                                                                 | S     |
| `SUB-062` | _Legacy:_ $10 + $1 pricing: failed invoice, then cancel                       | Same transitions as a tier subscription                                                                                   | S     |
| `SUB-063` | _Legacy:_ operator moves to a tier                                            | Old subscription ended, new one active; never billed twice; no access gap; data intact                                    | S, W  |
| `SUB-070` | Production pass: live webhook endpoints and portal                            | Endpoints list every event in `PLATFORM_EVENTS` and `CONNECT_EVENTS`; a live portal configuration exists                  | D     |

### Resident rent

| ID         | Case                                                                            | Expected                                                                                                             | Layer |
| ---------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| `RENT-001` | Pay full balance by card                                                        | `rentOwed` 0; `payments/{pi}` `succeeded`; destination is the house's account; fee equals `computeApplicationFee`    | S, M  |
| `RENT-002` | Half, custom, and $0.01 amounts                                                 | Balance falls by exactly that, in integer cents                                                                      | S, M  |
| `RENT-003` | Rent plus chore fees                                                            | Total shown and charged agree; `rentOwed + choreFees` falls by exactly the amount paid                               | S, M  |
| `RENT-004` | ACH (`us_bank_account`)                                                         | ACH fee; balance moves on success, not on submission; a later failure leaves it owed                                 | S     |
| `RENT-005` | Amount 0, negative, fractional, over `MAX_PAYMENT_CENTS`, non-USD               | Refused by validation; no intent                                                                                     | S     |
| `RENT-006` | Over the balance (D3)                                                           | Refused when the intent is created                                                                                   | S, M  |
| `RENT-010` | Double tap on Pay                                                               | One intent, one charge                                                                                               | S, M  |
| `RENT-011` | Decline, then retry the same amount the same day                                | Same intent can be retried; charged once                                                                             | S, M  |
| `RENT-012` | Second payment of the same amount the same day, after the first succeeded       | No second charge; a clear "this payment already went through" message, and the resident can pay a different amount   | S, M  |
| `RENT-013` | Declines: generic, insufficient funds, expired, bad CVC                         | Clear message; balance unchanged; can retry; failure recorded                                                        | S, M  |
| `RENT-014` | Operator's subscription lapsed                                                  | Rent still payable (not gated)                                                                                       | S, M  |
| `RENT-015` | Payment sheet dismissed                                                         | Nothing charged; balance unchanged; can pay again                                                                    | M     |
| `RENT-016` | ACH still processing, and the resident pays again                               | Warned or refused; never paid twice unknowingly                                                                      | S, M  |
| `RENT-017` | Declined just before 00:00 UTC, retried just after (evening in the US)          | New key, charged once, ledger moves once; the first intent stays uncharged                                           | S     |
| `RENT-018` | 3DS passed, then failed                                                         | Passed pays; failed leaves the balance unchanged and can retry                                                       | M     |
| `RENT-020` | App closed after confirming, webhook arrives later                              | Balance and history correct on next open                                                                             | S, M  |
| `RENT-021` | Webhook delayed: the balance before and after delivery                          | App never shows the payment applied twice, and catches up                                                            | S, M  |
| `RENT-022` | Webhook handler fails after the payment record is written, then redelivered     | Record exists throughout; balance applied exactly once                                                               | S     |
| `RENT-023` | `payment_intent.succeeded` delivered twice and concurrently                     | Balance falls once (`rentApplied` marker)                                                                            | S     |
| `RENT-024` | Manual payment recorded while a card payment is in flight                       | Both recorded; balance correct; a negative balance displays sensibly                                                 | S, M  |
| `RENT-025` | Succeeded event for a deleted guest, or with missing metadata                   | Payment recorded and flagged for reconciliation; no crash, no lost record                                            | S     |
| `RENT-030` | Resident of house A passes house B's id, or another resident's guest id         | `permission-denied`; no intent                                                                                       | S     |
| `RENT-031` | Admin of another house pays for this resident                                   | `permission-denied`                                                                                                  | S     |
| `RENT-032` | Signed out; missing house; missing guest                                        | `unauthenticated` / `not-found`                                                                                      | S     |
| `RENT-033` | Discharged resident, and a resident moved to another house                      | Follows the guest doc; the money can't reach the old house                                                           | S     |
| `RENT-034` | Account deleted with rent owed, and with a payment in flight                    | Payment records kept per the deletion rules; a late event is recorded for reconciliation                             | S     |
| `RENT-040` | Connect not started, pending, restricted, deauthorized                          | Pay Rent locked with an explanation; server refuses with `failed-precondition`                                       | S, M  |
| `RENT-041` | Account becomes restricted between opening the sheet and paying                 | Clear failure or success; ledger consistent either way                                                               | S     |
| `RENT-042` | `account.updated` and `deauthorized` delivered                                  | `stripeStatus` follows; repeats are harmless                                                                         | S     |
| `RENT-043` | Disconnect with payments in flight                                              | In-flight payments still land on the ledger                                                                          | S     |
| `RENT-044` | Payout failed                                                                   | Operator notified; ledger untouched                                                                                  | S     |
| `RENT-050` | Past grace: resident's own payment history, receipts, CSV                       | Readable                                                                                                             | S, M  |
| `RENT-051` | Pay Rent history and Payment History for the same resident (D4)                 | Same payments                                                                                                        | S, M  |
| `RENT-052` | Dashboard totals vs the ledger                                                  | Collected and Outstanding match; a $150 overdue resident can't show Outstanding $0 (#183); charges name the resident | S, M  |
| `RENT-053` | One resident can't read another's payments                                      | Rules deny; `listPayments` denies                                                                                    | S     |
| `RENT-060` | Full refund, partial refund, two partial refunds (D1)                           | Cumulative amount recorded; house's share reversed proportionally; balance per D1                                    | S     |
| `RENT-061` | Refund failed or updated (`charge.refund.updated`)                              | Reversal undone or retried; no double reversal                                                                       | S     |
| `RENT-062` | Chargeback opened, won, lost (D2)                                               | Transfer reversed, restored on a win; balance per D2; operator notified                                              | S     |
| `RENT-070` | Auto-pay charges on schedule                                                    | One charge; `rentAttempts` reconciled; ledger set by the webhook                                                     | S     |
| `RENT-071` | Auto-pay with a charge in flight; a manual payment the same day                 | No repeat charge (in-flight amount counted)                                                                          | S     |
| `RENT-072` | Auto-pay decline, and one resident failing among many                           | Failure recorded; others still charged; no retry storm                                                               | S     |
| `RENT-073` | Auto-pay toggled off, or no saved method                                        | Not charged; toggle reflects the state                                                                               | S, M  |
| `RENT-080` | _Legacy:_ house and resident shaped like production pay rent                    | Ledger and destination correct                                                                                       | S, M  |
| `RENT-081` | _Legacy:_ payment from before `guestUserId` existed                             | Resident sees it after the backfill                                                                                  | S     |
| `RENT-090` | Production pass: a real $1 rent payment, then refund, on the owner's test house | Ledger, transfer and refund reversal all correct; the owner confirms each step first                                 | D     |

---

### Task 1: Rows in the matrix, and a `server` kind

**Files:**

- Modify: `regroup/mobile/scripts/coverage-matrix-check.js` (`kind` list at line 34, `FILE_KINDS` at line 40)
- Test: `regroup/mobile/scripts/coverage-matrix-check.test.js`
- Modify: `regroup/mobile/docs/e2e/coverage-matrix.md` (Kind column legend, and the rows)

**Interfaces:**

- Produces: kind `server`, a file-backed kind. Rows `SUB-*` and `RENT-*` with Guard `money`, Status `missing`, and Fixture `legacy` where the catalog says so, else `clean`. A row has one kind, so a case gets one row per layer. **S** and **D** rows use the catalog ID. The other layers add an offset: **W** +100 (Platform `web`), **M** +200, **G** +300. So `SUB-006` becomes `SUB-106` and `SUB-206`, and `SUB-021` becomes `SUB-021` and `SUB-321`. Server, Maestro, staging and device rows use Platform `both`. Device rows carry the `DEVP` prefix in the matrix (`SUB-070` → `DEVP-010`, `RENT-090` → `DEVP-011`), as the P9 gate selects on it.

- [ ] **Step 1:** Add a test: a `server` row with `pass` and no covering file fails; with a file, it passes; a `server` row with Guard `money` and Status `deferred` fails.
- [ ] **Step 2:** `cd regroup/mobile && npx jest scripts/coverage-matrix-check`. Expected: FAIL on the unknown kind.
- [ ] **Step 3:** Add `server` to both lists.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** Add the rows and the legend line. Run `node scripts/coverage-matrix-check.js`. Expected: exit 0.
- [ ] **Step 6:** Commit: `test(regroup): payment suite rows in the coverage matrix`.

### Task 2: The server harness

**Files:**

- Create: `regroup/e2e/src/payments/harness/guards.ts`, `eventPump.ts`, `callables.ts`, `fixtures.ts`, `clock.ts`, `scheduled.ts`, `waitFor.ts`
- Create: `regroup/e2e/src/payments/__tests__/harness.server.test.ts`
- Create: `regroup/e2e/jest.payments.config.js` (run in band), `regroup/e2e/scripts/run-payment-suite.sh`, `regroup/e2e/scripts/stripe-local-setup.ts`
- Modify: `regroup/e2e/src/stripeSandbox.ts` (add `E2E_LOCAL_SANDBOX_ACCOUNT_ID`, `assertLocalSandbox`; `assertSandboxAccount` is unchanged), its tests, `regroup/e2e/package.json` (`firebase-admin`, `test:payments`, `payments:setup`), `regroup/e2e/jest.config.js` (exclude `*.server.test.ts`), `regroup/mobile/maestro/README.md` (setup and running)

**Interfaces:**

- Produces:
  - `assertLocalSandbox(stripe, key): Promise<string>`: `assertTestKey`, the account must be `E2E_LOCAL_SANDBOX_ACCOUNT_ID`, and `webhookEndpoints.list` must be empty.
  - `assertSafeTarget(): Promise<Stripe>`: requires `FIRESTORE_EMULATOR_HOST`, project `demo-regroup-e2e`, and `assertLocalSandbox`. The client is pinned with `pinnedStripeApiVersion()`.
  - `deliver(event: Stripe.Event | object, opts?: { endpoint?: 'platform' | 'connect'; secret?: string }): Promise<{ status: number; body: string }>`: signs with `stripe.webhooks.generateTestHeaderString` and the secret file's value, then POSTs to `http://127.0.0.1:5001/demo-regroup-e2e/us-central1/{stripeEvents|handleStripeConnectWebhook}`.
  - `fetchEvents(stripe, { since: number; objectId: string; types?: string[] }): Promise<Stripe.Event[]>`: polls `events.list`, filters client-side on the object id, and returns oldest first once stable. It **throws if `event.api_version` isn't the pinned version**, so tests can't pass on payloads production wouldn't receive. Tests decide what to deliver and when.
  - `callAs(uid: string, name: string, data: unknown): Promise<{ data?: unknown; errorCode?: string }>`: emulator auth token, then the callable's HTTP endpoint.
  - `waitFor<T>(read: () => Promise<T>, until: (v: T) => boolean, timeoutMs = 30000): Promise<T>`: used wherever a Firestore trigger or handler may still be running. Seeding fires triggers too.
  - `seedOperator(opts)`, `seedHouse(opts)`, `seedResident(opts)`: **written the way `createHouses` writes them** (random `adminIds`, uid in `superAdminIds`). `seedConnectedHouse()` uses the local Connect account. Every fixture id carries a per-test prefix, and Stripe objects carry `metadata.e2eRun`. `seedLegacyOperator(opts)` loads P4's legacy fixture.
  - `seedAutoPayResident(stripe, house, opts)`: creates a Stripe customer, attaches `pm_card_visa`, and writes `autoPayEnabled: true`, `rentOwed`, `stripeCustomerId` and `defaultPaymentMethodId` on the guest.
  - `runScheduled.rentCollection(): Promise<RentCollectionSummary>`: imports `runRentCollection` from `regroup/functions/lib/scheduled/scheduledRentCollection` and calls it in the Jest process. `firebase.e2e.json` has no pubsub emulator, so schedules don't fire.
  - `withClock(stripe, fn)` and `advance(stripe, clockId, toEpoch)`: creates a clock named `e2e-<run>` and a clocked customer, polls until `ready`, and deletes the clock afterwards.
  - `clockedOperator(stripe, tier, opts): Promise<{ uid; subscriptionId; customerId; clockId }>`: `createOperatorSubscription` creates its own customer, so a clock can't be attached to it. This builds the same subscription and `subscriptions/{id}` doc directly. `SUB-002` proves the two stay the same. `opts.failingCard` attaches `pm_card_chargeCustomerFail`.
- `stripe-local-setup.ts` (`npm run payments:setup`), idempotent: runs `assertLocalSandbox`, `ensureCatalog`, creates or finds a test Connect account with charges and payouts enabled, and writes `regroup/functions/.env.demo-regroup-e2e` (gitignored) with `TIER_BILLING_ENABLED=true` and `PRICE_ENV_VARS`, because the emulator env has no prices today. The Connect account id goes in `~/.config/regroup-e2e/stripe-local-connect-account.txt`.
- `run-payment-suite.sh` preflight refuses, naming the problem and never printing a value, if: ports 4000, 5001, 8080 or 9099 are in use (`emulators:exec` would clash with a running `test-prep.sh`); a config file is missing; `.secret.local` holds a `SG.` SendGrid key. It builds functions, deletes `e2e-` clocks older than an hour (Stripe limits clocks per account), and runs `firebase emulators:exec --project demo-regroup-e2e --config regroup/firebase.e2e.json`.

- [ ] **Step 1:** Write `harness.server.test.ts`. The first test is the walking skeleton, because a broken Connect account would fail every rent test (#183 item 8):
  - **one real rent payment end to end:** `seedConnectedHouse`, `callAs` `getStripeAccountStatus` reports active, `callAs` `createPaymentIntent`, confirm with `pm_card_visa`, `fetchEvents`, `deliver`, then `rentOwed` falls by the amount. This also proves the emulator holds the local sandbox's key;
  - `assertLocalSandbox` refuses the e2e sandbox, a `sk_live_` key, and a sandbox with an endpoint; `assertSafeTarget` refuses a non-demo project;
  - `deliver` with a wrong secret returns 400 and writes no `webhookEvents` doc;
  - a fetched `customer.subscription.updated` delivers with 200 and writes `webhookEvents/{id}` with `status: 'done'`;
  - `fetchEvents` throws on an event with another `api_version`;
  - a seeded house has an `adminIds` entry that isn't the operator's uid;
  - `advance` moves a clock, and a past-deadline write makes the callable refuse.
- [ ] **Step 2:** `cd regroup/e2e && npm run test:payments -- harness`. Expected: FAIL, modules missing.
- [ ] **Step 3:** Implement. If the skeleton fails on the Connect account or the API version, stop and report it: everything after depends on it.
- [ ] **Step 4:** Same command. Expected: PASS. `npm test` in `regroup/e2e` still passes without emulators or keys.
- [ ] **Step 5:** Commit: `test(regroup): payment suite harness over emulators and a local Stripe sandbox`.

### Task 3: Subscription server suite

**Files:**

- Create, in `regroup/e2e/src/payments/__tests__/`: `subscriptionCheckout.server.test.ts` (`SUB-001`–`005`, `010`), `subscriptionLifecycle.server.test.ts` (`SUB-020`–`025`), `subscriptionChanges.server.test.ts` (`SUB-030`–`038`), `subscriptionDelivery.server.test.ts` (`SUB-040`–`048`, `050`), `subscriptionLegacy.server.test.ts` (`SUB-060`–`063`, after P4's legacy fixture)

**Interfaces:**

- Consumes: Task 2's harness; `evaluateEntitlement` semantics from `regroup/functions/src/util/entitlement.ts`, asserted through callables and Firestore state, not by importing it.

- [ ] **Step 1:** Write one test per `S` row, named `SUB-0NN: <case>`, asserting the catalog's Expected on Firestore (`houses`, `users.subscriptionMetadata`, `subscriptions`) and on what the callable then allows. The grace test:

```ts
test('SUB-021: first failure starts 7-day grace and a retry does not change it', async () => {
  // clockedOperator with a failing card; advance past renewal; deliver the first invoice.payment_failed.
  expect(Date.parse(await graceEndsAtOf(houseId))).toBe(
    (invoice.status_transitions.finalized_at + 7 * DAY_S) * 1000,
  );
  // Advance 2 days on the clock, deliver the retry's invoice.payment_failed.
  expect(await graceEndsAtOf(houseId)).toBe(graceEndsAt);
});

test('SUB-023: past the deadline the operator and residents are blocked', async () => {
  await writeGraceEndsAt(houseId, minutesAgo(1)); // Stripe's clock can't move Date.now().
  expect((await callAs(operatorUid, 'createHouses', input)).errorCode).toBe('failed-precondition');
});
```

The ordering test delivers `customer.subscription.deleted`, then the older `customer.subscription.updated`, and expects `canceled` on every house.

- [ ] **Step 2:** `npm run test:payments -- subscription`. Read every failure and sort it: a test bug gets fixed; a product defect stays red.
  - **Expected red until P4:** `SUB-003`, `SUB-021` and `SUB-048` (the code grants 48 hours from `Date.now()`), `SUB-023`, `SUB-024`, `SUB-031`, `SUB-045` (spec §3.2 item 1), `SUB-047`, `SUB-050`. Any other red is a new finding: file it and add it to the matrix.
- [ ] **Step 3:** Set each green row to `pass` with its file in Covered by, and each red row to `fail`. Run `node scripts/coverage-matrix-check.js` in `regroup/mobile`. Expected: exit 0.
- [ ] **Step 4:** Commit: `test(regroup): subscription lifecycle server suite`. The PR body lists the red rows and what each waits on, and uses the `test-change-approved` label only if verify-diff asks.

### Task 4: Rent server suite

**Needs:** D1–D4 settled.

**Files:**

- Create, in `regroup/e2e/src/payments/__tests__/`: `rentIntent.server.test.ts` (`RENT-001`–`006`, `010`–`014`, `016`, `017`, `030`–`034`), `rentLedger.server.test.ts` (`RENT-020`–`025`, `050`–`053`), `rentConnect.server.test.ts` (`RENT-040`–`044`), `rentRefunds.server.test.ts` (`RENT-060`–`062`), `rentAutoPay.server.test.ts` (`RENT-070`–`073`, through `runScheduled.rentCollection`), `rentLegacy.server.test.ts` (`RENT-080`, `081`, after P4's legacy fixture)
- Create: `regroup/e2e/src/payments/harness/payWithTestCard.ts`

**Interfaces:**

- Consumes: Task 2's harness; `computeApplicationFee` expected values worked out by hand in the test from the documented formula (card: 0.75% + 2.9% + 30¢), never by importing it.
- Produces: `confirmWithCard(stripe, clientSecret, pm: 'pm_card_visa' | 'pm_card_bypassPending' | 'pm_card_chargeDeclined' | 'pm_card_chargeDeclinedInsufficientFunds' | 'pm_card_chargeDeclinedExpiredCard' | 'pm_card_chargeDeclinedIncorrectCvc'): Promise<Stripe.PaymentIntent>`. 3DS can't be completed server-side, so `RENT-018` is Maestro only. Refund cases use `pm_card_bypassPending`, so the house has funds to reverse, and `refunds.create`. Dispute cases use `pm_card_createDispute`, then `disputes.update` with `winning_evidence` or `losing_evidence`. ACH cases use Stripe's test routing and account numbers.

- [ ] **Step 1:** Write one test per `S` row, named `RENT-0NN: <case>`. Every ledger test checks all four: `guests/{id}.rentOwed`, `payments/{pi}`, the Stripe charge (amount, destination, fee), and the transfer with its reversals. Don't assert the connected account's balance, which tests share. The core one:

```ts
test('RENT-023: a duplicated succeeded event moves the balance once', async () => {
  const before = await rentOwed(guestId);
  const [event] = await paySucceededEvent(house, guest, 5000);
  await Promise.all([deliver(event), deliver(event)]); // one may answer 500; redeliver then
  await deliver(event);
  expect(await rentOwed(guestId)).toBe(before - 5000);
  expect((await paymentDoc(event)).rentApplied).toBe(true);
});
```

- [ ] **Step 2:** `npm run test:payments -- rent`. Sort failures as in Task 3. **Expected red until Task 5:** `RENT-006`, `RENT-012`, `RENT-016`, `RENT-051`, `RENT-052`, `RENT-062`. Any other red is a new finding, and goes on Task 5's list.
- [ ] **Step 3:** Update matrix rows as in Task 3. Run the checker. Expected: exit 0.
- [ ] **Step 4:** Commit: `test(regroup): rent ledger, Connect, refund and auto-pay server suite`.

### Task 5: Rent fixes

Every red rent row needs a fix before release, and P4 doesn't cover them. These are money paths: each fix is its own commit, its Task 4 test is already red, and an independent reviewer reasons from how the money should move.

**Files:**

- Modify: `regroup/functions/src/callable/payments.ts` (`createPaymentIntent`), `regroup/functions/src/webhooks/stripeWebhook.ts` (`charge.dispute.closed`)
- Modify: `regroup/mobile/src/services/payments.ts`, `regroup/mobile/src/screens/Payments/PaymentHistory.tsx`, `regroup/mobile/src/screens/HouseSettings/PaymentDashboard.tsx`, and their tests

**Interfaces:**

- Produces: `createPaymentIntent` refuses with `failed-precondition` when `amount > rentOwed + choreFees` (D3, `RENT-006`), and when a `processing` payment exists for the guest (`RENT-016`). When the idempotency key returns a `succeeded` intent, it returns `{ alreadyPaid: true }` with no client secret, and the client shows "this payment already went through" (`RENT-012`). A lost dispute increments `rentOwed` by the disputed amount exactly once and notifies the operator (D2, `RENT-062`). Payment History reads Firestore `payments` (D4, `RENT-051`). Dashboard Outstanding is the sum of positive balances (`RENT-052`).

- [ ] **Step 1:** Confirm each listed row, and any new finding from Task 4, is red. Run `cd regroup/e2e && npm run test:payments -- rent`. Expected: those rows FAIL.
- [ ] **Step 2:** Implement one fix per commit, re-running its row until green, with unit tests in `regroup/functions` and `regroup/mobile` for the changed logic.
- [ ] **Step 3:** `npm run test:payments -- rent`. Expected: all PASS. `npm test` in `regroup/functions` and `npx jest` in `regroup/mobile`. Expected: PASS.
- [ ] **Step 4:** Dispatch the independent money reviewer on the whole diff. Fix Critical and Important findings test first.
- [ ] **Step 5:** Update matrix rows. Commits: `fix(regroup-functions): <the rule>`, `fix(regroup-mobile): <the rule>`.

### Task 6: Web subscription journeys (Playwright)

**Files:**

- Create, in `regroup/e2e/`: `playwright.config.ts`, `web/checkout.spec.ts`, `web/portal.spec.ts`, `web/salesSwitch.spec.ts`, `web/helpers/stripeElements.ts`
- Modify: `regroup/e2e/package.json` (`@playwright/test`, `test:web`, `test:web:staging`), `regroup/e2e/jest.config.js` (ignore `web/`), `regroup/web/CLAUDE.md` (how to run)

**Interfaces:**

- Produces: `fillCard(page, card: '4242424242424242' | '4000002500003155' | '4000000000000002')` for Stripe Elements' frames. `baseURL` defaults to the `e2e-emulator` build; `E2E_BASE_URL` selects staging, and the config refuses any host but `localhost` and `regroup-e2e.web.app`.
- Needs: the sandbox's Customer Portal configuration and retry settings (P4, A7).

- [ ] **Step 1:** Write specs for `BILL-009`–`017`, plus the `W` layer of `SUB-005`, `006`, `010`, `011`, `012`, `030`, `031`, `033`, `034`, `035`, `063`. Each asserts the resulting page and the Firestore or Stripe state, not just the navigation.
- [ ] **Step 2:** Run `npm run test:web`. Expected: FAIL only on defects still open; fix tests until the rest pass.
- [ ] **Step 3:** Run `E2E_BASE_URL=https://regroup-e2e.web.app npm run test:web:staging` once. Record the result in the PR body.
- [ ] **Step 4:** Update matrix rows. Commit: `test(regroup): subscription checkout and portal journeys`.

### Task 7: Mobile payment flows (Maestro)

**Files:**

- Create, in `regroup/mobile/maestro/flows/`: `rent-pay-full.yaml`, `rent-pay-partial.yaml`, `rent-decline-retry.yaml`, `rent-3ds-pass.yaml`, `rent-3ds-fail.yaml`, `rent-sheet-dismiss.yaml`, `rent-connect-locked.yaml`, `rent-lapsed-house.yaml`, `billing-states-operator.yaml`, `billing-states-resident.yaml`, `payment-dashboard-totals.yaml`
- Create: `regroup/mobile/maestro/subflows/payment-sheet-card.yaml` (env `CARD_NUMBER`), `regroup/mobile/maestro/subflows/verify-balance.yaml`
- Create: `regroup/mobile/maestro/scripts/run-payment-flow.sh`, `regroup/e2e/scripts/deliver-latest-event.ts`
- Modify: `regroup/mobile/maestro/subflows/login.yaml` (see Step 1)
- Modify: `regroup/mobile/maestro/flows/guest-rent-payment.yaml` (fix the stale taps; `RES-009`), `regroup/mobile/maestro/scripts/seed/` (billing-state and Connect-state houses, written the way `createHouses` writes them)

**Interfaces:**

- Consumes: `maestro/scripts/assert-firestore.js`, Task 2's `fetchEvents` and `deliver`.
- Produces: `run-payment-flow.sh <flow> --guest <guestId> [--deliver <eventType>] [--assert '<docPath> field=value']`. Maestro's `runScript` is sandboxed JavaScript and can't run Node or the Stripe SDK, and the emulator gets no real webhook. So the wrapper runs the flow, then `deliver-latest-event.ts`, then `verify-balance.yaml`, then the Firestore assert, and exits non-zero if any fails. `RENT-021` asserts the screen before and after delivery this way.

- [ ] **Step 1:** Fix `login.yaml` first, because every flow depends on it. On iOS it fails at `hideKeyboard`, and `clearState` doesn't sign out because the session survives in the keychain, so one failed flow breaks the next. Dismiss the keyboard by tapping a non-input element, and sign out when `profile-tab` is visible at launch. Run `guest-home.yaml` twice in a row. Expected: PASS both times.
- [ ] **Step 2:** Write each flow, starting with the guard subflow, with no optional key steps. Each asserts the screen; the wrapper asserts Firestore: `rentOwed`, `payments/{pi}`. Declines and 3DS use the test cards in Task 6.
- [ ] **Step 3:** Run on iOS (`E2EEmulator`). Expected: PASS except open defects.
- [ ] **Step 4:** Run on Android (`e2eEmulator`). Expected: same results.
- [ ] **Step 5:** Update matrix rows, including `RES-008`, `RES-009`, `OPS-031`, `BILL-001`–`008`. Commit: `test(regroup-mobile): rent and billing-state flows`.

### Task 8: Staging round trip

**Files:**

- Create: `regroup/e2e/scripts/staging-scenario.ts`, `regroup/e2e/src/payments/staging/scenarios.ts`, and `regroup/e2e/src/__tests__/stagingScenarioGuards.test.ts`

**Interfaces:**

- Produces: `npm run staging:scenario -- <name>`, names `subscribe`, `failure-grace-lapse`, `recovery`, `cancel`, `oxford`, `rent-roundtrip`. It refuses every project except `regroup-e2e` and every key but the e2e sandbox's (`assertSandboxAccount`). Real Stripe webhooks deliver; the script waits on Firestore until the status arrives or fails on a timeout, then names the Maestro flow to run.

- [ ] **Step 1:** Write the guard tests: wrong project and live key are refused. Expected: FAIL, then PASS after implementing.
- [ ] **Step 2:** Implement and run each scenario once on iOS and Android, covering `STG-001`–`004`, `XROLE-009`, and the `G` layer of `SUB-021`, `022`, `035`. Clocks need a clocked customer, so `failure-grace-lapse` uses `clockedOperator` and a checkout-created account covers `subscribe`.
- [ ] **Step 3:** Record each outcome in the matrix and the PR body. Commit: `test(regroup): staging payment round trip`.

### Task 9: Independent review, and the launch report

**Files:**

- Create: `regroup/docs/operations/payment-suite-report.md`

- [ ] **Step 1:** Dispatch an independent reviewer on the most capable model, with the spec and this catalog but not the conclusions. Ask: from how the money should move, what can still go wrong that no row covers? Add a row for each real gap and run the new tests.
- [ ] **Step 2:** Run the whole suite. Write the report: rows passing per flow, durations per suite (target for the server suite: under 20 minutes; say so if it's over), anything red with its owner, and `DEVS-008` and `DEVP-001`/`004`/`010`/`011`, which stay device checks for P7 and P9.
- [ ] **Step 3:** Run in `regroup/mobile`: `node scripts/coverage-matrix-check.js --release --exclude-kinds device --id-prefix SUB-` and the same with `RENT-`. Expected: exit 0.
- [ ] **Step 4:** Commit: `docs(regroup): payment suite report`.
