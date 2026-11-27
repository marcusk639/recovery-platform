# Regroup Cloud Functions — Inventory

<!-- GENERATED FILE. Regenerate with: node regroup/scripts/generate-function-inventory.js
     (run it from the repo root after adding, removing or renaming an export).
     No CI workflow or git hook runs the script's --check mode, so nothing catches drift:
     regenerate by hand. This copy was regenerated on 2026-11-14 and then hand-corrected
     for three generator defects listed under "Generator notes" at the end; re-apply
     those corrections after regenerating until the script is fixed. On 2026-11-27
     onUserAdminProfileSync was added by hand, and the triggers/firestore/index.ts line
     numbers moved down one with it. -->

**Generated:** 2026-11-14
**Source:** the `docs/regroup-code-doc-audit-fixes` branch (base `c1931c04` plus its code changes)
**Total functions:** 63

All functions run in the default region (us-central1); none sets `region:`.
`regroup/functions/src/init.ts` applies `setGlobalOptions({ cpu: 0.167, maxInstances: 2 })`
as a quota stopgap — see that file's comment for the constraint.

## Callable functions (`onCall`)

| Function                           | Source                                                      | Deployed | Secrets                               |
| ---------------------------------- | ----------------------------------------------------------- | -------- | ------------------------------------- |
| `addAdminAuthorization`            | `regroup/functions/src/callable/auth.ts:119`                | yes      | —                                     |
| `addGuestAuthorization`            | `regroup/functions/src/callable/auth.ts:57`                 | yes      | —                                     |
| `applyBundleDiscount`              | `regroup/functions/src/callable/subscriptions.ts:642`       | yes      | `STRIPE_SECRET_KEY`                   |
| `cancelUserSubscription`           | `regroup/functions/src/callable/subscriptions.ts:445`       | yes      | `STRIPE_SECRET_KEY`                   |
| `castOxfordVote`                   | `regroup/functions/src/callable/oxford.ts:194`              | yes      | —                                     |
| `complianceExport`                 | `regroup/functions/src/callable/compliance.ts:373`          | yes      | —                                     |
| `connectStripeAccount`             | `regroup/functions/src/callable/payments.ts:603`            | yes      | `STRIPE_SECRET_KEY`                   |
| `createBillingPortalSession`       | `regroup/functions/src/callable/subscriptions.ts:686`       | yes      | `STRIPE_SECRET_KEY`                   |
| `createHouses`                     | `regroup/functions/src/callable/houses.ts:45`               | yes      | —                                     |
| `createInvitation`                 | `regroup/functions/src/callable/invitations.ts:87`          | yes      | `SENDGRID_API_KEY`                    |
| `createOperatorSubscription`       | `regroup/functions/src/callable/subscriptions.ts:165`       | yes      | `STRIPE_SECRET_KEY, SENDGRID_API_KEY` |
| `createPaymentIntent`              | `regroup/functions/src/callable/payments.ts:116`            | yes      | `STRIPE_SECRET_KEY`                   |
| `deleteAccount`                    | `regroup/functions/src/callable/account.ts:27`              | yes      | `STRIPE_SECRET_KEY`                   |
| `deleteAdminAuthorization`         | `regroup/functions/src/callable/auth.ts:215`                | yes      | —                                     |
| `disconnectStripeAccount`          | `regroup/functions/src/callable/payments.ts:786`            | yes      | `STRIPE_SECRET_KEY, STRIPE_CLIENT_ID` |
| `findMeetings`                     | `regroup/functions/src/callable/meetings.ts:94`             | yes      | `RECOVERY_PLATFORM_API_KEY`           |
| `finishOperatorSetup`              | `regroup/functions/src/callable/finishOperatorSetup.ts:137` | yes      | —                                     |
| `getPaymentMethod`                 | `regroup/functions/src/callable/payments.ts:478`            | yes      | `STRIPE_SECRET_KEY`                   |
| `getStripeAccountStatus`           | `regroup/functions/src/callable/payments.ts:900`            | yes      | `STRIPE_SECRET_KEY`                   |
| `getTierCatalog`                   | `regroup/functions/src/callable/getTierCatalog.ts:140`      | yes      | `STRIPE_SECRET_KEY`                   |
| `givePotentialSuperAdminPrivilege` | `regroup/functions/src/callable/auth.ts:418`                | yes      | —                                     |
| `listHousePayments`                | `regroup/functions/src/callable/payments.ts:417`            | yes      | `STRIPE_SECRET_KEY`                   |
| `listPayments`                     | `regroup/functions/src/callable/payments.ts:323`            | yes      | `STRIPE_SECRET_KEY`                   |
| `myHouseTiers`                     | `regroup/functions/src/callable/myHouseTiers.ts:21`         | yes      | —                                     |
| `peekInvitation`                   | `regroup/functions/src/callable/invitations.ts:195`         | yes      | —                                     |
| `promoteGuestsToAdmin`             | `regroup/functions/src/callable/auth.ts:267`                | yes      | —                                     |
| `reactivateOperatorSubscription`   | `regroup/functions/src/callable/subscriptions.ts:349`       | yes      | `STRIPE_SECRET_KEY`                   |
| `redeemInvitation`                 | `regroup/functions/src/callable/invitations.ts:233`         | yes      | —                                     |
| `removePrivilegesForGuests`        | `regroup/functions/src/callable/auth.ts:346`                | yes      | —                                     |
| `rentRoiMetrics`                   | `regroup/functions/src/callable/analytics.ts:99`            | yes      | —                                     |
| `sendConfirmationEmail`            | `regroup/functions/src/callable/subscriptions.ts:719`       | yes      | `SENDGRID_API_KEY`                    |
| `setOxfordEnabled`                 | `regroup/functions/src/callable/oxford.ts:45`               | yes      | `STRIPE_SECRET_KEY`                   |
| `updatePaymentInfo`                | `regroup/functions/src/callable/payments.ts:506`            | yes      | `STRIPE_SECRET_KEY`                   |
| `updateSubscriptionGuests`         | `regroup/functions/src/callable/subscriptions.ts:485`       | yes      | `STRIPE_SECRET_KEY`                   |
| `updateSubscriptionHouses`         | `regroup/functions/src/callable/subscriptions.ts:559`       | yes      | `STRIPE_SECRET_KEY`                   |
| `userIsAtMeeting`                  | `regroup/functions/src/callable/meetings.ts:173`            | yes      | `GOOGLE_MAPS_API_KEY`                 |
| `verifyUserEmail`                  | `regroup/functions/src/callable/auth.ts:402`                | yes      | —                                     |

