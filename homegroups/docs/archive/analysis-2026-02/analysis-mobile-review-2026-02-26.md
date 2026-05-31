# Mobile Codebase Review — 2026-02-26

**Scope:** `mobile/src` (274 files: 108 screens, 27 slices, 14 models, + components/services/utils)
**Dimensions:** Security & Privacy · Architecture & Feature Bloat · Code Quality & Bugs
**Total findings:** 84 (8 Critical, 26 High, 37 Medium, 13 Low)

---

## Prioritized Fix Order

### Do immediately (data integrity + security)

1. `MemberModel.ts:34,158` — flip privacy defaults `true` → `false` (active sobriety/phone data leak)
2. `LocationPicker.tsx:24` — move hardcoded Google Maps API key out of source
3. `SponsorModel.ts:466` — fix `sponsorId: request.sponseeId` → use sponsor's actual UID
4. `MemberModel.ts:735,782` — fix broken document ID range queries (all member lookups silently fail)
5. `MemberModel.ts:800` vs `:38` — normalize `photoURL`/`photoUrl` field name inconsistency

### Do soon (stability)

6. `navigation/IntergroupDashboardScreen.tsx:85,135` — remove navigation to non-existent routes `'IntergroupSettings'` / `'IntergroupUpgrade'` (runtime crash)
7. `models/ChatModel.ts:145` — fix `timestamp` → `sentAt` in group chat initialization
8. All `console.log/warn/error` calls containing user data — wrap in `if (__DEV__)` or remove
9. Resolve duplicate `gratitudeSlice` / `engagementSlice` (same Firestore collection, two slices)
10. Delete 3 orphaned screens + 2 dead navigator files (zero-risk dead code)

### Plan for next sprint (feature scope)

11. Audit non-MVP screens in nav tree and gate behind subscription / feature flags
12. Remove `BrandingProvider` from wrapping the entire app (fires Firestore read on every launch)
13. Break `GroupOverviewScreen.tsx` (2,507 lines) into focused components

---

## Critical (8)

### Security

**C1 — Hardcoded Google Maps API key**
`mobile/src/components/groups/LocationPicker.tsx:24`
Key `AIzaSyAyjHVwL4AcgLGdo1O7mmRFJLLHgpNOC5A` is committed to source and extractable from the built APK/IPA. A comment on line 22 acknowledges it should be in config. Move to environment variables or native config files with API key restrictions in Google Cloud Console.

**C2 — Hardcoded Google OAuth client IDs**
`mobile/src/services/firebase/auth.ts:234-239`
`webClientId` and `iosClientId` are hardcoded. Can't be rotated without a code change and new build submission. Move to environment config or native build config.

**C3 — Privacy defaults expose sobriety date and phone number**
`mobile/src/models/MemberModel.ts:34,35,158,159`
`showSobrietyDate` and `showPhoneNumber` both default to `true` in `fromFirestore()` and `addMember()`. For a privacy-first recovery app, these MUST default to `false`. If a Firestore document is missing these fields (migration gap, new user creation race, data corruption), sensitive data is shown to all group members without consent. `UserModel.ts:81,84` correctly defaults to `false` — MemberModel contradicts this.

### Architecture

**C4 — Duplicate slice: gratitudeSlice and engagementSlice**
`mobile/src/store/slices/gratitudeSlice.ts` + `engagementSlice.ts`
Both write to the same Firestore collection with identical thunk names. Both are registered in the Redux store simultaneously. Risk of data races and state inconsistency. One must be chosen and the other removed.

**C5 — God screen: GroupOverviewScreen at 2,507 lines**
`mobile/src/screens/homegroup/GroupOverviewScreen.tsx`
Single file contains navigation to 30+ sub-features: payments, referral dashboard, elections, bylaws, data export, intergroup reports, literature, meeting topics, resource library, analytics, sponsorship UI. MVP responsibility is showing group info, upcoming meetings, and recent announcements.

