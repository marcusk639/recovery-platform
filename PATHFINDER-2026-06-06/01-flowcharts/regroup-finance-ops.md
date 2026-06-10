# Regroup — FINANCE / OPS / WEB Cluster Flowcharts

Pathfinder run 2026-06-06. Primary happy-path traces for the six finance/ops/web features.
Every node is labelled `Name<br/>relative/path:line` with a verified line. All paths are under
`/Users/marcus/dev/recovery-platform/regroup`.

Stripe amount convention (project-wide): **US cents, integers**. `50000` = $500.00. Dollars↔cents
conversion happens only at the UI boundary.

---

## 1. Payments & Rent (Stripe Connect)

Happy path: resident taps "Pay Now" → `createPaymentIntent` callable builds a **destination charge**
on the house's connected account (2% application fee) → returns `clientSecret` → guest confirms in
Stripe → `payment_intent.succeeded` webhook decrements `rentOwed` and FCM-notifies the guest →
receipt shareable via native share sheet.

```mermaid
flowchart TD
    UI["RentPaymentScreen.handlePayNow<br/>mobile/src/screens/RentPayment/RentPaymentScreen.tsx:92"]
    SVC["createPaymentIntent (service)<br/>mobile/src/services/payments.ts:143"]
    SVC2["createRentPaymentIntent (service, legacy)<br/>mobile/src/services/payments.ts:65"]
    CALL["createPaymentIntent (callable onCall)<br/>functions/src/callable/payments.ts:92"]
    AUTHZ["isHouseAdmin / guest.userId check<br/>functions/src/callable/payments.ts:132"]
    HOUSE["houses doc: stripeAccountId + stripeStatus==active<br/>functions/src/callable/payments.ts:111"]
    IDEM["deterministic idempotencyKey (guest-house-day)<br/>functions/src/callable/payments.ts:148"]
    STRIPECLI["createStripeClient (apiVersion 2026-01-28.clover)<br/>functions/src/util/stripe.ts:9"]
    PI["stripe.paymentIntents.create destination charge<br/>functions/src/callable/payments.ts:157"]
    FEE["application_fee_amount = 2%<br/>functions/src/callable/payments.ts:152"]
    SECRET["return clientSecret<br/>functions/src/callable/payments.ts:172"]
    CONFIRM["Guest confirms card in Stripe (client-side)"]
    WH["stripeWebhook onRequest (POST)<br/>functions/src/webhooks/stripeWebhook.ts:933"]
    SIG["constructEvent signature verify (rawBody)<br/>functions/src/webhooks/stripeWebhook.ts:958"]
    ROUTE["case payment_intent.succeeded<br/>functions/src/webhooks/stripeWebhook.ts:1003"]
    PAYDOC["upsertPaymentDoc → payments collection (status succeeded)<br/>functions/src/webhooks/stripeWebhook.ts:310"]
    DEC["guests.rentOwed FieldValue.increment(-amountCents)<br/>functions/src/webhooks/stripeWebhook.ts:330"]
    FCM["sendFcmToUser 'Payment Received'<br/>functions/src/webhooks/stripeWebhook.ts:335"]
    RCPT["shareReceipt (native Share API)<br/>mobile/src/services/receiptService.ts:65"]

    UI --> SVC2 --> CALL
    SVC -. dashboard path .-> CALL
    CALL --> AUTHZ --> HOUSE --> IDEM --> STRIPECLI --> PI
    FEE --> PI
    PI --> SECRET --> CONFIRM --> WH
    WH --> SIG --> ROUTE --> PAYDOC --> DEC --> FCM
    PAYDOC -. operator/guest can share .-> RCPT
```

**Stripe Connect onboarding (operator side, prerequisite):**

