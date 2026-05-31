# Meetings Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up `src/util/meetings.ts` and `src/callable/meetings.ts` for readability, type safety, and simplicity — no behavior changes.

**Architecture:** Extract the 200-line GeoFire geohash block into its own utility file, replace the untyped `getMeetingEntity` dispatcher with three typed mapper functions, collapse a triplicated filter function, and simplify the callable layer's control flow.

**Tech Stack:** TypeScript, Firebase Functions v2, Jest/ts-jest

---

### Task 1: Extract geohash utilities to `src/util/geohash.ts`

**Files:**
- Create: `src/util/geohash.ts`
- Modify: `src/util/meetings.ts` (remove lines 322–528, swap import)
- Modify: `src/api/firestore.ts` (update import path)

**Background:** The geohash block in `meetings.ts` lines 322–528 is GeoFire bounding-box math with no meeting-domain logic. Moving it verbatim shrinks `meetings.ts` from ~530 to ~320 lines. `firestore.ts` imports `getQueriesForDocumentsAround` from `meetings` today — after the move, it needs to import from `geohash`.

**Step 1: Run existing tests to confirm baseline**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | tail -5
```

Expected: 54 tests pass.

**Step 2: Create `src/util/geohash.ts`**

Copy the block verbatim from `meetings.ts` lines 322–528. The file must:
- Import `ngeohash` and `logger`
- Export only `getQueriesForDocumentsAround`
- Keep all `console.warn` calls (used inside private helpers, not `logger`)

```typescript
import * as ngeohash from "ngeohash";
import { logger } from "firebase-functions/v1";

// Characters used in location geohashes (base-32 encoding)
const g_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// The meridional circumference of the earth in meters
const g_EARTH_MERI_CIRCUMFERENCE = 40007860;

// Length of a degree latitude at the equator
const g_METERS_PER_DEGREE_LATITUDE = 110574;

// Number of bits per geohash character
const g_BITS_PER_CHAR = 5;

// Maximum length of a geohash in bits (22 characters * 5 bits each)
const g_MAXIMUM_BITS_PRECISION = 22 * g_BITS_PER_CHAR;

// Equatorial radius of the earth in meters
const g_EARTH_EQ_RADIUS = 6378137.0;

// First eccentricity squared of the WGS-84 ellipsoid.
// Derived from: (EARTH_EQ_RADIUS^2 - EARTH_POL_RADIUS^2) / EARTH_EQ_RADIUS^2
// where EARTH_POL_RADIUS = 6356752.3. Exact value used to avoid rounding errors.
const g_E2 = 0.00669447819799;

// Cutoff for rounding errors on double calculations
const g_EPSILON = 1e-12;

const degreesToRadians = (degrees: number): number => {
  if (typeof degrees !== "number" || isNaN(degrees)) {
    throw new Error("Error: degrees must be a number");
  }
  return (degrees * Math.PI) / 180;
};

const metersToLongitudeDegrees = (distance: number, latitude: number): number => {
  const radians = degreesToRadians(latitude);
  const num = (Math.cos(radians) * g_EARTH_EQ_RADIUS * Math.PI) / 180;
  const denom = 1 / Math.sqrt(1 - g_E2 * Math.sin(radians) * Math.sin(radians));
  const deltaDeg = num * denom;
  if (deltaDeg < g_EPSILON) {
    return distance > 0 ? 360 : 0;
  }
  return Math.min(360, distance / deltaDeg);
};

const longitudeBitsForResolution = (resolution: number, latitude: number): number => {
  const degs = metersToLongitudeDegrees(resolution, latitude);
  return Math.abs(degs) > 0.000001 ? Math.max(1, Math.log2(360 / degs)) : 1;
};

const latitudeBitsForResolution = (resolution: number): number => {
  return Math.min(
    Math.log2(g_EARTH_MERI_CIRCUMFERENCE / 2 / resolution),
    g_MAXIMUM_BITS_PRECISION
  );
};

const wrapLongitude = (longitude: number): number => {
  if (longitude <= 180 && longitude >= -180) {
    return longitude;
  }
  const adjusted = longitude + 180;
  if (adjusted > 0) {
    return (adjusted % 360) - 180;
  }
  return 180 - (-adjusted % 360);
};

