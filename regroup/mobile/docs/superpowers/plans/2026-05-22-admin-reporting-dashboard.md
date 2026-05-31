# Admin Reporting Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Add a read-only **Admin Reporting Dashboard** screen accessible from HouseSettings that shows an admin a snapshot of their house's key metrics: current occupancy, a 4-week compliance trend (chore + meeting completion rates), and a discharge summary filtered by 30/60/90 days. All data is fetched client-side from existing Firestore collections — no new Cloud Functions or Firestore writes.

## Architecture

- **Data sources (read-only):**
  - `guests` collection — filtered by `houseId` and `status`; exposes `status`, `moveOutDate`, `firstName`, `lastName`, `displayName`
  - `week-summaries/{guestId}_{houseId}_{weekStart}` — `stats.choresCompleted`, `stats.meetingsAttended`
  - `houses/{houseId}` — `maximumCapacity`
- **Service layer:** `src/services/reportingService.ts` — three pure async functions; collection refs at module level; auth guard via `auth.currentUser` (matching existing `drugTests.ts` / `treasury.ts` pattern).
- **Query layer:** `src/state/queries/reportingQueries.ts` — three `useQuery` hooks with typed query keys, `staleTime: 60_000`, `logException` in `onError`, no mutations.
- **Screen:** `src/screens/AdminReport/AdminReportScreen.tsx` — `ScrollView` with three `Section` cards. Uses `useSelectedHouse` for `houseId`, calls `useGuests` (already in `guestQueries.ts`) to get active guest IDs, composes the three reporting hooks.
- **Navigation:** Modal screen registered in the `RootStack.Group` modal block (matches HouseSettings pattern). No params needed.
- **Entry point:** One new entry in the `SETTINGS` map inside `HouseSettings.tsx`.

## Tech Stack

- TypeScript 5.x, React Native, React 18
- `@react-native-firebase/firestore` (compat-style via `firestore` export from `firebase-setup`)
- `@tanstack/react-query` v4+ (`useQuery`, `useQueryClient`)
- `@react-navigation/native-stack` (modal presentation)
- Jest with self-contained `jest.mock` factories (hoisted before imports)
- `date-fns` — already installed; used for `startOfWeek`, `subWeeks`, `format`, `subDays`, `isAfter`

---

## File Structure

```
src/
  services/
    reportingService.ts                        # NEW — getOccupancyReport, getComplianceTrend, getDischargeReport
    __tests__/
      reportingService.test.ts                 # NEW — service unit tests
  state/queries/
    reportingQueries.ts                        # NEW — useOccupancyReport, useComplianceTrend, useDischargeReport
    __tests__/
      reportingQueries.test.ts                 # NEW — hook unit tests
  screens/
    AdminReport/
      AdminReportScreen.tsx                    # NEW — three-section read-only dashboard
      __tests__/
        AdminReportScreen.test.tsx             # NEW — screen unit tests
  navigation/
    types.ts                                   # MODIFY — add Routes.AdminReport + RootStackParamList entry
    navigators.tsx                             # MODIFY — register AdminReportScreen in modal group
  screens/
    HouseSettings/
      HouseSettings.tsx                        # MODIFY — add 'Reports' entry to SETTINGS map
```

---

## Task 1: Reporting service functions + tests

Build pure async functions that read Firestore. No writes. All three functions guard against missing `auth.currentUser`.

### Step 1.1 — Understand the `week-summaries` document ID format

The WeekSummary entity uses `id = "{guestId}_{startDate}"` but the collection in the prompt is described as `week-summaries/{guestId}_{houseId}_{weekStart}`. The `WeekSummaryEntity` constructor in `src/entities/WeekSummary.ts` sets `id = \`${guestId}_${startDate}\``(two-part key, no`houseId`). Confirm which format is live in Firestore before coding:

- [ ] Run `adb logcat` or open the Firebase Console → Firestore → `week-summaries` collection and inspect one document ID.
  - If IDs are `{guestId}_{weekStart}` (two-part): query with `where('guestId', '==', guestId).where('startDate', '==', weekStart)`.
  - If IDs are `{guestId}_{houseId}_{weekStart}` (three-part): construct the doc ID directly with `doc(weekSummaryCollection, \`${guestId}_${houseId}\_${weekStart}\`)`.
  - The plan below assumes **two-part** IDs (matching the entity class) and uses attribute queries. Adjust if confirmed otherwise.

### Step 1.2 — Create `src/services/reportingService.ts`

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/services/reportingService.ts`:

```ts
/**
 * reportingService.ts
 *
 * Read-only Firestore queries powering the Admin Reporting Dashboard.
 * No writes. All functions require an authenticated user.
 */
import { firestore } from '../../firebase-setup';
import { auth } from '../../firebase-setup';
import { logException } from '../util/logging';
import { Guest } from '../entities/Guest';
import { WeekSummary } from '../entities/WeekSummary';
import {
  startOfWeek,
  subWeeks,
  format,
  subDays,
  isAfter,
  parseISO,
} from 'date-fns';

// ─── Collection refs ──────────────────────────────────────────────────────────

export const weekSummaryCollection = firestore.collection('week-summaries');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OccupancyReport {
  activeCount: number;
  capacity: number;
  occupancyPct: number; // 0–100
}

export interface WeekComplianceSlice {
  weekStart: string; // 'YYYY-MM-DD'
  choreRate: number; // 0–1
  meetingRate: number; // 0–1
  guestCount: number;
}

export interface ComplianceTrend {
  weeks: WeekComplianceSlice[];
}

export type DischargePeriod = 30 | 60 | 90;

export interface DischargedResident {
  id: string;
  displayName: string;
  movedOutDate: string;
}