```mermaid
flowchart TD
    CSA["connectStripeAccount onCall<br/>functions/src/callable/payments.ts:360"]
    ADMIN["assertHouseAdmin<br/>functions/src/callable/payments.ts:393"]
    ACCT["stripe.accounts.create type=express<br/>functions/src/callable/payments.ts:410"]
    TX["Firestore tx writes houses.stripeAccountId, stripeStatus=pending<br/>functions/src/callable/payments.ts:437"]
    LINK["stripe.accountLinks.create account_onboarding<br/>functions/src/callable/payments.ts:472"]
    RET["stripeConnectReturn onRequest (eager sync)<br/>functions/src/http/stripeConnect.ts:86"]
    RETR["stripe.accounts.retrieve charges/payouts_enabled<br/>functions/src/http/stripeConnect.ts:111"]
    UPD["houses.update stripeStatus active/pending/restricted<br/>functions/src/http/stripeConnect.ts:136"]
    REAUTH["stripeConnectReauth onRequest (link expiry)<br/>functions/src/http/stripeConnect.ts:37"]
    CWH["handleStripeConnectWebhook → account.updated<br/>functions/src/webhooks/stripeWebhook.ts:1121"]

    CSA --> ADMIN --> ACCT --> TX --> LINK --> RET
    RET --> RETR --> UPD
    LINK -. expired link .-> REAUTH --> LINK
    RET -. authoritative reconcile .-> CWH
```

**Scheduled auto-pay (no UI):**

```mermaid
flowchart TD
    SCHED["scheduledRentCollection onSchedule '0 10 * * *' UTC<br/>functions/src/scheduled/scheduledRentCollection.ts:104"]
    QUERY["query guests autoPayEnabled==true AND rentOwed>0<br/>functions/src/scheduled/scheduledRentCollection.ts:40"]
    OFF["stripe.paymentIntents.create off_session confirm:true<br/>functions/src/scheduled/scheduledRentCollection.ts:68"]
    SCHED --> QUERY --> OFF
    OFF -. success .-> WH2["payment_intent.succeeded webhook (same as above)<br/>functions/src/webhooks/stripeWebhook.ts:1003"]
```

**External dependencies:** Stripe API (`paymentIntents`, `accounts`, `accountLinks`, `accounts.retrieve`),
**Stripe Connect** (Express accounts, destination charges with `transfer_data.destination` +
`application_fee_amount`), Firebase Auth (`request.auth`), Firestore (`houses`, `guests`, `payments`),
FCM push (`sendFcmToUser`), React Native `Share` API for receipts. Secret: `STRIPE_SECRET_KEY` via
Secret Manager. Webhook signature secret: `STRIPE_WEBHOOK_SECRET`.

**homegroups parallel:** regroup's Stripe client factory lives at `functions/src/util/stripe.ts:9`
(`createStripeClient`) — structurally mirrors homegroups' `utils/stripe.ts`. Both pin the same
`2026-01-28.clover` API version and centralise `mapStripeError`. regroup additionally implements the
**Connect destination-charge / application-fee** rent model (resident→house connected account), which
is regroup-specific vs homegroups' primary subscription billing.

---

## 2. Operator Subscriptions / Billing

Happy path: operator submits payment method + tier → `createOperatorSubscription` resolves the tier's
Stripe price → `initializeCustomer` creates a Stripe customer + subscription → writes
`subscriptionMetadata` onto the user and seeds the `subscriptions` collection → renewal invoices flow
back through `stripeWebhook` (`invoice.payment_succeeded`) to keep the `subscriptions` doc + house
statuses in sync.

```mermaid
flowchart TD
    UI["Subscription / SubscriptionHandler screens"]
    CALL["createOperatorSubscription onCall<br/>functions/src/callable/subscriptions.ts:156"]
    UIDCHK["user.id === request.auth.uid<br/>functions/src/callable/subscriptions.ts:170"]
    TIER["resolve SUBSCRIPTION_TIERS[houseType][tier]<br/>functions/src/callable/subscriptions.ts:174"]
    PRICE["priceId = process.env[tierConfig.priceEnvVar]<br/>functions/src/callable/subscriptions.ts:194"]
    INIT["initializeCustomer(email, paymentMethod, oxford, userId)<br/>functions/src/callable/subscriptions.ts:215"]
    CUST["stripe.customers.create<br/>functions/src/api/stripe.ts:47"]
    SUB["stripe.subscriptions.create<br/>functions/src/api/stripe.ts:87"]
    METADATA["build OperatorSubscription metadata<br/>functions/src/api/stripe.ts:291"]
    ENT["OperatorSubscription entity (customerId, subscriptionId, houses)<br/>functions/src/entities/OperatorSubscription.ts:1"]
    USR["updateUser subscriptionMetadata (status, tier, maxResidents)<br/>functions/src/callable/subscriptions.ts:229"]
    SEED["upsertSubscriptionDoc → subscriptions collection<br/>functions/src/callable/subscriptions.ts:246"]
    EMAIL["sendEmail admin@regroup-app.com (SendGrid)<br/>functions/src/callable/subscriptions.ts:258"]

    UI --> CALL --> UIDCHK --> TIER --> PRICE --> INIT
    INIT --> CUST --> SUB --> METADATA --> ENT
    METADATA --> USR --> SEED --> EMAIL
```

