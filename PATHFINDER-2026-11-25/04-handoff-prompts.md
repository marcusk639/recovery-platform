# 04 Handoff prompts: run each one with `/make-plan`

Each block below is a self-contained prompt. Paste it into `/make-plan` as-is.

Run them in the order shown. H0 first. U1 before U2. U3 before U5, U8 and U9.

All paths in the prompts are relative to the `recovery-platform` repo root. Evidence for every call site is in `PATHFINDER-2026-11-25/02-duplication-report.md`. Target designs are in `03-unified-proposal.md`.

Rules that apply to every prompt below:

- Work in a fresh worktree off `origin/main`.
- Name the product in the commit scope, e.g. `fix(regroup-functions):`.
- Don't lower coverage floors or skip tests. The test-tamper gate re-checks this in CI.
- Money paths (U5, U6, U7) need an independent reviewer who reasons from the domain model, not from mutation counts.
- Regroup has no live users. Delete the old path in the same change as its replacement. No feature flags, no dual writes.

---

## H0. Defect fixes that aren't duplication (security first)

```
/make-plan Fix four verified Regroup defects. Each is independent; plan them as separate PRs, in this order.

Context: PATHFINDER-2026-11-25/02-duplication-report.md Part C (D1, D2, D5, D6); flowcharts 01-flowcharts/L5-meeting-directory.md and L8-oxford-and-compliance.md. No live users (regroup/CLAUDE.md).

D1 (high, privacy). findMeetings returns every house's custom meetings, including addedBy (the resident's full name) and houseId, to any signed-in user.
- Code: regroup/functions/src/callable/meetings.ts:20-37,94-152; regroup/functions/src/util/meetings.ts:22-92; regroup/functions/src/api/firestore.ts:250-252. The client-side rule this bypasses is regroup/mobile/firebase/firestore.rules:848.
- Fix: the callable takes the caller's houseId, checks the caller's claims for that house, and queries meetings where houseId == that house. Never read the whole collection. Strip addedBy from the response, or return only the first name if the UI needs it.
- Tests: a functions test proving a user of house A gets none of house B's custom meetings.

D2 (high). The Oxford rules gate requires houses.oxfordEnabled, which no production code writes, so every officer, business-meeting and vote write is denied for real houses.
- Code: firestore.rules:95-98,606-621. The flag appears in houseInput.ts:109-123 and oxford.ts:129-135. The rules tests only pass because they seed the flag (regroup/mobile/firebase/__tests__/firestore.rules.test.ts:268-351).
- Fix: houseOxfordActive() derives from the server-owned houseType == 'oxford' plus the subscription status. Delete oxfordEnabled from the rules, the Maestro seeds (regroup/mobile/maestro/scripts/seed/index.js:101,118, docs.js:55) and the rules-test seeds. Re-seed the tests from houseType.
- Add a rules test that a house created by the createHouses path (no oxfordEnabled field) can write officers.

D5 (medium, needs an owner decision before coding). The userIsAtMeeting result is ignored, so check-in is never gated by location.
- Code: regroup/mobile/src/state/queries/meetingQueries.ts:41-42 and regroup/functions/src/callable/meetings.ts:173.
- Ask the owner to choose: (a) block check-in when the result is false, or (b) record it as activity data.locationVerified and show it in complianceExport. Plan only the chosen option.

D6 (medium). Oxford votes can never close: nothing writes closedAt or passed, and the rules deny client updates (rules:631).
- Add one admin callable, closeOxfordVote, next to castOxfordVote (regroup/functions/src/callable/oxford.ts:194). It tallies results and writes closedAt and passed in a transaction, with the same houseType and entitlement checks.
- Client: regroup/mobile/src/screens/Oxford/Voting.tsx gets a Close button for admins.

Anti-pattern guards:
- No client-side filtering as the D1 fix. The server must not return the data at all.
- Don't keep oxfordEnabled "for compatibility".
- Don't add a vote-scheduler job when a callable does the job.
```

## U1. House staff directory and one grant path

