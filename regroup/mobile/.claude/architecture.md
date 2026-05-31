# Architecture

## Provider Tree (`App.tsx`)

```
ErrorBoundary > SafeAreaProvider > StripeProvider > ThemeProvider
  > DataProvider > NotificationProvider > ModalProvider > Auth > RootNavigator
```

## State Management (hybrid)

**Redux Toolkit** for client/UI state — 12 slices in `src/state/slices/`:

- UI: `uiSlice`, `authSlice`, `themeSlice`, `navigationSlice`
- Entities (async thunks): `userSlice`, `housesSlice`, `guestsSlice`, `meetingsSlice`, `adminSlice`
- Features: `chatSlice`, `setupSlice`, `notificationsSlice`

**React Query** (`@tanstack/react-query`) for server data — `src/state/queries/`:

| Query File                 | Key Hooks                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `activityQueries`          | `useActivities`, `useInfiniteActivities`, `useHouseActivities`, `useWeekSummary`, `useLogNewActivity` |
| `adminQueries`             | `useHouseAdmins`, `useAdmin`, `useUpdateAdmin`                                                        |
| `applicationQueries`       | Guest/resident application hooks                                                                      |
| `charterComplianceQueries` | Charter compliance scoring hooks                                                                      |
| `choreRotationQueries`     | Chore rotation schedule hooks                                                                         |
| `disputeQueries`           | `useDisputes`                                                                                         |
| `documentQueries`          | House document upload/list/delete hooks                                                               |
| `drugTestQueries`          | Drug test record hooks                                                                                |
| `guestQueries`             | `useGuests`, `useGuest`, `useUpdateGuest`, `useCreateGuest`                                           |
| `houseQueries`             | `useHouse`, `useHouses`, `useNearbyHouses`, `useCreateHouse`, `useUpdateHouse`                        |
| `meetingQueries`           | Meeting search and check-in hooks                                                                     |
| `notificationQueries`      | `useNotifications`, `useMarkNotificationRead`                                                         |
| `oxfordQueries`            | `useOfficers`, `useBusinessMeetings`, `useMeetingVotes`, `useElections`, `useEESTransactions`         |
| `paymentQueries`           | `usePaymentHistory`, `useCreateRentPayment`                                                           |
| `phaseAdvancementQueries`  | Phase advancement eligibility hooks                                                                   |
| `reportingQueries`         | Admin report and analytics hooks                                                                      |
| `staffNoteQueries`         | Resident notes and shift log hooks                                                                    |
| `treasuryQueries`          | Financial record hooks (Oxford treasury)                                                              |

Typed hooks: `useAppSelector` / `useAppDispatch` from `src/state/store.ts`.

## Navigation

React Navigation 7 native stack. Route names: `Routes` enum in `src/navigation/types.ts`.

**Phase 6.1 (current):** Flat `RootStack` — all screens registered directly in `RootStackParamList`. Nested sub-stacks (HouseStack, GuestStack, ContactsStack) were removed. Only `AuthStack` and `MainTab` remain as child navigators.

- `AuthStackParamList` — login, signup, onboarding, house search, manager intro
- `MainTabParamList` — bottom tabs: House, Guest, Activities, Contacts, HouseChat, Personal
- `RootStackParamList` — everything else pushed as full-screen modals from any tab

Key modal routes: OxfordDashboard, OfficerManagement, EESTracker, BusinessMeetings, OxfordVoting, CharterCompliance, TreasuryDashboard, ResidentPayment, PaymentHistory, PaymentDashboard, RentPayment, HouseSettings, StripeSettings, Notifications, DrugTesting, DrugTestForm, DrugTestHistory, StaffNotes, ResidentIntake, Documents, BalanceDashboard, ApplicationList, ApplicationDetail, GuestImport, AdminReport, PhaseSetup, ChoreRotationSetup.

## Service Layer

`src/services/` wraps all Firestore reads/writes and Cloud Function calls.

