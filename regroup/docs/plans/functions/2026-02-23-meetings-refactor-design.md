# Design: Meetings Code Cleanup and Readability Refactor

**Date:** 2026-02-23
**Status:** Approved

## Overview

Clean up and simplify `src/util/meetings.ts` and `src/callable/meetings.ts` for readability, type safety, and simplicity. No behavior changes. The domain will be reorganized into a `src/meetings/` module structure in a future pass — this refactor prepares the code to be moved cleanly when that time comes.

## Section 1: Extract Geohash Utilities → `src/util/geohash.ts`

The entire geohash block in `meetings.ts` (lines 322–528) — constants, 8 private helpers, and `getQueriesForDocumentsAround` — moves verbatim to a new file `src/util/geohash.ts`. Only `getQueriesForDocumentsAround` is exported. `meetings.ts` imports it from `./geohash`.

**Result:** `meetings.ts` shrinks from ~530 lines to ~320 lines. No logic changes.

## Section 2: Three Typed Mapper Functions

`getMeetingEntity(meeting: any, type: MeetingType)` is removed and replaced by three standalone typed mapper functions:

```typescript
export const mapAAMeeting = (meeting: AAMeeting): RatsMeeting | null
export const mapNAMeeting = (meeting: NAMeeting): RatsMeeting | null
export const mapCRMeeting = (meeting: CelebrateRecoveryMeeting): RatsMeeting | null
```

Each function contains exactly the logic from its `if` block in the old `getMeetingEntity`. Each returns `null` on error (try/catch with `logger.error`).

Caller updates:
- `getAlcoholicsAnonymousMeetings` → calls `mapAAMeeting`
- `getCelebrateMeetings` → calls `mapCRMeeting`
- NA meetings come pre-mapped from Firestore — no mapper needed

`getMeetingsWithinDistance` loses its `type?` parameter (it was only ever called without one; the `type` path called `getMeetingEntity` which no longer exists). It becomes a pure distance filter over already-mapped `RatsMeeting[]`.

## Section 3: Filter Deduplication

`filterMeetingsByCriteria(meetings, criteria, type)` has three `if` branches (AA, NA, CR) with identical logic (filter by `criteria.name`). The `type` parameter only guarded these identical branches. Collapsed to:

```typescript
export const filterMeetingsByCriteria = (
  meetings: RatsMeeting[],
  criteria: MeetingSearchCriteria | undefined
): RatsMeeting[]
```

If `criteria.name` is set, filter by name (case-insensitive). Otherwise return all meetings unchanged. The `type` parameter is removed; all callers stop passing it.

Additionally, `getCelebrateMeetings` gains a try/catch — currently a failed XML parse or API call throws unhandled. It now returns `[]` with a `logger.error`.

## Section 4: `callable/meetings.ts` Cleanup

**`findMeetings`:** The promise-array accumulator pattern (push to array → `Promise.all` → flatten) is replaced with a direct `if/else if` chain since each branch always pushes exactly one promise. Cleaner control flow, same behavior.

**`MeetingSearchInput` interface:** `filters.date` is never read. Removed.

**`userIsAtMeeting`:** `getDistance(data.userLocation as any, locationOfMeeting as any)` on line 133 is replaced with `getDistance(userLocation!, locationOfMeeting!)` using the already-typed local variables. A guard returns `false` if either value is undefined.

## Files Changed

| File | Change |
|------|--------|
| `src/util/geohash.ts` | **New** — extracted from meetings.ts |
| `src/util/meetings.ts` | Remove `getMeetingEntity`, add 3 mappers, simplify filter + distance utils |
| `src/callable/meetings.ts` | Simplify `findMeetings`, fix `userIsAtMeeting` cast, remove `date` field |

## Testing

All existing unit tests in `src/__tests__/util/meetings.test.ts` and `src/__tests__/callable/meetings.test.ts` must continue to pass. No new behavior to test — this is purely structural.