```
/make-plan Make regroup/functions/src/util/houseRoleStore.ts (staffUids :98-110, readRoleTier, isPrimaryOwner) the only answer to "who is staff of this house", and add one grant primitive, grantHouseRole(uid, houseId, tier, via), in regroup/functions/src/util/houseRoles.ts.

Context: 03-unified-proposal.md U1; 02-duplication-report.md C2, D4, D7; flowcharts 01-flowcharts/L2-identity-access-and-roles.md and L9-messaging-and-notifications.md.

Key fact: houses.adminIds and superAdminIds hold admin-record ids from createAdminId(), not uids (regroup/functions/src/houses/houseInput.ts:113-114; regroup/functions/CLAUDE.md:250). Every place that compares them to a uid is wrong.

Rewrite these call sites:
- regroup/functions/src/util/houseAuth.ts:15-22 (isHouseAdmin), :46-54 (isHouseMoneyStaff), :72-89 (checkIsMember). Base them on readRoleTier plus live claims, and delete the house-doc id branches.
- regroup/functions/src/callable/payments.ts:634,808 (assertHouseAdmin). Use the money-staff check, rank >= manager.
- regroup/functions/src/util/notifications.ts:168-177 and regroup/functions/src/activities/disputeNotifications.ts:104-108. Use staffUids(houseId).
- regroup/mobile/src/hooks/useTreasuryRole.ts:35-37. Use isAdmin(token, houseId) from regroup/mobile/src/util/roles.ts:35, plus useMayEditRentMoney (regroup/mobile/src/state/queries/houseTierQueries.ts:16).
- regroup/portal/src/app/access.ts:13 (isStaffRole). Import isAdmin through the @mobile alias.
- Grant sequences. Replace all of these with grantHouseRole, using the single order justified by the retry comment at houseRoles.ts:42:
  - regroup/functions/src/callable/auth.ts:97-106, :179-202, :325-329 (record -> claims -> record)
  - regroup/functions/src/callable/invitations.ts:285-290 (claims -> record)
- Revoke. Replace regroup/functions/src/callable/auth.ts:248-257,389-395 (deleteClaim + setCustomUserClaims) with revokeHouseRoles (regroup/functions/src/util/claims.ts:128).

Tests:
- An invited manager (house-roles tier manager, no adminIds entry) passes isHouseMoneyStaff and appears in staffUids.
- useTreasuryRole is true for an owner and for a manager on a createHouses-built house.

Anti-pattern guards:
- No new "RoleService" class. Extend houseRoleStore.ts.
- Don't keep the house-doc id fallback "for legacy houses". None exist.
- Don't remove the adminIds/superAdminIds fields in this change. First grep firestore.rules for readers, and list what you find as a follow-up.
```

## U2. One notification path

```
/make-plan Make notifyUsers({ uids, kind, refId, title, body, data }) in regroup/functions/src/util/notifications.ts the only way the server notifies users.
- It creates notifications/{kind}_{refId}_{uid} with create(). ALREADY_EXISTS means it was already sent; this is the same idempotency regroup/functions/src/activities/disputeNotifications.ts:131-148 already uses.
- The existing notify trigger (regroup/functions/src/triggers/firestore/index.ts:35) calling sendNotification (notifications.ts:24-107: channel, notifee payload, token pruning) becomes the only FCM sender.

Prerequisite: U1 (staffUids).
Context: 03-unified-proposal.md U2; 02-duplication-report.md C1; flowchart 01-flowcharts/L9-messaging-and-notifications.md (the FCM send paths table).

Rewrite these call sites:
- sendFcmToHouseAdmins (notifications.ts:152-235). Its callers are regroup/functions/src/webhooks/stripeWebhook.ts:659,812,873,1435,1468 and regroup/functions/src/scheduled/overdueRentNotification.ts:61. They become notifyUsers({ uids: await staffUids(houseId) }). Then delete the function.
- sendFcmToUser (stripeWebhook.ts:116-146) and its 8 call sites (:651,:809,:1108,:1166,:1213,:1227,:1307 and the eighth). They become notifyUsers({ uids: [uid], refId: <stripe event id> }). Then delete it.
- regroup/functions/src/scheduled/officerTermReminder.ts:83-123. Replace the inline send and the duplicate pruning with notifyUsers.
- regroup/functions/src/rent/chargeResident.ts:161. Replace the direct sendNotification call with notifyUsers.
- disputeNotifications.ts:131-145 and regroup/functions/src/triggers/firestore/applicationNotice.ts:40. Replace their hand-written inbox docs with notifyUsers.
- Remove resident names from push bodies: stripeWebhook.ts:658-662 and applicationNotice.ts:44.
- Delete regroup/mobile/src/services/notifications.tsx:85-98 (registerDeviceToken, the userDeviceTokens store, which has no caller) and its account-deletion sweep line, regroup/functions/src/accountDeletion/personalData.ts:98.
- Delete regroup/mobile/src/services/notifications/rentReminder.ts and its callers (regroup/mobile/src/screens/Profile/GuestHome.tsx:257-266, plus the cancelRentReminder calls in the pay screens).
- overdueRentNotification also sends the resident a reminder through notifyUsers, using rentDueDate in the house timezone.

Tests:
- A webhook retry with the same event id produces one inbox doc and one push.
- Every push carries channelId and notifee.
- Stale tokens get pruned on every path.

Anti-pattern guards:
- No notification "provider" interface or registry. One function plus one trigger.
- Don't keep a direct-FCM escape hatch "for latency".
- Don't log tokens. stripeWebhook.ts:135 currently does.
```

## U3. One predicate per concept, one copy per runtime

