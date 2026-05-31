# Product Gap Analysis: RecoveryConnect / Homegroups

**Date:** 2026-02-23
**Analyst:** PM/PO Role (Claude Sonnet 4.6)
**Sources reviewed:** `PRODUCT_REQUIREMENTS.md`, `ROADMAP.md`, `STRATEGIC_ANALYSIS.md`
**Codebase paths inspected:**
- `mobile/src/screens/` (all subdirectories)
- `mobile/src/store/slices/`
- `functions/src/callable/` (80+ callables)
- `functions/src/triggers/` (firestore, auth, pubsub, scheduled)
- `functions/src/index.ts`
- `firestore.rules`
- `mobile/src/types/domain/treasury.ts`, `mobile/src/types/schema.ts`
- Key component and navigation files

---

## Executive Summary

The codebase is dramatically ahead of its stated MVP scope. The product has implemented features spanning the full roadmap from MVP through V4 (enterprise/intergroup). This creates a significant disconnect between the lean MVP framing in the requirements documents and actual code reality. The core MVP requirements are all functionally present; the app is not launch-blocked on features. The remaining launch blockers are legal/compliance gaps (Terms of Service and Privacy Policy are placeholders), a known sobriety privacy bug on the sponsor screen that is not fully closed, and a configurable prudent reserve that exists in code but may need UX validation. The codebase contains a large surface area of undocumented features that carry maintenance cost and increase test/QA burden before launch.

---

## 1. Features Documented as Requirements That Are Fully Implemented

### MVP Scope — Meetings

| Requirement | Evidence |
|---|---|
| Search/browse meetings and view details | `MeetingFinderScreen.tsx`, `MeetingScreen.tsx`, `MeetingDetailScreen.tsx`; `findMeetings` callable; map view with `react-native-maps` integrated in `MeetingFinderScreen.tsx` line 422 |
| Personal meeting favorites / schedule | Toggle-favorite logic in `MeetingScreen.tsx` line 840, `MeetingFinderScreen.tsx` line 480; `toggleFavoriteMeeting` action in `meetingsSlice.ts`; `favoriteMeetings` array on user doc; filter-by-favorites UI in both screens |
| Meeting directions | Confirmed working per `STRATEGIC_ANALYSIS.md`; navigation-to-location logic present in meeting detail |

### MVP Scope — Groups

| Requirement | Evidence |
|---|---|
| Create/join groups | `CreateGroupScreen.tsx`; `joinGroupByInviteCode`, `createGroupWithSubscription` callables; `generateGroupInvite`, `sendGroupInviteEmail` callables |
| Member directory with role labels and privacy controls | `GroupMembersScreen.tsx`, `MemberDetailScreen.tsx`; privacy settings flow in `authSlice`; `showSobrietyDate` and `showRecoveryDate` fields on member and user types (`schema.ts` line 97, 108, 267) |
| Group meeting schedule + meeting detail visibility | `GroupScheduleScreen.tsx`; meeting instances pipeline via `onMeetingCreate`, `scheduledInstanceGenerator` |

### MVP Scope — Communication

| Requirement | Evidence |
|---|---|
| Announcements: admin-only posting, member read, push notifications | `GroupAnnouncementsScreen.tsx`; `onAnnouncementCreate` trigger; Firestore rules enforce admin-only create, member read |
| Group chat | `GroupChatScreen.tsx` (1,793 lines); `chatSlice.ts`; `group_chats` collection secured in `firestore.rules` |
| 1:1 direct messages | `DirectMessageScreen.tsx`, `ConversationsListScreen.tsx`; `directMessagesSlice.ts`; `direct_message_threads` collection secured |
| Message reactions | `addReaction` action in `chatSlice`; `handleAddReaction` in `GroupChatScreen.tsx` line 458 |
| Message reply | `replyingTo` state and `replyTo` field in `GroupChatScreen.tsx` lines 363–925 |
| Message attachments | `ChatAttachment` type, `renderAttachments` in `GroupChatScreen.tsx` lines 751–757 |

### MVP Scope — Treasury

