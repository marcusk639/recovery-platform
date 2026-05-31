# RATS v2 — Comprehensive Test Suite Design

**Goal:** Full regression coverage across all core app functionality so that regressions are caught immediately during development with Claude Code.

**Stack:** React Native, Redux Toolkit, React Query, Firebase Firestore, Detox

---

## Architecture: Three-Tier Pyramid

| Tier | Tool | Firebase | Speed | Catches |
|------|------|----------|-------|---------|
| 1. Unit | Jest + mocks | Mocked | < 10s | Logic bugs, data transforms, broken hooks |
| 2. Integration | Jest + emulator | Emulator | ~30s | Firestore query correctness, write/read flows, week transitions |
| 3. E2e | Detox | Real Firebase | ~5 min | Navigation, UI regressions, full user journeys |

**Run commands:**
```bash
npx jest --testPathIgnorePatterns=integration  # Unit only — fast, during dev
npx jest --testPathPattern=integration         # Integration — requires emulator
npx detox test -c ios.sim.debug                # E2e — requires built app + simulator
```

---

## Prerequisite: Fix Jest ESM Config

The `jest.config.js` `transformIgnorePatterns` is missing `immer`, `@reduxjs/toolkit`, and `@react-native-firebase/*`. This causes 7 unit tests to fail with `SyntaxError: Unexpected token 'export'`.

**Fix:**
```js
transformIgnorePatterns: [
  'node_modules/(?!(react-native|@react-native|@react-navigation|@tanstack|immer|@reduxjs/toolkit|@react-native-firebase)/)',
],
```

This unblocks the entire unit tier.

---

## Tier 1: Unit Tests (Jest + Mocked Firebase)

All business logic tested in isolation. Firebase calls are mocked — no network, no emulator required. Target: all tests pass in under 10 seconds.

### Coverage

| Area | Files | Key scenarios |
|------|-------|---------------|
| Entities | `Guest`, `House`, `Activity`, `WeekSummary`, `Oxford/*` | Shape, defaults, validation |
| Services | `guest`, `house`, `weeks`, `meetings`, `migration`, `dispute` | CRUD, edge cases, error paths |
| Hooks | `useWeekSummary`, `useActivities`, `useCurrentWeek`, `useStatSummary`, `useMeetingSearch` | Data transforms, loading/error/empty states |
| Redux slices | `guestsSlice`, `housesSlice`, `userSlice`, `meetingsSlice` | Thunk pending/fulfilled/rejected, state shape |
| Utilities | `display`, `meeting`, `statHelpers`, `week`, `permissions` | Pure function correctness |
| Constants | `Activities` class | `constructActivities`, multi-job/meeting detection |

### File Structure

New tests sit alongside the code they test:

```
src/
  services/__tests__/
    guest.test.ts          ← new
    house.test.ts          ← new
    weeks.test.ts          ← new
    meetings.test.ts       ← new
    dispute.test.ts        ← new
  state/slices/__tests__/
    guestsSlice.test.ts    ← new
    housesSlice.test.ts    ← new
    userSlice.test.ts      ← new
  hooks/activity/__tests__/
    useStatSummary.test.ts ← new
  util/__tests__/
    display.test.ts        ← new
    statHelpers.test.ts    ← new
    meeting.test.ts        ← new
```

---

## Tier 2: Integration Tests (Jest + Firebase Emulator)

Real service functions running against the Firebase emulator — no mocks. Verifies Firestore queries, writes, and cross-document flows are correct.

### Setup

- `jest.config.integration.js` — separate Jest config pointing at `src/integration/**/*.test.ts`
- `src/integration/setup.ts` — connects to emulator (`FIRESTORE_EMULATOR_HOST=localhost:8080`), seeds data before each suite, wipes after
- `package.json` script: `test:integration` — starts emulator, waits for ready, runs tests, kills emulator

### Coverage

| Suite | Scenarios |
|-------|-----------|
| `activity.integration.test.ts` | Log activity → Firestore doc created; dispute → status flips; resolve → resolution stored |
| `weekSummary.integration.test.ts` | Log chore → week summary increments; log meeting → count updates; dispute removes stat |
| `guestWeekTransfer.integration.test.ts` | `advanceGuestWeek` → `currentWeekId` updates; old summary preserved; new empty summary pre-created |
| `guestCRUD.integration.test.ts` | Create guest → readable by houseId query; update fields → reflected in snapshot |
| `meetings.integration.test.ts` | Search by location/day/time → correct results; check-in → activity logged |

### File Structure

```
src/
  integration/
    setup.ts
    activity.integration.test.ts
    weekSummary.integration.test.ts
    guestWeekTransfer.integration.test.ts
    guestCRUD.integration.test.ts
    meetings.integration.test.ts
```

---

## Tier 3: E2e Tests (Detox + Real Firebase)

Full user journeys on a real app binary against real Firebase. Catches navigation regressions, screen render failures, and end-to-end flow breakage.

### Test Accounts (pre-seeded in Firebase)

| Account | Role | Purpose |
|---------|------|---------|
| `test-guest-a@rats-e2e.com` | Guest | Stat updates, check-in |
| `test-operator@rats-e2e.com` | Operator | House setup, invites |
| `test-manager@rats-e2e.com` | Manager | Manager flows |

### Existing Tests (12 — fix to pass)

`auth-login`, `auth-signup`, `signup-via-invite`, `authorization-rbac`, `guest-stats`, `dispute-system`, `guest-invitation`, `manager-invitation`, `house-setup`, `operator-complete-setup`, `activity-system-new`, `activity-verification`

### New Tests (5 — fill coverage gaps)

| File | Coverage |
|------|----------|
| `meeting-search.test.js` | Search meetings by location, check-in flow |
| `guest-medication.test.js` | Medication stat update |
| `notifications.test.js` | Receive and dismiss notification |
| `house-chat.test.js` | Send message, appears in feed |
| `profile-update.test.js` | Update name/sobriety date, persists after reload |

### New Helpers (`e2e/helpers/`)

- `seed.js` — reset guest stats to known state before each test
- `stats.js` — shared stat navigation helpers (reused across all stat test files)

---

## Key Decisions

- **Integration tests use a separate Jest config** — keeps them out of the default `npx jest` run so unit tests remain fast
- **E2e tests use real Firebase** — simpler than emulator + simulator coordination; test accounts are pre-seeded and reset via `seed.js` helper
- **No CI for now** — local only; CI can be layered on top later without redesign
- **Detox iOS sim debug** is the primary e2e target; Android can be added later
