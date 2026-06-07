# Stripe Connect Setup Guide — recovery-platform

How Stripe Connect is implemented in **homegroups** (Homegroups) and **regroup**
(Regroup), how to set each up, and the cross-cutting guidance you need to operate Connect
safely. Grounded in the actual code as of 2026-06-06 (file:line citations throughout).

> Both products use **Express** connected accounts and **destination charges**
> (`transfer_data` on a platform-owned PaymentIntent). They differ in _what_ gets paid,
> the _platform fee_, and which Firestore entity holds the account ID.

---

## 1. Connect at a glance — both products

| Dimension              | homegroups (Homegroups)                        | regroup (Regroup)                                                                        |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Account type           | Express                                             | Express                                                                               |
| Charge type            | Destination charge (`transfer_data.destination`)    | Destination charge (`transfer_data.destination`)                                      |
| What's paid            | Group donations / 7th Tradition                     | Resident rent payments                                                                |
| Platform fee           | **5%** (`PLATFORM_FEE_PERCENT = 0.05`)              | **2%** (`Math.round(amountCents * 0.02)`)                                             |
| Account ID stored on   | `groups/{groupId}.stripeConnectAccountId`           | `houses/{houseId}.stripeAccountId`                                                    |
| Onboarding entry       | `createStripeAccountLink` callable                  | `createConnectAccountLink`-style callable in `payments.ts`                            |
| Re-auth (expired link) | Web redirect re-calls the callable                  | `stripeConnectReauth` HTTP fn (`http/stripeConnect.ts`)                               |
| Connect webhook        | `stripeConnectWebhook` (in `http/stripeWebhook.ts`) | `account.updated` / `account.application.deauthorized` in `webhooks/stripeWebhook.ts` |
| Firebase project       | `recovery-connect-cad4b`                            | `phoenix-cleanhouse`                                                                  |

**Why destination charges (both apps):** the PaymentIntent is created on the _platform_
account with `transfer_data.destination` pointing at the connected account. Funds route
to the group/house, but the charge stays on the platform — so platform webhooks fire
reliably and the platform keeps a full record. This is deliberate; see
`createStripePaymentIntent.ts:96-101` (homegroups).

---

## 2. homegroups (Homegroups) — setup

**Use case:** A group admin connects a Stripe account so members can make 7th Tradition
donations to _that group_. The platform takes 5%.

### 2.1 Onboarding flow (code reality)

`functions/src/callable/createStripeAccountLink.ts`:

1. Auth: caller must be in `groups/{groupId}.admins` (or `adminUids`) — `:39-45`.
2. If `groups/{groupId}.stripeConnectAccountId` is unset, create an Express account
   with `capabilities.transfers.requested = true`, idempotency key
   `connect-acct-${groupId}` — `:50-61`.
3. Persist the account ID back to the group doc — `:63`.
4. Create an `account_onboarding` AccountLink with `collect: "eventually_due"` and
   return/refresh URLs at `https://homegroups-app.com/stripe-redirect` — `:73-79`.
5. Return `{ url }`; the client opens it for hosted onboarding.

**Re-auth:** there is no separate reauth endpoint — the `refresh_url` points back at the
same redirect page, which re-invokes `createStripeAccountLink` (the account already
exists, so step 2 is skipped and a fresh link is minted).

### 2.2 Taking a donation

`functions/src/callable/createStripePaymentIntent.ts`:

- If the group has `stripeConnectAccountId`, set
  `transfer_data.destination = stripeConnectAccountId` and
  `application_fee_amount = Math.round(amount * PLATFORM_FEE_PERCENT)` (5%) — `:98-104`.
- If not connected, the PaymentIntent stays fully on the platform — `:108-111`.
- Idempotency key = pre-generated donation document ID (prevents double-charge on
  callable retry) — `:114-119`.

### 2.3 Account status / metrics callables

- `getStripeAccountInfo` — basic account state
- `getStripeAccountDetails` — fuller detail
- `getStripeAccountMetrics` — charges/volume metrics

### 2.4 Setup checklist (homegroups)