| Requirement | Evidence |
|---|---|
| Income/expense entry with categories | `AddTransactionScreen.tsx`; `transactionsSlice.ts`; `ExpenseCategory` and `IncomeCategory` types in `treasury.ts` with 12-step-aligned categories (Area Contribution, Region Contribution, World Service) |
| Transaction editing | `EditTransactionModal` component, imported and rendered in `GroupTreasuryScreen.tsx` lines 25, 720; ROADMAP MVP checklist item marked complete |
| Current balance + prudent reserve visibility | `GroupTreasuryScreen.tsx`; `TreasuryStats` type with `prudentReserve` field; edit UI present (line 313–707) |
| Configurable prudent reserve | `GroupTreasuryScreen.tsx` line 225 shows edit UI with default 600 and range hint "$200-$2,000"; update callable exists; **ROADMAP item NOT yet checked off** — see Section 2 |
| Report generation | `TreasuryReportScreen.tsx`, `SavedTreasuryReportsScreen.tsx`; `financial_reports` collection |
| Treasurer handoff / continuity | `InitiateHandoffScreen.tsx`, `HandoffRequestScreen.tsx`, `HandoffConfirmationScreen.tsx`, `HandoffHistoryScreen.tsx`; `treasurerHandoffSlice.ts`; full state machine in `firestore.rules` lines 159–188 |

### MVP Scope — Safety & Governance

| Requirement | Evidence |
|---|---|
| Content/user reporting | `ModerationQueueScreen.tsx`, `ReportDetailScreen.tsx`; `onReportCreate` trigger; `reports` collection secured |
| Ban / warn / remove | `UserBansScreen.tsx`; `banUser` callable; `user_bans` collection |
| Admin governance escalation (manual CS resolution) | `AdminRemovalRequestsScreen.tsx`; `initiateAdminRemoval`, `voteOnAdminRemoval`, `submitAdminRemovalResponse` callables; `adminRemovalSlice.ts` — **NOTE: this implements full V1.4 automated voting, exceeding the MVP requirement of manual CS escalation** |

### Monetization

| Requirement | Evidence |
|---|---|
| $12/year per group subscription | `createStripeCheckoutSession`, `createGroupSubscription` callables; `STRIPE_PRODUCT_ID_GROUP` env; `SubscriptionUpgradeScreen.tsx` |
| Free tier for non-admin members | Firestore rules enforce admin-only access for paid features; `useTrialStatus` hook; treasury and announcements show "ask admin to upgrade" paths |
| 7-day trial | `scheduledTrialReminders` pubsub trigger; `useTrialStatus.ts`; `TrialStatusBanner` component rendered in `GroupOverviewScreen.tsx`, `GroupTreasuryScreen.tsx`, `GroupAnnouncementsScreen.tsx` |

### App Store Compliance

| Requirement | Evidence |
|---|---|
| Account deletion | `ProfileManagementScreen.tsx` line 394–443; `deleteUserAccount` callable exported from `index.ts` |
| Privacy controls | Granular `PrivacySettings` type; first-name display options in `authSlice` |

### ROADMAP MVP Checklist Items (Marked Complete)

- [x] Transactions can be edited: `EditTransactionModal` wired into `GroupTreasuryScreen.tsx`
- [x] Admin onboarding shows feature benefits before payment: `AdminValuePropScreen.tsx` registered in `GroupStackNavigator.tsx` at route `AdminValueProp`
- [x] Firestore security rules audited and locked down: comprehensive `firestore.rules` with claims-first + document-read fallback, catch-all deny rule at line 901

---

## 2. Features Documented as Requirements That Are Partially Implemented

### MVP: Sobriety Date Privacy on Sponsor Screen (ROADMAP P1)

**Status:** Logic present but incomplete.
**What exists:** `GroupSponsorsScreen.tsx` line 57 maps `showSobrietyDate: s.sobrietyDate != null` — meaning any sponsor with a non-null sobriety date has it shown, regardless of the user's actual `privacySettings.showRecoveryDate`. The display guard at line 206–209 checks `member.showSobrietyDate !== false`, but this flag is derived directly from whether the date field is populated, not from the user's privacy preference.
**What is missing:** `getCrossGroupSponsors.ts` callable (lines 92–106) returns `sobrietyDate` from the `members` collection without checking `memberData.privacySettings?.showRecoveryDate` or `memberData.showSobrietyDate`. The ROADMAP P1 bug ("sobriety date shows on sponsor screen despite privacy setting") is **not fully fixed** in the cross-group sponsor path.
**ROADMAP checklist:** Item NOT checked off — `[ ] Sobriety date respects privacy setting everywhere`
**Files:** `functions/src/callable/getCrossGroupSponsors.ts`, `mobile/src/screens/homegroup/GroupSponsorsScreen.tsx`

### MVP: Configurable Prudent Reserve (ROADMAP P1)

