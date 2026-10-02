# Regroup Cloud Functions — Inventory

<!-- GENERATED FILE — DO NOT EDIT BY HAND.
     Regenerate with: node regroup/scripts/generate-function-inventory.js
     Verify in CI with: node regroup/scripts/generate-function-inventory.js --check -->

**Generated:** 2026-10-02
**Source commit:** `465436d` on `feat/regroup-tier-billing`
**Total functions:** 53

All functions run in the default region (us-central1); none sets `region:`.
`regroup/functions/src/init.ts` applies `setGlobalOptions({ cpu: 0.167, maxInstances: 2 })`
as a quota stopgap — see that file's comment for the constraint.

## Callable functions (`onCall`)

| Function | Source | Deployed | Secrets |
| --- | --- | --- | --- |
| `addAdminAuthorization` | `regroup/functions/src/callable/auth.ts:95` | yes | — |
| `addGuestAuthorization` | `regroup/functions/src/callable/auth.ts:51` | yes | — |
| `applyBundleDiscount` | `regroup/functions/src/callable/subscriptions.ts:628` | yes | `STRIPE_SECRET_KEY` |
| `cancelUserSubscription` | `regroup/functions/src/callable/subscriptions.ts:405` | yes | `STRIPE_SECRET_KEY` |
| `castOxfordVote` | `regroup/functions/src/callable/oxford.ts:178` | yes | — |
| `complianceExport` | `regroup/functions/src/callable/compliance.ts:362` | yes | — |
| `connectStripeAccount` | `regroup/functions/src/callable/payments.ts:405` | yes | `STRIPE_SECRET_KEY` |
| `createBillingPortalSession` | `regroup/functions/src/callable/subscriptions.ts:672` | yes | `STRIPE_SECRET_KEY` |
| `createInvitation` | `regroup/functions/src/callable/invitations.ts:78` | yes | — |
| `createOperatorSubscription` | `regroup/functions/src/callable/subscriptions.ts:173` | yes | `STRIPE_SECRET_KEY` |
| `createPaymentIntent` | `regroup/functions/src/callable/payments.ts:87` | yes | `STRIPE_SECRET_KEY` |
| `deleteAdminAuthorization` | `regroup/functions/src/callable/auth.ts:162` | yes | — |
| `disconnectStripeAccount` | `regroup/functions/src/callable/payments.ts:549` | yes | `STRIPE_SECRET_KEY, STRIPE_CLIENT_ID` |
| `findMeetings` | `regroup/functions/src/callable/meetings.ts:92` | yes | `RECOVERY_PLATFORM_API_KEY` |
| `getPaymentMethod` | `regroup/functions/src/callable/payments.ts:287` | yes | `STRIPE_SECRET_KEY` |
| `getStripeAccountStatus` | `regroup/functions/src/callable/payments.ts:650` | yes | `STRIPE_SECRET_KEY` |
| `getTierCatalog` | `regroup/functions/src/callable/getTierCatalog.ts:128` | yes | `STRIPE_SECRET_KEY` |
| `givePotentialSuperAdminPrivilege` | `regroup/functions/src/callable/auth.ts:303` | yes | — |
| `listHousePayments` | `regroup/functions/src/callable/payments.ts:240` | yes | `STRIPE_SECRET_KEY` |
| `listPayments` | `regroup/functions/src/callable/payments.ts:187` | yes | `STRIPE_SECRET_KEY` |
| `peekInvitation` | `regroup/functions/src/callable/invitations.ts:171` | yes | — |
| `promoteGuestsToAdmin` | `regroup/functions/src/callable/auth.ts:198` | yes | — |
| `reactivateOperatorSubscription` | `regroup/functions/src/callable/subscriptions.ts:347` | yes | `STRIPE_SECRET_KEY` |
| `redeemInvitation` | `regroup/functions/src/callable/invitations.ts:205` | yes | — |
| `removePrivilegesForGuests` | `regroup/functions/src/callable/auth.ts:243` | yes | — |
| `rentRoiMetrics` | `regroup/functions/src/callable/analytics.ts:98` | yes | — |
| `sendConfirmationEmail` | `regroup/functions/src/callable/subscriptions.ts:705` | yes | `SENDGRID_API_KEY` |
| `setOxfordEnabled` | `regroup/functions/src/callable/oxford.ts:41` | yes | `STRIPE_SECRET_KEY` |
| `updatePaymentInfo` | `regroup/functions/src/callable/payments.ts:315` | yes | `STRIPE_SECRET_KEY` |
| `updateSubscriptionGuests` | `regroup/functions/src/callable/subscriptions.ts:445` | yes | `STRIPE_SECRET_KEY` |
| `updateSubscriptionHouses` | `regroup/functions/src/callable/subscriptions.ts:519` | yes | `STRIPE_SECRET_KEY` |
| `userIsAtMeeting` | `regroup/functions/src/callable/meetings.ts:167` | yes | `GOOGLE_MAPS_API_KEY` |
| `verifyUserEmail` | `regroup/functions/src/callable/auth.ts:287` | yes | — |