- [ ] In Stripe Dashboard → **Connect → Settings**, enable **Express** accounts.
- [ ] Set the Connect **branding** (business name, icon, brand color) — shown on the
      hosted onboarding page.
- [ ] Confirm the platform's `transfers` capability is active.
- [ ] Set secrets in the `recovery-connect-cad4b` project:
      `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (and the Connect webhook secret if
      separate). Use `/firebase-env-sync` or
      `firebase functions:secrets:set --project recovery-connect-cad4b`.
- [ ] Register the **Connect webhook** endpoint (`stripeConnectWebhook`) in Stripe and
      subscribe to `account.updated`, `account.application.deauthorized`, plus the
      `payment_intent.*` events you process.
- [ ] Verify `https://homegroups-app.com/stripe-redirect` resolves (return/refresh URL).
      ⚠️ If you move off that domain, update `createStripeAccountLink.ts:75-76`.
- [ ] Test onboarding end-to-end with a Connect **test** account before going live.

---

## 3. regroup (Regroup) — setup

**Use case:** A sober-living **house** connects a Stripe account so residents can pay
rent to that house. The platform takes 2%. Also supports **scheduled** auto rent
collection.

### 3.1 Onboarding flow (code reality)

`functions/src/callable/payments.ts` → **`connectStripeAccount`** (~`:360-484`):

1. Load the house; read existing `house.stripeAccountId`.
2. If absent, create an Express account (`:410-411`), then persist the new ID inside a
   **Firestore transaction** (`:424-438`) so two concurrent onboarding calls can't create
   two accounts — the transaction re-checks `current.stripeAccountId` and reuses it if a
   racing call already wrote one.
3. Create an `account_onboarding` AccountLink (`:472-476`) whose refresh URL is
   `${hostedBaseUrl}/stripeConnectReauth?stripeAccountId=${stripeAccountId}` (`:467`).

**Re-auth endpoint:** `functions/src/http/stripeConnect.ts` exports `stripeConnectReauth`
— when an AccountLink expires before the operator finishes, Stripe redirects here with
`?stripeAccountId=`; it mints a fresh `account_onboarding` link and redirects back
(`:40-63`). Missing param → 400.

### 3.2 Taking rent (destination charge)

`functions/src/callable/payments.ts` `createPaymentIntent` (~`:79-164`):

- **Guard:** rejects unless `house.stripeAccountId` set AND `house.stripeStatus === "active"` (`:122`).
- `transfer_data.destination = house.stripeAccountId`, `application_fee_amount` = 2% (`:163-164`).

**Reading a house's payments** acts _as_ the connected account via the `stripeAccount`
request option: `stripe.charges.list({...}, { stripeAccount: house.stripeAccountId })`
(`listPayments` `:204`, `listHousePayments` `:255`). _(Lists charges, not PaymentIntents.)_

**Scheduled rent collection** (`scheduled/scheduledRentCollection.ts:79-80`): same
destination-charge shape, `transfer_data.destination = guest.stripeConnectId`, 2% fee.

### 3.3 Connect webhook handlers

`functions/src/webhooks/stripeWebhook.ts`:

- `account.updated` (`:823-837`, dispatched `:1055/1168`) → `findHouseByStripeAccountId`
  then sync `charges_enabled` / `payouts_enabled` onto the house (this is what flips
  `stripeStatus` to `active`).
- `account.application.deauthorized` (`:1095-1121`, dispatched `:1172`) → marks the
  house's Stripe account disconnected.
- `findHouseByStripeAccountId` queries `houses where stripeAccountId == accountId`
  (`:117-124`).