**Status:** Mostly implemented, ROADMAP item not marked complete.
**What exists:** `GroupTreasuryScreen.tsx` line 225 defaults to 600, has an edit UI (lines 313–707), hint text "$200-$2,000", and calls an update function. `schema.ts` line 223 documents `prudentReserve?: number // Configurable prudent reserve goal, default 600`.
**What is missing:** No validation enforcing the $200-$2,000 range at the backend/rules layer. The update path calls a function but it is unclear if there is a dedicated callable or a direct Firestore write. The ROADMAP checklist item remains unchecked: `[ ] Prudent reserve configurable per group ($200-$2000 range)`.
**Files:** `mobile/src/screens/homegroup/GroupTreasuryScreen.tsx`, `mobile/src/types/schema.ts`

### MVP: Meeting Cancellation Push Notifications (ROADMAP P1)

**Status:** Backend exists, but end-to-end cancellation notification flow needs validation.
**What exists:** `onMeetingInstanceUpdate.ts` trigger exists and is exported. Comment block (lines 72–77) explicitly documents "Sends push notifications when: Meeting is cancelled / Meeting time changes / Meeting location changes."
**What is missing:** The ROADMAP checklist item remains unchecked: `[ ] Meeting cancellations trigger push notification to members`. No test confirms the "cancelled" status change path fires correctly. The test file `functions/src/__tests__/meetingEnhancements.test.ts` line 259 only tests that a notification is NOT sent for an already-cancelled meeting, not that an initial cancellation triggers one.
**Files:** `functions/src/triggers/firestore/onMeetingInstanceUpdate.ts`, `functions/src/__tests__/meetingEnhancements.test.ts`

### V1.1: Trial Optimization — Day Counter in-app

**Status:** Infrastructure exists, UI is surface-level.
**What exists:** `useTrialStatus` hook, `TrialStatusBanner` component, `scheduledTrialReminders` backend. Banner is used in 3 screens.
**What is missing:** The ROADMAP specifies "Day 3 of 7" visible in-app (trial day counter), Day 5 push notification reminder, and feature education tooltips. `FeatureTooltip.tsx` exists in `mobile/src/components/subscription/` but there is no evidence it is used in screens. `scheduledTrialReminders` handles Day 5 push notification on the backend but no in-app Day 5 banner was found. The ROADMAP V1 checklist: `[ ] Trial experience optimized with reminders` is not checked.
**Files:** `mobile/src/hooks/useTrialStatus.ts`, `mobile/src/components/subscription/TrialStatusBanner.tsx`, `mobile/src/components/subscription/FeatureTooltip.tsx`, `functions/src/triggers/pubsub/scheduledTrialReminders.ts`

### V2.1: Treasury — Report Approval Workflow

**Status:** Data model supports it; no UI found.
**What exists:** `FinancialReport` type in `treasury.ts` includes `approvedBy?: string` and `approvedAt?: Date` fields (lines 92–93). `financial_reports` Firestore rules allow treasurer/admin updates (for approval).
**What is missing:** No `approveReport` callable was found in `functions/src/callable/` or exported from `index.ts`. No UI in `TreasuryReportScreen.tsx` or `SavedTreasuryReportsScreen.tsx` shows an approval action. ROADMAP item: `Report approval workflow — Secretary/chair signs off on monthly report` is listed under V2.1 and is not checked.
**Files:** `mobile/src/types/domain/treasury.ts` lines 92–93, `mobile/src/screens/homegroup/TreasuryReportScreen.tsx`

### V2.1: Transaction Audit Log

**Status:** Type defined, no UI.
**What exists:** `EditHistoryEntry` interface and `editHistory?: EditHistoryEntry[]` field on `Transaction` type in `treasury.ts` lines 22–42. Firestore rules protect immutable audit fields (`createdBy`, `createdAt`) on transaction updates.
**What is missing:** No screen renders `editHistory`. The ROADMAP item "Transaction audit log — Who added/edited/deleted with timestamps" is not checked. The prior bug fix (MEMORY.md) specifically called out and removed a dead `editHistory` UI block from `EditTransactionModal`, but the replacement rendering was not added.
**Files:** `mobile/src/types/domain/treasury.ts`

### V3.2: "Ask Admin to Upgrade" Member Prompt