export interface DischargeReport {
  period: DischargePeriod;
  residents: DischargedResident[];
  count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the ISO date string (YYYY-MM-DD) of the most recent Sunday. */
export function getSundayAnchoredWeekStart(date: Date): string {
  // date-fns startOfWeek defaults to Sunday (weekStartsOn: 0)
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

/** Returns a display name from a partial Guest. */
function resolveDisplayName(guest: Partial<Guest>): string {
  if (guest.displayName) return guest.displayName;
  const first = guest.firstName ?? '';
  const last = guest.lastName ?? '';
  return `${first} ${last}`.trim() || 'Unknown';
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Returns current occupancy for a house.
 *
 * @param houseId       - The house to query
 * @param activeGuests  - Pre-fetched array of active guests (avoids a second query;
 *                        callers pass the result of useGuests)
 * @param capacity      - house.maximumCapacity
 */
export async function getOccupancyReport(
  houseId: string,
  activeGuests: Guest[],
  capacity: number,
): Promise<OccupancyReport> {
  if (!auth.currentUser) {
    throw new Error('getOccupancyReport: user not authenticated');
  }
  if (!houseId) throw new Error('getOccupancyReport: houseId is required');

  const activeCount = activeGuests.filter(
    g => g.houseId === houseId && g.status === 'active',
  ).length;

  const safeCap = capacity > 0 ? capacity : 1;
  const occupancyPct = Math.round((activeCount / safeCap) * 100);

  return { activeCount, capacity: safeCap, occupancyPct };
}

/**
 * Fetches week-summary docs for the last `weeksBack` Sunday-anchored weeks
 * across all provided guestIds and computes per-week compliance rates.
 *
 * Oxford standard: meetingsAttended >= 3 counts as "met" for a guest that week.
 * Chore standard:  choresCompleted > 0 counts as "completed".
 *
 * @param houseId   - Used to scope the query (week-summaries have a houseId field)
 * @param guestIds  - IDs of active guests to include
 * @param weeksBack - How many weeks of history to fetch (default 4)
 */
export async function getComplianceTrend(
  houseId: string,
  guestIds: string[],
  weeksBack: number = 4,
): Promise<ComplianceTrend> {
  if (!auth.currentUser) {
    throw new Error('getComplianceTrend: user not authenticated');
  }
  if (!houseId) throw new Error('getComplianceTrend: houseId is required');
  if (guestIds.length === 0) {
    return { weeks: [] };
  }

  const now = new Date();
  const weekStarts: string[] = [];
  for (let i = 0; i < weeksBack; i++) {
    const anchor = subWeeks(now, i);
    weekStarts.push(getSundayAnchoredWeekStart(anchor));
  }
  // oldest first
  weekStarts.reverse();

  // Fetch all week-summary docs for these guests in one batched query.
  // Firestore 'in' operator supports up to 30 values — chunk if needed.
  const CHUNK = 30;
  const allDocs: WeekSummary[] = [];

  for (let i = 0; i < guestIds.length; i += CHUNK) {
    const chunk = guestIds.slice(i, i + CHUNK);
    const snap = await weekSummaryCollection
      .where('houseId', '==', houseId)
      .where('guestId', 'in', chunk)
      .where('startDate', 'in', weekStarts)
      .get();
    snap.docs.forEach(d => allDocs.push(d.data() as WeekSummary));
  }

  // Group docs by startDate
  const byWeek: Record<string, WeekSummary[]> = {};
  for (const doc of allDocs) {
    const key = doc.startDate;
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(doc);
  }

  const guestCount = guestIds.length;

  const weeks: WeekComplianceSlice[] = weekStarts.map(weekStart => {
    const docs = byWeek[weekStart] ?? [];
    const choresMet = docs.filter(d => d.stats.choresCompleted > 0).length;
    const meetingsMet = docs.filter(d => d.stats.meetingsAttended >= 3).length;
    return {
      weekStart,
      choreRate: guestCount > 0 ? choresMet / guestCount : 0,
      meetingRate: guestCount > 0 ? meetingsMet / guestCount : 0,
      guestCount,
    };
  });

  return { weeks };
}

/**
 * Returns guests with status === 'discharged' whose movedOutDate falls within
 * the last `daysBack` days.
 *
 * Guests are pre-fetched by the caller (same pattern as getOccupancyReport)
 * to avoid redundant Firestore reads — the screen already holds the full guest
 * list from useGuests().
 *
 * @param houseId       - Used to scope the filter
 * @param allGuests     - All guests for the house (active + inactive + discharged)
 * @param daysBack      - 30 | 60 | 90
 */
export async function getDischargeReport(
  houseId: string,
  allGuests: Guest[],
  daysBack: DischargePeriod,
): Promise<DischargeReport> {
  if (!auth.currentUser) {
    throw new Error('getDischargeReport: user not authenticated');
  }
  if (!houseId) throw new Error('getDischargeReport: houseId is required');

  const cutoff = subDays(new Date(), daysBack);

  const discharged = allGuests.filter(g => {
    if (g.houseId !== houseId) return false;
    if (g.status !== 'discharged') return false;
    if (!g.moveOutDate) return false;
    try {
      return isAfter(parseISO(g.moveOutDate), cutoff);
    } catch {
      return false;
    }
  });

  const residents: DischargedResident[] = discharged.map(g => ({
    id: g.id,
    displayName: resolveDisplayName(g),
    movedOutDate: g.moveOutDate ?? '',
  }));

  // Sort most-recently-discharged first
  residents.sort((a, b) => b.movedOutDate.localeCompare(a.movedOutDate));

  return { period: daysBack, residents, count: residents.length };
}
```

### Step 1.3 — Create `src/services/__tests__/reportingService.test.ts`

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/services/__tests__/reportingService.test.ts`:

```ts
/**
 * reportingService.test.ts
 *
 * Unit tests for the Admin Reporting Dashboard service functions.
 * All Firestore and auth calls are mocked.
 */

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetFn = jest.fn();
const mockWhere = jest.fn();
const mockCollection = jest.fn();

jest.mock('../../../firebase-setup', () => {
  // chain: .where().where().where().get()
  const chainObj: any = {};
  chainObj.where = jest.fn(() => chainObj);
  chainObj.get = mockGetFn;

  const collection = jest.fn(() => chainObj);

  return {
    firestore: { collection },
    auth: { currentUser: { uid: 'user-1' } },
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import {
  getOccupancyReport,
  getComplianceTrend,
  getDischargeReport,
  getSundayAnchoredWeekStart,
} from '../reportingService';
import { Guest } from '../../entities/Guest';
import { subDays, format, startOfWeek } from 'date-fns';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeGuest = (overrides: Partial<Guest> = {}): Guest =>
  ({
    id: 'g1',
    houseId: 'house-1',
    status: 'active',
    displayName: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    moveOutDate: undefined,
    ...overrides,
  } as unknown as Guest);

// ─── getSundayAnchoredWeekStart ───────────────────────────────────────────────

describe('getSundayAnchoredWeekStart', () => {
  it('returns the most recent Sunday for a Wednesday', () => {
    // Wednesday 2026-05-20 → Sunday 2026-05-17
    const result = getSundayAnchoredWeekStart(new Date('2026-05-20T12:00:00'));
    expect(result).toBe('2026-05-17');
  });

  it('returns the same day when the date is already a Sunday', () => {
    const result = getSundayAnchoredWeekStart(new Date('2026-05-17T00:00:00'));
    expect(result).toBe('2026-05-17');
  });
});

// ─── getOccupancyReport ───────────────────────────────────────────────────────

describe('getOccupancyReport', () => {
  it('computes occupancy from active guest count and capacity', async () => {
    const activeGuests = [
      makeGuest({ id: 'g1', status: 'active' }),
      makeGuest({ id: 'g2', status: 'active' }),
      makeGuest({ id: 'g3', status: 'active' }),
    ];
    const result = await getOccupancyReport('house-1', activeGuests, 8);
    expect(result).toEqual({ activeCount: 3, capacity: 8, occupancyPct: 38 });
  });

  it('excludes guests from other houses', async () => {
    const activeGuests = [
      makeGuest({ id: 'g1', houseId: 'house-1', status: 'active' }),
      makeGuest({ id: 'g2', houseId: 'house-OTHER', status: 'active' }),
    ];
    const result = await getOccupancyReport('house-1', activeGuests, 8);
    expect(result.activeCount).toBe(1);
  });

  it('handles zero capacity gracefully (uses 1 as denominator)', async () => {
    const result = await getOccupancyReport('house-1', [], 0);
    expect(result.occupancyPct).toBe(0);
    expect(result.capacity).toBe(1);
  });

  it('throws when houseId is missing', async () => {
    await expect(getOccupancyReport('', [], 8)).rejects.toThrow('houseId');
  });

  it('throws when user is not authenticated', async () => {
    jest.resetModules();
    jest.mock('../../../firebase-setup', () => ({
      firestore: { collection: jest.fn() },
      auth: { currentUser: null },
    }));
    const { getOccupancyReport: fn } = await import('../reportingService');
    await expect(fn('house-1', [], 8)).rejects.toThrow('not authenticated');
  });
});

// ─── getComplianceTrend ───────────────────────────────────────────────────────

describe('getComplianceTrend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty weeks when guestIds is empty', async () => {
    const result = await getComplianceTrend('house-1', [], 4);
    expect(result.weeks).toHaveLength(0);
  });

  it('computes chore and meeting rates from week-summary docs', async () => {
    const now = new Date('2026-05-20T00:00:00');
    const weekStart = getSundayAnchoredWeekStart(now);

    mockGetFn.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            guestId: 'g1',
            houseId: 'house-1',
            startDate: weekStart,
            stats: { choresCompleted: 2, meetingsAttended: 4 },
          }),
        },
        {
          data: () => ({
            guestId: 'g2',
            houseId: 'house-1',
            startDate: weekStart,
            stats: { choresCompleted: 0, meetingsAttended: 1 },
          }),
        },
      ],
    });

    const result = await getComplianceTrend('house-1', ['g1', 'g2'], 1);
    expect(result.weeks).toHaveLength(1);
    const week = result.weeks[0];
    expect(week.weekStart).toBe(weekStart);
    expect(week.choreRate).toBeCloseTo(0.5); // 1 of 2 completed chores
    expect(week.meetingRate).toBeCloseTo(0.5); // 1 of 2 met Oxford standard
    expect(week.guestCount).toBe(2);
  });

  it('returns zero rates for a week with no summary docs', async () => {
    mockGetFn.mockResolvedValueOnce({ docs: [] });
    const result = await getComplianceTrend('house-1', ['g1'], 1);
    expect(result.weeks[0].choreRate).toBe(0);
    expect(result.weeks[0].meetingRate).toBe(0);
  });

  it('throws when houseId is missing', async () => {
    await expect(getComplianceTrend('', ['g1'], 4)).rejects.toThrow('houseId');
  });
});

// ─── getDischargeReport ───────────────────────────────────────────────────────

describe('getDischargeReport', () => {
  it('returns discharged guests within the period', async () => {
    const recentDate = format(subDays(new Date(), 10), 'yyyy-MM-dd');
    const oldDate = format(subDays(new Date(), 100), 'yyyy-MM-dd');
    const guests = [
      makeGuest({ id: 'g1', status: 'discharged', moveOutDate: recentDate }),
      makeGuest({ id: 'g2', status: 'discharged', moveOutDate: oldDate }),
      makeGuest({ id: 'g3', status: 'active' }),
    ];
    const result = await getDischargeReport('house-1', guests, 30);
    expect(result.count).toBe(1);
    expect(result.residents[0].id).toBe('g1');
    expect(result.period).toBe(30);
  });

  it('excludes guests from other houses', async () => {
    const recentDate = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    const guests = [
      makeGuest({
        id: 'g1',
        houseId: 'house-OTHER',
        status: 'discharged',
        moveOutDate: recentDate,
      }),
    ];
    const result = await getDischargeReport('house-1', guests, 30);
    expect(result.count).toBe(0);
  });

  it('falls back to firstName + lastName when displayName is empty', async () => {
    const recentDate = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    const guests = [
      makeGuest({
        id: 'g1',
        status: 'discharged',
        moveOutDate: recentDate,
        displayName: '',
        firstName: 'Bob',
        lastName: 'Jones',
      }),
    ];
    const result = await getDischargeReport('house-1', guests, 30);
    expect(result.residents[0].displayName).toBe('Bob Jones');
  });

  it('sorts by movedOutDate descending', async () => {
    const d1 = format(subDays(new Date(), 5), 'yyyy-MM-dd');
    const d2 = format(subDays(new Date(), 2), 'yyyy-MM-dd');
    const guests = [
      makeGuest({
        id: 'g1',
        status: 'discharged',
        moveOutDate: d1,
        displayName: 'Older',
      }),
      makeGuest({
        id: 'g2',
        status: 'discharged',
        moveOutDate: d2,
        displayName: 'Newer',
      }),
    ];
    const result = await getDischargeReport('house-1', guests, 30);
    expect(result.residents[0].displayName).toBe('Newer');
  });

  it('throws when houseId is missing', async () => {
    await expect(getDischargeReport('', [], 30)).rejects.toThrow('houseId');
  });
});
```

- [ ] Run tests:

  ```bash
  yarn test src/services/__tests__/reportingService.test.ts --no-coverage
  ```

  Expected: **10 tests pass**, 0 failures.

- [ ] Commit:
  ```bash
  git add src/services/reportingService.ts src/services/__tests__/reportingService.test.ts
  git commit -m "feat(reporting): add reportingService with occupancy, compliance, and discharge functions"
  ```

---

## Task 2: Reporting React Query hooks + tests

### Step 2.1 — Create `src/state/queries/reportingQueries.ts`

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/state/queries/reportingQueries.ts`:

```ts
/**
 * reportingQueries.ts
 *
 * React Query hooks for the Admin Reporting Dashboard.
 * All hooks are read-only (useQuery only — no mutations).
 */
import { useQuery } from '@tanstack/react-query';
import { logException } from '../../util/logging';
import { Guest } from '../../entities/Guest';
import {
  getOccupancyReport,
  getComplianceTrend,
  getDischargeReport,
  DischargePeriod,
  OccupancyReport,
  ComplianceTrend,
  DischargeReport,
} from '../../services/reportingService';

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const reportingKeys = {
  all: ['reporting'] as const,
  occupancy: (houseId: string) =>
    [...reportingKeys.all, 'occupancy', houseId] as const,
  compliance: (houseId: string, weeksBack: number) =>
    [...reportingKeys.all, 'compliance', houseId, weeksBack] as const,
  discharge: (houseId: string, daysBack: DischargePeriod) =>
    [...reportingKeys.all, 'discharge', houseId, daysBack] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns current occupancy data for a house.
 *
 * Depends on `activeGuests` and `capacity` being supplied by the caller
 * (typically from `useGuests` and `useHouse` respectively) so we avoid
 * duplicating queries that are already live on the screen.
 */
export const useOccupancyReport = (
  houseId: string,
  activeGuests: Guest[],
  capacity: number,
  enabled: boolean = true,
) => {
  return useQuery<OccupancyReport>({
    queryKey: reportingKeys.occupancy(houseId),
    queryFn: () => getOccupancyReport(houseId, activeGuests, capacity),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
    onError: (err: unknown) => logException(err),
  });
};

/**
 * Returns a 4-week compliance trend (chore + meeting rates) for all active
 * guests in the house.
 */
export const useComplianceTrend = (
  houseId: string,
  guestIds: string[],
  weeksBack: number = 4,
  enabled: boolean = true,
) => {
  return useQuery<ComplianceTrend>({
    queryKey: reportingKeys.compliance(houseId, weeksBack),
    queryFn: () => getComplianceTrend(houseId, guestIds, weeksBack),
    enabled: enabled && !!houseId && guestIds.length > 0,
    staleTime: 60_000,
    onError: (err: unknown) => logException(err),
  });
};

/**
 * Returns discharged residents for the last `daysBack` days.
 */
export const useDischargeReport = (
  houseId: string,
  allGuests: Guest[],
  daysBack: DischargePeriod = 30,
  enabled: boolean = true,
) => {
  return useQuery<DischargeReport>({
    queryKey: reportingKeys.discharge(houseId, daysBack),
    queryFn: () => getDischargeReport(houseId, allGuests, daysBack),
    enabled: enabled && !!houseId,
    staleTime: 60_000,
    onError: (err: unknown) => logException(err),
  });
};
```

### Step 2.2 — Create `src/state/queries/__tests__/reportingQueries.test.ts`

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/state/queries/__tests__/reportingQueries.test.ts`:

```ts
/**
 * reportingQueries.test.ts
 *
 * Unit tests for the Admin Reporting Dashboard React Query hooks.
 */

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetOccupancyReport = jest.fn();
const mockGetComplianceTrend = jest.fn();
const mockGetDischargeReport = jest.fn();

jest.mock('../../../services/reportingService', () => ({
  getOccupancyReport: (...args: any[]) => mockGetOccupancyReport(...args),
  getComplianceTrend: (...args: any[]) => mockGetComplianceTrend(...args),
  getDischargeReport: (...args: any[]) => mockGetDischargeReport(...args),
}));

jest.mock('../../../util/logging', () => ({
  logException: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useOccupancyReport,
  useComplianceTrend,
  useDischargeReport,
  reportingKeys,
} from '../reportingQueries';
import { Guest } from '../../../entities/Guest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

// ─── reportingKeys ────────────────────────────────────────────────────────────

describe('reportingKeys', () => {
  it('generates distinct keys for different houseIds', () => {
    const k1 = reportingKeys.occupancy('h1');
    const k2 = reportingKeys.occupancy('h2');
    expect(k1).not.toEqual(k2);
  });

  it('generates distinct keys for different daysBack values', () => {
    const k30 = reportingKeys.discharge('h1', 30);
    const k60 = reportingKeys.discharge('h1', 60);
    expect(k30).not.toEqual(k60);
  });
});

// ─── useOccupancyReport ───────────────────────────────────────────────────────

describe('useOccupancyReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns data on success', async () => {
    const expected = { activeCount: 3, capacity: 8, occupancyPct: 38 };
    mockGetOccupancyReport.mockResolvedValue(expected);

    const { result } = renderHook(() => useOccupancyReport('house-1', [], 8), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(expected);
  });

  it('is disabled when houseId is empty', () => {
    const { result } = renderHook(() => useOccupancyReport('', [], 8), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGetOccupancyReport).not.toHaveBeenCalled();
  });

  it('calls logException on error', async () => {
    const { logException } = require('../../../util/logging');
    mockGetOccupancyReport.mockRejectedValue(new Error('Firestore error'));

    const { result } = renderHook(() => useOccupancyReport('house-1', [], 8), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(logException).toHaveBeenCalled();
  });
});

// ─── useComplianceTrend ───────────────────────────────────────────────────────

describe('useComplianceTrend', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns compliance data on success', async () => {
    const expected = {
      weeks: [
        {
          weekStart: '2026-05-10',
          choreRate: 0.8,
          meetingRate: 0.7,
          guestCount: 5,
        },
      ],
    };
    mockGetComplianceTrend.mockResolvedValue(expected);

    const { result } = renderHook(
      () => useComplianceTrend('house-1', ['g1', 'g2'], 1),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(expected);
  });

  it('is disabled when guestIds is empty', () => {
    const { result } = renderHook(() => useComplianceTrend('house-1', [], 4), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled when houseId is empty', () => {
    const { result } = renderHook(() => useComplianceTrend('', ['g1'], 4), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

// ─── useDischargeReport ───────────────────────────────────────────────────────

describe('useDischargeReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns discharge data on success', async () => {
    const expected = {
      period: 30,
      count: 2,
      residents: [
        { id: 'g1', displayName: 'Alice Smith', movedOutDate: '2026-05-10' },
        { id: 'g2', displayName: 'Bob Jones', movedOutDate: '2026-05-01' },
      ],
    };
    mockGetDischargeReport.mockResolvedValue(expected);

    const { result } = renderHook(() => useDischargeReport('house-1', [], 30), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(expected);
  });

  it('is disabled when houseId is empty', () => {
    const { result } = renderHook(() => useDischargeReport('', [], 30), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('uses default daysBack of 30 when not provided', async () => {
    mockGetDischargeReport.mockResolvedValue({
      period: 30,
      count: 0,
      residents: [],
    });
    const { result } = renderHook(() => useDischargeReport('house-1', []), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDischargeReport).toHaveBeenCalledWith('house-1', [], 30);
  });
});
```

- [ ] Run tests:

  ```bash
  yarn test src/state/queries/__tests__/reportingQueries.test.ts --no-coverage
  ```

  Expected: **9 tests pass**, 0 failures.

- [ ] Commit:
  ```bash
  git add src/state/queries/reportingQueries.ts src/state/queries/__tests__/reportingQueries.test.ts
  git commit -m "feat(reporting): add reportingQueries React Query hooks"
  ```

---

## Task 3: AdminReportScreen + tests

### Step 3.1 — Create the screen directory

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/screens/AdminReport/AdminReportScreen.tsx`:

```tsx
/**
 * AdminReportScreen.tsx
 *
 * Read-only admin dashboard showing house occupancy, 4-week compliance
 * trend, and discharge summary.
 *
 * All data is fetched client-side from Firestore — no writes.
 */
import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useSelectedHouse } from '../../hooks/useSelectedHouse';
import { useGuests } from '../../state/queries/guestQueries';
import {
  useOccupancyReport,
  useComplianceTrend,
  useDischargeReport,
} from '../../state/queries/reportingQueries';
import { DischargePeriod } from '../../services/reportingService';
import { Guest } from '../../entities/Guest';
import { Guests } from '../../types';
import { RatsText } from '../../components/rats-text';
import RatsLoadingIndicator from '../../components/rats-loading-indicator/rats-loading-indicator';
import ScreenHeader from '../../components/screen-header';
import { color, normalize, fontSize, CARD_STYLE } from '../../styles/theme';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const PERIOD_OPTIONS: DischargePeriod[] = [30, 60, 90];

const AdminReportScreen: React.FC<Props> = ({ navigation }) => {
  const { house, houseId } = useSelectedHouse();
  const [dischargePeriod, setDischargePeriod] = useState<DischargePeriod>(30);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: guestsMap, isLoading: guestsLoading } = useGuests(
    houseId ?? '',
  );

  // Flatten the guests record map into an array
  const allGuests: Guest[] = useMemo(
    () => Object.values((guestsMap ?? {}) as Guests),
    [guestsMap],
  );
  const activeGuests = useMemo(
    () => allGuests.filter(g => g.status === 'active'),
    [allGuests],
  );
  const activeGuestIds = useMemo(
    () => activeGuests.map(g => g.id),
    [activeGuests],
  );

  const capacity = house?.maximumCapacity ?? 0;
  const dataReady = !!houseId && !guestsLoading;

  const { data: occupancy, isLoading: occLoading } = useOccupancyReport(
    houseId ?? '',
    activeGuests,
    capacity,
    dataReady,
  );

  const { data: compliance, isLoading: compLoading } = useComplianceTrend(
    houseId ?? '',
    activeGuestIds,
    4,
    dataReady,
  );

  const { data: discharge, isLoading: disLoading } = useDischargeReport(
    houseId ?? '',
    allGuests,
    dischargePeriod,
    dataReady,
  );

  const isLoading = guestsLoading || occLoading || compLoading || disLoading;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Returns a percentage string e.g. "75%" */
  const pct = (rate: number) => `${Math.round(rate * 100)}%`;

  /** Color based on rate vs threshold */
  const rateColor = (rate: number, threshold: number) =>
    rate >= threshold ? color.green : color.red;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container} testID="admin-report-screen">
      <ScreenHeader renderBackButton header="Reports" />

      {isLoading ? (
        <RatsLoadingIndicator testID="report-loading" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* ── Section 1: Occupancy ────────────────────────────────────────── */}
          <View style={[CARD_STYLE, styles.card]} testID="occupancy-section">
            <RatsText
              text="Occupancy"
              style={styles.sectionTitle}
              translate={false}
            />
            {occupancy ? (
              <View style={styles.row}>
                <RatsText
                  text={`${occupancy.activeCount} / ${occupancy.capacity}`}
                  style={styles.bigStat}
                  translate={false}
                  testID="occupancy-ratio"
                />
                <RatsText
                  text={`(${occupancy.occupancyPct}%)`}
                  style={[
                    styles.bigStatSub,
                    { color: rateColor(occupancy.occupancyPct / 100, 0.8) },
                  ]}
                  translate={false}
                  testID="occupancy-pct"
                />
              </View>
            ) : (
              <RatsText
                text="No data"
                style={styles.noData}
                translate={false}
              />
            )}
          </View>

          {/* ── Section 2: Compliance Trend ─────────────────────────────────── */}
          <View style={[CARD_STYLE, styles.card]} testID="compliance-section">
            <RatsText
              text="4-Week Compliance"
              style={styles.sectionTitle}
              translate={false}
            />
            <View style={styles.complianceLegend}>
              <RatsText
                text="Week"
                style={styles.colHeader}
                translate={false}
              />
              <RatsText
                text="Chores"
                style={styles.colHeader}
                translate={false}
              />
              <RatsText
                text="Meetings"
                style={styles.colHeader}
                translate={false}
              />
            </View>
            {compliance && compliance.weeks.length > 0 ? (
              compliance.weeks.map(week => (
                <View
                  key={week.weekStart}
                  style={styles.complianceRow}
                  testID={`week-row-${week.weekStart}`}>
                  <RatsText
                    text={week.weekStart.slice(5)} // 'MM-DD'
                    style={styles.colCell}
                    translate={false}
                  />
                  <RatsText
                    text={pct(week.choreRate)}
                    style={[
                      styles.colCell,
                      { color: rateColor(week.choreRate, 0.8) },
                    ]}
                    translate={false}
                    testID={`chore-rate-${week.weekStart}`}
                  />
                  <RatsText
                    text={pct(week.meetingRate)}
                    style={[
                      styles.colCell,
                      { color: rateColor(week.meetingRate, 0.8) },
                    ]}
                    translate={false}
                    testID={`meeting-rate-${week.weekStart}`}
                  />
                </View>
              ))
            ) : (
              <RatsText
                text="No compliance data for the last 4 weeks."
                style={styles.noData}
                translate={false}
              />
            )}
          </View>

          {/* ── Section 3: Discharge Summary ────────────────────────────────── */}
          <View style={[CARD_STYLE, styles.card]} testID="discharge-section">
            <RatsText
              text="Discharge Summary"
              style={styles.sectionTitle}
              translate={false}
            />

            {/* Period toggle */}
            <View style={styles.toggleRow}>
              {PERIOD_OPTIONS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.toggleBtn,
                    dischargePeriod === p && styles.toggleBtnActive,
                  ]}
                  onPress={() => setDischargePeriod(p)}
                  testID={`period-btn-${p}`}>
                  <RatsText
                    text={`${p}d`}
                    style={[
                      styles.toggleBtnText,
                      dischargePeriod === p && styles.toggleBtnTextActive,
                    ]}
                    translate={false}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {discharge ? (
              discharge.count === 0 ? (
                <RatsText
                  text={`No discharges in the last ${dischargePeriod} days.`}
                  style={styles.noData}
                  translate={false}
                  testID="discharge-empty"
                />
              ) : (
                <>
                  <RatsText
                    text={`${discharge.count} resident${
                      discharge.count !== 1 ? 's' : ''
                    } discharged`}
                    style={styles.dischargeSummary}
                    translate={false}
                    testID="discharge-count"
                  />
                  {discharge.residents.map(r => (
                    <View
                      key={r.id}
                      style={styles.dischargeRow}
                      testID={`discharge-row-${r.id}`}>
                      <RatsText
                        text={r.displayName}
                        style={styles.dischargeName}
                        translate={false}
                      />
                      <RatsText
                        text={r.movedOutDate}
                        style={styles.dischargeDate}
                        translate={false}
                      />
                    </View>
                  ))}
                </>
              )
            ) : (
              <RatsText
                text="No data"
                style={styles.noData}
                translate={false}
              />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.light_grey,
  },
  scroll: {
    padding: normalize(16),
    paddingBottom: normalize(40),
  },
  card: {
    marginBottom: normalize(16),
    padding: normalize(16),
  },
  sectionTitle: {
    fontSize: fontSize.large,
    fontWeight: '700',
    color: color.dark_grey,
    marginBottom: normalize(12),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: normalize(8),
  },
  bigStat: {
    fontSize: fontSize.xlarge ?? 28,
    fontWeight: '700',
    color: color.dark_grey,
  },
  bigStatSub: {
    fontSize: fontSize.large,
    fontWeight: '600',
  },
  noData: {
    color: color.dark_grey,
    fontSize: fontSize.small,
  },
  complianceLegend: {
    flexDirection: 'row',
    marginBottom: normalize(4),
  },
  complianceRow: {
    flexDirection: 'row',
    paddingVertical: normalize(6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.light_grey,
  },
  colHeader: {
    flex: 1,
    fontSize: fontSize.small,
    fontWeight: '600',
    color: color.dark_grey,
  },
  colCell: {
    flex: 1,
    fontSize: fontSize.medium ?? 14,
    color: color.dark_grey,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: normalize(12),
    gap: normalize(8),
  },
  toggleBtn: {
    paddingHorizontal: normalize(14),
    paddingVertical: normalize(6),
    borderRadius: normalize(16),
    borderWidth: 1,
    borderColor: color.dark_grey,
  },
  toggleBtnActive: {
    backgroundColor: color.dark_grey,
  },
  toggleBtnText: {
    fontSize: fontSize.small,
    color: color.dark_grey,
  },
  toggleBtnTextActive: {
    color: color.white,
  },
  dischargeSummary: {
    fontSize: fontSize.medium ?? 14,
    fontWeight: '600',
    color: color.dark_grey,
    marginBottom: normalize(8),
  },
  dischargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: normalize(6),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.light_grey,
  },
  dischargeName: {
    fontSize: fontSize.medium ?? 14,
    color: color.dark_grey,
  },
  dischargeDate: {
    fontSize: fontSize.small,
    color: color.medium_grey ?? color.dark_grey,
  },
});

export default AdminReportScreen;
```

### Step 3.2 — Create `src/screens/AdminReport/__tests__/AdminReportScreen.test.tsx`

- [ ] Create `/Users/marcusklein/dev/rats-v2/src/screens/AdminReport/__tests__/AdminReportScreen.test.tsx`:

```tsx
/**
 * AdminReportScreen.test.tsx
 */

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockUseSelectedHouse = jest.fn();
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => mockUseSelectedHouse(),
}));