```
/make-plan Give each of the concepts below exactly one definition per runtime. The portal deletes its copies and imports the phone's through @mobile.

Context: 03-unified-proposal.md U3; 02-duplication-report.md C3, C5, C6, C15; flowchart 01-flowcharts/L1-houses-and-operator-setup.md (portal summary).

Root cause first: regroup/portal/src/app/houses/summary.ts:71-72 says the portal's vitest cannot load phone modules. Fix the portal's vitest config so it resolves the @mobile alias, the same way tools/bundle.mjs:73 does for the build. Then delete the copies.

1. Current resident.
   - The server's allow-list is the definition: isActiveGuestDoc (regroup/functions/src/util/guestMembership.ts:100-102). Status absent or active, and no moveOutDate.
   - Redefine the phone's isCurrentResident (regroup/mobile/src/util/paymentDisplay.ts:52) to the same rule.
   - Server callers to switch to isActiveGuestDoc:
     - regroup/functions/src/callable/analytics.ts:264-266
     - regroup/functions/src/scheduled/overdueRentNotification.ts:29-36 (it currently has no status filter at all)
   - Phone callers to switch to isCurrentResident:
     - regroup/mobile/src/screens/GuestList/GuestList.tsx:211-217
     - regroup/mobile/src/hooks/useDefaultGuestSelection.ts:12
     - regroup/mobile/src/util/house.tsx:165
   - Portal callers to switch to isCurrentResident:
     - regroup/portal/src/app/houses/summary.ts:71-73
     - regroup/portal/src/app/houses/useHouseSummary.ts:80
     - regroup/portal/src/app/residents/rows.ts:21-22
2. Owed now.
   - The definition: owedNowCents (paymentDisplay.ts:56-57). Rent plus chore fees, floored at 0 per resident.
   - rentRoiMetrics outstanding (analytics.ts:268-281) adopts the same rule.
   - Delete the portal copy at summary.ts:77-98.
3. House access.
   - Export evaluateHouseAccess (regroup/mobile/src/hooks/useSubscriptionGate.ts:90-111).
   - Change it to grant grace only for past_due, matching the server's evaluateEntitlement (regroup/functions/src/util/entitlement.ts:60-67).
   - Keep "absent status -> pending". It is a deliberate UX choice.
   - Delete the portal copy at summary.ts:50-64.
4. House health.
   - getHousePercentage (regroup/mobile/src/util/house.tsx:150-162) returns null when nothing is scored.
   - Delete the portal copies at summary.ts:111-118 and useHouseSummary.ts:88-91.
5. Staff role. Covered by U1.

Tests: the same truth table (status x moveOutDate x grace -> expected result) in both the functions and the mobile test suites, each with a comment pointing to the other.

Anti-pattern guards:
- No new shared package or "domain" module. Edit the existing canonical files in place.
- Don't keep the portal copies with a "keep in sync" comment.
- Don't broaden the server's rule to match the clients. The clients move to the server's rule.
```

## U4. One week and date module per runtime

```
/make-plan Consolidate week and date logic:
- Server: regroup/functions/src/activities/weekSummaryMath.ts (weekStartFor :113, resolveTimeZone, localDateString, summaryDocId :161).
- Phone: getWeekStart in regroup/mobile/src/hooks/activity/useCurrentWeek.ts:35-40. Keep it as the documented mirror of the server rule.

Context: 03-unified-proposal.md U4; 02-duplication-report.md C4; flowcharts 01-flowcharts/L4-activities-and-disputes.md and L8-oxford-and-compliance.md.

Server rewrites:
- regroup/functions/src/util/week.ts:33 (getCurrentWeekStart, UTC) and :12 (buildWeekId). Their callers are regroup/functions/src/util/guest.ts:64,85,93,129. Replace with weekStartFor(now, house.timezone) and summaryDocId, then delete week.ts.
- regroup/functions/src/triggers/firestore/guestWrite.ts:216 (isoWeekStartUtc). Replace with weekStartFor.
- regroup/functions/src/scheduled/overdueRentNotification.ts:22-24 and regroup/functions/src/callable/analytics.ts:274. Compute "today" with localDateString(now, house.timezone), because rent writes rentDueDate as a house-local date.

Phone rewrites:
- useCurrentWeek.ts:117-151 (isInCurrentWeek, getPreviousWeek, getNextWeek). Make timeZone a required argument; today they default to New York.
- Replace these with getWeekStart(now, house.timezone):
  - regroup/mobile/src/services/oxford/ees.ts:80-90
  - regroup/mobile/src/services/treasury.ts:131-135, :153-157
  - regroup/mobile/src/screens/Treasury/FinancialRecordForm.tsx:55-61
  - regroup/mobile/src/screens/Oxford/EESTracker.tsx:45
  - regroup/mobile/src/services/choreRotation.ts:14 and regroup/mobile/src/hooks/useAutoAdvanceRotation.ts:7
- regroup/mobile/src/util/display.tsx:166-207 (Sunday, device-local). Move its callers (regroup/mobile/src/util/guest.tsx:178-179, display.tsx:253-254) to getWeekStart, then delete the week helpers from display.tsx and regroup/mobile/src/util/dateWithTimezone.ts:38-100.
- Weekly summary hook. Keep the onSnapshot useWeekSummary (regroup/mobile/src/hooks/activity/useWeekSummary.ts:40). Delete the React Query useWeekSummary (regroup/mobile/src/state/queries/activityQueries.ts:199) and move its callers (GuestHome.tsx:245, GuestList.tsx:126). Of getWeekSummaryOnce (useWeekSummary.ts:118) and getWeekSummary (regroup/mobile/src/services/activity.ts:306), keep one.

Behaviour change to call out in the PR: chore rotation flips at the house's week start (Monday), not on a device-local Sunday.

Tests: for a house in America/Los_Angeles at Sunday 20:00 local time, the server and the phone produce the same week start. The treasury and EES period keys equal that Monday.

Anti-pattern guards:
- No date-library swap.
- No "week strategy" option.
- Don't keep the UTC helpers "for scripts". regroup/functions/src/scripts/migrateGuestWeeks.ts can be deleted along with guest-weeks (U12).
```