**Status:** Partially wired, backend incomplete.
**What exists:** `GroupAnnouncementsScreen.tsx` line 681 and `GroupTreasuryScreen.tsx` line 371 show "ask admin to upgrade" buttons. `notifyAdminUpgradeRequest` callable exists and is exported. `upgradeRequests` subcollection rule in `firestore.rules` lines 143–149.
**What is missing:** The `upgradeRequests` subcollection rule allows members to write, but the actual rate-limiting described in the comment ("1 per 30 days") is not enforced at the rules level (the `notSpamming()` function returns `true`). Backend callable logic is present but the full flow (notification delivery to admin, UI acknowledgment) was not verified complete. ROADMAP item: `[ ] Ask admin to upgrade — Members see prompt when hitting paywalled feature` is not checked.

---

## 3. Features Documented as Requirements That Are NOT Implemented

### MVP Scope: Terms of Service and Privacy Policy (CRITICAL — STRATEGIC_ANALYSIS)

**Status:** Placeholder text only.
**Evidence:** `RegisterScreen.tsx` line 480: `'Full terms would be displayed here.'` and line 507: `'Full privacy policy would be displayed here.'` — both are `Alert.alert` placeholder strings, not links to actual legal documents.
**Impact:** App store compliance requirement. `STRATEGIC_ANALYSIS.md` marks this as "CRITICAL | Blocking | 0.5 days." The app cannot be submitted to the App Store or Google Play without real, accessible ToS and Privacy Policy documents.
**Files:** `mobile/src/screens/auth/RegisterScreen.tsx` lines 480, 507

### V2.0: Home Screen Widget — Sobriety Counter

**Status:** Not implemented.
**Evidence:** No native widget code found anywhere in the repository. This requires platform-specific native code (iOS WidgetKit, Android App Widgets). Not present.
**ROADMAP item:** `Sobriety counter widget — Home screen widget showing days`

### V2.3: Voice Message Playback

**Status:** Not implemented.
**Evidence:** No voice recording, audio attachment type, or inline audio player found in `GroupChatScreen.tsx`, `DirectMessageScreen.tsx`, or `chatSlice.ts`.
**ROADMAP item:** `Voice message playback — Inline audio player (not browser)`

### V2.3: Message Search

**Status:** Not implemented.
**Evidence:** No search-by-keyword functionality found in group chat or DM screens. No search bar in `GroupChatScreen.tsx` or `ConversationsListScreen.tsx` for message content.
**ROADMAP item:** `Message search — Find old messages by keyword`

### V3.0: Referral Rewards / Leaderboard

**Status:** Referral tracking exists, rewards and leaderboard do not.
**Evidence:** `ReferralDashboardScreen.tsx` and `referralSlice.ts` exist with code generation and stats display. `generateReferralCode`, `getReferralStats`, `applyReferralCode` callables are deployed. However, no "1 month free per successful referral" reward logic was found in callable functions or Stripe integration. No leaderboard UI was found.
**ROADMAP items:** `Referral rewards — 1 month free per successful referral`, `Leaderboard — Top referrers get recognition`

### V3.0: Traveling Member Mode

**Status:** Not implemented.
**Evidence:** No "I'm visiting [city]" mode found. The meeting finder (`MeetingFinderScreen.tsx`, `MeetingScreen.tsx`) supports location-based search but there is no dedicated "traveling member" UX flow.
**STRATEGIC_ANALYSIS:** Listed under Opportunity 1 — Cross-Group Social Layer

### V4.0 / V2.1: Treasury Year-End Summary (annotation only)

**Status:** Screen exists, but generation logic uncertain.
**Evidence:** `YearEndSummaryScreen.tsx` file exists. However, no dedicated backend callable for generating an annual fiscal report was found in `functions/src/callable/`. Without confirming the callable, this may be client-side computed only.
**ROADMAP item:** `Year-end summary — Annual fiscal report with totals`
**Note:** Requires further investigation to confirm fully implemented vs. stub.

---

## 4. Features in the Codebase Not Documented in Requirements (Undocumented / Scope Creep)

The following features exist in code but have no corresponding requirement in `PRODUCT_REQUIREMENTS.md` or ROADMAP milestone items. Many are tagged with version comments (V3.x, V4.x) that do not match the document versions, suggesting they were built speculatively ahead of roadmap sequence.

### Group Governance Suite (Well Beyond MVP/V1)

