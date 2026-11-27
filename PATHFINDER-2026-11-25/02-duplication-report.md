# 02 Duplication report: Regroup + recovery-api

Inputs:

- the nine Phase 1 flowcharts (`01-flowcharts/L1`–`L9`)
- a within-feature agent that re-checked every within-lane claim against source
- a cross-feature agent that compared lanes
- an independent verifier that re-derived the 14 highest-cost defect claims

Every claim below cites at least two `path:line` locations.

Prefixes: F = `regroup/functions/src`, M = `regroup/mobile/src`, P = `regroup/portal/src/app`, W = `regroup/web/src/app`, RA = `recovery-api/src`, R = `regroup/mobile/firebase/firestore.rules`.

Context that sets severity: `regroup/CLAUDE.md` says Regroup has **no live users** (owner, 2026-11-10). Every finding here is a launch risk, and none needs a data backfill.

## Part A: Cross-feature duplicated concerns

Verdicts:

- **ACCIDENTAL**: the copies diverged for no stated reason, so they should be unified.
- **LEGIT**: specialization by trust model, runtime or product boundary, so the copies stay.
- **MIXED**: some copies are legitimate and the rest are accidental.

Impact:

- **live**: wrong behaviour today.
- **latent**: wrong only under conditions that don't hold yet.

| #   | Concern                                    | Lanes            | Locations                   | Verdict                         | Impact today                                                   |
| --- | ------------------------------------------ | ---------------- | --------------------------- | ------------------------------- | -------------------------------------------------------------- |
| C2  | House staff and authority resolution       | L2 L4 L6 L8 L9   | 8+                          | ACCIDENTAL                      | **live**                                                       |
| C1  | Push and notification sending              | L4 L6 L7 L8 L9   | 4 senders + 2 inbox writers | ACCIDENTAL                      | **live**                                                       |
| C5  | "Current resident" definitions             | L1 L3 L6 portal  | 9+                          | ACCIDENTAL                      | **live**                                                       |
| C13 | Occupancy and capacity counters            | L3 L7            | 6                           | ACCIDENTAL                      | **live** (house search vacancy), latent (plan cap never frees) |
| C12 | Compliance rules and report builders       | L4 L8            | 4                           | ACCIDENTAL                      | **live**                                                       |
| C6  | Balance / owed / overdue maths             | L1 L6 portal     | 3 independent               | ACCIDENTAL                      | **live** (server figure)                                       |
| C10 | Client writes to server-sensitive docs     | L1 L3 L4 L6 L9   | 15+ sites                   | MIXED                           | **live**                                                       |
| C4  | Week, date and timezone maths              | L4 L6 L8         | 9+                          | ACCIDENTAL (phone mirror LEGIT) | latent                                                         |
| C3  | Subscription entitlement ladder            | L1 L7 portal     | 3                           | MIXED                           | latent                                                         |
| C15 | Portal re-derives phone logic              | L1 L2 L6 L8      | 7                           | MIXED                           | live (small)                                                   |
| C8  | Domain entities in 3 packages; wire types  | all              | 3 + 2                       | MIXED                           | latent                                                         |
| C14 | Dead legacy parallel models still deployed | L2 L3 L4 L7 L9   | 8+                          | ACCIDENTAL                      | none or latent                                                 |
| C7  | Stripe client construction                 | L6 L7            | 3 + 2 memoizers             | ACCIDENTAL                      | none                                                           |
| C9  | Geohash and distance helpers               | L3 L5            | 4                           | ACCIDENTAL (RA LEGIT)           | none                                                           |
| C11 | Callable invocation wrappers               | L1 L7 portal web | 4                           | LEGIT                           | none                                                           |

### C2. House staff and authority resolution: ACCIDENTAL, live

Which uids are staff of a house? Five sources answer that question today.

- **House-doc id fields compared against a uid:**
  - `F/util/houseAuth.ts:15-22` (`isHouseAdmin`)
  - `:46-54` (`isHouseMoneyStaff`, with a `house-roles` fallback)
  - `:72-89` (`checkIsMember`)
  - `F/util/notifications.ts:168-177` (`sendFcmToHouseAdmins`)
  - `F/activities/disputeNotifications.ts:104-108`
  - `M/hooks/useTreasuryRole.ts:35-37`