## U5. Server-owned guest lifecycle side effects

```
/make-plan Make onGuestWrite (regroup/functions/src/triggers/firestore/guestWrite.ts:61) the only writer of derived guest state. Add a server-only houses/{id}.residentCount, recomputed with the U3 current-resident predicate. It replaces both house.currentCapacity and subscriptionMetadata.houses[h].numberOfGuests.

Prerequisite: U3.
Context: 03-unified-proposal.md U5; 02-duplication-report.md C10, C13, D13; flowchart 01-flowcharts/L3-residents-and-admissions.md.

Rewrite these call sites:
- Remove the client currentCapacity writes: regroup/mobile/src/services/guest.tsx:257-259 (createGuest's whole-house +1) and :291-298 (deleteGuest -1).
- Delete these numberOfGuests writers:
  - recordResidentAccepted (regroup/functions/src/util/residentCapacity.ts:110-127), reached from regroup/functions/src/callable/invitations.ts:292
  - the add/remove branches in regroup/functions/src/callable/subscriptions.ts:577-586 (that callable is deleted in U6)
- assertResidentCapacityAvailable (residentCapacity.ts:57-100): count residentCount plus pending invites. It takes caps from the U6 config lookup. Delete withinResidentCap (regroup/functions/src/util/tierCaps.ts:7-10).
- Readers move to residentCount:
  - regroup/mobile/src/screens/IntroHouseSummary/IntroHouseSummary.tsx:225,521
  - regroup/mobile/src/screens/HouseOverview/HouseInfo/HouseInfo.tsx:223
- Rules: add residentCount to the server-owned list (regroup/mobile/firebase/firestore.rules:582-584). Remove client write access to currentCapacity.
- Discharge. Delete the client removeGuestPrivileges call in dischargeGuest (regroup/mobile/src/services/guest.tsx:383-386); the trigger already revokes (guestWrite.ts:126-129,198). Simplify regroup/mobile/src/screens/Profile/DischargeGuestModal.tsx:43-46 accordingly.
- CSV import (regroup/mobile/src/services/guestImport.ts:94-126) calls createGuest (guest.tsx:255, minus the house update). Use one email validator (regroup/mobile/src/util/form.tsx:70) and lowercase emails. Delete guestImport.ts:16.

Tests:
- Discharge, delete, CSV import and moving between houses each leave residentCount correct.
- Discharging an accountless resident succeeds with no error.
- The invite cap frees a slot after a discharge.

Anti-pattern guards:
- No distributed counter or extra counter document. A recount inside the existing trigger is enough.
- Don't keep currentCapacity as a fallback.
- Don't revoke claims in two places.
```

## U6. Operator billing: one writer per field, delete what no client reaches