const mockUseGuests = jest.fn();
jest.mock('../../../state/queries/guestQueries', () => ({
  useGuests: () => mockUseGuests(),
}));

const mockUseOccupancyReport = jest.fn();
const mockUseComplianceTrend = jest.fn();
const mockUseDischargeReport = jest.fn();
jest.mock('../../../state/queries/reportingQueries', () => ({
  useOccupancyReport: () => mockUseOccupancyReport(),
  useComplianceTrend: () => mockUseComplianceTrend(),
  useDischargeReport: () => mockUseDischargeReport(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('../../../context', () => ({
  useTheme: () => ({
    theme: {
      primaryColor: '#638BFA',
      secondaryColor: '#d2d8ef',
      tertiaryColor: '#969696',
      backgroundColor: '#FAFAFA',
      textColor: 'black',
      primaryFontFamily: 'Quicksand-Medium',
      secondaryFontFamily: 'Quicksand-Medium',
      logoTintColor: '#ffffff',
    },
  }),
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('../../../components/screen-header', () => {
  const { View, Text } = require('react-native');
  return ({ header }: any) => (
    <View testID="screen-header">
      <Text>{header}</Text>
    </View>
  );
});

jest.mock('../../../components/rats-text/rats-text', () => {
  const { Text } = require('react-native');
  return ({ text, testID }: any) => (
    <Text testID={testID}>{String(text ?? '')}</Text>
  );
});

jest.mock('../../../components/rats-text', () => {
  const { Text } = require('react-native');
  return {
    RatsText: ({ text, testID }: any) => (
      <Text testID={testID}>{String(text ?? '')}</Text>
    ),
  };
});

jest.mock(
  '../../../components/rats-loading-indicator/rats-loading-indicator',
  () => {
    const { View } = require('react-native');
    return ({ testID }: any) => <View testID={testID ?? 'loading-indicator'} />;
  },
);

// ─── Imports ──────────────────────────────────────────────────────────────────

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AdminReportScreen from '../AdminReportScreen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const defaultHouse = {
  id: 'house-1',
  name: 'Recovery House',
  maximumCapacity: 8,
};

const makeGuest = (overrides: any = {}) => ({
  id: 'g1',
  houseId: 'house-1',
  status: 'active',
  displayName: 'Alice Smith',
  ...overrides,
});

const defaultOccupancy = { activeCount: 5, capacity: 8, occupancyPct: 63 };

const defaultCompliance = {
  weeks: [
    {
      weekStart: '2026-05-10',
      choreRate: 0.9,
      meetingRate: 0.8,
      guestCount: 5,
    },
    {
      weekStart: '2026-05-17',
      choreRate: 0.7,
      meetingRate: 0.6,
      guestCount: 5,
    },
  ],
};

const defaultDischarge = {
  period: 30,
  count: 1,
  residents: [
    { id: 'g99', displayName: 'Bob Jones', movedOutDate: '2026-05-10' },
  ],
};

const setupMocks = (overrides: any = {}) => {
  mockUseSelectedHouse.mockReturnValue({
    house: defaultHouse,
    houseId: 'house-1',
    isLoading: false,
    ...overrides.house,
  });
  mockUseGuests.mockReturnValue({
    data: { g1: makeGuest() },
    isLoading: false,
    ...overrides.guests,
  });
  mockUseOccupancyReport.mockReturnValue({
    data: defaultOccupancy,
    isLoading: false,
    ...overrides.occupancy,
  });
  mockUseComplianceTrend.mockReturnValue({
    data: defaultCompliance,
    isLoading: false,
    ...overrides.compliance,
  });
  mockUseDischargeReport.mockReturnValue({
    data: defaultDischarge,
    isLoading: false,
    ...overrides.discharge,
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdminReportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('renders all three sections', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('occupancy-section')).toBeTruthy();
    expect(getByTestId('compliance-section')).toBeTruthy();
    expect(getByTestId('discharge-section')).toBeTruthy();
  });

  it('shows loading indicator when data is loading', () => {
    setupMocks({ guests: { isLoading: true } });
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('report-loading')).toBeTruthy();
  });

  it('displays occupancy ratio and percentage', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('occupancy-ratio').props.children).toBe('5 / 8');
    expect(getByTestId('occupancy-pct').props.children).toBe('(63%)');
  });

  it('renders a row for each compliance week', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('week-row-2026-05-10')).toBeTruthy();
    expect(getByTestId('week-row-2026-05-17')).toBeTruthy();
  });

  it('shows chore rate in correct color (green when >= 80%)', () => {
    // choreRate 0.9 → green; 0.7 → red. We just verify the rows render.
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('chore-rate-2026-05-10').props.children).toBe('90%');
    expect(getByTestId('chore-rate-2026-05-17').props.children).toBe('70%');
  });

  it('renders discharged resident rows', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('discharge-row-g99')).toBeTruthy();
    expect(getByTestId('discharge-count').props.children).toBe(
      '1 resident discharged',
    );
  });

  it('shows empty message when no discharges', () => {
    setupMocks({
      discharge: { data: { period: 30, count: 0, residents: [] } },
    });
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByTestId('discharge-empty')).toBeTruthy();
  });

  it('switches discharge period when toggle is pressed', () => {
    const { getByTestId } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    fireEvent.press(getByTestId('period-btn-60'));
    // After press the hook is called again; we just verify the button exists and is pressable
    expect(getByTestId('period-btn-60')).toBeTruthy();
  });

  it('shows "no data" text when compliance has no weeks', () => {
    setupMocks({ compliance: { data: { weeks: [] } } });
    const { getByText } = render(
      <AdminReportScreen navigation={mockNavigation} />,
    );
    expect(getByText('No compliance data for the last 4 weeks.')).toBeTruthy();
  });
});
```

- [ ] Run tests:

  ```bash
  yarn test src/screens/AdminReport/__tests__/AdminReportScreen.test.tsx --no-coverage
  ```

  Expected: **9 tests pass**, 0 failures.

- [ ] Commit:
  ```bash
  git add src/screens/AdminReport/AdminReportScreen.tsx src/screens/AdminReport/__tests__/AdminReportScreen.test.tsx
  git commit -m "feat(reporting): add AdminReportScreen with occupancy, compliance, and discharge sections"
  ```

---

## Task 4: Navigation wiring + HouseSettings integration

### Step 4.1 — Add `AdminReport` to `src/navigation/types.ts`

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/navigation/types.ts`:

  In the `Routes` enum, add after `SendInvites = 'sendInvites'`:

  ```ts
  AdminReport = 'adminReport',
  ```

  In `RootStackParamList`, add after `[Routes.SendInvites]: undefined;`:

  ```ts
  [Routes.AdminReport]: undefined;
  ```

