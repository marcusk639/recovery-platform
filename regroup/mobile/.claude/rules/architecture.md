---
description: Provider tree, state management, navigation, entities, domain concepts
paths: 'src/**/*.{ts,tsx}'
---

# Architecture

## Provider Tree (`App.tsx`)

```
ErrorBoundary > SafeAreaProvider > StripeProvider > ThemeProvider
  > DataProvider > NotificationProvider > ModalProvider > Auth > VersionGate > RootNavigator
```

`VersionGate` (`src/components/version-gate/`) shows `UpdateRequiredScreen` when this build's `APP_VERSION` (`src/config/appVersion.ts`) is below the public `getAppConfig` callable's minimum for its platform. It runs before sign-in and fails open: loading, an error, a 3 s timeout, or a missing or malformed value lets the user in. Refetched on foreground.

## State Management (hybrid)

**Redux Toolkit** for client/UI state — 10 slices in `src/state/slices/` (re-exported from `src/state/slices/index.ts`):

- UI: `authSlice`, `themeSlice`
- Entities (async thunks): `userSlice`, `housesSlice`, `guestsSlice`, `meetingsSlice`, `adminSlice`
- Features: `chatSlice`, `setupSlice` (plus `setupSelectors.ts`, `setupRecoveryThunk.ts`), `notificationsSlice`

There is no `uiSlice`, `navigationSlice` or `cacheSlice`.

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

**Phase 6.1 (current):** Flat `RootStack` — all screens registered directly in `RootStackParamList`. Nested sub-stacks (HouseStack, GuestStack, ContactsStack) were removed. Three child navigators remain: `AuthStack`, `SetupStack` and `MainTab` (`src/navigation/navigators.tsx`).

- `AuthStackParamList` — login, signup, onboarding, house search, manager intro
- `SetupStackParamList` — operator onboarding: `OrgSetup`, `OperatorSetupWizard` (`SetupNavigator`)
- `MainTabParamList` — bottom tabs: House, Guest, Activities, Contacts, HouseChat, Personal
- `RootStackParamList` — everything else pushed as full-screen modals from any tab

**Deep links:** `linkingConfig` (`src/navigation/linking.ts`) is passed to `<NavigationContainer linking>` in `index.js`. Prefixes come from `appLinkPrefixes()` (`regroup-app://`, legacy `com.rats.dev://`, and the origin of `webBaseUrl()` only when it is a valid `https://host`, `http:` in dev builds only). It resolves only an allowlist: the six Main tabs (`app/house|guest|activities|contacts|chat|personal`), `auth/login` and `auth/signup/:invitation?` (the param is never read). No operator-only, paywalled or SubscriptionGate-bypassing screen is listed. An `app/*` link opens only for a signed-in, non-anonymous Firebase user; otherwise it is dropped and the app stays on the landing screen. Invitation and checkout-return URLs are not navigation: `parseAppLink` (`src/services/appLinks/parseAppLink.ts`) is the only parser, the config's `getInitialURL` and `subscribe` hold back every full URL it claims (so the guard follows its per-prefix rules), and Splash hands them to `deliverAppLink` (initial URL and listener). A link that claims to be an invitation but does not parse (`claimsInvitation`: the `invite` route, or the custom scheme's `type=invitation`) still reaches Splash, which shows "Invitation link not valid" (`services/appLinks/brokenInvitation.ts`) instead of opening the app silently; any other unparseable link is dropped. Accepted forms: `?type=invitation&token=` and `invite?token=` on either custom scheme or `https://<web origin>/invite?token=`, the legacy `?type=invitation&house=…&email=…`, and `checkout-return?result=success|canceled|portal` (also `app/checkout-return`, on either the custom scheme or https; https `/checkout-return`). An invitation goes to `state.user.invitation` (signup when signed out; signed in, `improvedNavigationService.navigateToInvitation()` opens the same screen, and a cold start opens it through `handleInvitationFlow`). A user who was already signed in when the invitation reached SignUp sees `SignedInInvitation` instead of the form (an account the sign-up itself just created keeps the form): "Accept as this account" (token invitations: refused before any redeem when the account already has an admins record and the invitation is a manager one, or is a resident of another house and the invitation is a resident one; otherwise `redeemInvitation`, force-refreshed ID token, the same membership records sign-up writes via `src/services/invitationMembership.ts` (resident record + `isGuest`/`houseId`/`guestId`, or admins record + `isAdmin`/`adminId`), reloaded user) and "Continue to the app", both clear the invitation and reset to `getInitialNavigation`'s start route (`resetToStartRoute`). The invitation is also cleared when sign-up finishes (NewAccount) and on logout. It survives a login (launch spec §4.2): after any login with an invitation held, LoginForm opens SignUp, so a user who opened an invitation signed out and then logged in to an existing account (finished profile or not) gets the same accept / continue screen. Any other link that arrives signed out is held in `state.user.pendingAppLink` (with `pendingAppLinkReceivedAt`) and delivered once after sign-in if under 15 minutes old; logout clears it. Add a route to the allowlist only with a test in `src/navigation/__tests__/linking.test.ts`. **Link registrations** follow `regroup/app-links.json` (the source of the web's AASA and assetlinks.json): iOS associated domains are `applinks:regroup-app.com` in `rats.entitlements` / `ratsDebug.entitlements` and `applinks:regroup-e2e.web.app` in `ratsE2EStaging.entitlements` (the E2EStaging configuration); Android's verified https filter takes its host from the `appLinkHost` manifest placeholder (`build.gradle`: `regroup-app.com` by default, `regroup-e2e.web.app` for `e2eStaging`) and claims exactly the paths in `app-links.json`. `scripts/app-link-registrations.test.js` keeps them in agreement. `applinks:cleanhouse.page.link` and the `example` URL scheme stay until the release after launch. The JSON files `apple-app-site-association` and `.well-known/apple-app-site-association` in this directory are stale (they claim `*` and are not served); the served files come from `regroup/web`.