```
/make-plan Consolidate Regroup operator billing.
- users.subscriptionMetadata status, period, tier and interval are written only by the webhook (regroup/functions/src/webhooks/subscriptionState.ts:25-40, syncOperatorTier.ts:17-40), using dotted-path transactions.
- The checkout seed is written only by writeOperatorSubscription (regroup/functions/src/util/operatorSubscriptionWrite.ts:14).
- There is one checkout entry: createOperatorSubscription (regroup/functions/src/callable/subscriptions.ts:203) calling createTierSubscription (regroup/functions/src/api/stripe.ts:151-173).

Context: 03-unified-proposal.md U6; 02-duplication-report.md C3, C14, D12; flowchart 01-flowcharts/L7-operator-billing.md. Money path: plan for an independent reviewer.

Steps:
1. Delete these callables. No client reaches them; this was verified by grep of regroup/web, regroup/mobile and regroup/portal.
   - cancelUserSubscription (:493)
   - reactivateOperatorSubscription (:397)
   - updateSubscriptionGuests (:533)
   - updateSubscriptionHouses (:607)
   - applyBundleDiscount (:690)
   - sendConfirmationEmail (:767)
   Delete their wrappers too: regroup/web/src/app/services/functions/cloud-function.service.ts:14,72,78 and regroup/mobile/src/services/subscription.ts:13,17,22. Move createHouses (:44) into a houses service.
   This also removes the whole-map updateUser writes at subscriptions.ts:463,518,580,666.
2. First, confirm that createOperatorSubscription accepts an operator whose subscription is canceled. If it doesn't, fold the replacement logic from subscriptions.ts:427-485 into checkout, so a returning operator resubscribes through it and keeps their billingInterval (this fixes D12).
3. Delete the legacy two-item billing code:
   - regroup/functions/src/api/stripe.ts: HOUSE_PRICE_ID:38, getBundleCoupon:50, createSubscription:115, createItemsFromMetadata:176, the legacy branch :237-259, getSubscriptionItem:287, updateSubscriptionItem:298, updateHouseSubscriptionAmount:330, updateGuestSubscriptionAmount:337, applyBundleDiscountToSubscription/removeBundleDiscount:353-375, initializeSubscription:395, initializeCustomer:423, updateSubscriptionMetadata:487
   - subscriptions.ts:336-390 and the unused imports at :24-28
   - regroup/functions/src/api/firestore.ts:146-201
4. Caps come from config by stored tier (regroup/functions/src/config.ts:130-228). Delete the persisted maxResidents/maxProperties snapshot at subscriptions.ts:293-294, syncOperatorTier.ts:34-39 and api/stripe.ts:227-228. Move its readers (regroup/functions/src/util/residentCapacity.ts:70, regroup/functions/src/util/subscriptionHouses.ts:56) to the config lookup.
5. Use the single HouseSubscriptionStatus type at entitlement.ts:164-169 and delete the copy at regroup/functions/src/webhooks/stripeWebhook.ts:251-256.
6. Web: read salesOpen and trialDays from the catalog (regroup/functions/src/callable/getTierCatalog.ts:148-150). Show "sales closed" before the account is created, which removes the create-then-delete loop at regroup/web/src/app/services/auth/auth-service.service.ts:246,266. Delete TRIAL_DAYS (regroup/web/src/app/components/pricing/order-summary/order-summary.component.ts:4).
7. Make regroup/mobile/src/screens/SubscriptionHandler/SubscriptionHandler.tsx:22-23 use the env-derived URL from SubscriptionRequiredScreen.tsx:22-25.
8. Fix the stale docs:
   - regroup/functions/CLAUDE.md and .claude/rules/regroup-paywall.md ("Phase A grants absent status")
   - the comment at entitlement.ts:107-110 (paywall/config is client-readable per firestore.rules:722-725)
   - regroup/web/CLAUDE.md (wrapper counts)
   - regroup/CLAUDE.md ("quantity callables are gone")

Tests:
- e2e regroup/e2e/src/payments covers checkout, cancel through the billing portal, and resubscribe, preserving the annual interval.
- Delete regroup/e2e/src/payments/__tests__/subscriptionChanges.server.test.ts only together with the callables it exercises, and say so in the PR description (test-tamper gate, test-change-approved label).

Anti-pattern guards:
- Don't keep the deleted callables "for admin use".
- Don't keep cap snapshots "for grandfathering". No operators exist.
- No second subscription-creation path.
```

## U7. Money plumbing: one Stripe client, one Connect status writer, one balance rule, one pay screen