const boundingBoxBits = (coordinate: number[], size: number): number => {
  const latDeltaDegrees = size / g_METERS_PER_DEGREE_LATITUDE;
  const latitudeNorth = Math.min(90, coordinate[0] + latDeltaDegrees);
  const latitudeSouth = Math.max(-90, coordinate[0] - latDeltaDegrees);
  const bitsLat = Math.floor(latitudeBitsForResolution(size)) * 2;
  const bitsLongNorth = Math.floor(longitudeBitsForResolution(size, latitudeNorth)) * 2 - 1;
  const bitsLongSouth = Math.floor(longitudeBitsForResolution(size, latitudeSouth)) * 2 - 1;
  return Math.min(bitsLat, bitsLongNorth, bitsLongSouth, g_MAXIMUM_BITS_PRECISION);
};

const boundingBoxCoordinates = (center: number[], radius: number): number[][] => {
  const latDegrees = radius / g_METERS_PER_DEGREE_LATITUDE;
  const latitudeNorth = Math.min(90, center[0] + latDegrees);
  const latitudeSouth = Math.max(-90, center[0] - latDegrees);
  const longDegsNorth = metersToLongitudeDegrees(radius, latitudeNorth);
  const longDegsSouth = metersToLongitudeDegrees(radius, latitudeSouth);
  const longDegs = Math.max(longDegsNorth, longDegsSouth);
  return [
    [center[0], center[1]],
    [center[0], wrapLongitude(center[1] - longDegs)],
    [center[0], wrapLongitude(center[1] + longDegs)],
    [latitudeNorth, center[1]],
    [latitudeNorth, wrapLongitude(center[1] - longDegs)],
    [latitudeNorth, wrapLongitude(center[1] + longDegs)],
    [latitudeSouth, center[1]],
    [latitudeSouth, wrapLongitude(center[1] - longDegs)],
    [latitudeSouth, wrapLongitude(center[1] + longDegs)],
  ];
};

const geohashQuery = (geohash: string, bits: number): [string, string] => {
  const precision = Math.ceil(bits / g_BITS_PER_CHAR);
  if (geohash.length < precision) {
    console.warn(
      `geohash.length < precision: ${geohash.length} < ${precision} bits=${bits} g_BITS_PER_CHAR=${g_BITS_PER_CHAR}`
    );
    return [geohash, geohash + "~"];
  }
  const trimmed = geohash.substring(0, precision);
  const base = trimmed.substring(0, trimmed.length - 1);
  const lastValue = g_BASE32.indexOf(trimmed.charAt(trimmed.length - 1));
  const significantBits = bits - base.length * g_BITS_PER_CHAR;
  const unusedBits = g_BITS_PER_CHAR - significantBits;
  // eslint-disable-next-line no-bitwise
  const startValue = (lastValue >> unusedBits) << unusedBits;
  // eslint-disable-next-line no-bitwise
  const endValue = startValue + (1 << unusedBits);
  if (endValue >= g_BASE32.length) {
    console.warn(
      `endValue > 31: endValue=${endValue} precision=${precision} bits=${bits} g_BITS_PER_CHAR=${g_BITS_PER_CHAR}`
    );
    return [base + g_BASE32[startValue], base + "~"];
  }
  return [base + g_BASE32[startValue], base + g_BASE32[endValue]];
};

const geohashQueries = (center: number[], radius: number): [string, string][] => {
  const queryBits = Math.max(1, boundingBoxBits(center, radius));
  const coordinates = boundingBoxCoordinates(center, radius);
  const queries = coordinates.map((coordinate) =>
    geohashQuery(ngeohash.encode(coordinate[0], coordinate[1]), queryBits)
  );
  return queries.filter((query, index) =>
    !queries.some(
      (other, otherIndex) =>
        index > otherIndex && query[0] === other[0] && query[1] === other[1]
    )
  );
};