- **Role records:** `staffUids` (`F/util/houseRoleStore.ts:98-110`), used by `F/triggers/firestore/applicationNotice.ts:33-35`.
- **Live claims:** `claimsHouseAdminCheck` (`F/activities/activityTrust.ts:89-103`), used by `syncWeekSummary.ts:137`. This is a different function from `houseAuth.isHouseAdmin`, which closes the L2 gap.
- **Token claims:** `assertHouseMemberFromClaims` (`F/util/houseAuth.ts:98-112`).

`adminIds` and `superAdminIds` hold **admin-record ids** from `createAdminId()`, not uids. The house doc is built with them at `F/houses/houseInput.ts:113-114`; `regroup/functions/CLAUDE.md:250` says the same. Only `ownerId` and `superAdminId` are uids.

Why it diverged: role records came later (invitations, #145). The money path was patched with a records fallback; the notification and treasury paths were not.

Verified impact:

- Pushes for rent, payouts and disputes reach the **owner only**. Invited managers, peer leaders and co-owners are missed, because their uids exist only in `house-roles`.
- `useTreasuryRole` is false for everyone on a new house.

The split between claims (fast path) and records (grants) is a legitimate trust-model choice. Comparing id fields to uids is not.

### C1. Push sending: ACCIDENTAL, live

| Sender                                                                                                                                   | Payload                                           | Inbox doc         | Stale-token pruning |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------- | ------------------- |
| `sendNotification` `F/util/notifications.ts:24-63` (via `notify` `F/triggers/firestore/index.ts:35`, and `F/rent/chargeResident.ts:161`) | `notification` + channel + `data.notifee`         | via `notify` only | yes, `:65-107`      |
| `sendFcmToHouseAdmins` `F/util/notifications.ts:152-235`                                                                                 | `notification` + channel, no `notifee`            | no                | no                  |
| `sendFcmToUser` `F/webhooks/stripeWebhook.ts:116-146` (8 call sites)                                                                     | `notification` only; logs the raw token at `:135` | no                | no                  |
| `F/scheduled/officerTermReminder.ts:83-123`                                                                                              | `notification` + `data`, no channel or `notifee`  | no                | yes, a second copy  |

The server also writes inbox docs directly at `F/activities/disputeNotifications.ts:131-144` and `F/triggers/firestore/applicationNotice.ts:40`. All four senders read the same token store, `users.messagingToken`.

Why it diverged: callers wanted pushes for a house-level recipient set with no inbox doc, so each one added a private sender.

Impact:

- Probably silent in the Android foreground on three of the four paths. `M/services/notifications/remoteMessage.ts:45-48` needs `notifee`; this is inferred from code and was not tested on a device.
- Stale tokens are never pruned on two paths.
- A raw token is logged.
- Stripe and rent pushes never appear in the inbox.
- Resident names appear in push bodies: `F/webhooks/stripeWebhook.ts:658-662` and `F/triggers/firestore/applicationNotice.ts:44`.

A dead second token store also exists: `userDeviceTokens` (`M/services/notifications.tsx:85-98`). It has no caller and is touched only by `F/accountDeletion/personalData.ts:98`.

### C5. "Current resident": ACCIDENTAL, live

| Definition                                                   | Where                                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status absent or `active`, and no `moveOutDate` (allow-list) | `F/util/guestMembership.ts:100-102`, the server authority                                                                                                                    |
| Status absent or `active` (ignores `moveOutDate`)            | `F/callable/analytics.ts:264-266`                                                                                                                                            |
| No filter at all                                             | `F/scheduled/overdueRentNotification.ts:29-36`, which pushes about discharged residents                                                                                      |
| Not `discharged` and not `archived`                          | `M/util/paymentDisplay.ts:52-53`, `P/houses/summary.ts:71-73` (a copy)                                                                                                       |
| Not `discharged` only                                        | `M/screens/GuestList/GuestList.tsx:211-217`, `M/hooks/useDefaultGuestSelection.ts:12`, `M/util/house.tsx:165`, `P/residents/rows.ts:21-22`, `P/houses/useHouseSummary.ts:80` |

The portal contradicts itself: `summary.ts:73` excludes `archived`, but `useHouseSummary.ts:80` does not. The clients count `inactive`, `expelled` and moved-out residents, which the server excludes.

### C13. Occupancy counters: ACCIDENTAL, live

- **`house.currentCapacity`, a client-maintained counter.**
  - Increased at `M/services/guest.tsx:258` and decreased at `:293`.
  - Discharge (`:360-365`) and CSV import (`M/services/guestImport.ts:98-122`) never change it, so it drifts.
  - The vacancy display reads it: `M/screens/IntroHouseSummary/IntroHouseSummary.tsx:225,521`.
  - `M/screens/Oxford/EESTracker.tsx:59-66` deliberately avoids it.
  - Both client writers rewrite the whole house doc from a stale read (`guest.tsx:257-259,291-298`).
- **`subscriptionMetadata.houses[h].numberOfGuests`, the plan counter.**
  - Increased by `recordResidentAccepted` (`F/util/residentCapacity.ts:110-127`).
  - The only decrement is in `updateSubscriptionGuests` (`F/callable/subscriptions.ts:577-586`), which has no client caller. The plan resident cap therefore only ever fills.
- **Two cap checks.** `residentCapacity.ts:57-100` is live and counts pending invites. `withinResidentCap` (`F/util/tierCaps.ts:7-10`) is used only by the dead `updateSubscriptionGuests`. Both read a persisted `maxResidents` snapshot (`F/webhooks/syncOperatorTier.ts:33-38`) instead of the tier config.

### C12. Compliance rules and reports: ACCIDENTAL, live

- **Week pass/fail rules in three places:**
  - the canonical per-phase rule `checkPhaseCompliance` (`M/util/compliance.ts:51-80`)
  - a re-implementation at `M/services/weeklyReportHtml.ts:19-26,62-77`
  - a hard-coded, phase-blind rule at `M/services/reportingService.ts:139-140` (`meetingsAttended >= 3`, `choresCompleted > 0`)
- **Two compliance exports:**
  - The server `complianceExport` (`F/callable/compliance.ts:373`) is tier-gated and owner-only, and includes drug tests and the dispute history. **No UI calls it.**
  - The client weekly PDF (`M/services/reportExport.ts:26`) is the only one users can reach, from `M/screens/Profile/GuestHome.tsx:381` and `P/residents/ComplianceExport.tsx:36`. It has no tier gate and contains no drug tests or disputes.
- `M/services/oxford/charterCompliance.ts:197-247` is Oxford charter scoring, a different concept, so it is **not** a duplicate. This corrects L8.

### C6. Balances: ACCIDENTAL, live

There are three independent definitions:

- `owedNowCents` (`M/util/paymentDisplay.ts:56-57`): floored at 0, rent plus chore fees. `PaymentDashboard.tsx:250-252` already uses it.
- The portal copy `owedNow` / `rentOverdue` (`P/houses/summary.ts:77-98`).
- The server's `rentRoiMetrics` (`F/callable/analytics.ts:268-281`): rent only, no floor, so credits cancel out other residents' debt.

`useGuestBalances` (`M/state/queries/paymentQueries.ts:180-181`) is an inline copy, but its only consumer is the unreachable `BalanceDashboard`.

A related, verified defect: the webhook subtracts the whole payment from `rentOwed` only (`F/webhooks/stripeWebhook.ts:625-627`), even though the cap allows paying `rentOwed + choreFees` (`F/callable/payments.ts:197,205`). As a result `choreFees` never goes down and `rentOwed` goes negative. Totals that add the two together are still right; the split between them is wrong.

### C10. Client writes to server-sensitive docs: MIXED, live

- **`guests` is written from 9 or more client sites with no shared helper:**
  - `M/services/guest.tsx:137,260,267,334,360`
  - `M/services/guestImport.ts:99`, which does its own email regex and does not lowercase emails
  - `M/services/phaseAdvancement.ts:158`, with no server check
  - `M/services/users.tsx:303`
  - `M/services/payments.ts:476`
- **`rentOwed` has three mechanisms for applying a payment:**
  - the webhook: a transaction plus a `rentApplied` marker (`F/webhooks/stripeWebhook.ts:615-641`)
  - the client's manual payment: a batch with no marker (`M/services/payments.ts:474-479`)
  - refund restore: a transaction with a cumulative marker (`F/webhooks/refundRestore.ts:20-41`)
- **Claim revoke on discharge happens twice:**
  - The client calls `M/services/guest.tsx:383-386` → `F/callable/auth.ts:348`.
  - The `onGuestWrite` trigger also revokes (`F/triggers/firestore/guestWrite.ts:126-129,198`).
  - For an accountless resident the client call fails schema validation (`F/callable/auth.ts:43-48`), and the UI shows a misleading "contact support" alert (`M/screens/Profile/DischargeGuestModal.tsx:43-46`). Verified as PARTIAL.

Client-owned data (activities, chat, issues) written by clients is the app's model, so that part is LEGIT.

### C4. Week, date and timezone maths: ACCIDENTAL, latent

The authoritative function is `weekStartFor` (`F/activities/weekSummaryMath.ts:113`): house timezone, week starts Monday. Rent also imports it (`F/rent/anchor.ts:6`, `chargeRule.ts:5`, `period.ts:5`, `rate.ts:2`).

**LEGIT mirror:** `getWeekStart` (`M/hooks/activity/useCurrentWeek.ts:35-40`), which is documented as having to match the server. However, `isInCurrentWeek`, `getPreviousWeek` and `getNextWeek` in the same file (`:117-151`) call it **without a timezone**, so they default to New York.

ACCIDENTAL copies:

- **UTC Monday:**
  - `F/util/week.ts:33` → `guest.currentWeekStartDate` (`F/util/guest.ts:64`)
  - `F/triggers/firestore/guestWrite.ts:216` (`isoWeekStartUtc`)
  - `M/services/oxford/ees.ts:80-90`
- **Local Monday sliced to a UTC date:**
  - `M/services/treasury.ts:131-135` and `:153-157`
  - `M/screens/Treasury/FinancialRecordForm.tsx:55-61`

  In a US evening the resulting date can fall on a Tuesday.

- **Device-local week starting Sunday:**
  - `M/util/display.tsx:166-207`, which is live through `M/util/guest.tsx:178-179`
  - `M/util/dateWithTimezone.ts:38-47`, whose only consumers are orphans
- **Chore-rotation Sunday:** `M/services/choreRotation.ts:14` and `M/hooks/useAutoAdvanceRotation.ts:7`, which are identical.
- **Overdue rent and ROI use a UTC "today":** `F/scheduled/overdueRentNotification.ts:22-24` and `F/callable/analytics.ts:274`. Rent writes `rentDueDate` as a house-local date.
- `buildWeekId` (`F/util/week.ts:12`) produces the same output as `summaryDocId` (`F/activities/weekSummaryMath.ts:161`).
- **Two live `useWeekSummary` hooks** on the same docs: React Query `M/state/queries/activityQueries.ts:199` and `onSnapshot` `M/hooks/activity/useWeekSummary.ts:40`.

### C3. Entitlement ladder: MIXED, latent

There are three copies:

- the server, `F/util/entitlement.ts:40-76`
- the phone, `M/hooks/useSubscriptionGate.ts:90-111`
- the portal, `P/houses/summary.ts:50-64`, whose comment says it "mirrors evaluateHouseAccess"

The server is the security boundary and fails closed. On absent status the phone shows `pending` (a deliberate UX choice, `useSubscriptionGate.ts:80-88`) where the server denies. That difference is **LEGIT**.

What is ACCIDENTAL is the portal hand-copy, plus a drift between the server and both clients over grace:

- The server allows grace only for `past_due` (`entitlement.ts:60-67`).
- The phone and portal allow grace for **any** status other than active or trialing when `guestGraceEndsAt` is in the future (`useSubscriptionGate.ts:104-107`, `summary.ts:61-62`). That covers `canceled`, `unpaid` and unknown statuses.

The client creation gate (`M/services/setup-plan-gate.ts:13`) agrees with the server (`F/houses/createHousesTx.ts:46-51` together with `entitlement.ts:195-198`). This corrects L1.

### C15. Portal re-derivation: MIXED, live (small)

`P/houses/summary.ts` copies several phone helpers:

- `subscriptionStateOf` (`:50`)
- `isCurrentResident` (`:73`)
- `owedNow` (`:77`)
- `rentOverdue` (`:89`)
- `houseHealth` (`:111`), which returns null where the phone's `M/util/house.tsx:150-162` returns 0
- `applicationsWaiting` (`:108`)

`isStaffRole` (`P/access.ts:13`) is the same as `isAdmin` (`M/util/roles.ts:35-36`).

The stated cause is that the portal's vitest cannot load phone modules (`summary.ts:71-72`). That is a build-tooling limit, so the cause is LEGIT, but the resulting drift is accidental.

### C8. Entities: MIXED, latent

- Guest and House are each declared in three packages: `F/entities/Guest.ts:11-16`, `M/entities/Guest.tsx:8-13`, `W/entities/Guest.ts:54,80`. The defaults differ. For example, `subscriptionStatus` defaults to `""` in `F/entities/House.ts:90` and is undefined in `M/entities/House.tsx:91`.
- The meeting type uses two spellings: `'CUSTOM'` in `F/entities/Meeting.ts:3` and `F/util/directoryMapping.ts:30`, versus `'Custom'` in `M/entities/Meeting.tsx:22`.
- There is no shared package (root `CLAUDE.md`).
- `DirectoryMeeting` is declared in both `F/entities/DirectoryMeeting.ts:24` and `RA/entities/DirectoryMeeting.ts:31`. This is **LEGIT**: a wire type across a product boundary.

### C14. Dead legacy parallel models: ACCIDENTAL

- Legacy disputes:
  - the daily `updateDisputes` (`F/scheduled/index.ts:26`, `F/util/disputes.ts:181-307`)
  - the client `challengeDispute` → `M/services/dispute.tsx:24` (button hidden)
  - `houses.disputes`, mirrored by `F/activities/houseDisputeMirror.ts:245,256`
- `guest-weeks` (`F/api/firestore.ts:16`, no importer).
- Legacy two-item billing (`F/api/stripe.ts:38,115,176,287,298,330,337,395,423,487`). The unreachable block `F/callable/subscriptions.ts:336-390` sits behind `:219`.
- `userDeviceTokens`.
- The root `issues` and `complaints` helpers (`M/services/issues.ts:17`, `M/services/complaints.ts:15,19`).
- Dead Redux state:
  - `authSlice` (`M/state/slices/authSlice.ts:41`, registered at `M/state/store.ts:36`)
  - `notificationsSlice`
  - `guestsSlice.guests` (`M/state/slices/guestsSlice.ts:6-65`)
- Orphan screens: `M/screens/{HouseConfig,HouseChoreOverview,SubscriptionUpdateModal,CreateGuest,GuestUpdate}`, `M/screens/HouseSettings/ChoreRotationSetupScreen.tsx`.
- Unreachable routes: `PaymentWebView` and `BalanceDashboard`.
- Dead meeting sources: `F/api/api.ts:37,42,66,80,95` and `F/api/firestore.ts:246,384`. `F/util/geohash.ts` is dead transitively.
- Dead house search: `getNearbyHouses` (`F/api/firestore.ts:117`).
- `EnhancedAuthService.ts`.
- The dead `meetingsSlice.checkIntoMeeting` (`M/state/slices/meetingsSlice.ts:66-103`).
- Scheduled autopay (`F/scheduled/scheduledRentCollection.ts:140`). It matches no one, as its own comment at `:20-21` says.
- Callables with no client caller:
  - `cancelUserSubscription`, `reactivateOperatorSubscription`, `sendConfirmationEmail`, `updateSubscriptionGuests`, `updateSubscriptionHouses`, `applyBundleDiscount`, `givePotentialSuperAdminPrivilege`, `verifyUserEmail`, `getPaymentMethod`, `updatePaymentInfo`, `setOxfordEnabled`
  - The web wraps six of them unreachably: `W/services/functions/cloud-function.service.ts:14,19,59,68,72,78`.

### C7. Stripe clients: ACCIDENTAL, no impact

Clients are constructed in five places: `F/util/stripe.ts:10-13`, the lazy Proxy `F/api/stripe.ts:20-31`, inline at `F/scheduled/scheduledRentCollection.ts:116`, and two identical `getStripe` memoizers (`F/webhooks/stripeWebhook.ts:18`, `F/http/stripeConnect.ts:31`). All of them share the pin in `F/util/stripeApiVersion.ts`.

The shared webhook receiver, `verifyStripeWebhook` (`F/util/verifyStripeWebhook.ts:84`), is **LEGIT**.

Related: the Connect status sync has two writers with different field sets. The callable `F/callable/payments.ts:996-1003` writes `stripeLastSyncAt` and `stripeError`; the webhook `F/webhooks/stripeWebhook.ts:1425-1431` writes neither, so both go stale. The "closed means disconnected" branch is also duplicated, at `payments.ts:959-966` and `stripeWebhook.ts:1409-1423`.

### C9. Geohash: ACCIDENTAL (recovery-api LEGIT)

`getGeohashRange` exists in `M/util/geolocation.ts:48` (live, house search) and `F/util/location.ts:89`. The functions copy is used only by the dead `getNearbyHouses`. Recovery-api uses `geofire-common` (`RA/callable/findMeetings.ts:4,114,132`), a separate dependency in a separate product. Both sides encode with `ngeohash`, so the stored hashes agree.

### C11. Callable wrappers: LEGIT

`M/integration/rnfb-to-web.ts:158`, `regroup/mobile/firebase-setup.ts:67`, `regroup/portal/src/adapter/firebase-setup.ts:40` and `W/services/functions/cloud-function.service.ts` are one-line seams, one per runtime and SDK.

## Part B: Within-lane duplication

Only items worth consolidating are listed; trivial ones were dropped.

| Lane | Duplication                                                                                                                                                             | Evidence                                                                                                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L2   | The grant sequence (record → claims → record) is hand-copied three times. The redeem path writes claims → record instead. The two orders are not interchangeable.       | `F/callable/auth.ts:97-106,179-202,325-329`; `F/callable/invitations.ts:285-290`                                                                                                                                                                                     |
| L2   | Three claim-write styles                                                                                                                                                | `F/callable/auth.ts:248-257,389-395` (`deleteClaim`); `F/util/claims.ts:128,162`; `auth.ts:326` (direct)                                                                                                                                                             |
| L6   | Two writers for Connect status sync, plus a duplicated "closed" branch                                                                                                  | `F/callable/payments.ts:959-966,996-1003`; `F/webhooks/stripeWebhook.ts:1409-1431`                                                                                                                                                                                   |
| L6   | Two pay screens, each with its own Stripe shim; only one writes the optimistic record, and that write is denied for residents                                           | `M/screens/RentPayment/RentPaymentScreen.tsx:81-100,248`; `M/screens/Payments/ResidentPayment.tsx:37-60`; R:678-681                                                                                                                                                  |
| L7   | Two live code paths that create a tier subscription: reactivation sends no trial, metadata `{userId}` only, and always the monthly interval                             | `F/api/stripe.ts:159-170` vs `:212-235`                                                                                                                                                                                                                              |
| L7   | `users.subscriptionMetadata` is written whole-map by the callables but with dotted paths or transactions by the webhook, a lost-update risk                             | `F/callable/subscriptions.ts:463,518,580,666`; `F/util/residentCapacity.ts:121` vs `F/webhooks/subscriptionState.ts:33-40`; `F/webhooks/syncOperatorTier.ts:25-40`                                                                                                   |
| L7   | Occupancy write implemented in two places, one of them dead                                                                                                             | `F/util/residentCapacity.ts:119-127` ("mirrors the add branch"); `F/callable/subscriptions.ts:577-586`                                                                                                                                                               |
| L8   | `financial-records` has two services and two React Query caches with the same hook names; a treasury write leaves charter compliance stale                              | `M/services/treasury.ts:17-51` + `M/state/queries/treasuryQueries.ts:7-8,59-65`; `M/services/oxford/index.ts:391-430` + `M/state/queries/oxfordQueries.ts:64-65,482-510`                                                                                             |
| L8   | `ees-records` has three readers, two shapes and a dead second writer                                                                                                    | `M/services/oxford/ees.ts:16,42,93,119`; `M/services/oxford/index.ts:355-387`; `M/services/treasury.ts:171-188`                                                                                                                                                      |
| L8   | The EES split exists on the phone and on the server, with different divisors (all guests vs. `isActiveGuestDoc`)                                                        | `M/screens/Oxford/EESTracker.tsx:63-65,101` + `M/services/oxford/ees.ts:27-35`; `F/triggers/firestore/guestWrite.ts:257,282-289`                                                                                                                                     |
| L8   | Officer creation has two paths with different ids and shapes                                                                                                            | `M/state/mutations/oxfordOnboardingMutations.ts:41-48`; `M/services/oxford/index.ts:74-110`                                                                                                                                                                          |
| L9   | Chat and DM plumbing: three snapshot mappers; the two create loops differ in error handling; four message builders use three `sortKey` conventions (orderings disagree) | `M/services/message.tsx:83,115-125,170-179,242-246,338`; `M/screens/HouseChat/HouseChat.tsx:120`; `M/screens/DirectChat/DirectChat.tsx:223,580`; `M/screens/DirectChat/hooks/useChatLogic.ts:117`; `M/state/slices/chatSlice.ts:95` + `M/entities/Message.tsx:59,75` |
| L9   | Issues and complaints have two stores each: the house-doc maps (live) and root collections (dead helpers)                                                               | `M/screens/Personal/Personal.tsx:168-171,200-206`; `M/services/issues.ts:17,34,82`; `M/services/complaints.ts:15,19,31`                                                                                                                                              |
| L1   | The post-commit grant-then-flags sequence is written twice                                                                                                              | `F/callable/houses.ts:55-80`; `F/callable/finishOperatorSetup.ts:160-171`                                                                                                                                                                                            |
| L1   | Selected house is stored four ways; two are vestigial                                                                                                                   | `M/state/slices/housesSlice.ts:7-8,28,31`; `M/state/slices/setupSlice.ts:158-185`; `P/current-house.ts:13` + `P/HouseGate.tsx:21-27`                                                                                                                                 |
| L5   | The meeting enum has three copies with different members, and day-name normalization has two copies with different failure behaviour                                    | `F/callable/meetings.ts:24`, `M/screens/StatUpdates/MeetingFilterForm.tsx:13`, `M/entities/Meeting.tsx:67-73`; `F/util/directoryMapping.ts:16-23` vs `RA/lib/meetings/identity.ts:46-88`                                                                             |

## Part C: Verified defects found along the way (not duplication)

Each defect was re-derived independently from source. Severity assumes launch, with no live users today.

| #   | Defect                                                                                                                                                                                                                                                                                                                                | Verdict                 | Severity   | Evidence                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Cross-house leak of custom meetings.** `findMeetings` returns every house's custom meetings, with `addedBy` (the resident's full name) and `houseId`, to any signed-in user. The location is supplied by the client, so any area can be swept.                                                                                      | CONFIRMED               | **high**   | `F/api/firestore.ts:250-252`; `F/util/meetings.ts:22-71`; `F/callable/meetings.ts:20-37,107,135`; `M/screens/StatUpdates/NewMeeting.tsx:407-408`; bypasses R:848                              |
| D2  | **The Oxford rules gate is dead.** `houseOxfordActive()` needs `houses.oxfordEnabled`, which no production code writes. Only Maestro seeds and the rules tests set it. Every officer, house-meeting and vote write is denied for real houses, while the UI still shows those features. Admins can also set the flag with a raw write. | CONFIRMED               | **high**   | R:95-98,606-621,582-589; `F/callable/oxford.ts:129-135`; `F/houses/houseInput.ts:109-123`; `regroup/mobile/firebase/__tests__/firestore.rules.test.ts:268-351`; `M/hooks/useOxfordGate.ts:24` |
| D3  | **Confidential complaints are readable by every member.** Complaints live in the house doc, so every resident can read the text and the plaintiff id, and residents can rewrite the map.                                                                                                                                              | CONFIRMED               | **high**   | `M/screens/Personal/Personal.tsx:155,168-170`; R:507,598-599,728-735                                                                                                                          |
| D4  | Managers and co-owners never receive rent, payout or dispute pushes (C2)                                                                                                                                                                                                                                                              | PARTIAL (owner covered) | medium     | `F/util/notifications.ts:169-187`; `F/activities/disputeNotifications.ts:104-108`; `F/util/houseRoleStore.ts:98`                                                                              |
| D5  | The `userIsAtMeeting` result is ignored, so location never gates check-in                                                                                                                                                                                                                                                             | CONFIRMED               | medium     | `M/state/queries/meetingQueries.ts:41-42`; `M/screens/StatUpdates/MeetingSearch/useMeetingSearch.ts:51`                                                                                       |
| D6  | Oxford votes can never close                                                                                                                                                                                                                                                                                                          | CONFIRMED               | medium     | R:631; `F/callable/oxford.ts:275-282`                                                                                                                                                         |
| D7  | Treasury admin check is always false (C2)                                                                                                                                                                                                                                                                                             | CONFIRMED               | medium     | `M/hooks/useTreasuryRole.ts:35-37`; `F/houses/houseInput.ts:113-114`                                                                                                                          |
| D8  | EES treasury income treats dollars as cents (100x too low) and counts unpaid records. **Masked today:** the `totalExpenses` input has no setter, so every EES amount is 0.                                                                                                                                                            | CONFIRMED               | medium     | `M/services/treasury.ts:183`; `M/screens/Treasury/FinancialRecordForm.tsx:197,312`; `M/screens/Oxford/EESTracker.tsx:47`                                                                      |
| D9  | Chore-fee payments go into `rentOwed`: chore fees never fall and rent goes negative (C6)                                                                                                                                                                                                                                              | CONFIRMED               | low–medium | `F/webhooks/stripeWebhook.ts:625-627`; `F/callable/payments.ts:197,205`                                                                                                                       |
| D10 | DM read receipts: the recipient's `markRead` is denied by the rules                                                                                                                                                                                                                                                                   | CONFIRMED               | low        | R:1182-1185; `M/services/message.tsx:287-292`                                                                                                                                                 |
| D11 | The resident's optimistic `recordRentPayment` is denied by the rules (produces error noise only)                                                                                                                                                                                                                                      | CONFIRMED               | low        | R:675-681; `M/screens/RentPayment/RentPaymentScreen.tsx:258-262`                                                                                                                              |
| D12 | Reactivation drops the annual interval. No UI reaches it.                                                                                                                                                                                                                                                                             | CONFIRMED               | low        | `F/api/stripe.ts:215`; `F/util/tierPricing.ts:48`                                                                                                                                             |
| D13 | Discharging an accountless resident shows a "contact support" alert even though the discharge succeeded (C10)                                                                                                                                                                                                                         | PARTIAL                 | low        | `M/services/guest.tsx:383-384`; `F/callable/auth.ts:43-48`; `M/screens/Profile/DischargeGuestModal.tsx:43-46`                                                                                 |
| D14 | Scheduled autopay charges no one                                                                                                                                                                                                                                                                                                      | CONFIRMED (documented)  | low        | `F/scheduled/scheduledRentCollection.ts:20-21,140`                                                                                                                                            |

The audit also found stale docs and comments (these are not defects):

- `F/util/entitlement.ts:107-110` says the client read of `paywall/config` is denied. The rules allow it (R:722-725).
- `regroup/functions/CLAUDE.md` and `.claude/rules/regroup-paywall.md` still say "Phase A grants absent status".
- `regroup/web/CLAUDE.md` says "nine wrappers, three reachable". The actual count is ten wrappers, four reachable.
- `regroup/CLAUDE.md` says "quantity callables are gone". They are still exported.
- `F/scheduled/rentAttempts.ts:17-19` says "no rent accrual job".
- `.claude/rules/architecture.md:78` lists `EnhancedAuthService` as live.

## Part D: Corrections to the Phase 1 lane files

The lane files have been left as written. Where they disagree, this report takes precedence.

- **L1:** the client creation gate does **not** disagree with the server about `cancelling`.
- **L2:** the `isHouseAdmin` called in `syncWeekSummary.ts:137` is `claimsHouseAdminCheck`, not the helper in `houseAuth.ts`.
- **L4:** both `useWeekSummary` hooks are live. `display.tsx`'s Sunday week helpers are live too, not only used by orphan screens.
- **L5:**
  - `F/util/geohash.ts` is dead transitively (imported at `F/api/firestore.ts:10`), not unreferenced.
  - The phone's `MeetingResultsList` does no house filtering (`M/screens/StatUpdates/MeetingResultsList.tsx:353-380`), so D1 stands.
- **L6:**
  - `payments.ts:270` is `transfer_data`, not a gate.
  - The accrual line is `chargeResident.ts:149`.
  - Balances have three independent definitions, not four.
- **L7:**
  - The grace drift covers `unpaid` and unknown statuses as well as `canceled`.
  - `subscriptions.ts:666` also races.
- **L8:**
  - `EESTracker.tsx:65,101` calls `calculateEES`, so it is not a third EES split.
  - `charterCompliance.ts` is not a third weekly threshold.
  - The Oxford financial-record _create_ hook has no consumer.
  - The EES amount is always 0 today (D8).

## Specializations kept (do not unify)

- Server entitlement vs. client gate, including `pending` on absent status: a different trust model and a deliberate UX choice.
- The phone's `getWeekStart` mirror of the server's week rule. The client can't call the server's rule, and the mirror is documented.
- The claims fast path vs. live-claims-plus-record for grants: a trust model.
- `DirectoryMeeting` wire types in Regroup and recovery-api, and recovery-api's own geofire code: a product boundary.
- Callable wrappers, one per runtime and SDK.
- One webhook receiver with one signature check, serving both rent and billing.
- Client-written client-owned data: activities, chat, issues.