```
/make-plan Consolidate Regroup's resident-payments plumbing.
Context: 03-unified-proposal.md U7; 02-duplication-report.md C6, C7, D9, D11; flowchart 01-flowcharts/L6-rent-and-resident-payments.md. Money path: plan for an independent reviewer.

1. Stripe client: one memoized getStripe() in regroup/functions/src/util/stripe.ts. Delete these:
   - the Proxy at regroup/functions/src/api/stripe.ts:20-31
   - the memoizers at regroup/functions/src/webhooks/stripeWebhook.ts:18 and regroup/functions/src/http/stripeConnect.ts:31
   - the inline client at regroup/functions/src/scheduled/scheduledRentCollection.ts:116 (or the whole job, if U12 deletes it first)
2. Connect status: add syncHouseConnectStatus(houseRef, account) in regroup/functions/src/util/connectAccountStatus.ts. It writes the full field set: status, chargesEnabled, payoutsEnabled, requirements, stripeLastSyncAt, and clears stripeError. It owns the "closed means disconnected" branch.
   Call it from:
   - regroup/functions/src/callable/payments.ts:959-966,996-1003
   - stripeWebhook.ts:1409-1431
3. Balance: add applyPaymentToBalance(tx, { guestRef, paymentRef, cents }) in regroup/functions/src/rent/. It keeps the rentApplied marker and the refund netting (regroup/functions/src/webhooks/refundRestore.ts:58-67). It owns one rule for allocating a payment between rentOwed and choreFees.
   - Ask the owner for the order. Default: rent first, then chore fees, with any overpayment credited to rent. This fixes D9: stripeWebhook.ts:625-627 currently decrements rentOwed only, while regroup/functions/src/callable/payments.ts:197,205 allows paying rentOwed+choreFees.
   - Use it in the webhook success path (stripeWebhook.ts:615-641) and in refund restore (refundRestore.ts:20-41).
   - Add a recordManualPayment callable (staff only, U1 money-staff check) that uses it.
   - Delete the client batch at regroup/mobile/src/services/payments.ts:434-479 and tighten the rules on client rentOwed writes so they cover only the manager adjustment path (regroup/mobile/src/services/guest.tsx:74,196; firestore.rules:425-449).
4. Pay screen: give RentPaymentScreen (regroup/mobile/src/screens/RentPayment/RentPaymentScreen.tsx) an optional amount.
   - Delete regroup/mobile/src/screens/Payments/ResidentPayment.tsx and its Stripe shim (:37-60).
   - Point GuestHome.tsx:558 and any deep link at RentPaymentScreen.
   - Delete the optimistic recordRentPayment (regroup/mobile/src/services/payments.ts:226-261 and its call at RentPaymentScreen.tsx:248). The rules deny it for residents (firestore.rules:675-681), and the webhook is the record.
5. Destination gate: use createRentDestinationLookup (regroup/functions/src/scheduled/rentDestination.ts:32-54) from createPaymentIntent too (payments.ts:149).

Tests:
- A payment of rentOwed+choreFees leaves both fields at 0 under the chosen rule.
- A duplicate manual payment applies once.
- The webhook and the callable produce identical house Stripe fields.

Anti-pattern guards:
- No ledger or event-sourcing rewrite. One function, inside the existing transactions.
- Don't keep the client manual-payment batch "for offline use".
- Don't keep two pay screens.
```

## U8. One compliance rule and one export

```
/make-plan Make checkPhaseCompliance (regroup/mobile/src/util/compliance.ts:51-80) the only weekly compliance rule. Make the server complianceExport (regroup/functions/src/callable/compliance.ts:373) the only export.

Prerequisite: U3.
Context: 03-unified-proposal.md U8; 02-duplication-report.md C12; flowchart 01-flowcharts/L8-oxford-and-compliance.md (section iii).

Rewrite these call sites:
- regroup/mobile/src/services/reportingService.ts:139-140 (hard-coded meetingsAttended >= 3, choresCompleted > 0): use checkPhaseCompliance with the resident's phase rules.
- regroup/mobile/src/services/weeklyReportHtml.ts:19-26,62-77: delete it. It re-implements the rule.
- Both export buttons call complianceExport and present the returned CSV or PDF:
  - regroup/mobile/src/screens/Profile/GuestHome.tsx:381
  - regroup/portal/src/app/residents/ComplianceExport.tsx:36
  Delete the client PDF path: regroup/mobile/src/services/reportExport.ts:19-50, weeklyReportHtml.ts, and the dead exportEESHistoryCSV (reportExport.ts:92-119).
- Server fix: getDrugTestsForGuest (regroup/functions/src/api/firestore.ts:320-325) filters by houseId as well as guestId.

Owner check before coding: confirm that losing the client's weekly PASS/FAIL PDF is acceptable. It never worked on iOS and bypassed the tier gate. If the owner wants that table, plan it as a section of the server export built from week-summaries. Do not keep it as a second export.

Tests: complianceExport called from the phone and from the portal returns the same file. A lower-tier operator gets upgrade_required from both.

Anti-pattern guards:
- Don't keep the client PDF behind a platform check.
- No "export strategy" switch.
```

## U9. Oxford money records: one service per collection, cents everywhere