**C6 — 27 Redux reducers initialized on every app start; 12 are beyond MVP**
`mobile/src/store/index.ts:30`
Non-MVP reducers loaded unconditionally: `brandingSlice`, `intergroupSlice`, `referralSlice`, `gratitudeSlice`, `engagementSlice`, `stepWorkSlice`, `reflectionsSlice`, `literatureSlice`, `groupResourcesSlice`, `groupHealthSlice`, `dashboardSlice`, `sponsorshipSlice`.

**C7 — GroupStackNavigator: 80+ flat routes, MVP and non-MVP mixed**
`mobile/src/navigation/GroupStackNavigator.tsx`
All routes in one flat navigator makes it impossible to lazy-load or feature-flag non-MVP screens. Mixes elections, bylaws, minutes, intergroup reports, sponsorship analytics, QR codes, referral dashboard, public directory, public events, data export with core MVP screens.

### Code Quality

**C8 — SponsorModel: sponsorId set to sponseeId**
`mobile/src/models/SponsorModel.ts:466`

```typescript
sponsorId: request.sponseeId, // BUG: should be the accepting user's ID
sponseeId: request.sponseeId,
```

Both fields hold the sponsee's UID. The sponsor's actual user ID is never recorded. Every sponsorship record created through this path is corrupted.

---

## High (26)

### Security (4)

**H1 — console.log leaks Google Sign-In result including ID token**
`mobile/src/services/firebase/auth.ts:259`
Full result object logged including email, display name, photo URL, and potentially ID token. Accessible via `adb logcat` (Android) or Console.app (iOS).

**H2 — console.log leaks full FCM notification payloads**
`mobile/src/services/notifications/NotificationHandler.ts:55,100-103,129-132`
Entire FCM message logged in foreground, background, and quit-state handlers. Payloads include user names, group names, milestone data, userId, groupId.

**H3 — Auth gate bypass: anonymous "seeker" users reach MainTabNavigator**
`mobile/src/navigation/AppNavigator.tsx:148-151`
Comment on line 141 says "MainTabNavigator will handle limited mode for unauthenticated users" but no visible auth check blocks anonymous users from DM, member list (with phone numbers), or profile screens after onboarding completes.

**H4 — GroupSponsorsScreen ignores user privacy preference for sobriety date**
`mobile/src/screens/homegroup/GroupSponsorsScreen.tsx:57`
`showSobrietyDate: s.sobrietyDate != null` — shows any sponsor's sobriety date if it exists, regardless of their `showSobrietyDate` privacy setting. Cross-group sponsor data doesn't carry the actual preference.

### Architecture (16)

**H5 — Entire intergroup feature is out of MVP scope; contains crash-inducing dead routes**
`mobile/src/screens/intergroup/` (5 screens + navigator + slice)
`IntergroupDashboardScreen.tsx:85,135` navigates to `'IntergroupSettings'` and `'IntergroupUpgrade'` — routes that do not exist in `IntergroupNavigator.tsx`. Runtime navigation crash if users reach these buttons.

**H6 — IntergroupSSOScreen: explicit MVP non-goal**
`mobile/src/screens/intergroup/IntergroupSSOScreen.tsx`
SSO/auto-join is out of scope per PRODUCT_REQUIREMENTS.md.

**H7 — FacilityDashboardScreen: V4.4 enterprise feature**
`mobile/src/screens/intergroup/FacilityDashboardScreen.tsx`

**H8 — Elections: explicit non-goal**
`mobile/src/screens/homegroup/GroupElectionsScreen.tsx` + `ElectionDetailScreen.tsx`
PRODUCT_REQUIREMENTS.md: "Automated governance/voting systems (beyond manual CS workflow)" is out of scope.

**H9 — Group conscience voting: explicit non-goal**
`mobile/src/screens/homegroup/GroupConscienceScreen.tsx` + `CreateConscienceVoteScreen.tsx`

**H10 — Referral/rewards system: not in MVP**
`mobile/src/screens/homegroup/ReferralDashboardScreen.tsx` + `store/slices/referralSlice.ts`
Calls cloud function `getReferralStats` that may not exist.