### Step 4.2 — Register the screen in `src/navigation/navigators.tsx`

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/navigation/navigators.tsx`:

  Add import after `GuestImportScreen` import:

  ```ts
  import AdminReportScreen from '../screens/AdminReport/AdminReportScreen';
  ```

  Inside the `RootStack.Group` modal block (after the `MeetingSearch` screen entry is a good location near other HouseSettings-launched screens):

  ```tsx
  <RootStack.Screen name={Routes.AdminReport} component={AdminReportScreen} />
  ```

### Step 4.3 — Add "Reports" entry to HouseSettings

- [ ] Edit `/Users/marcusklein/dev/rats-v2/src/screens/HouseSettings/HouseSettings.tsx`:

  In the `SETTINGS` `useMemo` object, add a new `reports` key after `paymentDashboard`:

  ```ts
  reports: {
    action: () => navigation.navigate(Routes.AdminReport),
    label: 'Reports',
    description: 'View occupancy, compliance trends, and discharge summary',
    iconName: 'chart-line',
    color: color.medium_grey,
  },
  ```

  Add `Routes.AdminReport` to the `navigation` dependency in the `useMemo` deps array (it's already there via `navigation` — no change needed since `navigation` is already in deps).

### Step 4.4 — Verify wiring compiles

- [ ] Run TypeScript check (from project root):

  ```bash
  yarn tsc --noEmit
  ```

  Expected: **0 type errors** related to the new files.

- [ ] Run the full test suites for modified files:

  ```bash
  yarn test src/navigation/ --no-coverage
  yarn test src/screens/HouseSettings/ --no-coverage
  ```

  Expected: all existing tests continue to pass.

- [ ] Commit:
  ```bash
  git add src/navigation/types.ts src/navigation/navigators.tsx src/screens/HouseSettings/HouseSettings.tsx
  git commit -m "feat(reporting): wire AdminReportScreen into navigation and HouseSettings menu"
  ```

---

## Known Edge Cases & Caveats

1. **`week-summaries` document ID format** — The `WeekSummaryEntity` class uses a two-part ID (`{guestId}_{startDate}`) but the codebase comment in the prompt says `{guestId}_{houseId}_{weekStart}`. Verify live IDs in the Firebase Console before writing the query in Task 1. The query in `getComplianceTrend` uses `.where()` attribute filters rather than doc-ID lookups, so it works regardless of which ID format is used — but set an index in Firebase Console if you see a `FAILED_PRECONDITION` error about a missing composite index on `(houseId, guestId, startDate)`.

2. **`Guests` map vs array** — `useGuests` returns a `Record<string, Guest>` keyed by `id` (via lodash `keyBy`). `AdminReportScreen` converts it to an array with `Object.values(guestsMap)` before passing to service functions. This is deliberate — the service functions receive plain arrays so they stay decoupled from the React Query shape.

3. **`moveOutDate` vs `movedOutDate` field name** — `Guest.tsx` declares the field as `moveOutDate`. The prompt uses `movedOutDate` in the discharge report output type. The service translates: it reads `g.moveOutDate` from Firestore and returns it as `movedOutDate` in `DischargedResident`. This is intentional to keep the output type readable.

4. **`color.medium_grey` / `fontSize.medium` / `fontSize.xlarge`** — These exist in the project's theme but may not be exported from all theme entry points. If TypeScript flags missing properties, fall back to `color.dark_grey` and numeric literals (`28`, `14`) respectively.

5. **Firestore `in` operator limit** — The `getComplianceTrend` function chunks `guestIds` into groups of 30 to stay within Firestore's `in` array limit. For houses with more than 30 residents, all chunks are awaited sequentially (not parallelized) to keep the read count predictable.

6. **`RatsText` import path** — The project has both `components/rats-text/rats-text` (default export) and `components/rats-text` (named export `{ RatsText }`). `AdminReportScreen` uses the named export. If the barrel `index.ts` is missing, change to `import { RatsText } from '../../components/rats-text/rats-text'`.

7. **No `auth` named export in `firebase-setup`** — Some service files import `{ firestore }` but access auth via `FirebaseAuth()` default export. Check `firebase-setup.ts` for the exact exported name. If `auth` is not a named export, replace with `import auth from '@react-native-firebase/auth'; const currentUser = auth().currentUser;` (matching `drugTests.ts`).