```
/make-plan Consolidate Oxford money records.
- financial-records: one service (regroup/mobile/src/services/treasury.ts) and one query cache (regroup/mobile/src/state/queries/treasuryQueries.ts).
- ees-records: one service and shape (regroup/mobile/src/services/oxford/ees.ts, EESRecord), stored in cents.

Prerequisites: U3 and U4.
Context: 03-unified-proposal.md U9; 02-duplication-report.md L8 rows and D8; flowchart 01-flowcharts/L8-oxford-and-compliance.md (section ii).

Rewrite these call sites:
- Delete regroup/mobile/src/services/oxford/index.ts:391-430 and regroup/mobile/src/state/queries/oxfordQueries.ts:64-65,482-510 (a duplicate CRUD and cache key for financial-records). Point regroup/mobile/src/state/queries/charterComplianceQueries.ts:6,31 at the treasury hook.
- Delete the EESTransaction entity (regroup/mobile/src/entities/oxford/EESTransaction.ts), oxford/index.ts:355-387, and the third EESRecord type (regroup/mobile/src/services/reportExport.ts:92). The OxfordDashboard feed reads from ees.ts instead.
- Store EES amounts in cents:
  - calculateEES (ees.ts:27-35)
  - createEESRecords (ees.ts:109-145), which must also write totalExpenses
  - the server resplitEES (regroup/functions/src/triggers/firestore/guestWrite.ts:243-289), which should round in cents and use the U3 predicate for the resident divisor; the phone (regroup/mobile/src/screens/Oxford/EESTracker.tsx:63-65,101) uses the same divisor
- getEESIncomeForWeek (treasury.ts:171-188) sums paid records only, in cents (regroup/mobile/src/screens/Treasury/FinancialRecordForm.tsx:197,312).
- Fix the missing setter for the totalExpenses input (EESTracker.tsx:47).
- Officers: the onboarding batch (regroup/mobile/src/state/mutations/oxfordOnboardingMutations.ts:41-48) uses createOfficer's builder (oxford/index.ts:74-110). One id scheme, and one active officer per role.

Tests:
- A $37.50 share appears as $37.50 in treasury income.
- An unpaid share is not counted as income.
- After a resident moves out, the server and the phone compute the same split.

Anti-pattern guards:
- No dollars-to-cents conversion shims "at the edges". Store cents.
- Don't keep both query hooks under the same name.
```

## U10. Complaints and issues: one store each

```
/make-plan Move Regroup complaints and issues out of the house document into their existing root collections. complaints/{id} carries confidential access: admins plus the plaintiff. issues/{id} is one document per issue.

Context: 03-unified-proposal.md U10; 02-duplication-report.md D3 (high: every resident can currently read and rewrite every complaint); flowchart 01-flowcharts/L9-messaging-and-notifications.md.

Rewrite these call sites:
- Complaints: delete the house-map writes at regroup/mobile/src/screens/Personal/Personal.tsx:155,168-171 and regroup/mobile/src/screens/Complaints/Complaints.tsx:79-139. Use the existing createComplaint/removeComplaint (regroup/mobile/src/services/complaints.ts:15,19). Read with a query that matches the rules at regroup/mobile/firebase/firestore.rules:728-735.
- Issues: delete the map writes at Personal.tsx:200-206 and regroup/mobile/src/services/issues.ts:34,82. Use createIssue (issues.ts:17). Make removeIssue (:27-47) delete the document only.
- Rules: remove the issues and complaints keys from the house update whitelist (firestore.rules:595-599). Make sure the complaints rules deny other residents read access, and add rules tests for that.
- Move HouseSummary's open-issue and complaint counts to a query.

Tests:
- Rules tests: resident B cannot read or modify resident A's complaint; an admin can.
- Two residents filing at the same moment both persist.

Anti-pattern guards:
- Don't keep the house-map copy for display.
- Don't add a Cloud Function mirror. The root collections are the only store.
```

## U11. One conversation module for chat

```
/make-plan Collapse house chat and DM plumbing in regroup/mobile/src/services/message.tsx into one set of operations parameterized by conversation path (houses/{id}/chat or direct-messages/{cid}/chat): sendMessage, subscribe, loadPage, mapSnapshot. Use one message builder.

Context: 03-unified-proposal.md U11; 02-duplication-report.md L9 chat row and D10; flowchart 01-flowcharts/L9-messaging-and-notifications.md (section ii).

Rewrite these call sites:
- Merge the duplicate pairs in message.tsx:
  - send: :83 and :338. Pick one error semantic: report a partial failure, don't swallow it.
  - snapshot mappers: :115, :170 and :242.
  - subscribe: :133 and :261.
  - load: :187 and :217.
  The DM path keeps ownMessagesFilter (:159-165), which the rules require.
- Use one builder, new Message (regroup/mobile/src/entities/Message.tsx:59,75), with one numeric sortKey convention that matches orderBy('sortKey','desc'). Replace the builders at:
  - regroup/mobile/src/screens/HouseChat/HouseChat.tsx:104-125, which writes sortKey as a string
  - regroup/mobile/src/screens/DirectChat/DirectChat.tsx:209-227 (negative)
  - regroup/mobile/src/screens/DirectChat/hooks/useChatLogic.ts:108-124
  Make DirectChat.tsx:580 pass the built message through.
- Rules (D10): the DM recipient may update only the read field (regroup/mobile/firebase/firestore.rules:1182-1186). Add a rules test.

Tests:
- House chat and DMs order messages identically.
- A recipient marking a DM read succeeds.
- A sender cannot edit the recipient's read flag on other fields.

Anti-pattern guards:
- No chat "adapter" class hierarchy. One module of functions taking a path.
- No server trigger for chat in this change. Chat push notifications are a separate feature decision.
```

## U12. Delete dead parallel models