## HTTP endpoints (`onRequest`)

| Function | Source | Deployed | Secrets |
| --- | --- | --- | --- |
| `handleStripeConnectWebhook` | `regroup/functions/src/webhooks/stripeWebhook.ts:1198` | yes | `STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET` |
| `stripeConnectReauth` | `regroup/functions/src/http/stripeConnect.ts:41` | yes | `STRIPE_SECRET_KEY` |
| `stripeConnectReturn` | `regroup/functions/src/http/stripeConnect.ts:108` | yes | `STRIPE_SECRET_KEY` |
| `stripeWebhook` | `regroup/functions/src/webhooks/stripeWebhook.ts:1002` | yes | `STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SENDGRID_API_KEY` |
| `universal` | `regroup/functions/src/http/universal.ts:12` | yes | — |

## Firestore triggers — document created

| Function | Source | Path | Secrets |
| --- | --- | --- | --- |
| `notify` | `regroup/functions/src/triggers/firestore/index.ts:33` | `/houses/{houseId}` | `SENDGRID_API_KEY` |
| `notifyNewHouseCreated` | `regroup/functions/src/triggers/firestore/index.ts:51` | `/houses/{houseId}` | `SENDGRID_API_KEY` |
| `notifyOperatorOnApplication` | `regroup/functions/src/triggers/firestore/index.ts:365` | `houses/{houseId}/applications/{appId}` | — |
| `reportBug` | `regroup/functions/src/triggers/firestore/index.ts:195` | `/bugs/{bugId}` | `SENDGRID_API_KEY` |
| `sendContactEmail` | `regroup/functions/src/triggers/firestore/index.ts:132` | `/contact/{contactId}` | `SENDGRID_API_KEY` |
| `setHouseSubscriptionStatusOnCreate` | `regroup/functions/src/triggers/firestore/index.ts:91` | `/houses/{houseId}` | — |
| `submitFeedback` | `regroup/functions/src/triggers/firestore/index.ts:223` | `/feedback/{feedbackId}` | `SENDGRID_API_KEY` |

## Firestore triggers — document updated

| Function | Source | Path | Secrets |
| --- | --- | --- | --- |
| `sendSubscriptionUpdateEmail` | `regroup/functions/src/triggers/firestore/index.ts:162` | `/users/{userId}` | `SENDGRID_API_KEY` |

## Firestore triggers — document written

| Function | Source | Path | Secrets |
| --- | --- | --- | --- |
| `onGuestWrite` | `regroup/functions/src/triggers/firestore/index.ts:261` | `guests/{guestId}` | — |

## Scheduled functions (`onSchedule`)

| Function | Source | Schedule | Secrets |
| --- | --- | --- | --- |
| `officerTermReminder` | `regroup/functions/src/scheduled/officerTermReminder.ts:131` | `0 8 * * * (UTC)` | — |
| `overdueRentNotification` | `regroup/functions/src/scheduled/overdueRentNotification.ts:70` | `0 9 * * * (UTC)` | — |
| `scheduledRentCollection` | `regroup/functions/src/scheduled/scheduledRentCollection.ts:155` | `0 10 * * * (UTC)` | `STRIPE_SECRET_KEY` |
| `updateDisputes` | `regroup/functions/src/scheduled/index.ts:34` | `0 2 * * *` | — |
| `warmWebsite` | `regroup/functions/src/scheduled/index.ts:123` | `every 5 minutes` | — |
| `weeklyTransfers` | `regroup/functions/src/scheduled/index.ts:82` | `0 8 * * 0 (UTC)` | — |

## Deployment surface

All 53 functions are re-exported from `regroup/functions/src/index.ts` and deploy.

Note: `stripeWebhook` is deployed under the name `stripeEvents` (aliased in `index.ts`).