## HTTP endpoints (`onRequest`)

| Function                                | Source                                                 | Deployed | Secrets                                                                                  |
| --------------------------------------- | ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `handleStripeConnectWebhook`            | `regroup/functions/src/webhooks/stripeWebhook.ts:1918` | yes      | `STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET, STRIPE_CONNECT_TEST_WEBHOOK_SECRET`   |
| `stripeConnectReauth`                   | `regroup/functions/src/http/stripeConnect.ts:43`       | yes      | `STRIPE_SECRET_KEY`                                                                      |
| `stripeConnectReturn`                   | `regroup/functions/src/http/stripeConnect.ts:149`      | yes      | `STRIPE_SECRET_KEY`                                                                      |
| `stripeEvents` (source `stripeWebhook`) | `regroup/functions/src/webhooks/stripeWebhook.ts:1604` | yes      | `STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_TEST_WEBHOOK_SECRET, SENDGRID_API_KEY` |
| `universal`                             | `regroup/functions/src/http/universal.ts:12`           | yes      | —                                                                                        |

## Firestore triggers — document created

| Function                             | Source                                                             | Path                                    | Secrets            |
| ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------- | ------------------ |
| `notify`                             | `regroup/functions/src/triggers/firestore/index.ts:36`             | `/notifications/{notificationId}`       | —                  |
| `notifyNewHouseCreated`              | `regroup/functions/src/triggers/firestore/index.ts:51`             | `/houses/{houseId}`                     | `SENDGRID_API_KEY` |
| `notifyOperatorOnApplication`        | `regroup/functions/src/triggers/firestore/applicationNotice.ts:19` | `houses/{houseId}/applications/{appId}` | —                  |
| `reportBug`                          | `regroup/functions/src/triggers/firestore/index.ts:195`            | `/bugs/{bugId}`                         | `SENDGRID_API_KEY` |
| `sendContactEmail`                   | `regroup/functions/src/triggers/firestore/index.ts:132`            | `/contact/{contactId}`                  | `SENDGRID_API_KEY` |
| `setHouseSubscriptionStatusOnCreate` | `regroup/functions/src/triggers/firestore/index.ts:91`             | `/houses/{houseId}`                     | —                  |
| `submitFeedback`                     | `regroup/functions/src/triggers/firestore/index.ts:223`            | `/feedback/{feedbackId}`                | `SENDGRID_API_KEY` |