| Service                         | Key Operations                                            |
| ------------------------------- | --------------------------------------------------------- |
| `activity.ts`                   | Log, update, paginate, subscribe, offline support         |
| `admin.tsx`                     | Admin record management                                   |
| `applications.ts`               | Guest/resident application CRUD, status updates           |
| `choreRotation.ts`              | Chore rotation schedule management                        |
| `complaints.ts`                 | Complaint CRUD                                            |
| `crud.tsx`                      | Reusable generic CRUD operations                          |
| `dispute.tsx`                   | Activity dispute workflow                                 |
| `documents.ts`                  | House document upload, list, delete (admin-only)          |
| `drugTests.ts`                  | Drug test record creation and history                     |
| `EnhancedAuthService.ts`        | Sign in/up with rate limiting + validation                |
| `feedback.ts`                   | User feedback submissions                                 |
| `guest.tsx`                     | CRUD with optimistic locking, transactions, stat merging  |
| `guestImport.ts`                | Bulk guest import from CSV/data                           |
| `house.tsx`                     | CRUD, nearby search, admin management, batch create       |
| `invites.ts`                    | Admin/guest invitation email dispatch                     |
| `issues.ts`                     | House maintenance issue CRUD                              |
| `meeting.ts`                    | Search, check-in (calls Cloud Functions)                  |
| `message.tsx`                   | DM conversations, house chat messages                     |
| `notifications.tsx`             | Fetch, mark read, FCM token registration                  |
| `notifications/rentReminder.ts` | Scheduled rent reminder logic                             |
| `offlineQueue.ts`               | Queue failed writes, retry with backoff (AsyncStorage)    |
| `organization.ts`               | Multi-house organization management                       |
| `payments.ts`                   | Payment intent creation, history (calls Cloud Functions)  |
| `paywall.ts`                    | Subscription status gate — operator vs guest grace period |
| `phaseAdvancement.ts`           | Phase advancement eligibility + automation                |
| `receiptService.ts`             | Payment receipt generation                                |
| `reportExport.ts`               | PDF/CSV export for activity and compliance reports        |
| `reportingService.ts`           | Admin analytics and reporting aggregation                 |
| `setup-wizard.ts`               | House onboarding wizard steps                             |
| `SimpleValidationService.ts`    | Form field validation helpers                             |
| `staffNotes.ts`                 | Resident notes and shift log entries                      |
| `storage.tsx`                   | Cloud Storage upload for house photos, avatars, reports   |
| `subscription.ts`               | Subscription status helpers and upgrade flows             |
| `treasury.ts`                   | Oxford financial record CRUD                              |
| `treasuryReport.ts`             | Oxford treasury report generation                         |
| `users.tsx`                     | User profile CRUD                                         |
| `oxford/index.ts`               | Oxford officer management                                 |
| `oxford/businessMeetings.ts`    | Business meeting CRUD                                     |
| `oxford/charterCompliance.ts`   | Charter compliance scoring and monitoring                 |
| `oxford/ees.ts`                 | Equal Expense Share calculations                          |
| `oxford/votes.ts`               | Vote creation, casting (with Firestore transactions)      |

## DataContext

`src/context/DataContext.tsx` — provides current user, house, guest, admin entities to the tree. Dispatches Redux thunks on auth state / role changes.

## Auth & Roles

Firebase custom claims: `guest`, `admin`, `superAdmin`, `potentialSuperAdmin`.

`Auth` class component (`src/components/auth/auth.tsx`) parses ID token claims → `RoleToken` via `src/context/auth.ts`.

- `useData()` — current user/house/guest
- `useModal()` / `useNotification()` — context helpers

`isAdmin()` in Firestore rules returns true for both `admin` and `superAdmin` — always use it instead of checking individual roles.

**`auth` is a singleton** — use `auth.currentUser` (not `auth().currentUser`).

## Subscription & Paywall

`src/services/paywall.ts` reads `user.subscriptionMetadata.status` on foreground resume. Gate logic:

- **Operators (admin/superAdmin):** lapsed subscription → `SubscriptionRequiredScreen` blocks all app access
- **Guests:** 7-day grace window after operator lapses → dismissible banner → `GraceExpiredScreen`
- **potentialSuperAdmin / setup-incomplete users:** not gated (routed to SetupStack before gate runs)

Oxford features are additionally gated by `houseOxfordActive()` in Firestore rules (requires `oxfordEnabled == true` AND `subscriptionStatus ∈ {active, trialing}`).

## Domain Entities

TypeScript interfaces in `src/entities/` define Firestore document shapes. Newer files use `.ts`; legacy files use `.tsx` (embedded JSX helpers — do not create new `.tsx` entities).

