# Regroup Fresh Audit — 2026-07-06

**Scope:** A fresh, independent sweep of `regroup/mobile` and `regroup/functions`, run after Parts 1-8 of `regroup-usability-audit-2026-07-05.md` and `dead-code-audit-2026-07-04.md` were already actioned. Five parallel agents covered guest-facing screens, house admin/settings screens, the Oxford House program feature set, `regroup/functions` security, and chat/notifications/Treasury — each instructed to skim the prior two docs first and only report genuinely new findings, and to verify every claim via grep before reporting (not guess).

**Status:** Findings only. Nothing in this document has been fixed yet — this is the "what and why," pending triage.

---

## Critical

1. **Three guest stat-summary modals crash the entire app.** `GuestChoreSummary.tsx`, `GuestWorkSummary.tsx`, and `GuestSupporterSummary.tsx` all call `showFormModal(<Field component={...} />, ...)`, but `ModalContext.tsx` renders that content with no `<Formik>` ancestor anywhere in the tree. Formik's `<Field>`/`useField()` throws an invariant when rendered outside Formik context, and the app has one top-level `ErrorBoundary` — so tapping CHANGE CHORE / ADD HOURS / ADD JOB / MEET SPONSOR / CHANGE SPONSOR blanks the whole screen to "Something went wrong." Tests pass only because each test file mocks Formik's `Field` to bypass the real invariant. Unaffected: `GuestMeetingSummary.tsx` (navigates instead) and `GuestMedicationSummary.tsx` (already hardened 2026-07-05 to local state).
   - Fix: wrap ModalContext's form-modal content in a real `<Formik>` provider, or convert these 3 modals to local-state forms matching the Medication pattern.

2. **Anonymous Oxford votes have no duplicate-vote protection — one resident can inflate a tally arbitrarily.** `services/oxford/votes.ts` hardcodes `previousChoice = undefined` for anonymous votes (necessary to avoid persisting who-voted-for-what), which also means the decrement branch never fires — every repeat call by the same guest just adds +1 with nothing removed. `Voting.tsx` never disables vote buttons after voting on anonymous polls (since `individualVotes` is intentionally never written for them). Compounding: `charterCompliance.ts`'s `computeDemocraticCondition` sums these inflated `results` as the participation numerator for a house's "Democratic Self-Governance" score.
   - Fix: track a separate per-guest "has voted" marker (e.g. a `voterIds` set) that dedupes without exposing the individual choice, checked inside the same transaction before incrementing.

3. **AdminManagement's "Send Invitation" always fails.** Imports `inviteAdmin` from `state/slices/adminSlice`, which exports no such thing (verified via `grep -n "^export"` — only `setUserAsAdmin`/`selectAdmin`/`clearSelectedAdmin`/`clearError`/`resetAdminState` + selectors). Every invite throws a `TypeError`, caught and shown as "Failed to send invitation" — 100% failure rate. The correct replacement, `useInviteAdmin()` in `state/queries/adminQueries.ts`, already exists and is unused.
   - Fix: swap to `useInviteAdmin().mutateAsync(...)`.

4. **Selecting a house from "My Houses" (HousesOverview) does nothing.** Dispatches a raw `{ type: 'SELECT_HOUSE', payload: {house} }` that no reducer anywhere handles (confirmed sole dispatch site in the repo). The sibling `HouseSearchScreen.tsx` does this correctly via `dispatch(selectHouseById(house.id))`. Notably, `HousesOverview.test.tsx` asserts the _broken_ action is dispatched — the test was written against the bug, which is why it shipped unnoticed. Admins managing multiple houses cannot switch houses from this screen.
   - Fix: `dispatch(selectHouseById(houseId))`.

---

## High