**H11 — Duplicate SponsorChatScreen**
`mobile/src/screens/homegroup/SponsorChatScreen.tsx` (453 lines) + `mobile/src/screens/sponsor/SponsorChatScreen.tsx` (95 lines)
Only the `homegroup/` version is wired in navigation. The `sponsor/` version is an unreferenced stub.

**H12 — Full sponsorship system: not in MVP**
`mobile/src/screens/homegroup/SponsorshipAnalyticsScreen.tsx` + `GroupSponsorsScreen.tsx` + `store/slices/sponsorshipSlice.ts` (763 lines)

**H13 — BrandingProvider wraps entire app, fires Firestore read on every launch**
`mobile/src/context/BrandingContext.tsx` + `store/slices/brandingSlice.ts`
Registered in `AppNavigator.tsx:143`. V4.4 enterprise white-label feature adds latency for every user on every launch.

**H14 — Step tracker: not in MVP**
`mobile/src/screens/profile/StepTrackerScreen.tsx` + `store/slices/stepWorkSlice.ts` (330 lines)
Registered in both ProfileNavigator and GroupStackNavigator as `SponseeStepProgress`.

**H15 — Gratitude journal: not in MVP; also duplicated in engagementSlice**
`mobile/src/screens/profile/GratitudeJournalScreen.tsx` + `store/slices/gratitudeSlice.ts`

**H16 — Check-in streak / gamification: not in MVP**
`mobile/src/screens/profile/CheckInStreakScreen.tsx` + streak tracking in `engagementSlice`

**H17 — Daily reflections: V4.2 content, not MVP**
`mobile/src/screens/profile/DailyReflectionScreen.tsx` + `store/slices/reflectionsSlice.ts`

**H18 — Literature system: V4.2 content, not MVP**
`mobile/src/screens/profile/LiteratureIndexScreen.tsx` + `LiteratureDetailScreen.tsx` + `ContributeLiteratureScreen.tsx` + `store/slices/literatureSlice.ts`

**H19 — MyRecoveryJourneyScreen: V4.3 personal analytics, not MVP**
`mobile/src/screens/profile/MyRecoveryJourneyScreen.tsx`

**H20 — SobrietyCalculatorScreen duplicates SobrietyTrackerScreen**
`mobile/src/screens/profile/SobrietyCalculatorScreen.tsx`
Two screens computing sobriety math; `SobrietyTrackerScreen.tsx` is the MVP version.

### Code Quality (6)

**H21 — Broken document ID range query in getAllUserMemberDocuments**
`mobile/src/models/MemberModel.ts:735-736`
Member IDs are formatted `${groupId}_${userId}`. The query uses `>= '_${userId}'` (underscore prefix) which never matches — all user-wide member document lookups silently return nothing.

**H22 — Same broken query in updateUserPhotoURL**
`mobile/src/models/MemberModel.ts:782-783`
Identical pattern. Photo URL updates across memberships silently fail to find any documents.

**H23 — photoURL vs photoUrl field name mismatch**
`mobile/src/models/MemberModel.ts:800` (write) vs `:38` (read)
`updateUserPhotoURL` and `updateUserAcrossMemberships` write `photoURL`; `fromFirestore` reads `photoUrl`. Photo updates are permanently lost on read.

**H24 — Filename typo: ForgotPosswordScreen**
`mobile/src/screens/auth/ForgotPosswordScreen.tsx`
Typo (`Possword`) propagates through `AuthNavigator.tsx`, `types/navigation/index.ts`, and `types/index.ts`.

**H25 — Input parameter mutation in GroupModel.toFirestore**
`mobile/src/models/GroupModel.ts:117`
`delete group.meetings` mutates the caller's input object. The caller's `Partial<HomeGroup>` is permanently modified after calling `toFirestore`.

**H26 — ChatModel.initializeGroupChat uses wrong field name**
`mobile/src/models/ChatModel.ts:145`
Writes `timestamp` instead of `sentAt` for the initial "Chat created" message. The domain convention is `sentAt` (number). The timestamp is silently dropped when read back via `fromFirestore`.

---

## Medium (37)

### Security (6)