**Renewal / state reconcile via webhook:**

```mermaid
flowchart TD
    WH["stripeWebhook onRequest<br/>functions/src/webhooks/stripeWebhook.ts:933"]
    SIG["constructEvent signature verify<br/>functions/src/webhooks/stripeWebhook.ts:958"]
    IDEMP["checkAndMarkEventProcessed (dedupe)<br/>functions/src/webhooks/stripeWebhook.ts:972"]
    RT1["case invoice.payment_succeeded<br/>functions/src/webhooks/stripeWebhook.ts:1023"]
    H1["handleInvoicePaymentSucceeded<br/>functions/src/webhooks/stripeWebhook.ts:536"]
    LOOKUP["query subscriptions where stripeSubscriptionId==<br/>functions/src/webhooks/stripeWebhook.ts:551"]
    UPD["subscriptions doc update status=active, currentPeriodEnd<br/>functions/src/webhooks/stripeWebhook.ts:570"]
    HOUSES["updateHouseSubscriptionStatus(active) for operator houses<br/>functions/src/webhooks/stripeWebhook.ts:588"]
    RT2["case invoice.payment_failed<br/>functions/src/webhooks/stripeWebhook.ts:1030"]
    RT3["case customer.subscription.updated/deleted<br/>functions/src/webhooks/stripeWebhook.ts:1034"]
    CWH["handleStripeConnectWebhook (separate endpoint)<br/>functions/src/webhooks/stripeWebhook.ts:1121"]

    WH --> SIG --> IDEMP --> RT1 --> H1 --> LOOKUP --> UPD --> HOUSES
    IDEMP --> RT2
    IDEMP --> RT3
    CWH -. Connect-only events, NOT subscription billing .-> CWH
```

