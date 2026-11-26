# L6 rent-and-resident-payments

Prefixes: `F/` = `regroup/functions/src/`, `M/` = `regroup/mobile/src/`. Money path.

## (i) Accrual → autopay → webhook ledger → resident view

```mermaid
flowchart TD
  A1["rentCharges hourly<br/>F/scheduled/rentChargeJob.ts:145"] --> A2["runRentCharges<br/>F/scheduled/rentChargeJob.ts:40"] --> A3["chargeHouse<br/>F/scheduled/rentChargeJob.ts:73"] --> A6
  A4["onGuestWrite<br/>F/triggers/firestore/guestWrite.ts:61"] --> A5["rentOnGuestWrite<br/>F/rent/guestWriteRent.ts:85"] --> A6["chargeResident transaction<br/>F/rent/chargeResident.ts:39"]
  H1["onHouseRentSettingsWrite stamps rentHouseStates<br/>F/triggers/firestore/houseRentSettings.ts:91"] --> A3
  A6 --> A7["create rentCharges, set rentAccounts<br/>F/rent/chargeResident.ts:124"] --> A8["rentOwed increment, rentDueDate<br/>F/rent/chargeResident.ts:148"] --> A9["sendNotification Rent added<br/>F/rent/chargeResident.ts:161"]
  B1["scheduledRentCollection daily<br/>F/scheduled/scheduledRentCollection.ts:343"] --> B3["query autoPayEnabled, which nothing ever writes<br/>F/scheduled/scheduledRentCollection.ts:139"]
  B3 --> B5["rentDestination lookup, status active<br/>F/scheduled/rentDestination.ts:45"] --> B6["recordRentAttempt before Stripe<br/>F/scheduled/scheduledRentCollection.ts:238"] --> B8["paymentIntents.create off_session<br/>F/scheduled/scheduledRentCollection.ts:263"]
  B8 -.-> W1["stripeEvents webhook<br/>F/webhooks/stripeWebhook.ts:1628"]
  W1 --> W2["handlePaymentIntentSucceeded<br/>F/webhooks/stripeWebhook.ts:394"] --> W3["upsert payments/piId<br/>F/webhooks/stripeWebhook.ts:507"] --> W5["transaction: rentApplied guard, rentOwed decrement<br/>F/webhooks/stripeWebhook.ts:615"] --> W6["sendFcmToUser, sendFcmToHouseAdmins, sendEmail<br/>F/webhooks/stripeWebhook.ts:651"]
  W1 --> W7["handlePaymentIntentFailed<br/>F/webhooks/stripeWebhook.ts:692"] --> W8["resolveFailedPaymentOffline, no balance change<br/>F/callable/resolveFailedPayment.ts:29"]
  W1 --> R1["handleChargeRefunded<br/>F/webhooks/stripeWebhook.ts:902"] --> R2["reverseTransfersForRefunds<br/>F/webhooks/transferReversals.ts:135"] --> R3["restoreRefundedRent<br/>F/webhooks/refundRestore.ts:14"]
  A8 --> V1["GuestHome balance card<br/>M/screens/Profile/GuestHome.tsx:506"]
  A8 --> V2["useGuestBalances, client totals<br/>M/state/queries/paymentQueries.ts:153"]
  A8 --> V3["overdueRentNotification, admins, UTC<br/>F/scheduled/overdueRentNotification.ts:71"]
```

## (ii) Operator Connect onboarding