| #   | Location                             | Issue                                                                                                             |
| --- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| M1  | `NotificationService.ts:102`         | Logs first 20 chars of FCM token (device-identifying)                                                             |
| M2  | `NotificationService.ts:122`         | Logs `userId` alongside FCM token storage                                                                         |
| M3  | `authSlice.ts:222`                   | `console.warn` outputs raw Firebase UID                                                                           |
| M4  | `UserModel.ts:590,715,719`           | Multiple console.log calls output UIDs during onboarding and FCM ops                                              |
| M5  | `DirectMessageScreen.tsx:162-168`    | DM privacy check (`allowDirectMessages`) is client-side only; requires Firestore rule enforcement on `dm_threads` |
| M6  | `MemberModel.ts:605,619,728,754,787` | Excessive userId logging across member operations                                                                 |

### Architecture (25)

| #   | Location                                                                                                                                  | Issue                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| M7  | `navigation/GroupNavigator.tsx`                                                                                                           | Fully commented-out dead file, never imported                             |
| M8  | `navigation/GroupTabNavigator.tsx`                                                                                                        | Mostly-commented dead file, never imported                                |
| M9  | `screens/homegroup/HomegroupMainScreen.tsx` (1,499 lines)                                                                                 | Never imported by any navigator or component; completely orphaned         |
| M10 | `screens/homegroup/PublicDirectoryScreen.tsx`                                                                                             | Registered as route; nothing navigates to it                              |
| M11 | `screens/homegroup/PublicEventsScreen.tsx`                                                                                                | Registered as route; nothing navigates to it                              |
| M12 | `screens/homegroup/MeetingQRCodeScreen.tsx`                                                                                               | QR check-in; not in MVP                                                   |
| M13 | `screens/homegroup/GroupHealthDashboardScreen.tsx` + `AttendanceAnalyticsScreen.tsx` + `TreasuryTrendsScreen.tsx` + `groupHealthSlice.ts` | V4.3 analytics suite                                                      |
| M14 | `screens/homegroup/GroupBylawsScreen.tsx` + `EditBylawsScreen.tsx`                                                                        | V4.1 governance                                                           |
| M15 | `screens/homegroup/MeetingMinutesScreen.tsx` + `EditMeetingMinutesScreen.tsx` + `MinutesArchiveScreen.tsx`                                | V4.1 governance                                                           |
| M16 | `screens/homegroup/TermsDashboardScreen.tsx`                                                                                              | V4.1 term tracking                                                        |
| M17 | `screens/homegroup/IntergroupReportScreen.tsx` + `IntergroupReportHistoryScreen.tsx`                                                      | V4.1 GSR reports                                                          |
| M18 | `screens/homegroup/GroupDataExportScreen.tsx`                                                                                             | V4.4 enterprise data export                                               |
| M19 | `screens/homegroup/GroupDonationScreen.tsx` (1,197 lines) + `PaymentLinksSetupScreen.tsx`                                                 | Marketplace donations — **explicit non-goal** per PRODUCT_REQUIREMENTS.md |
| M20 | `screens/homegroup/GroupResourceLibraryScreen.tsx` + `AddGroupResourceScreen.tsx` + `groupResourcesSlice.ts`                              | V4.2 content                                                              |
| M21 | `screens/homegroup/GroupLiteratureBookmarksScreen.tsx`                                                                                    | V4.2 content                                                              |
| M22 | `screens/homegroup/MeetingTopicsScreen.tsx`                                                                                               | V4.2 content                                                              |
| M23 | `screens/homegroup/PostGroupDailyThoughtScreen.tsx`                                                                                       | V4.2 content                                                              |
| M24 | `store/slices/dashboardSlice.ts`                                                                                                          | Admin metrics, beyond MVP                                                 |
| M25 | `store/slices/recurringTransactionsSlice.ts` + `ManageRecurringScreen.tsx`                                                                | Transaction automation; MVP is basic income/expense entry                 |
| M26 | `store/slices/adminRemovalSlice.ts` + `AdminRemovalRequestsScreen.tsx`                                                                    | Automated admin removal voting — explicit non-goal                        |
| M27 | `screens/homegroup/YearEndSummaryScreen.tsx`                                                                                              | Beyond basic treasury reporting                                           |
| M28 | `screens/homegroup/SecretaryToolkitScreen.tsx` + `MeetingChecklistScreen.tsx`                                                             | Beyond MVP                                                                |
| M29 | `screens/messages/UnifiedInboxScreen.tsx`                                                                                                 | 3rd messaging entry point; MVP specifies group chat + 1:1 DMs             |
| M30 | `models/SponsorModel.ts` + `BusinessMeetingModel.ts` + `TreasurerHandoffModel.ts`                                                         | Models for non-MVP features adding to bundle and import graph             |