| Feature | Evidence | Version Tag in Code |
|---|---|---|
| Group conscience votes | `CreateConscienceVoteScreen.tsx`, `GroupConscienceScreen.tsx`; `createConscienceVote`, `castConscienceVote`, `closeConscienceVote` callables; `group_conscience_votes` Firestore rules | V3.3 / V4.0 in code |
| Group bylaws | `GroupBylawsScreen.tsx`, `EditBylawsScreen.tsx`; `saveBylawDraft`, `ratifyBylaws` callables; `group_bylaws` Firestore rules | V4.1 in code |
| Officer elections | `GroupElectionsScreen.tsx`, `ElectionDetailScreen.tsx`; `openElection`, `nominateForElection`, `castElectionVote`, `closeElection` callables; `group_elections` Firestore rules | V4.1 in code |
| Business meetings with agenda + minutes | `BusinessMeetingsListScreen.tsx`, `BusinessMeetingDetailScreen.tsx`, `ManageAgendaScreen.tsx`, `MeetingMinutesScreen.tsx`, `EditMeetingMinutesScreen.tsx`, `MinutesArchiveScreen.tsx`; `saveMeetingMinutes`, `approveMeetingMinutes` callables | V4.1 in code |

**Note:** The V1.4 Admin Removal Voting requirement (documented in ROADMAP) overlaps with the conscience vote and election features above, but the full governance suite goes far beyond it.

### Intergroup / Enterprise Features (V4+ Not in Requirements)

| Feature | Evidence |
|---|---|
| Intergroup management | `IntergroupDashboardScreen.tsx`, `IntergroupGroupsScreen.tsx`, `IntergroupAnnouncementScreen.tsx`; `createIntergroup`, `affiliateGroupToIntergroup`, `sendIntergroupAnnouncement` callables |
| SSO for treatment centers | `IntergroupSSOScreen.tsx`; `configureSSO` callable; `sso_domain_index` and `sso_join_log` Firestore rules |
| White-label / branding | `submitBranding`, `uploadBrandingLogo` callables; `branding` Firestore rules |
| Facility dashboard + compliance | `FacilityDashboardScreen.tsx`; `getFacilityStats`, `exportFacilityComplianceReport` callables |
| Group data export | `GroupDataExportScreen.tsx`; `exportGroupData`, `exportIntergroupData` callables |
| Group backups | `scheduledGroupBackups` trigger; `groups/{groupId}/backups` Firestore rules |
| Intergroup report | `IntergroupReportScreen.tsx`, `IntergroupReportHistoryScreen.tsx`; `generateIntergroupReport` callable |

### Content & Resource Features (V4.2 — Not in MVP/V1/V2 Requirements)

| Feature | Evidence |
|---|---|
| Daily reflections (seeded content) | `DailyReflectionScreen.tsx`; `seedDailyReflections`, `scheduledDailyReflection`; `daily_reflections` Firestore rules |
| Group daily thought | `PostGroupDailyThoughtScreen.tsx`; `postGroupDailyThought` callable |
| Literature library | `LiteratureIndexScreen.tsx`, `LiteratureDetailScreen.tsx`, `GroupLiteratureBookmarksScreen.tsx`; `contributeLiterature`, `saveLiteratureItem`, `bookmarkLiteratureForGroup` callables |
| Meeting topics | `MeetingTopicsScreen.tsx`; `contributeMeetingTopic`, `favoriteGroupTopic` callables |
| Group resource library | `GroupResourceLibraryScreen.tsx`, `AddGroupResourceScreen.tsx`; `deleteGroupResource` callable |

### Personal Recovery Features (Beyond Core MVP)

| Feature | Evidence |
|---|---|
| Gratitude journal | `GratitudeJournalScreen.tsx`; `engagementSlice.ts` with `fetchTodayGratitude`, `saveGratitudeEntry`; `users/{userId}/gratitudeEntries` Firestore rules |
| Check-in streak | `CheckInStreakScreen.tsx`; `recordCheckIn` callable; `engagementSlice.ts` streak tracking |
| Step tracker / step work companion | `StepTrackerScreen.tsx`; `stepWorkSlice.ts`; `grantSponsorStepAccess` callable |
| My Recovery Journey | `MyRecoveryJourneyScreen.tsx` |
| Sobriety calculator | `SobrietyCalculatorScreen.tsx` |
| Milestone tracking (beyond sobriety tracker) | `recordMilestone`, `getMilestones` callables; `scheduledMilestoneReminders`; `GroupMilestonesScreen.tsx` |

### Other Undocumented Features