```mermaid
flowchart TD
  O1["handleConnect<br/>M/screens/HouseSettings/StripeSettingsScreen.tsx:254"] --> O2["connectStripeAccount<br/>F/callable/payments.ts:595"] --> O3["createHouseAccount, houses stripeAccountId pending<br/>F/callable/payments.ts:688"] --> O4["accountLinks.create<br/>F/callable/payments.ts:748"]
  O4 --> O6["Linking.openURL<br/>M/screens/HouseSettings/StripeSettingsScreen.tsx:265"] --> O7["hosting rewrites connect return and refresh<br/>regroup/web/firebase.json:12"]
  O7 --> O8["stripeConnectReauth 303<br/>F/http/stripeConnect.ts:43"]
  O7 --> O9["stripeConnectReturn read-only page<br/>F/http/stripeConnect.ts:149"]
  C1["handleStripeConnectWebhook<br/>F/webhooks/stripeWebhook.ts:1942"] --> C2["handleAccountUpdated<br/>F/webhooks/stripeWebhook.ts:1353"] --> C3["houses Stripe fields, writer 1<br/>F/webhooks/stripeWebhook.ts:1425"]
  S1["fetchStatus on foreground<br/>M/screens/HouseSettings/StripeSettingsScreen.tsx:198"] --> S2["getStripeAccountStatus<br/>F/callable/payments.ts:892"] --> S3["houses Stripe fields, writer 2<br/>F/callable/payments.ts:996"]
```

## (iii) Resident one-off payment

```mermaid
flowchart TD
  P1["Pay Rent card<br/>M/screens/Profile/GuestHome.tsx:527"] --> P3["RentPaymentScreen.handlePayNow<br/>M/screens/RentPayment/RentPaymentScreen.tsx:164"]
  P2["Make a Payment card<br/>M/screens/Profile/GuestHome.tsx:558"] --> P4["ResidentPayment.handlePayment<br/>M/screens/Payments/ResidentPayment.tsx:186"]
  P3 --> P5["createRentPaymentIntent, no paymentMethodType sent<br/>M/services/payments.ts:165"]
  P4 --> P5
  P5 --> P6["createPaymentIntent<br/>F/callable/payments.ts:117"] --> P7["house active gate (inline copy)<br/>F/callable/payments.ts:149"] --> P9["cap amount at rentOwed+choreFees<br/>F/callable/payments.ts:197"] --> P10["computeApplicationFee<br/>F/util/rentFee.ts:64"] --> P11["paymentIntents.create destination charge<br/>F/callable/payments.ts:240"]
  P11 --> P13["PaymentSheet<br/>M/screens/RentPayment/RentPaymentScreen.tsx:217"] --> P14["recordRentPayment optimistic pending doc, likely denied by rules<br/>M/services/payments.ts:226"]
  P13 -.-> P16["stripeEvents webhook ledger<br/>F/webhooks/stripeWebhook.ts:615"]
  M1["recordManualPayment, client batch with rentOwed decrement<br/>M/services/payments.ts:434"]
```

## Side effects

See the lane report's table, summarized here:

- **`chargeResident`** writes in one transaction:
  - `rentCharges`
  - `rentAccounts`
  - `guests.rentOwed` and `rentDueDate`

  It then sends a push.

- **Webhook success** writes:
  - `payments/{piId}`
  - `rent-collection-attempts`
  - `guests.rentOwed` (decrement)
  - `webhookEvents`

  It then sends two pushes and an email.

- **Refund**: reverses the transfer, then increments `rentOwed` back.
- **Connect**: writes the house Stripe fields from two places, the webhook and the polling callable.
- **Stripe calls**:
  - `paymentIntents.create` and `retrieve`
  - `paymentMethods.retrieve`
  - `accountLinks.create`
  - `transfers.createReversal` and `create`
  - `charges.list` on the connected account

## Findings beyond duplication (to verify)

- **Autopay is dead.** Nothing writes `autoPayEnabled` or a guest `stripeCustomerId` (`F/scheduled/scheduledRentCollection.ts:21-22`). `updatePaymentInfo` attaches the card to the operator's own customer (`F/callable/payments.ts:522`), and no client calls it. The whole `scheduledRentCollection` job matches no one.
- **The resident's optimistic `recordRentPayment` write is probably denied.** The rule for creating `payments` requires `isAdmin` (`regroup/mobile/firebase/firestore.rules:678-681`). The error is only logged (`RentPaymentScreen.tsx:256-261`).
- **Chore fees end up in the wrong field.** Residents pay `rentOwed + choreFees`, but the webhook takes the whole amount off `rentOwed` (`F/webhooks/stripeWebhook.ts:627`). `rentOwed` goes negative and `choreFees` never falls. `rentRoiMetrics.outstandingCents` counts rent only, so it drifts.
- **ACH can't be selected.** The phone never sends `paymentMethodType` (`M/services/payments.ts:182-190`), so the server defaults to card (`F/callable/payments.ts:133`).
- **Unreachable screens:** `PaymentWebView` and `BalanceDashboard` are registered as routes but nothing navigates to them.
- **`overdueRentNotification` is loose.** It scans every guest with `rentOwed > 0` (discharged ones included) using UTC dates, and puts the resident's name in the push body.