export function getQueriesForDocumentsAround(
  ref: FirebaseFirestore.CollectionReference,
  center: { lat: number; lon: number },
  radiusInKm: number,
  day?: string
): FirebaseFirestore.Query[] {
  const geohashesToQuery = geohashQueries([center.lat, center.lon], radiusInKm * 1000);
  logger.info("geohashes", JSON.stringify(geohashesToQuery));
  return geohashesToQuery.map((location) =>
    ref
      .where("geohash", ">=", location[0])
      .where("geohash", "<=", location[1])
  );
}
```

**Step 3: Update `src/util/meetings.ts`**

1. Remove the entire block from the comment `// ---------------------------------------------------------------------------` on line 322 through the closing `}` of `getQueriesForDocumentsAround` on line 528.

2. Remove `import * as ngeohash from "ngeohash";` from the top of the file.

3. Add this import after the other local imports:
   ```typescript
   import { getQueriesForDocumentsAround } from "./geohash";
   ```

   Note: `getQueriesForDocumentsAround` is re-exported from `meetings.ts` via this import — callers in `firestore.ts` will be updated next.

**Step 4: Update `src/api/firestore.ts`**

Change the import at line 9 from:
```typescript
import { getQueriesForDocumentsAround } from "../util/meetings";
```
to:
```typescript
import { getQueriesForDocumentsAround } from "../util/geohash";
```

**Step 5: Run tests and verify TypeScript**

```bash
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | tail -5
npx tsc --noEmit 2>&1 | head -20
```

Expected: 54 tests pass, no TypeScript errors. The geohash helpers are not tested directly so nothing changes for tests.

**Step 6: Commit**

```bash
git add src/util/geohash.ts src/util/meetings.ts src/api/firestore.ts
git commit -m "refactor: extract geohash utilities to src/util/geohash.ts"
```

---

### Task 2: Add `mapAAMeeting`, update `getAlcoholicsAnonymousMeetings`, update AA tests

**Files:**
- Modify: `src/__tests__/util/meetings.test.ts` (rename AA describe block, keep getMeetingEntity import for NA tests)
- Modify: `src/util/meetings.ts` (add mapAAMeeting, update caller)

**Background:** The AA branch from `getMeetingEntity` becomes the standalone exported function `mapAAMeeting(meeting: AAMeeting): RatsMeeting | null`. `getMeetingEntity` is NOT removed yet — the NA describe block still uses it and it stays until Task 4.

**Step 1: Update the test imports to add `mapAAMeeting`**

In `src/__tests__/util/meetings.test.ts`, update lines 24–32:

```typescript
import {
  getMeetingEntity,         // still needed for NA tests (Tasks 2-3)
  mapAAMeeting,
  filterCustomMeetings,
  filterMeetingsByCriteria,
  getAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings,
  geocodeNAMeeting,
  getAll12StepMeetings,
} from '../../util/meetings';
```

**Step 2: Rename the AA describe block and update all calls**

In `src/__tests__/util/meetings.test.ts`:

1. Line 39: `describe('getMeetingEntity — AA type', () => {` → `describe('mapAAMeeting', () => {`

2. Replace all `getMeetingEntity(aaRaw, 'AA')` with `mapAAMeeting(aaRaw)`. There are 9 occurrences across the 13 tests.

3. Replace `getMeetingEntity({ ...aaRaw, conference_url: 'https://zoom.us/j/1' }, 'AA')` with `mapAAMeeting({ ...aaRaw, conference_url: 'https://zoom.us/j/1' })`.

4. Replace `getMeetingEntity({ ...aaRaw, day: 0 }, 'AA')` with `mapAAMeeting({ ...aaRaw, day: 0 })`.

5. Replace `getMeetingEntity({ ...aaRaw, day: 6 }, 'AA')` with `mapAAMeeting({ ...aaRaw, day: 6 })`.

**Step 3: Update the null-data describe block to use `mapAAMeeting`**

Lines 207–215:

```typescript
describe('mapAAMeeting — returns null on bad data', () => {
  it('returns null when meeting data is null', () => {
    expect(mapAAMeeting(null as any)).toBeNull();
  });

  it('returns null when meeting data is undefined', () => {
    expect(mapAAMeeting(undefined as any)).toBeNull();
  });
});
```

**Step 4: Run tests to confirm they fail**

```bash
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | grep -E "FAIL|mapAAMeeting" | head -5
```