| Feature | Evidence |
|---|---|
| Group phone list | `GroupPhoneListScreen.tsx` |
| Group calendar (visual by-date view) | `GroupCalendarScreen.tsx` (V2.2 tagged in file header) |
| Attendance analytics | `AttendanceAnalyticsScreen.tsx`; `getAttendanceAnalytics` callable |
| Secretary toolkit + meeting checklist | `SecretaryToolkitScreen.tsx`, `MeetingChecklistScreen.tsx` |
| Group health time-series dashboard | `GroupHealthDashboardScreen.tsx`; `groupHealthSlice.ts`; `getGroupHealthTimeSeries` callable; uses `victory-native` charting |
| Member engagement metrics | `getMemberEngagementMetrics` callable; `AdminDashboardScreen.tsx` (in `homegroup/` directory) |
| Treasury trends | `TreasuryTrendsScreen.tsx`; `getTreasuryTrends` callable |
| Public group directory | `PublicDirectoryScreen.tsx`; `isPublic` field on groups; `groups` read rule allows unauthenticated read when `isPublic == true` |
| Public events | `PublicEventsScreen.tsx`; `getPublicEvents` callable |
| Group donations (Stripe) | `GroupDonationScreen.tsx`; `createStripePaymentIntent`, `createStripeAccountLink`; Venmo/PayPal/Zelle/Stripe payment method config |
| Payment links setup | `PaymentLinksSetupScreen.tsx` |
| Sponsorship analytics | `SponsorshipAnalyticsScreen.tsx`; `sponsorshipSlice.ts` |
| Thread muting | `ConversationsListScreen.tsx` line 48/171; `DirectMessageScreen.tsx` line 112 |
| Unified inbox | `UnifiedInboxScreen.tsx`; `MessagesNavigator.tsx` |
| Recurring transactions | `ManageRecurringScreen.tsx`; `recurringTransactionsSlice.ts`; `scheduledRecurringTransactions`; `recurring_transactions` Firestore rules |
| Meeting QR code | `MeetingQRCodeScreen.tsx` |
| Group data export | `GroupDataExportScreen.tsx`; `exportGroupData` callable |
| Cross-group sponsorship | `GroupSponsorsScreen.tsx` with "my_groups" view mode; `getCrossGroupSponsors` callable |

---

## 5. Requirements That Are Ambiguous or Contradictory

### 5.1 "Admin Removal Voting" — MVP vs. Automated System

**Conflict:** `PRODUCT_REQUIREMENTS.md` (Safety & Governance section) states: "Content/user reporting + moderation actions (ban/warn/remove admin, etc.)" and "Admin governance escalation flow (MVP manual CS resolution)." The Out of Scope list explicitly says "Automated governance/voting systems (beyond manual CS workflow)."

**Reality:** The codebase implements a full automated voting system (`initiateAdminRemoval`, `voteOnAdminRemoval`, `submitAdminRemovalResponse`, `AdminRemovalRequestsScreen.tsx`, `adminRemovalSlice.ts`) matching the V1.4 ROADMAP spec (2/3 majority, 7-day window, admin response). This directly contradicts the MVP explicit non-goal of "Automated governance/voting systems."

**Recommendation:** Either update `PRODUCT_REQUIREMENTS.md` to acknowledge admin removal voting is in scope for launch, or document it as a soft-launch feature that requires further testing before enabling for all groups.

### 5.2 "Messaging" Attachment/Reaction Support — Conditional Language

**Conflict:** `PRODUCT_REQUIREMENTS.md` states messaging should include "Attachments, reactions, reply (as supported)." The hedge "as supported" creates ambiguity about what the launch commitment is.

**Reality:** Reactions and reply are implemented in `GroupChatScreen.tsx`. Attachments are also implemented. Voice messages are not. The qualifier "as supported" should be resolved: either define what is supported or remove it.

### 5.3 Sobriety Tracker — Personal vs. Group Feature

**Conflict:** `PRODUCT_REQUIREMENTS.md` does not mention the sobriety tracker as a core MVP capability. `STRATEGIC_ANALYSIS.md` (Tier 1 table) lists it as "Excellent Implementation" and a "High daily engagement driver."

**Reality:** The sobriety tracker (`SobrietyTrackerScreen.tsx`) is deeply implemented with medallions, celebrations, money saved estimates, and group milestone notifications (`scheduledMilestoneCheck`, `onMilestoneWrite`). It is a significant feature with no requirement reference. Its privacy implications (sobriety date exposure) are currently buggy (see Section 2). The requirements document should explicitly include or exclude it.

### 5.4 Donation Platform — Scope vs. Implementation