Key modal routes: OxfordDashboard, OfficerManagement, EESTracker, BusinessMeetings, BusinessMeetingDetail, OxfordVoting, CharterCompliance, TreasuryDashboard, ResidentPayment, PaymentHistory, PaymentDashboard, RentPayment, HouseSettings, StripeSettings, Notifications, DrugTesting, DrugTestForm, DrugTestHistory, StaffNotes, ResidentIntake, Documents, BalanceDashboard, ApplicationList, ApplicationDetail, GuestImport, AdminReport, PhaseSetup. (`ChoreRotationSetupScreen` exists in `src/screens/HouseSettings/` but is not registered as a route.)

**Role checks on operator-only screens (P5 Task 20):** the modal routes sit outside `SubscriptionGate`, so each operator-only screen is registered behind `RequireHouseRole` (`src/components/require-house-role/`) through `src/navigation/guardedScreens.ts`: DrugTesting, DrugTestForm, DrugTestHistory, ResidentIntake, ApplicationList, ApplicationDetail, GuestImport, HouseSettings and StaffNotes need house staff (`admin` or `superAdmin` claim); BalanceDashboard, PaymentDashboard and AdminReport also need the owner or manager tier (`useHouseMoneyAccess`, myHouseTiers), never a peer leader; StripeSettings (Stripe Connect setup) needs the owner (`superAdmin` claim), because the Connect callables accept only the house's owners. The house checked is the route's `houseId`, else the selected house. A new operator-only screen goes in `guardedScreens.ts` (its test pins the list), not straight into `navigators.tsx`. Entry points hide these too (HouseSummary's three staff sections; House Settings shows Payments to owners and Payment Dashboard/Balances to owners and managers); the rules stay the last line. Not in the list on purpose: the Oxford screens (officers, treasury, voting, business meetings) are for every member of a resident-run house (the rules let residents read the financial records and vote), so an admin-only guard would lock residents out; the rules gate the writes (admin, officer, `houseOxfordActive`). The remaining modals (GuestList, SendInvites, PhaseSetup, NewMeeting, …) were outside P5 Task 20's list and are rules-only.

## Service Layer

`src/services/` wraps all Firestore reads/writes and Cloud Function calls.

| Service                         | Key Operations                                            |
| ------------------------------- | --------------------------------------------------------- |
| `activity.ts`                   | Log, update, paginate, subscribe                          |
| `admin.tsx`                     | Admin record management                                   |
| `applications.ts`               | Guest/resident application CRUD, status updates           |
| `choreRotation.ts`              | Chore rotation schedule management                        |
| `complaints.ts`                 | Complaint CRUD                                            |
| `crud.tsx`                      | Reusable generic CRUD operations                          |
| `dispute.tsx`                   | Activity dispute workflow                                 |
| `documents.ts`                  | House document upload, list, delete (staff); residents read their own |
| `drugTests.ts`                  | Drug test record creation and history                     |
| `EnhancedAuthService.ts`        | Sign in/up with rate limiting + validation                |
| `feedback.ts`                   | User feedback submissions                                 |
| `guest.tsx`                     | CRUD with optimistic locking, transactions, stat merging  |
| `guestImport.ts`                | Bulk guest import from CSV/data                           |
| `house.tsx`                     | CRUD, nearby search, admin management, batch create       |
| `invitations.ts`                | Invitation callables: create, peek, redeem                 |
| `issues.ts`                     | House maintenance issue CRUD                              |
| `meeting.ts`                    | Search, check-in (calls Cloud Functions)                  |
| `message.tsx`                   | DM conversations, house chat messages                     |
| `notifications.tsx`             | Fetch, mark read, FCM token registration                  |
| `notifications/rentReminder.ts` | Rent reminder as a react-native-notify-kit trigger        |
| `notifications/channels.ts`     | Android channels (`default`, `default-channel-id`)        |
| `notifications/remoteMessage.ts`| FCM message handling                                      |
| `organization.ts`               | Multi-house organization management                       |
| `payments.ts`                   | Payment intent creation, history (calls Cloud Functions)  |
| `paywall.ts`                    | `paywallConfigRef` only (the `paywall/config` kill switch) |
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

There is no offline write queue: no `offlineQueue` service exists, and a failed write surfaces to its caller.

## DataContext

`src/context/DataContext.tsx` — provides current user, house, guest, admin entities to the tree. Dispatches Redux thunks on auth state / role changes.

## Auth & Roles

Firebase custom claims: `guest`, `admin`, `superAdmin`, `potentialSuperAdmin`.

`Auth` class component (`src/components/auth/auth.tsx`) parses ID token claims → `RoleToken` via `src/context/auth.ts`.

- `useData()` — current user/house/guest
- `useModal()` / `useNotification()` — context helpers

`isAdmin()` in Firestore rules returns true for both `admin` and `superAdmin` — always use it instead of checking individual roles.

**`auth` is a singleton** — the modular `Auth` instance from `firebase-setup.ts`: use `auth.currentUser` and pass `auth` to modular functions (`signOut(auth)`), never `auth()`.

## Subscription & Paywall

The gate is `SubscriptionGate` (`src/components/subscription/SubscriptionGate.tsx`), which wraps the main navigator and renders the result of `useSubscriptionGate()` (`src/hooks/useSubscriptionGate.ts`). For operators and guests alike it reads the selected house's `subscriptionStatus` and `guestGraceEndsAt` (the fields the Stripe webhook writes), not `user.subscriptionMetadata.status`. A house with no status yet shows a spinner, not a paywall. The `paywall/config` kill switch (`paywallConfigRef` in `src/services/paywall.ts`) can turn the gate off. On a background → active change, the gate invalidates the user and house queries so status refreshes after the billing portal. Gate logic:

- **Operators (admin/superAdmin):** lapsed subscription → `SubscriptionRequiredScreen` blocks all app access
- **Guests:** 7-day grace window after operator lapses → dismissible banner → `ResidentLimitedView` (`grace_expired`, which a plan-required house also gives): only their own Payment History (with CSV export) and their own Documents, read-only, plus sign out. Modal routes sit outside the gate, so none may be deep-linkable (the `linking` allowlist; `limitedViewLinks.test.ts` pins these two).
- **potentialSuperAdmin / setup-incomplete users:** not gated (routed to SetupStack before gate runs)

A resident's document access (owner decision 2026-11-26): their own documents only, read-only, from GuestHome's **My Documents** card (`my-documents-card`) in an active house or from `ResidentLimitedView` in a blocked one; staff keep the **Documents** card. The rules read the ID token's guest claim, so a resident who moved out still sees their own document list (names only) for up to an hour, until the token refreshes; accepted for launch. `getDocumentLink` reads live claims, so the files don't open.

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
| `Document`                 | id, houseId, name, url, uploadedBy, createdAt                                                                      | Staff manage; a resident reads their own (`guestId` = their guest record): GuestHome's My Documents card, or the limited view. Top-level `documents` |
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