Expected: test suite fails because `mapAAMeeting` is not yet exported from `meetings.ts`.

**Step 5: Add `mapAAMeeting` to `src/util/meetings.ts`**

Add after `getMeetingTime` (after line 40), before the existing `getMeetingEntity`:

```typescript
export const mapAAMeeting = (meeting: AAMeeting): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.name = meeting.name;
    m.street = meeting.address;
    m.city = meeting.city;
    m.time = meeting.time.substring(0, meeting.time.lastIndexOf(":"));
    m.zip = meeting.postal_code;
    m.state = meeting.state;
    m.locationName = meeting.location_name;
    m.types = meeting.types.split(",");
    m.lat = parseFloat(meeting.latitude);
    m.lng = parseFloat(meeting.longitude);
    m.type = "AA";
    m.day = daysOfWeek[meeting.day];
    m.online = !!meeting.conference_url;
    m.link = meeting.conference_url;
    m.onlineNotes = meeting.conference_url_notes;
    return m;
  } catch (err) {
    logger.error("failed to map AA meeting", meeting, err);
    return null;
  }
};
```

**Step 6: Update `getAlcoholicsAnonymousMeetings` to call `mapAAMeeting`**

In `getAlcoholicsAnonymousMeetings` (around line 277 in original, will be a few lines later now):

```typescript
// Before:
const meetings: RatsMeeting[] = meetingsResponse.meetings
  .map((meeting) => getMeetingEntity(meeting, "AA"))
  .filter((meeting): meeting is RatsMeeting => meeting !== null);

// After:
const meetings: RatsMeeting[] = meetingsResponse.meetings
  .map((meeting) => mapAAMeeting(meeting))
  .filter((meeting): meeting is RatsMeeting => meeting !== null);
```

**Step 7: Run tests**

```bash
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | tail -5
```

Expected: all 54 tests pass.

**Step 8: Commit**

```bash
git add src/util/meetings.ts src/__tests__/util/meetings.test.ts
git commit -m "refactor: add mapAAMeeting, update getAlcoholicsAnonymousMeetings"
```

---

### Task 3: Add `mapCRMeeting`, add error handling to `getCelebrateMeetings`

**Files:**
- Modify: `src/util/meetings.ts`

**Background:** The CR branch from `getMeetingEntity` becomes `mapCRMeeting`. `getCelebrateMeetings` currently has no try/catch — a failed XML parse or API call throws unhandled. Add a try/catch that returns `[]` with `logger.error`. No test file changes needed (no existing CR mapper tests).

**Step 1: Add `mapCRMeeting` to `src/util/meetings.ts`**

Add after `mapAAMeeting`:

```typescript
export const mapCRMeeting = (meeting: CelebrateRecoveryMeeting): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.type = "Celebrate Recovery";
    const addressParts = meeting.address[0].split(",");
    m.name = meeting.name[0];
    m.street = addressParts[0];
    m.city = addressParts[1].trim();
    // addressParts[2] is " STATE ZIP COUNTRY" — split on space and skip the
    // leading empty string that results from the leading space character.
    const stateZipCountry = addressParts[2].split(" ").slice(1);
    m.state = stateZipCountry[0];
    m.zip = stateZipCountry[1];
    const [day, time] = meeting.custom2[0]._.split(" ");
    if (day && time) {
      m.day = day.toLowerCase().trim();
      // Convert 12-hour time (e.g. "5:00 PM") to 24-hour format (e.g. "17:00").
      m.time = moment(time, ["h:mm A"]).format("HH:mm");
    }
    m.lat = parseFloat(meeting.lat[0]);
    m.lng = parseFloat(meeting.lng[0]);
    return m;
  } catch (err) {
    logger.error("failed to map CR meeting", meeting, err);
    return null;
  }
};
```

**Step 2: Update `getCelebrateMeetings` — call `mapCRMeeting`, add try/catch**

Replace the entire `getCelebrateMeetings` function:

```typescript
export const getCelebrateMeetings = async (
  location: Location,
  criteria?: MeetingSearchCriteria
) => {
  logger.info("Retrieving celebrate recovery meetings...");
  try {
    const result = await getCelebrateRecoveryMeetings(location.lat, location.lng);
    const parsed = await parseXml(result);
    const meetings: RatsMeeting[] = parsed.markers.marker
      .map((meeting) => mapCRMeeting(meeting))
      .filter((meeting): meeting is RatsMeeting => meeting !== null);
    logger.info("Retrieved celebrate recovery meetings");
    return filterMeetingsByCriteria(meetings, criteria, "Celebrate Recovery");
  } catch (err) {
    logger.error("Failed to retrieve celebrate recovery meetings", err);
    return [];
  }
};
```

Note: `filterMeetingsByCriteria` still takes a type argument here. Task 4 removes that parameter and updates this call.

**Step 3: Run tests**

```bash
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | tail -5
```

Expected: all 54 tests pass.

**Step 4: Commit**

```bash
git add src/util/meetings.ts
git commit -m "refactor: add mapCRMeeting, add error handling to getCelebrateMeetings"
```

---

### Task 4: Add `mapNAMeeting`, remove `getMeetingEntity`, simplify filter and distance utils

**Files:**
- Modify: `src/util/meetings.ts`
- Modify: `src/__tests__/util/meetings.test.ts`

**Background:** With `mapAAMeeting` and `mapCRMeeting` in place, we can now add `mapNAMeeting` (exported but no production caller — NA meetings come pre-mapped from Firestore), then delete `getMeetingEntity` entirely. We also simplify `filterMeetingsByCriteria` (three identical branches → one) and `getMeetingsWithinDistance` (remove dead `type?` param and its unreachable branch).

**Step 1: Update the test file — NA describe block and filter tests**

In `src/__tests__/util/meetings.test.ts`:

1. Update the import — add `mapNAMeeting`, remove `getMeetingEntity`:
   ```typescript
   import {
     mapAAMeeting,
     mapNAMeeting,
     filterCustomMeetings,
     filterMeetingsByCriteria,
     getAlcoholicsAnonymousMeetings,
     getNarcoticsAnoymousMeetings,
     geocodeNAMeeting,
     getAll12StepMeetings,
   } from '../../util/meetings';
   ```

2. Rename `describe('getMeetingEntity — NA type', () => {` → `describe('mapNAMeeting', () => {`

3. Replace all 11 `getMeetingEntity(naRaw, 'NA')` and `getMeetingEntity({ ...naRaw, ... }, 'NA')` calls with `mapNAMeeting(naRaw)` / `mapNAMeeting({ ...naRaw, ... })`.

4. In `describe('filterMeetingsByCriteria', ...)` (lines 280–318), remove the type argument from all 5 calls:
   - `filterMeetingsByCriteria(meetings, undefined, 'AA')` → `filterMeetingsByCriteria(meetings, undefined)`
   - `filterMeetingsByCriteria(meetings, { name: 'Sunrise' }, 'AA')` → `filterMeetingsByCriteria(meetings, { name: 'Sunrise' })`
   - `filterMeetingsByCriteria(meetings, { name: 'aa' }, 'AA')` → `filterMeetingsByCriteria(meetings, { name: 'aa' })`
   - `filterMeetingsByCriteria(meetings, { city: 'Austin' }, 'AA')` → `filterMeetingsByCriteria(meetings, { city: 'Austin' })`
   - `filterMeetingsByCriteria(naMeetings, { name: 'Morning' }, 'NA')` → `filterMeetingsByCriteria(naMeetings, { name: 'Morning' })`

**Step 2: Run tests to confirm they fail**

```bash
npx jest src/__tests__/util/meetings.test.ts --no-coverage 2>&1 | grep -E "FAIL|mapNAMeeting|Expected 3" | head -10
```

Expected: tests fail because `mapNAMeeting` doesn't exist and `filterMeetingsByCriteria` still requires 3 args.

**Step 3: Add `mapNAMeeting` to `src/util/meetings.ts`**

Add after `mapCRMeeting`. `getMeetingTime` is a private helper defined at the top of the file — it is used here for `mtg_time` conversion:

```typescript
export const mapNAMeeting = (meeting: NAMeeting): RatsMeeting | null => {
  try {
    const m = new RatsMeeting();
    m.type = "NA";
    m.name = meeting.com_name;
    m.day = daysOfWeek[meeting.mtg_day - 1];
    m.Location = [
      meeting.com_name,
      meeting.address,
      `${meeting.city}, ${meeting.state} ${meeting.zip}`,
      meeting.directions,
    ];
    m.time = getMeetingTime(meeting.mtg_time);
    m.lat = meeting.latitude;
    m.lng = meeting.longitude;
    m.online = meeting.online === "Yes";
    m.onlineNotes = meeting.password;
    m.link = meeting.link;
    return m;
  } catch (err) {
    logger.error("failed to map NA meeting", meeting, err);
    return null;
  }
};
```

**Step 4: Delete `getMeetingEntity` from `src/util/meetings.ts`**

Remove the entire function including its `eslint-disable` comment (original lines 42–111):

```typescript
// DELETE this block:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getMeetingEntity = (meeting: any, type: MeetingType) => {
  // ... entire function body ...
};
```

**Step 5: Simplify `filterMeetingsByCriteria` — remove `type` param, collapse three branches**

Replace the existing function:

```typescript
export const filterMeetingsByCriteria = (
  meetings: RatsMeeting[],
  criteria: MeetingSearchCriteria | undefined
): RatsMeeting[] => {
  if (criteria?.name) {
    const name = criteria.name;
    logger.info("Filtering by criteria", criteria);
    return meetings.filter((meeting) =>
      meeting.name.toLowerCase().includes(name.toLowerCase())
    );
  }
  return meetings.slice();
};
```

**Step 6: Update the three callers of `filterMeetingsByCriteria`**

Remove the type argument from each call in `meetings.ts`:

1. In `getNarcoticsAnoymousMeetings`:
   ```typescript
   // Before:
   return filterMeetingsByCriteria(naMeetingList, criteria, "NA");
   // After:
   return filterMeetingsByCriteria(naMeetingList, criteria);
   ```

2. In `getCelebrateMeetings`:
   ```typescript
   // Before:
   return filterMeetingsByCriteria(meetings, criteria, "Celebrate Recovery");
   // After:
   return filterMeetingsByCriteria(meetings, criteria);
   ```

3. In `getAlcoholicsAnonymousMeetings`:
   ```typescript
   // Before:
   return filterMeetingsByCriteria(meetings, criteria, "AA");
   // After:
   return filterMeetingsByCriteria(meetings, criteria);
   ```

**Step 7: Simplify `getMeetingsWithinDistance` — remove dead `type?` param**

Replace the function:

```typescript
const getMeetingsWithinDistance = (
  location: Location,
  meetings: RatsMeeting[],
  distance: number = 16000
): RatsMeeting[] => {
  return meetings.filter((meeting) =>
    getDistance(
      { lat: meeting.lat || 0, lng: meeting.lng || 0 },
      location
    ) <= distance
  );
};
```

**Step 8: Remove `MeetingType` from the import at the top of `meetings.ts`**

`MeetingType` was only used in `getMeetingEntity` and the `filterMeetingsByCriteria`/`getMeetingsWithinDistance` type params — all now gone. Update the import:

```typescript
// Before:
import {
  MeetingSearchCriteria,
  MeetingType,
  RatsMeeting,
} from "../entities/Meeting";

// After:
import {
  MeetingSearchCriteria,
  RatsMeeting,
} from "../entities/Meeting";
```

**Step 9: Run all tests**

```bash
npx jest src/__tests__/util/meetings.test.ts src/__tests__/callable/meetings.test.ts --no-coverage 2>&1 | tail -10
npx tsc --noEmit 2>&1 | head -20
```

Expected: all 54 + 15 = 69 tests pass, no TypeScript errors.

**Step 10: Commit**

```bash
git add src/util/meetings.ts src/__tests__/util/meetings.test.ts
git commit -m "refactor: add mapNAMeeting, remove getMeetingEntity, simplify filter and distance utils"
```

---

### Task 5: Clean up `src/callable/meetings.ts`

**Files:**
- Modify: `src/callable/meetings.ts`