**External dependencies:** Stripe API (`customers`, `subscriptions`, `invoices` via webhook),
Firestore (`users`, `subscriptions`, `houses`), SendGrid email (`sendEmail`), price IDs from env vars
keyed by tier config. Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENDGRID_API_KEY`.

**Verified webhook export lines:** `stripeWebhook` at **functions/src/webhooks/stripeWebhook.ts:933**,
`handleStripeConnectWebhook` at **functions/src/webhooks/stripeWebhook.ts:1121**. Both verify the
Stripe signature against `req.rawBody` (`constructEvent`) before processing — `stripeWebhook` uses
`STRIPE_WEBHOOK_SECRET`, `handleStripeConnectWebhook` uses `STRIPE_CONNECT_WEBHOOK_SECRET`
(stripeWebhook.ts:1143). The two webhooks are split: standard account billing/subscription events go
to `stripeWebhook`; Connect platform events (`account.updated`, `account.application.deauthorized`)
go to `handleStripeConnectWebhook` (stripeWebhook.ts:1160, :1164).

**homegroups parallel:** regroup's subscription customer/subscription creation lives in
`functions/src/api/stripe.ts` (`createCustomer:47`, `subscriptions.create:87`, `initializeCustomer:306`)

- the `OperatorSubscription` entity — this mirrors homegroups' subscription module structure. Both
  seed a Firestore `subscriptions`/subscription doc so webhook handlers can resolve by
  `stripeSubscriptionId`. The mobile service `mobile/src/services/subscription.ts:10` is a thin
  `httpsCallable` wrapper (matches homegroups' callable-wrapper convention); `paywall.ts:3` is just a
  Firestore config ref.

---

## 3. Treasury (house finances)

Happy path: operator/staff opens Treasury/BalanceDashboard → reads the per-house
`financial-records` subcollection (week summaries) → creates/edits the current week record → submits
for approval → another admin approves. All amounts persisted as integer cents (post
`migrateBalanceToCents`). Pure Firestore CRUD, no Stripe.

```mermaid
flowchart TD
    UI["Treasury / BalanceDashboard screens<br/>mobile/src/screens/Treasury/, BalanceDashboard/"]
    GET["getCurrentWeekRecord (period == monday)<br/>mobile/src/services/treasury.ts:119"]
    LIST["getFinancialRecords (orderBy period desc)<br/>mobile/src/services/treasury.ts:12"]
    REF["houses/{houseId}/financial-records subcollection<br/>mobile/src/services/treasury.ts:5"]
    CREATE["createFinancialRecord (set new doc)<br/>mobile/src/services/treasury.ts:43"]
    SUBMIT["submitForApproval status=submitted<br/>mobile/src/services/treasury.ts:71"]
    APPROVE["approveRecord status=approved, approvedBy<br/>mobile/src/services/treasury.ts:86"]
    EES["getEESIncomeForWeek (ees-records aggregate)<br/>mobile/src/services/treasury.ts:165"]
    RPT["treasuryReport service (export/summary)<br/>mobile/src/services/treasuryReport.ts:1"]
    ENT["WeekSummary entity<br/>mobile/src/entities/WeekSummary.ts:1"]
    MIG["migrateBalanceToCents (one-off script, integer cents)<br/>functions/src/scripts/migrateBalanceToCents.ts:1"]

    UI --> GET --> REF
    UI --> LIST --> REF
    GET --> CREATE --> REF
    CREATE --> SUBMIT --> APPROVE
    EES --> UI
    REF --> ENT
    RPT --> UI
    MIG -. backfill .-> REF
```

**External dependencies:** Firestore only (`houses/{id}/financial-records`, `ees-records`). No Stripe,
no FCM, no email on the core path. `migrateBalanceToCents.ts` is a deploy-time script, not a function.
Amounts are integer cents (enforced by the migration). `treasuryReport.ts` builds export/summary text.

**homegroups parallel:** none structural — treasury is regroup-specific (sober-living house ledger).

---

## 4. Messaging & Notifications

Happy path: user sends a house-chat message → written to `houses/{id}/chat` subcollection → a
real-time `onSnapshot` listener delivers it to other members. Out-of-band notifications use the
notification-fan-out pattern: write a `/notifications/{id}` doc → the `notify` Firestore trigger sends
the FCM push to the recipient's registered device token.

```mermaid
flowchart TD
    UI["HouseChat / DirectChat / Notifications screens<br/>mobile/src/screens/HouseChat/, DirectChat/, Notifications/"]
    SEND["sendMessageToHouseChat → houses/{id}/chat<br/>mobile/src/services/message.tsx:65"]
    SUB["subscribeToHouseChat onSnapshot (realtime)<br/>mobile/src/services/message.tsx:115"]
    MSGENT["Message entity<br/>mobile/src/entities/Message.tsx:1"]
    DCENT["DirectConversation entity<br/>mobile/src/entities/DirectConversation.tsx:1"]
    NSVC["createNotification → notifications collection<br/>mobile/src/services/notifications.tsx:56"]
    REG["registerDeviceToken → userDeviceTokens<br/>mobile/src/services/notifications.tsx:77"]
    NENT["Notification entity<br/>mobile/src/entities/Notification.tsx:1"]
    TRIG["notify onDocumentCreated /notifications/{id}<br/>functions/src/triggers/firestore/index.ts:31"]
    SENDN["sendNotification (util)<br/>functions/src/util/notifications.ts:22"]
    FCM["admin.messaging().sendEachForMulticast<br/>functions/src/util/notifications.ts:33"]
    READ["markNotificationAsRead<br/>mobile/src/services/notifications.tsx:113"]

    UI --> SEND --> MSGENT
    SEND --> SUB --> UI
    UI --> NSVC --> NENT
    NSVC --> TRIG --> SENDN --> FCM
    REG -.token source.-> FCM
    UI --> READ