## Within-lane duplication found

- **Stripe clients:** three are constructed in deployed code: `F/util/stripe.ts:11`, the lazy Proxy at `F/api/stripe.ts:23`, and an inline one at `F/scheduled/scheduledRentCollection.ts:116`. Three more are in scripts. All share the pin in `F/util/stripeApiVersion.ts`.
- **Writers of `rentOwed`** (refutes "chargeResident is the only writer"):
  - Accrual: `chargeResident.ts:148`
  - Transfer: `linkIntakeRecord.ts:206,215`
  - Payment: `stripeWebhook.ts:627`
  - Refund: `refundRestore.ts:37`
  - Manual payment on the client: `M/services/payments.ts:477`
  - Manager edit on the client: `M/services/guest.tsx:88`, enforced by the rules at `firestore.rules:425-449`
  - Initialization: `guestImport.ts:108`
  - Scripts
  - `F/scheduled/rentAttempts.ts:17-19` still says "no rent accrual job"; that comment is stale.
- **Destination and "active" gate:** `F/callable/payments.ts:149,270` and `F/scheduled/rentDestination.ts:45-47`, plus re-checks on the phone (`RentPaymentScreen.tsx:143`, `GuestHome.tsx:510`).
- **Amount and idempotency rules:** one-off payments use the day-bucket key and the `rentOwed + choreFees` cap. Autopay uses the in-flight attempts ledger and charges `rentOwed` only. Neither path accounts for the other, so a double payment is possible but latent while autopay is dead.
- **Two pay screens:** `RentPaymentScreen.tsx:164-288` and `ResidentPayment.tsx:186-277`. Each wraps Stripe in its own require shim. The reminder deep-links to the free-amount screen.
- **Two writers of the Connect status sync:** `F/callable/payments.ts:996-1003` and `F/webhooks/stripeWebhook.ts:1425-1431`, with different field sets. The "closed means disconnected" branch is also duplicated: `payments.ts:959-966` and `stripeWebhook.ts:1409-1423`.
- **Two webhook endpoints dispatch the same Connect events:** `account.updated` and `payout.failed` at `stripeWebhook.ts:1849,1855` and again at `:2042,2057`. They are deduplicated through the shared `claimEvent`.
- **Balance and aging are computed in four places with different definitions:**
  - `useGuestBalances`, which floors at 0 and includes chore fees
  - `PaymentDashboard.tsx:245-259`
  - `BalanceDashboard.tsx:108-113`
  - `rentRoiMetrics` (`F/callable/analytics.ts:268-281`): rent only, with no floor

  "Overdue" also has two meanings: days since the last payment, versus past `rentDueDate`.

- **Rent push senders:** four resident-facing money channels go through three senders (`sendNotification`, inline `sendFcmToUser`, and the local notifee reminder). The client reminder (`M/services/notifications/rentReminder.ts:96`) assumes a Monday due date and ignores `rentDueDate`.

## External dependencies

- L7: shared webhook infrastructure (`claimEvent`, `verifyStripeWebhook`), `sendFcmToUser`, `tierAllows` for ROI, and `api/stripe.ts`
- L2: `houseAuth`
- L3: `linkIntakeRecord` and `onGuestWrite`
- L9: senders
- Account deletion

## Gaps

- `rentAttempts.ts` from line 80 onward was not read.
- The Connect account status and lifecycle internals were not read.
- The rent period math (`anchor`, `chargeRule`, `rate`, `period`) was not read.
- The dispute-closed webhook case was not read.