```
/make-plan Delete Regroup's dead parallel models. Each item already has a live replacement, so nothing replaces them. Split the work into one PR per bullet.

Context: 03-unified-proposal.md U12; 02-duplication-report.md C9 and C14. Items owned by U2, U6, U7 and U8 are excluded.

Before each deletion:
- Re-grep for callers, including barrels (regroup/mobile/src/state/slices/index.ts, state/queries/index.ts), the portal's @mobile imports, string route names, and regroup/e2e.
- Note the test files deleted with the code in the PR description, because the test-tamper gate requires the test-change-approved label.

Items:
1. Legacy disputes. Owner check first: confirm no published store build still writes the legacy shape.
   - regroup/functions/src/scheduled/index.ts:26 (updateDisputes), regroup/functions/src/scheduled/disputeUpdates.ts, regroup/functions/src/util/disputes.ts, regroup/functions/src/api/firestore.ts:258-288
   - regroup/mobile/src/hooks/useBaseActivityScreen.ts:154,237-267, regroup/mobile/src/services/dispute.tsx, regroup/mobile/src/state/queries/disputeQueries.ts
   - the houses.disputes mirror writes at regroup/functions/src/activities/houseDisputeMirror.ts:231-256
   - readers regroup/mobile/src/util/guest.tsx:483 and regroup/mobile/src/util/house.tsx:237, after the portal stops using them (U3)
2. guest-weeks: regroup/functions/src/api/firestore.ts:16, regroup/functions/src/accountDeletion/personalData.ts:92-93, regroup/functions/src/scripts/migrateGuestWeeks.ts.
3. Redux state that duplicates React Query:
   - regroup/mobile/src/state/slices/authSlice.ts (registered at regroup/mobile/src/state/store.ts:36,56)
   - notificationsSlice
   - regroup/mobile/src/state/slices/guestsSlice.ts:6-65 (guests, cacheGuests)
   - meetingsSlice.checkIntoMeeting (:66-103)
   - housesSlice.selectedHouse/selectHouse (regroup/mobile/src/state/slices/housesSlice.ts:7,28)
4. Orphan screens and dead create paths:
   - regroup/mobile/src/screens/{HouseConfig,HouseChoreOverview,SubscriptionUpdateModal,CreateGuest,GuestUpdate}
   - regroup/mobile/src/screens/HouseSettings/ChoreRotationSetupScreen.tsx
   - regroup/mobile/src/services/house.tsx:58,325-405
   - regroup/mobile/src/state/slices/setupSlice.ts:87-117
   - regroup/mobile/src/state/queries/houseQueries.ts:156-160
   - also remove .typecheck-baseline:82
5. Unreachable routes: PaymentWebView, and BalanceDashboard together with useGuestBalances (regroup/mobile/src/state/queries/paymentQueries.ts:153-199).
6. Dead meeting sources and geo code:
   - regroup/functions/src/api/api.ts:26-103
   - regroup/functions/src/api/firestore.ts:117,246-252,384-398
   - regroup/functions/src/util/geohash.ts
   - regroup/functions/src/util/location.ts:89-110
   - regroup/mobile/src/entities/{AAMeeting,NAMeeting}.ts
7. Callables with no caller:
   - givePotentialSuperAdminPrivilege (regroup/functions/src/callable/auth.ts:420)
   - verifyUserEmail (:404), which sets emailVerified without an inbox check
   - getPaymentMethod and updatePaymentInfo (regroup/functions/src/callable/payments.ts:480,508)
   - setOxfordEnabled (regroup/functions/src/callable/oxford.ts:45), only after H0/D2 lands
   - the legacy token-less invite branch: regroup/mobile/src/screens/SignUp/SignUpForm.tsx:121-125,184-187, regroup/mobile/src/services/native-deep-links.ts:154-172, and addGuestAuthorization/addAdminAuthorization (auth.ts:57,119)
   - their web wrappers (regroup/web/src/app/services/functions/cloud-function.service.ts:19,59,68)
8. regroup/mobile/src/services/EnhancedAuthService.ts, plus its stale listing at .claude/rules/architecture.md:78.
9. Scheduled autopay (owner decision first: delete, recommended, or wire it up properly):
   - regroup/functions/src/scheduled/scheduledRentCollection.ts and rentAttempts.ts
   - the autoPayEnabled+rentOwed index in firestore.indexes.json
   - the e2e harness fields
10. The redundant subscriptionStatus re-stamp trigger setHouseSubscriptionStatusOnCreate (regroup/functions/src/triggers/firestore/index.ts:90-122). createHousesTx.ts:166 already writes the status, and the rules forbid other creates.
11. Verify, then fix: meeting-type casing. Functions return 'CUSTOM' (regroup/functions/src/util/directoryMapping.ts:30) but the phone expects 'Custom' (regroup/mobile/src/entities/Meeting.tsx:22). Make the callable return the phone's value.

After deletions, run the functions, mobile and portal test suites plus the mobile typecheck ratchet.

Anti-pattern guards:
- Don't comment code out.
- Don't leave @deprecated stubs.
- Don't keep a feature flag around a deleted path.
```