> **Known Gap (subscription billing, not Connect onboarding):** the `subscriptions`
> Firestore collection is **read** by five webhook paths (`resolveOperatorUid`
> fallback `:160`, `invoice.payment_succeeded` `:559`, `invoice.payment_failed`
> `:633`, `customer.subscription.deleted` `:704`, `customer.subscription.updated`
> `:760`) but **written by nothing** — there is no `customer.subscription.created`
> handler and `createOperatorSubscription` only writes `users/{uid}.subscriptionMetadata`.
> Consequence: webhook-driven status changes (past-due FCM alerts, renewal period
> updates, house status propagation on `subscription.updated`) never fire; only the
> synchronous purchase-time path works. The Stripe subscription carries only
> `metadata.userId` (`api/stripe.ts:103,139`) — **not** `houseId` or `guestCount` —
> so a `.created` handler cannot fully populate `SubscriptionDoc` (`houseId`,
> `guestCount`) from the event alone. Closing this requires a design decision on how
> the `subscriptions` collection gets seeded. _Note: this is subscription billing,
> separate from the Connect destination-charge flow, which works correctly._

### 3.4 Setup checklist (regroup)

- [ ] **Unblock the build first** — functions currently must compile cleanly; verify
      `cd regroup/functions && npx tsc --noEmit` passes before deploying Connect changes.
- [ ] Enable **Express** accounts in the `phoenix-cleanhouse` Stripe Dashboard.
- [ ] Set secrets in `phoenix-cleanhouse`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- [ ] Confirm `hostedBaseUrl` (used for reauth/return URLs) points at the live Functions
      host; deploy `stripeConnectReauth`.
- [ ] Register the webhook endpoint and subscribe to `account.updated`,
      `account.application.deauthorized`, `payment_intent.succeeded`,
      `payment_intent.payment_failed`, `charge.dispute.created`, `payout.failed`,
      `invoice.payment_succeeded`, `invoice.payment_failed`,
      `customer.subscription.updated`, and `customer.subscription.deleted`
      (`:1011-1059`). These are the events the handler currently switches on.
      ⚠️ **`customer.subscription.created` is NOT handled** — and nothing else
      writes the `subscriptions` collection, so the `subscription.updated` /
      `subscription.deleted` / `invoice.*` handlers (which look a sub doc up by
      `stripeSubscriptionId`) currently early-return "subscription not found". See
      the Known Gap note in §3.3.
- [ ] Verify a house only becomes chargeable after `account.updated` flips
      `stripeStatus = "active"` — the `createPaymentIntent` guard depends on it.
- [ ] Test the full cycle on a Connect test account: onboard → `account.updated` →
      `stripeStatus active` → resident rent PaymentIntent → payout.

---

## 4. Cross-cutting Connect guidance (read this regardless of app)

### 4.1 Charge type & fees

- Both apps use **destination charges**. Keep it that way unless you have a strong reason
  — switching to direct charges (`{ stripeAccount }` on _create_) moves the charge,
  disputes, and webhook delivery onto the connected account and changes your liability
  and reporting model.
- `application_fee_amount` is always **integer cents**. Compute with `Math.round(...)`
  (both apps do). Never send a float.
- Fees differ on purpose: homegroups 5% (donations), regroup 2% (rent). If you unify the
  platform fee later, change it in one place per app (`PLATFORM_FEE_PERCENT` /
  the `0.02` literal) and add a test.

### 4.2 Idempotency (mandatory)

- **Account creation:** always pass an idempotency key tied to the entity
  (`connect-acct-${groupId}`), or wrap the create + persist in a Firestore transaction
  (regroup's pattern). Without this, a retried onboarding call creates a _second_ Stripe
  account and silently splits funds.
- **PaymentIntent creation:** key off the pre-generated payment/donation doc ID so a
  client retry can't double-charge.

### 4.3 Webhooks

- **Verify the signature** (`stripe.webhooks.constructEvent`) before touching the
  payload — never trust an unverified webhook. Both apps already do.
- **Connect events arrive with a `stripe-account` header / `event.account`** identifying
  the connected account. homegroups reads `req.headers["stripe-account"]`
  (`stripeWebhook.ts:82`); regroup looks the house up by `stripeAccountId`. Connected-
  account events and platform events may need _separate_ registered endpoints/secrets in
  Stripe — confirm which secret verifies which stream.
- The connected-account's **`account.updated`** is the source of truth for "can this
  group/house accept money yet." Gate charging on `charges_enabled` (regroup gates on the
  derived `stripeStatus === "active"`).

### 4.4 Capabilities & onboarding