5. **Firestore rules let any house guest tamper with Oxford governance votes.** `firestore.rules`'s `/votes/{voteId}` `update` rule has no `diff().affectedKeys()` restriction (unlike the `/guests/{guestId}` rule a few lines up, which whitelists exactly which self-update fields are allowed). Any authenticated guest can `update` a vote doc with **any** field — vote tallies, other residents' individual choices, `isAnonymous`, `passed`, `closedAt` — not just cast their own ballot. The client (`services/oxford/votes.ts`'s `castVote`) does the right thing via a scoped transaction, but that's client-side only; nothing server-side stops a modified client or direct SDK call from overwriting the tally. A second function, `updateVote(id, updates: Partial<Vote>)` in `services/oxford/index.ts`, demonstrates the rule permits exactly this — it has zero call sites today (dead code) but shows the gap. Same root-cause pattern on `/houses/{houseId}/business-meetings/{meetingId}` (lower stakes, same missing field gate).
   - Fix: restrict `update` to only `results` and `individualVotes.<request.auth.uid>`; deny changes to `isAnonymous`/`passed`/`closedAt`/`houseId` from this rule. For real integrity, move tally mutation into a callable — client-trusted vote tallying is spoofable even with tighter field rules, since the client still computes `results` itself.

6. **Assigning a new Oxford officer never deactivates the incumbent.** The live path (`OfficerManagement.tsx` → `useCreateOfficer` → `services/oxford/index.ts`'s `createOfficer`) just creates a new doc with `isActive: true`, never touching the existing active officer for that role. A correct implementation already exists — `services/oxford/officers.ts`'s `setOfficer()`, which properly batches deactivate-then-create — but has zero callers anywhere (confirmed via grep; same dead-parallel-implementation shape the prior audit found for EES).
   - Fix: delete `officers.ts`/`businessMeetings.ts` (dead) and port the deactivation logic into `index.ts`'s `createOfficer`, or repoint `useCreateOfficer` at `setOfficer`.

7. **Officer names entered during onboarding are stored but never displayed.** `oxfordOnboardingMutations.ts` writes onboarding officers with `{ role, name, ... }` and no `userId`. Both display sites (`OxfordDashboard.tsx`, `OfficerManagement.tsx`) key exclusively off `officer.userId` via `getGuestName(userId)`, falling through to the literal string `"Unknown"` when it's absent — never falling back to `officer.name`, even though the `Officer` type's own doc comments describe exactly this onboarding-vs-elected split.
   - Fix: `getGuestName` at both call sites should fall back to `officer.name` when `userId` is absent.

8. **Discharging a resident never revokes Firebase custom claims.** `dischargeGuest` (`services/guest.tsx`) only `.update()`s the guest doc — never deletes it. The only claims-revocation trigger, `onGuestWrite`, revokes claims _only_ when the doc is deleted, not updated. Firestore rules gate house-level access purely on custom claims, not a live guest-doc check. Net: a discharged resident keeps house-level read/write access indefinitely. (Contrast: `deleteGuest`, used by "Remove from home," does delete the doc and correctly triggers revocation — this gap is specific to discharge.) Compounding: no query anywhere filters by status, so discharged residents also keep showing in the active resident list forever.
   - Fix: have `dischargeGuest` call `removePrivilegesForGuests` with `role: "guest"` (the backend already supports this role value; no client code currently calls it that way), and filter discharged guests out of `GuestList`.

9. **DirectChat has no real-time listener — breaks for deep-linked or notification-opened chats.** `DirectChat.tsx` never calls `subscribeToDirectChat`, only fetches once on mount. Real-time delivery today only happens as a side effect of `ContactScreen.tsx` staying mounted underneath it in the nav stack (it subscribes to every conversation while mounted). `chat/:userId` is a registered deep link, and `ContactScreen` is the only other nav entry point — opening a DM via push notification or deep link mounts `DirectChat` with nothing else in the stack providing a listener, so the conversation is frozen at whatever was fetched on open.
   - Fix: give `DirectChat.tsx` its own `subscribeToDirectChat` subscription, mirroring `HouseChat.tsx`'s existing `subscribeToHouseChat` pattern.

10. **Resubmitting a rejected Treasury report reassigns it to the current week.** `FinancialRecordForm.tsx` computes `period` from `getCurrentWeekPeriod()` once at mount and never restores the original record's period when editing an existing (rejected) record — so "Edit & Resubmit" on an old record silently retargets it to this week's period. Since `getCurrentWeekRecord()`/`getPreviousWeekRecord()` query by exact period match, this can collide with or shadow the house's actual current-week record, corrupting week-to-record association.
    - Fix: track the record's original `period` in state on load; submit that instead of `getCurrentWeekPeriod()` when editing an existing record.

11. **Removing an admin (non-guest branch) leaves a ghost entry in ManagerSettings.** The backend call succeeds (Cloud Function + house `adminIds` update), but the local `state.setup.admins` Redux cache is spliced on a clone that's never dispatched — the removed admin keeps showing in the list until a full remount. The guest-admin branch immediately above this code correctly dispatches its update.
    - Fix: `dispatch(setAdmins(_admins))` after the backend call succeeds (the action already exists).

12. **Client/Firestore permission mismatch on house-edit scope.** `HouseSummary.tsx` gates House Settings/Manage Guests behind a `superAdmin`-only client rule, but Firestore rules allow any plain `admin` to write the same fields (including `stripeAccountId`/`adminIds`/`ownerId`) server-side — only guests are blocked from those fields. A plain admin can write financial/ownership fields directly via the Firestore SDK even though the UI hides that capability from them.
    - Fix direction: either tighten the Firestore rule to match the intended superAdmin-only scope for those specific fields, or relax the UI gate if plain-admin access is actually intended — these two enforcement layers currently disagree.

---

## Medium

13. **`sendInviteEmails` callable has no house-scoping in its authorization check** (`regroup/functions`). Any authenticated admin of _any_ house can invoke it to send invite-flavored emails to arbitrary recipients via the app's real SendGrid sender — a phishing/spam vector, not privilege escalation (recipients still need `redeemInvitation`, which is correctly scoped, to get any claims). Confirmed zero production callers — already flagged `DELETE` in the 2026-07-04 dead-code audit (superseded by `createInvitation`). Flagging again here because as long as it's deployed it's directly invocable via the callable SDK regardless of UI wiring — reason to prioritize that deletion.

14. **PII (guest names) logged via `console.log` in `migrateGuestWeeks.ts`.** A local/CI-only migration script (not deployed), but violates the repo-wide "never log PII" rule for anyone running it. Low blast radius, easy fix — log guest doc IDs instead of names.

15. **EES per-resident amount preview can mismatch what's actually charged.** `EESTracker.tsx` displays `totalExpenses / house.currentCapacity` (bed capacity) but `handleCreateRecords` actually divides by `guestList.length` (current residents) when generating records. Whenever occupancy < capacity — the common case — the number shown to the treasurer doesn't match what residents are actually billed.

16. **Guest list health icon always shows the worst status for every resident.** `GuestList.tsx` calls `getOverallPercentage(guest, house, date)` (3 args), but the real signature requires a `weekStats` 4th argument and returns `0` immediately when it's missing. `0` always maps to the "sad" health icon, so every row's boxed icon is wrong regardless of actual compliance — while the separate `GuestComplianceDot` rendered alongside is correct, so each row shows one always-wrong indicator next to one correct one.

17. **`EditUserInfoForm.tsx` silently drops errors on profile-update failure.** `dispatch(updateUser(...))` is never `.unwrap()`ed, so a rejected thunk resolves anyway; the handler has no try/catch and never resets `isSubmitting`. If the React Query mutations underneath reject, the async handler throws unhandled — no error shown, no visual reset, navigation silently doesn't proceed. Same shape as an already-documented missing-`.unwrap()` bug elsewhere, just not previously caught in this file.

18. **Balance Aging view drops cents, inconsistent with the balance shown just above it on the same screen.** `BalanceDashboard.tsx` builds aging rows via `Math.round(totalBalance / 100)` (whole dollars) while the primary balance row directly above uses full `.toFixed(2)` precision — a guest owing $42.37 shows "$42.37" in the main list and "$42" in the aging breakdown right below it.

19. **FCM permission request doesn't check the result or handle denial/errors.** `Splash.tsx`'s `handleMessagingToken` awaits `requestPermission()`/`getToken()` with no try/catch and discards the resolved authorization status — contrast `rentReminder.ts`, which correctly checks permission before scheduling. This is the actual production token-registration path.

20. **StripeSettingsScreen doesn't refresh after the Stripe Connect onboarding redirect.** Opens an external browser for onboarding but only fetches status on mount, with no `useFocusEffect`/AppState listener — sibling screens in the same directory (`PaymentDashboard.tsx`, `HouseSettings.tsx`) both use `useFocusEffect` for exactly this "refresh on return" pattern. Not a security issue (server-side enforcement is real), just a stale-UI bug on the one screen whose entire purpose is redirect-out-and-back.

21. **Recording a manual payment doesn't refresh "Overdue Residents" on PaymentDashboard.** `handleRecord` invalidates `paymentKeys.housePayments`/`guestBalances`/`history` but never `guestKeys.list(houseId)`, which is what actually backs the Overdue Residents card. Staff records a cash payment and the resident stays listed as overdue until the screen backgrounds/refocuses or the 30s staleTime lapses.

22. **"Any" gender filter on house search returns zero results instead of clearing the filter.** The picker's "Any" option maps to the literal string `'any'`, which `searchForHouses` applies as an equality filter that never matches real data (no house has `gender: 'any'`). Should map to the empty-string no-filter sentinel instead.

---

## Low / informational

- **HouseConfigFormView's "Rent" field writes to `house.rent`, a property that doesn't exist** on the real `House` schema (only `monthlyRent`/`weeklyRent`). Screen is already known-unreachable per the prior audit, so no live impact today — a landmine if reconnected.
- **HouseSearchScreen silently returns zero results with no location set** — GPS-denied + no address entered produces a bogus geohash with no user-facing explanation.
- **Every house search result hardcodes "12 Step"** as the displayed type — the field exists on the entity but is never exposed in the filter form or applied in the query; it's a literal, not real data.
- **Chore rotation auto-advance uses device-local time, not house timezone** — duplicates week-boundary logic instead of reusing `getStartOfWeekInTimezone` (which has its own doc comment flagging this exact class of bug and is used correctly elsewhere). Rotation can flip a day early/late for houses outside the admin's device timezone.
- **"Rotation Order" in HouseChoreInfo is fully disconnected from the real rotation feature** — just alphabetizes guests by name; the actual `getCurrentAssignee()` rotation function has zero callers anywhere.
- **`deleteClaim` silently resets `potentialSuperAdmin` to `false`** on every caller that omits its 4th argument (all current callers do) — not an escalation path today, but a silent data-clobber worth a look if that flag is ever relied on post-facto.
- **`sendDirectMessage.fulfilled` reducer skips the dedup check its sibling `addMessageToConversation` reducer has** — not currently visible as a duplicate since `sortKey` happens to survive the round-trip unchanged, but the same defensive gap class as the `.unwrap()` fix earlier this session (one path hardened, sibling not).
- **Two competing, unused FCM token-registration code paths** (`services/notifications.tsx`'s `registerDeviceToken`, `notifications/service.ts`, `notifications/handler.ts`) — the real path is `Splash.tsx` writing `user.messagingToken` directly. Not a functional bug, cleanup candidate.
- **`ProfileUpdate.tsx` is genuinely dead code** — zero non-test importers anywhere, not previously documented.
- **`GuestUpdateFormView.tsx` renders `rentOwed`/`choreFees` as unlabeled plain-number inputs** — since these are integer cents elsewhere (per an earlier session's fix), reconnecting this already-unreachable screen as-is risks a 100x entry error with no unit indication.
- **`PhaseCustomization.tsx`'s `renderButtons` callback is defined but never called** — dead code in a live file; the working Cancel/Save buttons are rendered directly elsewhere in the same component.
- **ChoreRotationSetupScreen's resident list never populates for a house with no existing rotation** (unreachable screen, noted for if it's ever wired up).
- **HouseConfigForm's commented-out `validationSchema` + rekey-by-name for phases/chores** can silently collide and drop entries if 2+ unnamed phases/chores are added before renaming (unreachable screen).
- **`updateHouseAdmins`'s `arrayRemove()` call has zero arguments** (no-op), but has no UI caller today.
- **Correction to the 2026-07-04 dead-code audit:** `util/admin.ts` was flagged there as dead (zero imports, ARCHIVE) — that's now wrong. 4 real production imports exist (`services/house.tsx`, `AdminManagement.tsx`, `ManagerSettings.tsx`, `SignUpForm.tsx`). Should be **KEEP**, not archived.

---

## Areas checked with no new issues found

- `regroup/functions`: Stripe webhook signature verification (both endpoints, distinct secrets), webhook idempotency (Firestore-transaction guard on `event.id`), all payment callables (customer/account identity always resolved server-side from the caller's own uid), `setOxfordEnabled`/`complianceExport`/`rentRoiMetrics` (correct `superAdminId` checks, fail-closed tier gating), `createInvitation`/`peekInvitation`/`redeemInvitation` (crypto-random tokens, correct expiry/email-match checks), `authGuard.ts`'s claim-granting authorization, storage rules, no hardcoded secrets anywhere.
- Mobile: `BaseChat.tsx`/`useChatLogic.ts`, `Notifications.tsx` (the `.unwrap()`+rollback pattern fixed earlier this session is correct and not repeated elsewhere in that file), `rentReminder.ts`, `TreasuryDashboard.tsx`/`treasury.ts`/`treasuryQueries.ts`/`useTreasuryRole.ts`, `FinancialRecordDetail.tsx` (beyond the already-fixed reject-reason bug), `HouseChat.tsx`/`message.tsx`, `DischargeGuestModal.tsx`, `GuestHome.tsx`, `GuestImportScreen.tsx`, `GuestMeetingSummary.tsx`, `HouseInfo.tsx`, `HouseActivity.tsx`, `HouseChoreActivity.tsx`, `houseQueries.ts`, `adminQueries.ts`, `AddManager.tsx`, `HouseConfig.tsx`.

---

## Suggested triage

This is a lot of findings for one pass — the volume itself is informative (several of these are the exact same bug shape recurring: a live implementation living alongside a dead-correct parallel implementation nobody wired up, or a `dispatch()` whose thunk result is never used/awaited). Suggested order:

1. **Critical items #1-4** — these are outright breakage (a crash, three broken/no-op admin actions) reachable by real users today. Fix first, independent of everything else.
2. **High #5, #8** — the two real security/data-integrity gaps (vote tampering, discharge not revoking access). Worth prioritizing alongside the crashes given they're silent, not just broken.
3. **High #6, #7, #9, #10, #11, #12** — real bugs, lower urgency than the above, good candidates for a batch of small fixes.
4. **Medium and Low items** — schedule as routine cleanup; several are pure `.unwrap()`/query-invalidation misses matching a pattern already fixed elsewhere in the codebase this session, so they're mechanically similar to fix.
