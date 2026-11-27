# Pathfinder 2026-11-25: Regroup + recovery-api feature inventory

Scope: `regroup/mobile/src` (M), `regroup/functions/src` (F), `regroup/web/src/app` (W), `regroup/portal/src` (P), `recovery-api/src` (RA). Base: `origin/main` at `dc6ed8d6` (#297). Excluded: `regroup/_legacy`, compiled `lib/`, `public/`, tests (counted, not read).

Phase 0 proposed 14 domain features plus 8 infra features. For Phase 1 the orchestrator merged them into **9 lanes**. Two features are merged when they share a server trigger, a Firestore document or one user flow. Splitting those would draw the same path twice. The portal (`regroup/portal`) is not a lane of its own. It bundles `regroup/mobile/src` through the `@mobile/` alias (`regroup/portal/tools/bundle.mjs:73`) and reuses or replaces mobile screens one route key at a time (`P/app/routes.tsx`). So each lane traces its own portal paths.

Layer sizes (non-test source): M 518, F 185, W 244 (with `.html`), P 81, RA 44.

## Lanes

| #   | Lane                          | Merged from                                                    | Entry points (sample)                                                                                                                                                                                                                                     | Approx files |
| --- | ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| L1  | `houses-and-operator-setup`   | F1                                                             | `F/index.ts:38` createHouses, `:39` finishOperatorSetup; `F/triggers/firestore/index.ts:25,50`; `M/navigation/navigators.tsx:189,227,342,352,376,377`; portal `HousePage`                                                                                 | ~89          |
| L2  | `identity-access-and-roles`   | F2 + F14 + infra-auth-session-claims                           | `F/callable/auth.ts:57,119,215,269,348,404,420`; `F/index.ts:37` invitations, `:28` myHouseTiers, `:59` deleteAccount; `M/navigators.tsx:170-189` (auth stack), `:366,:544`; `W/app-routing.module.ts:44-46`; `P/SignIn.tsx`, `P/session.ts`              | ~100         |
| L3  | `residents-and-admissions`    | F3 + F4                                                        | `F/triggers/firestore/index.ts:28` onGuestWrite, `:30` notifyOperatorOnApplication; `M/navigators.tsx:177,347,357,381,485-500,506`; portal `ResidentList`, `ResidentRecord`                                                                               | ~53          |
| L4  | `activities-and-disputes`     | F5 + F6                                                        | `F/triggers/firestore/index.ts:26` onActivityWritten, `:27` onGuestLinkedRestamp; `F/scheduled/index.ts:26` updateDisputes, `:56` weeklyTransfers; `M/navigators.tsx:272,344,378,383-399`                                                                 | ~72          |
| L5  | `meeting-directory`           | F7 + infra-recovery-api-gateway                                | `F/callable/meetings.ts:94,173`; `RA/callable/findMeetings.ts:178`; `RA/middleware/auth.ts:38`; `F/api/recoveryApi.ts:47`; `M/navigators.tsx:372`                                                                                                         | ~67          |
| L6  | `rent-and-resident-payments`  | F8                                                             | `F/callable/payments.ts:117-892`; `F/http/stripeConnect.ts:43,149`; `F/webhooks/stripeWebhook.ts:1942`; scheduled rentCharges, scheduledRentCollection, overdueRentNotification; `M/navigators.tsx:354,452-468,518`                                       | ~51          |
| L7  | `operator-billing`            | F9 + the billing pages of F13                                  | `F/callable/subscriptions.ts:203-767`; `F/index.ts:26` getTierCatalog; `F/webhooks/stripeWebhook.ts:1628`; `F/triggers/firestore/index.ts:90,161`; `W/app-routing.module.ts:32,34,55,61`; `M/hooks/useSubscriptionGate.ts:131`; `P/SubscriptionCheck.tsx` | ~61          |
| L8  | `oxford-and-compliance`       | F10 + F11                                                      | `F/callable/oxford.ts:45,194`; `F/scheduled/officerTermReminder.ts:131`; `F/callable/compliance.ts:373`; `F/callable/documentLinks.ts:26`; `M/navigators.tsx:368-371,427-446,474-479,512,530-538`; `P/residents/ComplianceExport.tsx`                     | ~64          |
| L9  | `messaging-and-notifications` | F12 + infra-notifications-push-email + the support half of F13 | `M/navigators.tsx:277,282,405,408,422,423,524`; `F/triggers/firestore/index.ts:35` notify, `:131` sendContactEmail, `:194` reportBug, `:222` submitFeedback; `F/util/notifications.ts:24,112,152`; `F/util/email.ts:20`; `M/services/messagingToken.ts`   | ~45          |

Not drawn as their own flowchart. They feed Phase 2 as cross-cutting concerns:

- **infra-firestore-data-layer**: `F/api/firestore.ts:13-207`, three entity models (`F/entities` 32, `M/entities` ~40, `W/entities` 33), three client state mechanisms (`M/state/slices`, `M/state/queries`, `M/context/DataContext.tsx`), rules in `regroup/mobile/firebase/firestore.rules`.
- **infra-portal-web-adapter**: `regroup/portal/src/adapter/**`, `regroup/portal/tools/{bundle,replacements,check-bundle}.mjs`. Today it is emulator-only: `adapter/firebase/emulator-config.ts:2` pins `demo-regroup-e2e`, and `tools/check-bundle.mjs:28` refuses `phoenix-cleanhouse`.
- **infra-navigation-deep-links**, **infra-logging-observability**, **infra-ui-kit**: shared plumbing. Duplication there is reported in Phase 2 only where it is material.
- **public website** (F13, marketing half): `W/themes`, `W/components/{blogs,features,faq,...}`, served by `regroup/web/functions/src/index.ts:103` (ssr). This is static content with no domain flow.

## Boundary decisions

- `F/webhooks/stripeWebhook.ts` (2,098 lines) serves both L6 (Connect, `:1942`) and L7 (`:1628`). Each lane traces only its own handler.
- `F/rent/linkIntakeRecord.ts` belongs to L3, where intake creates it, and is consumed by L6.
- `F/scheduled/weeklyTransfers.ts` belongs to L4. It is a week-stat rollover with no Stripe calls, despite its name.
- `M/screens/StatUpdates/` is split: MeetingSearch goes to L5, NewMeeting activity logging goes to L4.
- `M/services/subscription.ts:44` (createHouses) belongs to L1, even though the file sits in the subscription service.
- From Regroup's side, recovery-api is used only as the 12-step meeting directory. Grep finds Regroup calls only through `F/api/recoveryApi.ts`. Referrals and user profiles (`RA/callable/referrals.ts`, `users.ts`) have no Regroup caller.

## Phase 0 overlap leads (to be verified in Phase 2)

1. Legacy two-item billing beside tier billing in `F/api/stripe.ts` (`:115,:200,:330,:337,:353,:395`). `applyBundleDiscount` is still called by the phone (`M/services/subscription.ts:22`).
2. Three Stripe client constructions: `F/util/stripe.ts:11`, `F/api/stripe.ts:23`, `F/scheduled/scheduledRentCollection.ts:116`.
3. Paywall config read by the server (`F/util/entitlement.ts:132`) and by the phone (`M/services/paywall.ts:7`). The rules reportedly deny the client read (`entitlement.ts:107-109`).
4. The compliance export exists on the server (`F/callable/compliance.ts:373`, no client caller) and is also built on the client (`M/services/reportExport.ts`, `weeklyReportHtml.ts`).
5. `setOxfordEnabled` (`F/callable/oxford.ts:45`) has no caller. Onboarding writes `houses` directly (`M/state/mutations/oxfordOnboardingMutations.ts`).
6. Four or more FCM send paths: `F/util/notifications.ts:42,152`, `F/webhooks/stripeWebhook.ts:130`, `F/scheduled/officerTermReminder.ts:83`.
7. Two device-token stores: `users.messagingToken` (`M/services/messagingToken.ts:11`) and `userDeviceTokens` (`M/services/notifications.tsx:85-89`, no caller).
8. Two rent reminders: the client one in `M/services/notifications/rentReminder.ts` and the server one in `F/scheduled/overdueRentNotification.ts:71`.
9. Two dispute models: the server-owned one (`house-disputes`) and the legacy client `disputes` plus `scheduled/disputeUpdates.ts:21`. Two week-stat models: `week-summaries` and the legacy `guest-weeks` / `weeklyTransfers`.
10. A dead `authSlice` (`M/state/slices/authSlice.ts:41`) beside the live `userSlice.ts:204`.
11. Three mobile state mechanisms: Redux, React Query and DataContext.
12. Two client role sources: token claims (`M/util/roles.ts:26`) and the `myHouseTiers` callable (`M/services/houseTiers.ts:9`). The server's payments authority reads house-doc fields (`F/util/houseAuth.ts`).
13. Treasury and EES both touch `ees-records` (`M/services/treasury.ts`, `M/services/oxford/ees.ts:15`).
14. Portal replacements re-derive mobile logic: `HousePage` / `useHouseSummary.ts`, `ResidentList` and `ResidentRecord`, versus the phone's `HouseSummary`, `GuestList` and `GuestHome`.
15. Three `callHttpsFunction` implementations: `M/integration/rnfb-to-web.ts:158`, `regroup/mobile/firebase-setup.ts:67`, `P/adapter/firebase-setup.ts`.
16. Web callable wrappers that no UI reaches: `W/services/functions/cloud-function.service.ts` wraps 10 callables, and 3 are reachable.
17. Suspected orphans: `M/screens/HouseConfig/*`, `HouseChoreOverview/*`, `SubscriptionUpdateModal/*`, `HouseSettings/ChoreRotationSetupScreen.tsx`, `M/services/EnhancedAuthService.ts`.