- Express + `transfers` capability is the minimum for receiving destination-charge
  payouts. If you ever take **direct** charges on the connected account you'd also need
  `card_payments`.
- Use `collect: "eventually_due"` (homegroups) so onboarding only asks for what Stripe
  needs now; the rest is collected as thresholds are hit.
- AccountLinks **expire quickly** (minutes). You must be able to mint a fresh one —
  homegroups via the return/refresh page re-calling the callable; regroup via the
  dedicated `stripeConnectReauth` endpoint. Don't store and reuse an AccountLink URL.

### 4.5 Secrets & config

- Per the monorepo rule: **no secrets in source**. Connect uses the same
  `STRIPE_SECRET_KEY` as the rest of each app, set via Firebase Secret Manager per
  project. Webhook signing secrets (`STRIPE_WEBHOOK_SECRET`, and a separate Connect one
  if you split endpoints) go there too.
- Publishable keys (`pk_*`), price IDs (`price_*`), and product IDs (`prod_*`) are **not
  secret** — they live in `.env`/config and are safe client-side.
- Each Stripe **product needs a default price** or `getDefaultPriceForProduct()` throws
  at runtime (homegroups). This bites Connect indirectly: if a group's subscription
  product has no default price, the admin can't get far enough to onboard for donations.

### 4.6 Testing

- Use Stripe **test mode** + test connected accounts. Stripe provides test onboarding
  that auto-fills verification.
- Drive `account.updated` in test by completing/incompleting onboarding and confirm your
  Firestore status field flips correctly.
- For destination charges, verify in the Dashboard that the **transfer** to the connected
  account and the **application fee** both appear on a successful PaymentIntent.

### 4.7 Common failure modes

| Symptom                                     | Likely cause                                                                         | Where                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Funds land on platform, not the group/house | `stripeConnectAccountId`/`stripeAccountId` unset when PaymentIntent created          | hg `createStripePaymentIntent.ts:98`; rg `payments.ts:122` |
| `createPaymentIntent` throws for a house    | `stripeStatus !== "active"` (onboarding incomplete / `account.updated` not received) | rg `payments.ts:122`                                       |
| Duplicate connected accounts for one entity | missing idempotency key / no transaction on create+persist                           | hg `:60`; rg `:424-438`                                    |
| Onboarding link "expired"                   | reused a stale AccountLink instead of minting fresh                                  | rg `http/stripeConnect.ts`; hg refresh page                |
| Webhook 400 / not processing                | wrong signing secret for the Connect vs platform stream                              | both `stripeWebhook`                                       |
| Double charge on flaky network              | no idempotency key on PaymentIntent create                                           | hg `:114-119`                                              |

### 4.8 PII / compliance

- Connect onboarding collects bank + identity data — Stripe holds it; do **not** mirror
  SSNs, bank numbers, or verification docs into Firestore or logs.
- Never log the connected account's payout details or a donor/resident's payment
  identifiers. Log the account _ID_ and event _type_ only (both apps already scope logs
  this way).

---

## 5. Quick reference — file map

| Concern                      | homegroups                                       | regroup                                                    |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Onboard / AccountLink        | `callable/createStripeAccountLink.ts`            | `callable/payments.ts` → `connectStripeAccount` (~360-484) |
| Reauth expired link          | (return/refresh page → callable)                 | `http/stripeConnect.ts` (`stripeConnectReauth`)            |
| Take payment (dest. charge)  | `callable/createStripePaymentIntent.ts:96-104`   | `callable/payments.ts:118-164`                             |
| Scheduled collection         | —                                                | `scheduled/scheduledRentCollection.ts:79-80`               |
| Read connected-acct payments | `callable/getStripeAccount*`                     | `payments.ts:206,257` (`{ stripeAccount }`)                |
| Connect webhook              | `http/stripeWebhook.ts` (`stripeConnectWebhook`) | `webhooks/stripeWebhook.ts:823,1095`                       |
| Account-status field         | `groups.stripeConnectAccountId`                  | `houses.stripeAccountId` + `stripeStatus`                  |
| Disconnect                   | —                                                | `util/stripe.ts` (idempotent)                              |