### Code Quality (6)

| #   | Location                                  | Issue                                                                                                |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M31 | `store/slices/chatSlice.ts:488`           | `auth().currentUser` called in Redux reducer — side effect; move to thunk                            |
| M32 | `store/slices/directMessagesSlice.ts:522` | Same: `auth().currentUser` in reducer                                                                |
| M33 | `models/ChatModel.ts:75`                  | `sentAt` typed as `number` but `fromFirestore` can return `undefined`; type lie risks runtime errors |
| M34 | `models/MeetingModel.ts:96,103`           | `catch (e) {}` silently swallows date conversion errors                                              |
| M35 | `models/UserModel.ts:342`                 | `catch (e) {}` silently swallows `recoveryDate` conversion                                           |
| M36 | `models/AnnouncementModel.ts:52-57`       | `toFirestore` doesn't convert Date fields to Firestore Timestamps; uses `as any`                     |

---

## Low (13)

### Security (4)

| #   | Location                         | Issue                                                                                                   |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| L1  | `auth.ts:51,82,100,132`          | `console.error` logs full Firebase error objects (may contain request details, user identifiers)        |
| L2  | `authSlice.ts:9`                 | Onboarding state (group IDs, intent, completion) stored in plaintext AsyncStorage                       |
| L3  | `NotificationHandler.ts:148-154` | Notification tap handler logs full data payload including groupId/userId                                |
| L4  | `LoginScreen.tsx:98`             | Full Firebase auth error (may include attempted email) logged; user-facing message is correctly generic |

### Architecture (9)

| #   | Location                                                  | Issue                                                |
| --- | --------------------------------------------------------- | ---------------------------------------------------- |
| L5  | `screens/homegroup/AdminDashboardScreen.tsx`              | Analytics beyond basic admin needs                   |
| L6  | `screens/homegroup/PositionHistoryScreen.tsx`             | Nice-to-have, not MVP                                |
| L7  | `screens/homegroup/GroupCalendarScreen.tsx`               | MVP specifies list view; calendar is incremental     |
| L8  | `screens/homegroup/SavedTreasuryReportsScreen.tsx`        | MVP specifies report generation, not archiving       |
| L9  | `screens/homegroup/GroupPhoneListScreen.tsx`              | Duplicates phone display already in member directory |
| L10 | `screens/homegroup/GroupMilestonesScreen.tsx` (862 lines) | Member celebrations; not explicitly in MVP scope     |
| L11 | `screens/sponsorship/MySponsorshipsScreen.tsx`            | Sponsorship not MVP                                  |
| L12 | `screens/homegroup/GroupChatInfoScreen.tsx`               | Minor addition to MVP chat                           |
| L13 | `screens/onboarding/AdminValuePropScreen.tsx`             | Sales/upsell screen, not core functionality          |

---

## Metrics

| Metric                                    | Value |
| ----------------------------------------- | ----- |
| Total screen files                        | 108   |
| Screens beyond MVP scope                  | ~55   |
| Redux slices                              | 27    |
| Redux slices beyond MVP scope             | ~12   |
| Firestore models                          | 14    |
| Orphaned/dead screens                     | 3     |
| Dead navigator files                      | 2     |
| Duplicate implementations                 | 3     |
| Navigation routes to non-existent screens | 2     |
| Total findings                            | 84    |