## Firestore triggers — document updated

| Function                      | Source                                                            | Path              | Secrets            |
| ----------------------------- | ----------------------------------------------------------------- | ----------------- | ------------------ |
| `onUserAdminProfileSync`      | `regroup/functions/src/triggers/firestore/adminProfileSync.ts:17` | `/users/{userId}` | —                  |
| `sendSubscriptionUpdateEmail` | `regroup/functions/src/triggers/firestore/index.ts:162`           | `/users/{userId}` | `SENDGRID_API_KEY` |

## Firestore triggers — document written

| Function                   | Source                                                               | Path                      | Secrets |
| -------------------------- | -------------------------------------------------------------------- | ------------------------- | ------- |
| `onActivityWritten`        | `regroup/functions/src/triggers/firestore/activityWeekSummary.ts:36` | `activities/{activityId}` | —       |
| `onGuestLinkedRestamp`     | `regroup/functions/src/triggers/firestore/guestRestamp.ts:18`        | `guests/{guestId}`        | —       |
| `onGuestWrite`             | `regroup/functions/src/triggers/firestore/guestWrite.ts:61`          | `guests/{guestId}`        | —       |
| `onHouseRentSettingsWrite` | `regroup/functions/src/triggers/firestore/houseRentSettings.ts:91`   | `houses/{houseId}`        | —       |

## Firestore triggers — document deleted

| Function         | Source                                                          | Path                | Secrets |
| ---------------- | --------------------------------------------------------------- | ------------------- | ------- |
| `onHouseDeleted` | `regroup/functions/src/triggers/firestore/houseTombstone.ts:77` | `/houses/{houseId}` | —       |

## Scheduled functions (`onSchedule`)

| Function                  | Source                                                           | Schedule           | Secrets             |
| ------------------------- | ---------------------------------------------------------------- | ------------------ | ------------------- |
| `officerTermReminder`     | `regroup/functions/src/scheduled/officerTermReminder.ts:131`     | `0 8 * * * (UTC)`  | —                   |
| `overdueRentNotification` | `regroup/functions/src/scheduled/overdueRentNotification.ts:71`  | `0 9 * * * (UTC)`  | —                   |
| `rentCharges`             | `regroup/functions/src/scheduled/rentChargeJob.ts:145`           | `5 * * * * (UTC)`  | —                   |
| `scheduledRentCollection` | `regroup/functions/src/scheduled/scheduledRentCollection.ts:333` | `0 10 * * * (UTC)` | `STRIPE_SECRET_KEY` |
| `updateDisputes`          | `regroup/functions/src/scheduled/index.ts:26`                    | `0 2 * * *`        | —                   |
| `warmWebsite`             | `regroup/functions/src/scheduled/index.ts:73`                    | `every 5 minutes`  | —                   |
| `weeklyTransfers`         | `regroup/functions/src/scheduled/index.ts:56`                    | `0 8 * * 0 (UTC)`  | —                   |

## Deployment surface

All 63 functions are re-exported from `regroup/functions/src/index.ts` and deploy.

Note: `stripeWebhook` is deployed under the name `stripeEvents` (aliased in `index.ts`).

`scripts/deploy-batched.sh` `ALL_FUNCTIONS` lists the same 63 deployed names; `functions/src/__tests__/deployList.test.ts` keeps it equal to the exports.

## Generator notes

Hand corrections applied on 2026-11-14, each a defect in `scripts/generate-function-inventory.js`:

1. **Deployed name.** The script lists the webhook by its source name `stripeWebhook`; the row above shows the deployed name `stripeEvents`.
2. **Lookahead bleed.** The script reads the 600 characters after each `export const`, so a short definition picks up the next function's options. `notify` (`onDocumentCreated('/notifications/{notificationId}', …)`, no options) came out with `notifyNewHouseCreated`'s `/houses/{houseId}` path and `SENDGRID_API_KEY`; corrected above.
3. **Trailing commas.** A multi-line `secrets: [ … , ]` array keeps its trailing comma; removed from the two webhook rows.

The line numbers are from the source above and drift with every edit; search for the symbol.