**Conflict:** `PRODUCT_REQUIREMENTS.md` Out of Scope states: "Marketplace-style donations provider swaps (e.g., Braintree) unless explicitly prioritized." `STRATEGIC_ANALYSIS.md` lists "Stripe Donations: Connect integration — Smooth onboarding flow" as a Tier 2 good feature.

**Reality:** `GroupDonationScreen.tsx` implements Stripe, Venmo, PayPal, Zelle, and CashApp — a multi-provider payment hub. `BILLING_AND_PAYMENTS.md` and `BRAINTREE_INTEGRATION.md` exist in docs. The scope boundary is not enforced in code.

### 5.5 "Free Tier" Definition — What Features Are Paywalled

**Conflict:** `PRODUCT_REQUIREMENTS.md` states "Free tier: members (non-admin) can use core meeting/group participation features." It does not specify which treasury, announcement, or moderation features are behind the paywall.

**Reality:** Code shows treasury and announcements as subscription-gated features (they display "ask admin to upgrade" for non-subscribed groups). But the sobriety tracker, direct messages, group chat, and sponsorship features appear accessible regardless of subscription status. The requirements document needs a definitive paywall table to prevent accidental product decisions during development.

### 5.6 ROADMAP Version Numbering Mismatch

**Conflict:** The `functions/src/index.ts` uses version labels V3.1, V3.2, V3.3, V3.5, V4.1, V4.2, V4.4 in comments. These do not map cleanly to the ROADMAP document's V3.0, V3.1, V3.2, V3.3 milestones. For example, code-labeled "V4.4" intergroup features appear in what the ROADMAP calls "V4.3 Enterprise Features."

**Impact:** Creates confusion about what "done" means for any given roadmap milestone. A developer looking at `index.ts` cannot reliably determine which ROADMAP milestone a function belongs to.

---

## 6. Overall Product Readiness vs. Stated Roadmap Milestones

### Against the MVP (v0) Checklist

| Item | Status |
|---|---|
| [x] Transactions can be edited | DONE |
| [x] Admin onboarding shows feature benefits before payment step | DONE (`AdminValuePropScreen.tsx`) |
| [x] Firestore security rules audited and locked down | DONE |
| [ ] Sobriety date respects privacy setting everywhere | NOT DONE — partial fix, cross-group sponsor path still leaks |
| [ ] Prudent reserve configurable per group ($200-$2000 range) | FUNCTIONALLY DONE — UI and update path exist; checklist item not yet marked |
| [ ] Meeting cancellations trigger push notification to members | LIKELY DONE — trigger exists; no end-to-end test confirms; leave as open |
| CRITICAL: Terms of Service / Privacy Policy accessible in-app | NOT DONE — placeholder text only |

**MVP Gate Assessment:** The app is close but not launch-ready. The ToS/Privacy Policy gap is a hard App Store submission blocker. The sobriety privacy bug affects user trust in a population that places high value on anonymity.

### Against V1 Checklist

| Item | Status |
|---|---|
| [ ] Admin dashboard with group health metrics | DONE — `AdminDashboardScreen.tsx` in `homegroup/`, `GroupHealthDashboardScreen.tsx`, `dashboardSlice.ts` |
| [ ] Trial experience optimized with reminders | PARTIAL — Banner exists, day counter present in hook, Day 5 push notification backend exists; in-app Day 5 banner not confirmed |
| [ ] Service position rotation reminders working | DONE — `scheduledPositionReminders` deployed; `PositionHistoryScreen.tsx`, `TermsDashboardScreen.tsx` |
| [ ] Announcement read tracking implemented | DONE — `readCount` rendered in `GroupAnnouncementsScreen.tsx` line 329; Firestore rules allow member `readBy` update |
| [ ] Scheduled announcements available | DONE — `isScheduled` toggle in `GroupAnnouncementsScreen.tsx`; `scheduledAnnouncementPublisher` deployed |
| [ ] Admin removal voting system live | DONE — Full system exists; exceeds MVP non-goal; see Section 5.1 |

**V1 Assessment:** The V1 milestone appears substantially implemented already. The checklist items are not marked as done in the document but the code evidence is strong. Most V1 features are in production-ready code.

### Against V2 Checklist