| Entity                     | Key Fields                                                                                                         | Notes                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `User`                     | uid, email, roles, housesOwned, subscriptionMetadata, messagingToken[]                                             | Keyed by Firebase Auth UID                                   |
| `House`                    | id, name, location, adminIds[], capacity, monthlyRent, stripeAccountId, phases, chores, health, subscriptionStatus | `subscriptionStatus` defaults to `'trialing'` for new houses |
| `Guest`                    | id, userId, houseId, sobrietyDate, phase, step, status, rentOwed, supporters[]                                     | Optimistic locking via `version` field                       |
| `Activity`                 | id, guestId, houseId, type, timestamp, data, verified, status                                                      | type: chore/meeting/work/medication/primarySupporter         |
| `WeekSummary`              | id (guestId_startDate), stats, dailyStats, phaseRequirementsMet                                                    | Pre-aggregated weekly rollups                                |
| `Meeting`                  | id, houseId, type (AA/NA/Custom), location, day, time                                                              | App-created and external API meetings                        |
| `Admin`                    | id, userId, houseIds[], email                                                                                      | Maps user to admin role                                      |
| `Notification`             | userId, subject, message, type, read, date                                                                         | Written by Cloud Functions                                   |
| `Dispute`                  | id, guestId, activityId, status, challenges[]                                                                      | Immutable resolution chain                                   |
| `Application`              | id, houseId, applicantUid, status, profile data                                                                    | Stored in `houses/{id}/applications` subcollection           |
| `Document`                 | id, houseId, name, url, uploadedBy, createdAt                                                                      | Admin-only; stored in top-level `documents` collection       |
| `DrugTest`                 | id, houseId, guestId, result, observedBy, testedAt                                                                 | Immutable audit trail; admin-only write                      |
| `Room`                     | id, houseId, name, capacity, beds[]                                                                                | Embedded in house document                                   |
| `StaffNote`                | id, houseId, guestId?, type (resident_note/shift_log), body, authorId                                              | Shift logs have no guestId                                   |
| `Chore`                    | id, name, assignedTo, frequency, rotationIndex                                                                     | Embedded in house document                                   |
| `Phase`                    | id, name, duration, requirements (meetings/work/chores/sponsor)                                                    | Embedded in house document                                   |
| `Organization`             | id, name, ownerId, houseIds[]                                                                                      | Multi-house operator grouping                                |
| `oxford/Officer`           | id, houseId, userId, role, termStart, termEnd, status                                                              | role: president/treasurer/secretary/comptroller              |
| `oxford/BusinessMeeting`   | id, houseId, scheduledDate, attendees[], agendaItems[], minutes, votesHeld[]                                       | Mandatory weekly Oxford meeting                              |
| `oxford/Vote`              | id, houseId, type, results, individualVotes, isAnonymous, status                                                   | Immutable once created                                       |
| `oxford/Election`          | id, houseId, position, candidates[], outcome                                                                       | Officer election record                                      |
| `oxford/EESTransaction`    | id, houseId, residentId, amount, status                                                                            | Equal Expense Share payment record                           |
| `oxford/FinancialRecord`   | id, houseId, category, amount, description, date                                                                   | House expense audit trail                                    |
| `oxford/CharterCompliance` | houseId, democraticGovernance score, financialSelfSufficiency score, zeroTolerance score, overallCompliance        | Computed from meeting/vote/EES data                          |

## Domain Concepts

| Term                   | Meaning                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **House**              | A sober living residence managed by an operator                                                                                     |
| **Guest**              | A resident of a house                                                                                                               |
| **Oxford**             | Oxford House governance features (officers, meetings, voting, EES, charter compliance) — gated by `oxfordEnabled` subscription flag |
| **Activity**           | Unified tracking model for meetings, chores, work, medication, supporters (replaced legacy Week/Day models)                         |
| **Charter Compliance** | Scoring system for the three Oxford House charter conditions: democratic governance, financial self-sufficiency, zero tolerance     |
| **EES**                | Equal Expense Share — every Oxford House resident pays the same amount; auto-recalculates on resident add/remove                    |
| **Phase**              | Stage of recovery program (traditional houses only); requirements differ per phase                                                  |
| **Dispute**            | Admin-initiated challenge to a guest's logged activity; resolved via admin decision                                                 |
| **Paywall**            | Subscription enforcement: operators are hard-blocked on lapse; guests get a 7-day grace window                                      |