```

**External dependencies:** Firestore (`houses/{id}/chat`, `direct-messages`/`chat`, `notifications`,
`userDeviceTokens`), Firebase Cloud Messaging (`admin.messaging().sendEachForMulticast`). The chat
itself is pure Firestore realtime; push is decoupled via the `/notifications/{id}` write → `notify`
trigger fan-out. No Stripe, no email on this path.

**homegroups parallel:** none structural for chat. The `/notifications/{id}` → trigger → FCM fan-out
is a generic pattern but uses regroup's own `util/notifications.ts`.

---

## 5. Complaints / Disputes / Issues / Staff Notes

Happy path (complaint as representative): staff files a complaint → `createComplaint` writes to the
top-level `complaints` collection (and the house doc keeps a `complaints` map) → to notify staff, a
`/notifications/{id}` doc is written which triggers the `notify` FCM fan-out (shared with feature 4).
Issues, Disputes, and StaffNotes follow the same Firestore-write shape.

```mermaid
flowchart TD
    UI["Complaints / Disputes / Issues / StaffNotes screens<br/>mobile/src/screens/Complaints/, Disputes/, Issues/, StaffNotes/"]
    CC["createComplaint → complaints collection<br/>mobile/src/services/complaints.ts:10"]
    CENT["Complaint entity<br/>mobile/src/entities/Complaint.ts:1"]
    RM["removeComplaint (batch: complaints + houses map)<br/>mobile/src/services/complaints.ts:14"]
    ISS["createIssue → issues collection<br/>mobile/src/services/issues.ts:10"]
    ISSUPD["updateIssueStatus / resolveIssue<br/>mobile/src/services/issues.ts:33"]
    IENT["Issue entity<br/>mobile/src/entities/Issue.ts:1"]
    SN["addStaffNote → staffNotes collection<br/>mobile/src/services/staffNotes.ts:78"]
    SNADD["staffNotesCollection.add(payload)<br/>mobile/src/services/staffNotes.ts:101"]
    SNENT["StaffNote entity<br/>mobile/src/entities/StaffNote.ts:1"]
    DENT["Dispute entity / dispute service<br/>mobile/src/services/dispute.tsx:1"]
    NSVC["createNotification → /notifications/{id}<br/>mobile/src/services/notifications.tsx:56"]
    TRIG["notify trigger → FCM fan-out<br/>functions/src/triggers/firestore/index.ts:31"]
    RPT["reportExport (PDF/CSV export)<br/>mobile/src/services/reportExport.ts:1"]

    UI --> CC --> CENT
    CC --> NSVC --> TRIG
    UI --> ISS --> IENT
    ISS --> ISSUPD
    UI --> SN --> SNADD --> SNENT
    UI --> DENT
    CC -. delete .-> RM
    UI --> RPT
