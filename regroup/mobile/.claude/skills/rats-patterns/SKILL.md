---
name: rats-patterns
description: Coding patterns and conventions extracted from the RATS sober living React Native app. Use when adding screens to src/screens/, creating service files, writing Firestore rules, or scaffolding new features. Triggers on: add screen, new feature, RATS conventions, where do I put, screen structure, service pattern, React Native pattern, Firebase service, how do we do X in this project.
version: 1.0.0
source: local-git-analysis
analyzed_commits: 200
---

# RATS App Patterns

## Commit Conventions

Strict **conventional commits** with optional scopes:

| Type       | Count | Usage                                                              |
| ---------- | ----- | ------------------------------------------------------------------ |
| `fix`      | ~45   | Bug fixes, often scoped: `fix(oxford):`, `fix(security):`          |
| `feat`     | ~40   | New features, scoped by domain: `feat(payments):`, `feat(oxford):` |
| `refactor` | ~15   | Code restructuring, extractions                                    |
| `test`     | ~25   | Test rounds, integration tests                                     |
| `docs`     | ~15   | Plans, architecture docs                                           |
| `chore`    | ~8    | Config, tooling                                                    |
| `perf`     | ~2    | Performance improvements                                           |

Common scopes: `oxford`, `payments`, `security`, `navigation`, `ux`, `reliability`, `migration`

Commit messages are descriptive — explain the _why_ after the type prefix:

```
fix(oxford): guard attendance toggle before state mutation; revert on failure; add error path test
feat: rebuild PaymentDashboard with React Query, date filters, stats card, bar chart, and manual payment FAB
```

## Code Architecture

```
src/
├── components/       # Reusable UI components (rats-* prefix for custom library)
├── config/           # Firebase, emulator configuration
├── constants/        # App-wide constants
├── context/          # React Context providers (DataContext)
├── entities/         # TypeScript domain models (Guest, House, ActivityModel, Vote, etc.)
├── forms/            # Form definitions
├── hooks/            # Custom hooks (useStatSummary, useBaseActivityScreen, activity/)
├── integration/      # Integration test setup
├── navigation/       # React Navigation config, types, navigators
├── screens/          # Feature screens organized by domain (30+ screen folders)
├── services/         # Firestore CRUD, Cloud Function callers, notifications
├── settings/         # App settings
├── state/            # Redux Toolkit store
│   ├── queries/      # React Query definitions (activityQueries, paymentQueries)
│   ├── selectors/    # Memoized selectors (createSelector from reselect)
│   └── slices/       # Redux slices (guestsSlice, etc.)
├── styles/           # Shared styles
├── types/            # Global TypeScript types
└── util/             # Utility functions (compliance, guest, house, subscription)
```

## Key Patterns

### Screen Organization

Each screen lives in its own directory with co-located tests:

```
src/screens/Oxford/
├── BusinessMeetingDetail.tsx
├── BusinessMeetings.tsx
├── EESTracker.tsx
├── OfficerManagement.tsx
├── OxfordDashboard.tsx
├── Voting.tsx
└── __tests__/
    ├── BusinessMeetingDetail.test.tsx
    ├── BusinessMeetings.test.tsx
    ├── OfficerManagement.test.tsx
    ├── OxfordDashboard.test.tsx
    └── Voting.test.tsx
```

### Component Extraction Pattern

Large screens are refactored by extracting sub-components into the same directory:

```
src/screens/RentPayment/
├── PaymentRow.tsx            # Extracted component
├── PaymentStatusBadge.tsx    # Extracted component
├── RentPaymentScreen.tsx     # Main screen
├── rentPaymentHelpers.ts     # Extracted helpers
└── __tests__/
    ├── PaymentRow.test.tsx
    └── PaymentStatusBadge.test.tsx
```

### Service Layer

Services wrap Firestore operations and Cloud Function calls:

- One service file per domain: `payments.ts`, `guest.tsx`, `house.tsx`
- Cloud Function calls use `httpsCallable` from Firebase
- Tests in `services/__tests__/`
- Domain-specific services nested: `services/oxford/votes.ts`, `services/notifications/`

### Entity Pattern

Entities are TypeScript interfaces/types in `src/entities/`:

- Define Firestore document shapes
- Use `.tsx` extension when they include JSX helpers (legacy pattern)
- Newer entities use `.ts` extension

### State Management (Hybrid)

- **Redux Toolkit**: Slices for client state (guests, reports)
- **React Query**: Server state via `src/state/queries/` (activity, payments)
- **Memoized selectors**: `createSelector` in `src/state/selectors/`
- Migration in progress from Redux → React Query for server data

### Error Handling

- Replace `console.error` with `logException` (Sentry-compatible)
- Remove production console statements
- Add error callbacks to Firestore `onSnapshot` subscriptions
- Use `Promise.allSettled` for parallel operations that can partially fail

### Security Rules

- Firestore rules in `firebase/firestore.rules`
- Tests in `firebase/__tests__/firestore.rules.test.ts`
- Use `get()` for ownership verification, not just auth UID matching

## Testing Patterns

- **Framework**: Jest + React Native Testing Library
- **Test files**: `__tests__/` directories co-located with source
- **270+ test files** across the codebase
- **Naming**: `ComponentName.test.tsx` or `moduleName.test.ts`
- **E2E**: Detox for iOS/Android (`e2e/tests/`)
- **Integration**: Separate jest config (`jest.config.integration.js`)
- **Coverage target**: 80%+
- Tests written alongside features (TDD approach in recent commits)

### Test Co-change Pattern

Features and their tests always change together. The most frequent co-changes:

- `OfficerManagement.tsx` ↔ `OfficerManagement.test.tsx` (7 commits each)
- `GuestList.tsx` ↔ `GuestList.test.tsx` (5+ commits each)
- `ResidentPayment.tsx` ↔ `ResidentPayment.test.tsx` (6 commits each)

## Workflows

### Adding a New Screen Feature

1. Create screen component in `src/screens/FeatureName/`
2. Add entity type in `src/entities/` if needed
3. Create service in `src/services/` for Firestore operations
4. Add tests in `src/screens/FeatureName/__tests__/`
5. Wire up navigation in `src/navigation/navigators.tsx`

### Adding a New Service Function

1. Add function to appropriate service file in `src/services/`
2. Add corresponding test in `src/services/__tests__/`
3. If Firestore rules needed, update `firebase/firestore.rules` + tests

### Refactoring a Large Screen

1. Extract sub-components into the same screen directory
2. Extract helpers into `*Helpers.ts` file
3. Add tests for each extracted component
4. Keep the main screen file thin

### Security Rule Changes

1. Update `firebase/firestore.rules`
2. Add/update tests in `firebase/__tests__/firestore.rules.test.ts`
3. Use `get()` for ownership checks, not just `request.auth.uid`

## Domain Context

RATS is a **sober living house management app** with these feature domains:

- **Oxford**: Oxford House governance (meetings, officers, voting, EES tracking)
- **Payments**: Rent payment processing via Stripe
- **Activity**: Guest activity tracking (chores, medication, meetings, work, supporters)
- **House Management**: Guest lists, bed assignments, house configuration
- **Notifications**: Rent reminders, push notifications
- **Subscription**: Feature gating via subscription tiers (e.g., `oxfordEnabled`)