| Item | Status |
|---|---|
| [ ] Daily engagement feature live (reflection or gratitude) | DONE — `DailyReflectionScreen.tsx`, `GratitudeJournalScreen.tsx`, `CheckInStreakScreen.tsx` all exist |
| [ ] Recurring transactions working | DONE — `ManageRecurringScreen.tsx`, `recurringTransactionsSlice.ts`, `scheduledRecurringTransactions` |
| [ ] Year-end treasury summary available | PARTIAL — `YearEndSummaryScreen.tsx` exists; backend callable unconfirmed |
| [ ] Calendar view for meetings | DONE — `GroupCalendarScreen.tsx` |
| [ ] Unread message tracking for group chat | DONE — `ConversationsListScreen.tsx` and `UnifiedInboxScreen.tsx` show unread badges |
| [ ] Typing indicators in chat | DONE — Full typing indicator subscription in `GroupChatScreen.tsx` |
| [ ] Message search functional | NOT DONE |

**V2 Assessment:** 5 of 7 items are implemented. Message search is the only clearly missing item. Year-end summary needs backend verification.

### Against V3 Checklist

| Item | Status |
|---|---|
| [ ] Referral program live with tracking | PARTIAL — Code generation and stats exist; reward/leaderboard mechanics missing |
| [ ] Multi-group discount implemented | DONE — `getMultiGroupPricing` callable, `SubscriptionUpgradeScreen.tsx` discount banner |
| [ ] Group switcher for multi-group users | DONE — `GroupSwitcherModal.tsx` component, `UnifiedInboxScreen.tsx` |
| [ ] Public group directory opt-in | DONE — `PublicDirectoryScreen.tsx`, `isPublic` field, Firestore rules |
| [ ] Cross-group sponsorship enabled | DONE — `getCrossGroupSponsors` callable, dual-mode `GroupSponsorsScreen.tsx` |

**V3 Assessment:** 4 of 5 items are substantially done. Referral rewards (the revenue-driving component) are missing.

### Against V4 Checklist (Enterprise/Platform)

All major V4 features (governance, elections, bylaws, business meetings, minutes, intergroup, SSO, branding, facility dashboards) are implemented in code. The ROADMAP frames these as 25+ weeks of future work; they are already in the codebase.

---

## 7. Summary Risk Table

| Risk | Severity | Evidence |
|---|---|---|
| ToS / Privacy Policy are placeholder text | LAUNCH BLOCKER | `RegisterScreen.tsx` lines 480, 507 |
| Sobriety date privacy bug not fully fixed | HIGH — trust/anonymity issue | `getCrossGroupSponsors.ts` line 95 returns `sobrietyDate` without privacy check |
| MVP checklist items not marked done despite code being complete | MEDIUM — process debt | ROADMAP checklist vs. observed code |
| Enormous undocumented feature surface area increases launch risk | MEDIUM — QA/testing gap | 80+ callables deployed; V4 screens already in production codebase |
| Version labels in code mismatch ROADMAP document versions | LOW — communication debt | `index.ts` V4.4 comments vs. ROADMAP V4.3 |
| `notSpamming()` rate limiting is a stub (returns `true`) | MEDIUM — abuse risk | `firestore.rules` lines 94–100 |
| No analytics implementation (Plausible/Mixpanel etc.) | MEDIUM — cannot measure product success | No analytics SDK found in `mobile/src/` |
| Transaction `editHistory` field defined in type but no UI to surface it | LOW — dead weight in type | `treasury.ts` line 41; prior bug fix removed only the dead UI block |

---

## 8. Recommendations

**Immediate (before App Store submission):**
1. Write and host real Terms of Service and Privacy Policy documents; wire `RegisterScreen.tsx` to open them via `Linking.openURL`.
2. Fix `getCrossGroupSponsors.ts` to filter out sobriety date when the member's `privacySettings.showRecoveryDate` is false or `showSobrietyDate` is false.
3. Update the ROADMAP checklist to reflect what is actually done (prudent reserve, admin dashboard, most of V1-V2).

**Near-term (V1 launch gate):**
4. Add end-to-end test for meeting cancellation push notification path.
5. Implement real referral rewards logic in Stripe (free month credit) and add leaderboard UI.
6. Implement message search (client-side filtering or Algolia).
7. Implement a privacy-respecting analytics SDK (Plausible recommended per `STRATEGIC_ANALYSIS.md`).
8. Resolve the `notSpamming()` stub — implement actual Cloud Function-backed rate limiting for report creation and upgrade requests.

**Process / documentation:**
9. Add a definitive paywall feature table to `PRODUCT_REQUIREMENTS.md`.
10. Reconcile version label inconsistencies between `functions/src/index.ts` comments and the ROADMAP document.
11. Consider feature flagging V4 enterprise/governance features so they can be selectively enabled per group, reducing launch risk from untested surface area.