**Background:**
1. `findMeetings` accumulates a single promise into an array, calls `Promise.all`, then flattens — since each branch pushes exactly one promise, use direct `await` with `if/else if`.
2. `MeetingSearchInput.filters.date` is never read anywhere — remove it.
3. `userIsAtMeeting` line 133 uses `data.userLocation as any` and `locationOfMeeting as any` despite already-destructured typed locals — replace with the locals and add an undefined guard.

**Step 1: Run callable tests to confirm baseline**

```bash
npx jest src/__tests__/callable/meetings.test.ts --no-coverage 2>&1 | tail -5
```

Expected: all 15 tests pass.

**Step 2: Remove `filters.date` from `MeetingSearchInput`**

```typescript
// Before:
interface MeetingSearchInput {
  filters: {
    date: string;
    location: Location;
    day: string;
    type: MeetingTypeFilters;
  };
  criteria?: MeetingSearchCriteria;
}

// After:
interface MeetingSearchInput {
  filters: {
    location: Location;
    day: string;
    type: MeetingTypeFilters;
  };
  criteria?: MeetingSearchCriteria;
}
```

**Step 3: Replace `findMeetings` body with direct `if/else if`**

Replace the entire `findMeetings` function body:

```typescript
export const findMeetings = onCall(async (request) => {
  const data = request.data as MeetingSearchInput;
  const start = Date.now();
  try {
    logger.info("FIND MEETING Filters", data.filters);
    let meetings: RatsMeeting[];
    if (data.filters?.type && data.filters.type !== "all") {
      if (data.filters.type === "AA") {
        meetings = await getAlcoholicsAnonymousMeetings(data.filters.location, data.criteria);
      } else if (data.filters.type === "NA") {
        meetings = await getNarcoticsAnoymousMeetings(data.filters.location, data.criteria, data.filters.day);
      } else if (data.filters.type === "Custom") {
        meetings = await getCustomMeetings(data.filters.location, data.criteria);
      } else if (data.filters.type === "Celebrate Recovery") {
        meetings = await getCelebrateMeetings(data.filters.location, data.criteria);
      } else {
        meetings = [];
      }
    } else {
      meetings = await getAll12StepMeetings(data.filters.location, data.criteria, data.filters.day);
    }
    logger.info("Meeting retrieval took", (Date.now() - start) / 1000, "seconds");
    return meetings;
  } catch (error) {
    logger.info("SOMETHING WENT WRONG", error);
    return [];
  }
});
```

**Step 4: Fix `userIsAtMeeting` — replace `as any` cast with typed locals and undefined guard**

In `userIsAtMeeting`, replace line 133:

```typescript
// Before:
const distance = getDistance(data.userLocation as any, locationOfMeeting as any);

// After:
if (!userLocation || !locationOfMeeting) return false;
const distance = getDistance(userLocation, locationOfMeeting);
```

The destructured `userLocation` and `locationOfMeeting` are already typed as `Location | undefined` from lines 116–117.

**Step 5: Run callable tests**

```bash
npx jest src/__tests__/callable/meetings.test.ts --no-coverage 2>&1 | tail -5
```

Expected: all 15 tests pass. The tests mock `../../util/meetings` entirely, so the structural changes to `findMeetings` don't affect them.

**Step 6: Run the full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -10
```

Expected: all tests pass (current count: 425+).

**Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Step 8: Commit**

```bash
git add src/callable/meetings.ts
git commit -m "refactor: simplify findMeetings, fix userIsAtMeeting cast, remove dead date field"
```

---

## Done

After all 5 tasks:

| File | Change |
|------|--------|
| `src/util/geohash.ts` | **New** — 200-line geohash block, exports only `getQueriesForDocumentsAround` |
| `src/util/meetings.ts` | ~320 lines (was ~530): `getMeetingEntity` removed, 3 typed mappers added, filter + distance utils simplified |
| `src/api/firestore.ts` | Import path updated to `geohash` |
| `src/callable/meetings.ts` | `findMeetings` simplified, `userIsAtMeeting` typed, dead `date` field removed |
| `src/__tests__/util/meetings.test.ts` | AA + NA describe blocks updated to use typed mappers; `filterMeetingsByCriteria` calls updated |