```

**External dependencies:** Firestore (`complaints`, `issues`, `staffNotes`, `disputes`, plus the
`houses` doc complaints/issues maps), the shared `/notifications/{id}` → `notify` → FCM fan-out for
staff push, `reportExport.ts` for export artifacts. No Stripe. `requireUser()` enforces an
authenticated author on staff notes (staffNotes.ts:87).

**homegroups parallel:** none structural — this is regroup-specific sober-living operations.

---

## 6. Web Marketing / Pricing Portal (Angular)

Mapped at module/route level (Angular 9 SSR). Happy path: visitor hits any route → Firebase Hosting
serves static assets, dynamic routes render through the `universal` SSR Cloud Function (`server.ts`
Express engine) → marketing/pricing pages route via the flat `app-routing.module.ts` → pricing CTA
links to `/signup` (operator subscription is completed via the shared callables in feature 2). Mobile
deep-link handoff is handled client-side by `RedirectComponent`, which reads `?url=` and attempts
custom-scheme → universal-link → app-store fallback.

```mermaid
flowchart TD
    REQ["HTTP request"]
    STATIC["express.static '*.*' (Hosting/dist assets)<br/>web/server.ts:43"]
    SSR["server.get '*' res.render via ngExpressEngine<br/>web/server.ts:51"]
    ENGINE["ngExpressEngine bootstrap AppServerModule<br/>web/server.ts:32"]
    ROUTES["Routes table (flat)<br/>web/src/app/app-routing.module.ts:33"]
    HOME["'' → ThemeTwoComponent<br/>web/src/app/app-routing.module.ts:33"]
    PRICING["'pricing' → PricingComponent<br/>web/src/app/app-routing.module.ts:39"]
    CTA["pricing CTA routerLink ['/signup']<br/>web/src/app/components/pricing/pricing-one/pricing-one.component.html:46"]
    SIGNUP["'signup' → SignupComponent<br/>web/src/app/app-routing.module.ts:52"]
    DL["'download' → DownloadPageComponent<br/>web/src/app/app-routing.module.ts:40"]
    ACCT["'my-account' → MyAccountComponent (AuthGuard)<br/>web/src/app/app-routing.module.ts:59"]
    SUBSCRIBE["'subscribe' → SubscribePageComponent<br/>web/src/app/app-routing.module.ts:41"]
    REDIR["RedirectComponent.handleRedirect reads ?url=<br/>web/src/app/components/redirect/redirect.component.ts:203"]
    SCHEME["redirectToCustomScheme (iOS/Android branch)<br/>web/src/app/components/redirect/redirect.component.ts:221"]
    LAUNCH["attemptAppLaunch (location/iframe/window.open + store fallback)<br/>web/src/app/components/redirect/redirect.component.ts:287"]

    REQ --> STATIC
    REQ --> SSR --> ENGINE --> ROUTES
    ROUTES --> HOME
    ROUTES --> PRICING --> CTA --> SIGNUP
    ROUTES --> DL
    ROUTES --> ACCT
    ROUTES --> SUBSCRIBE
    REQ -. deep-link ?url= .-> REDIR --> SCHEME --> LAUNCH
    SUBSCRIBE -. operator billing .-> CALL["createOperatorSubscription (feature 2)<br/>functions/src/callable/subscriptions.ts:156"]
```

**External dependencies:** Angular Universal SSR via `@nguniversal/express-engine`
(`ngExpressEngine`, server.ts:32), Firebase Hosting (static) + the `universal` SSR Cloud Function
(see web/CLAUDE.md), Firebase Auth (`AuthGuard` on `/my-account`), the shared `phoenix-cleanhouse`
callables for billing (`CloudFunctionService` wraps `createOperatorSubscription`, `getPaymentMethod`,
`updatePaymentInfo`, `cancelUserSubscription`, `reactivateOperatorSubscription`,
`createBillingPortalSession`). `RedirectComponent` is browser-only (guarded by
`isPlatformBrowser`, redirect.component.ts:155) and not wired into `app-routing.module.ts`.

**homegroups parallel:** the web portal's billing CTAs ultimately call the same Connect-account /
operator-subscription Stripe stack as feature 2 (`functions/src/api/stripe.ts`), which structurally
parallels homegroups' subscription module.

---

## Gaps & Notes

- **Web `redirect` not routed:** `RedirectComponent` exists (`redirect.component.ts`) but no `redirect`
  path appears in `app-routing.module.ts` — deep-link handling appears to be reached by direct
  bootstrap / a non-Angular host rather than the flat route table. Flagged, not blocking.
- **`accounts/` components** (`login`, `signup`, `reset`, `my-account`) are referenced by routes
  (lines 51, 52, 53, 59) but the directory under `components/accounts/` is the implementation home;
  the route table imports them under aliases — verified at route level only as instructed.
- **Mobile Stripe confirmation step** (card entry / `clientSecret` confirm) happens client-side after
  `createPaymentIntent` returns; `RentPaymentScreen.handlePayNow:122` branches on a legacy
  `result.paymentUrl` (WebView path) that the current callable no longer returns (payments.ts:172
  returns only `clientSecret`) — see deprecated field note at payments.ts service:29. Confirmed
  structural mismatch, surfaced as a gap for the inventory subagent.
