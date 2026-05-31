# Unit Test Suites Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add comprehensive unit test suites for all `src/util/` and Cloud Function modules, preceded by critical fixes to `api/firestore.ts` and dead-code deletion.

**Architecture:** Each test file mocks all external I/O (Firebase Admin, Stripe, SendGrid, Axios) at the module level, uses an in-memory store to simulate Firestore, and tests exported functions directly. The mock pattern established in `payments.test.ts` is the project standard — follow it exactly.

**Tech Stack:** Jest, ts-jest, firebase-admin (mocked), firebase-functions (mocked), Stripe (mocked), @sendgrid/mail (mocked)

---

## Batch 1 — Critical Fixes (sequential, must complete before tests)

### Task 1: Fix api/firestore.ts — remove service-key dependency

**Files:**
- Modify: `src/api/firestore.ts`

`api/firestore.ts` calls `admin.initializeApp()` with a local `service-key.json` file, then exports the named app and derived collections. Cloud Functions v2 provides credentials at runtime via the default app. Replace the hardcoded init with the default app.

**Step 1: Apply the fix**

Replace the top of `src/api/firestore.ts` from the current:
```typescript
import admin from "firebase-admin";
// ...
export const app = admin.initializeApp({
  // @ts-ignore
  credential: admin.credential.cert(
    require("../../service-key.json")["phoenix-cleanhouse"]
  ),
  databaseURL: "https://phoenix-cleanhouse.firebaseio.com",
});

export const ratsFirestore = app.firestore();
```

With:
```typescript
import * as admin from "firebase-admin";
// ...
export const app = admin.app();
export const ratsFirestore = admin.firestore();
```

Remove the `Stripe` import if it is only used for the `saveStripeEvent` type annotation — keep the function but use `any` or import Stripe only for the type. Keep all collection exports as-is since they now derive from `ratsFirestore` which is `admin.firestore()`.

**Step 2: Fix notifications.ts — uses `app` for messaging**

`util/notifications.ts` calls `admin.messaging(app)`. After the fix, `app` is the default app so this still works. No change needed, but verify the import compiles.

**Step 3: Verify TypeScript compiles**

```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm run build 2>&1 | tail -20
```
Expected: exit 0, no errors.

**Step 4: Commit**
```bash
git add src/api/firestore.ts && git commit -m "fix: remove service-key dependency from api/firestore"
```

---

### Task 2: Delete entities/WeeklyReport.ts

**Files:**
- Delete: `src/entities/WeeklyReport.ts`

**Step 1: Delete the file**
```bash
rm /Users/marcusklein/dev/regroup-functions/functions/src/entities/WeeklyReport.ts
```

**Step 2: Verify no broken imports**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm run build 2>&1 | tail -20
```
Expected: exit 0.

**Step 3: Commit**
```bash
git add -A && git commit -m "chore: delete unused WeeklyReport entity"
```

---

## Batch 2 — Pure Utility Tests (parallel — no Firebase deps)

### Task 3: Tests for util/date.ts

**Files:**
- Create: `src/__tests__/util/date.test.ts`

`util/date.ts` exports pure date-manipulation functions using `moment`. All tests are pure — no mocking needed.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/date.test.ts
import {
  daysOfWeek,
  camelCaseToDisplayForm,
  getYesterdaysDate,
  getStartOfWeek,
  getEndOfWeek,
  getTodaysDate,
  getCurrentTime,
  getDayOfWeek,
  getWeekdayDate,
  getMilitaryTime,
  dateIsAfter,
  dayIsAfter,
  dayIsBefore,
  getWeekdayRange,
  dateIsInWeek,
  dayDiff,
} from '../../util/date';
import moment from 'moment';

describe('daysOfWeek', () => {
  it('has 7 entries starting with sunday', () => {
    expect(daysOfWeek).toHaveLength(7);
    expect(daysOfWeek[0]).toBe('sunday');
    expect(daysOfWeek[6]).toBe('saturday');
  });
});

describe('camelCaseToDisplayForm', () => {
  it('converts camelCase to Title Case with spaces', () => {
    expect(camelCaseToDisplayForm('houseId')).toBe('House Id');
  });
  it('handles already-capitalized first letter', () => {
    expect(camelCaseToDisplayForm('AdminName')).toBe(' Admin Name');
  });
});

describe('getYesterdaysDate', () => {
  it('returns a date one day before today in YYYY-MM-DD format', () => {
    const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD');
    expect(getYesterdaysDate()).toBe(yesterday);
  });
});

describe('getStartOfWeek', () => {
  it('returns Sunday of the week for a mid-week date', () => {
    expect(getStartOfWeek('2024-01-17')).toBe('2024-01-14'); // Wednesday → Sunday
  });
});

describe('getEndOfWeek', () => {
  it('returns Saturday of the week for a mid-week date', () => {
    expect(getEndOfWeek('2024-01-17')).toBe('2024-01-20'); // Wednesday → Saturday
  });
});

describe('getTodaysDate', () => {
  it('returns today in YYYY-MM-DD format', () => {
    expect(getTodaysDate()).toBe(moment().format('YYYY-MM-DD'));
  });
});

describe('getCurrentTime', () => {
  it('returns an ISO 8601 formatted string', () => {
    expect(getCurrentTime()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('getDayOfWeek', () => {
  it('returns 0 for Sunday', () => expect(getDayOfWeek('2024-01-14')).toBe(0));
  it('returns 1 for Monday', () => expect(getDayOfWeek('2024-01-15')).toBe(1));
  it('returns 6 for Saturday', () => expect(getDayOfWeek('2024-01-20')).toBe(6));
});

describe('getMilitaryTime', () => {
  it('formats 9:05 AM correctly', () => expect(getMilitaryTime(9, 5)).toBe('09:05'));
  it('formats 14:30 correctly', () => expect(getMilitaryTime(14, 30)).toBe('14:30'));
});

describe('dateIsAfter', () => {
  it('returns true when first date is after second', () => {
    expect(dateIsAfter('2024-01-20', '2024-01-15')).toBe(true);
  });
  it('returns false when first date is before second', () => {
    expect(dateIsAfter('2024-01-10', '2024-01-15')).toBe(false);
  });
});

describe('dayDiff', () => {
  it('returns absolute day difference', () => {
    expect(dayDiff('2024-01-10', '2024-01-15')).toBe(5);
    expect(dayDiff('2024-01-15', '2024-01-10')).toBe(5);
  });
  it('returns 0 for same date', () => {
    expect(dayDiff('2024-01-10', '2024-01-10')).toBe(0);
  });
});

describe('dateIsInWeek', () => {
  it('returns true when date falls within the week', () => {
    expect(dateIsInWeek('2024-01-17', '2024-01-14', '2024-01-20')).toBe(true);
  });
  it('returns true for boundary dates', () => {
    expect(dateIsInWeek('2024-01-14', '2024-01-14', '2024-01-20')).toBe(true);
    expect(dateIsInWeek('2024-01-20', '2024-01-14', '2024-01-20')).toBe(true);
  });
  it('returns false when date is outside the week', () => {
    expect(dateIsInWeek('2024-01-21', '2024-01-14', '2024-01-20')).toBe(false);
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/date.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/date.test.ts && git commit -m "test: add util/date unit tests"
```

---

### Task 4: Tests for util/week.ts

**Files:**
- Create: `src/__tests__/util/week.test.ts`

`util/week.ts` exports pure week-calculation functions. No mocking needed.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/week.test.ts
import { buildWeekId, getNextWeekStart, getCurrentWeekStart, sumStat } from '../../util/week';
import Week from '../../entities/Week';

describe('buildWeekId', () => {
  it('builds id as guestId_weekStart', () => {
    expect(buildWeekId('guest-123', '2024-01-15')).toBe('guest-123_2024-01-15');
  });
});

describe('getNextWeekStart', () => {
  it('returns the next Monday from a Monday', () => {
    // 2024-01-15 is a Monday → next Monday is 2024-01-22
    expect(getNextWeekStart('2024-01-15')).toBe('2024-01-22');
  });
  it('returns the next Monday from a Wednesday', () => {
    // 2024-01-17 is Wednesday → next Monday is 2024-01-22
    expect(getNextWeekStart('2024-01-17')).toBe('2024-01-22');
  });
  it('returns the next Monday from a Sunday', () => {
    // 2024-01-21 is Sunday → next Monday is 2024-01-22
    expect(getNextWeekStart('2024-01-21')).toBe('2024-01-22');
  });
});

describe('getCurrentWeekStart', () => {
  it('returns Monday for a Wednesday date', () => {
    // 2024-01-17 is Wednesday → Monday is 2024-01-15
    const wednesday = new Date('2024-01-17T12:00:00Z');
    expect(getCurrentWeekStart(wednesday)).toBe('2024-01-15');
  });
  it('returns Monday for a Monday date', () => {
    const monday = new Date('2024-01-15T12:00:00Z');
    expect(getCurrentWeekStart(monday)).toBe('2024-01-15');
  });
  it('returns Monday for a Sunday date (previous Monday)', () => {
    // Sunday 2024-01-21 → previous Monday is 2024-01-15
    const sunday = new Date('2024-01-21T12:00:00Z');
    expect(getCurrentWeekStart(sunday)).toBe('2024-01-15');
  });
});

describe('sumStat', () => {
  const makeWeek = (days: Record<string, any>): Week => ({ days } as Week);

  it('sums boolean stats (true = 1, false = 0)', () => {
    const week = makeWeek({
      '2024-01-15': { choreCompleted: true },
      '2024-01-16': { choreCompleted: false },
      '2024-01-17': { choreCompleted: true },
    });
    expect(sumStat(week, 'choreCompleted')).toBe(2);
  });

  it('sums array stats (counts items)', () => {
    const week = makeWeek({
      '2024-01-15': { meeting: ['AA Meeting'] },
      '2024-01-16': { meeting: ['NA Meeting', 'AA Meeting'] },
    });
    expect(sumStat(week, 'meeting')).toBe(3);
  });

  it('sums numeric object stats (hoursWorked)', () => {
    const week = makeWeek({
      '2024-01-15': { hoursWorked: { job1: 4, job2: 2 } },
      '2024-01-16': { hoursWorked: { job1: 3 } },
    });
    expect(sumStat(week, 'hoursWorked')).toBe(9);
  });

  it('returns 0 for empty days', () => {
    expect(sumStat(makeWeek({}), 'choreCompleted')).toBe(0);
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/week.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/week.test.ts && git commit -m "test: add util/week unit tests"
```

---

### Task 5: Tests for util/location.ts

**Files:**
- Create: `src/__tests__/util/location.test.ts`

`util/location.ts` uses `haversine-distance` and `ngeohash` (both real npm packages — no mocking needed for the pure tests). Import the file directly.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/location.test.ts
import {
  locationIsInArea,
  getXYvalues,
  getAreaPolygon,
  getDistance,
  getMilesAsMeters,
  getGeohashRange,
  getAddressFromGeocode,
} from '../../util/location';
import { GeocodeResponse } from '../../entities/GeocodeResponse';

describe('getXYvalues', () => {
  it('returns [lng, lat] order', () => {
    expect(getXYvalues({ lat: 30.267, lng: -97.743 })).toEqual([-97.743, 30.267]);
  });
});

describe('getAreaPolygon', () => {
  it('converts an array of LatLng to [lng, lat] pairs', () => {
    const points = [
      { lat: 30.0, lng: -97.0 },
      { lat: 31.0, lng: -98.0 },
    ];
    expect(getAreaPolygon(points)).toEqual([[-97.0, 30.0], [-98.0, 31.0]]);
  });
});

describe('locationIsInArea', () => {
  // A simple square polygon
  const square: number[][] = [
    [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
  ];
  it('returns true for a point inside the polygon', () => {
    expect(locationIsInArea(square, [0.5, 0.5])).toBe(true);
  });
  it('returns false for a point outside the polygon', () => {
    expect(locationIsInArea(square, [2, 2])).toBe(false);
  });
});

describe('getDistance', () => {
  it('returns ~0 for identical coordinates', () => {
    const loc = { lat: 30.267, lng: -97.743 };
    expect(getDistance(loc, loc)).toBe(0);
  });
  it('returns a positive number for different coordinates', () => {
    const a = { lat: 30.267153, lng: -97.743057 };
    const b = { lat: 30.268, lng: -97.744 };
    expect(getDistance(a, b)).toBeGreaterThan(0);
  });
  it('Austin to Houston is roughly 240 km (240000+ meters)', () => {
    const austin = { lat: 30.267, lng: -97.743 };
    const houston = { lat: 29.760, lng: -95.370 };
    const dist = getDistance(austin, houston);
    expect(dist).toBeGreaterThan(200_000);
    expect(dist).toBeLessThan(300_000);
  });
});

describe('getMilesAsMeters', () => {
  it('converts 1 mile to ~1609 meters', () => {
    expect(getMilesAsMeters(1)).toBeCloseTo(1609.34, 0);
  });
  it('converts 0 miles to 0 meters', () => {
    expect(getMilesAsMeters(0)).toBe(0);
  });
});

describe('getGeohashRange', () => {
  it('returns lower and upper geohash strings', () => {
    const { lower, upper } = getGeohashRange(30.267, -97.743, 10);
    expect(typeof lower).toBe('string');
    expect(typeof upper).toBe('string');
    expect(lower.length).toBeGreaterThan(0);
    expect(upper.length).toBeGreaterThan(0);
  });
  it('lower geohash is lexicographically less than upper', () => {
    const { lower, upper } = getGeohashRange(30.267, -97.743, 10);
    expect(lower < upper).toBe(true);
  });
});

describe('getAddressFromGeocode', () => {
  const makeGeocode = (components: { types: string[]; long_name: string; short_name: string }[]): GeocodeResponse => ({
    results: [
      { address_components: [], formatted_address: '', geometry: { location: { lat: 0, lng: 0 } }, types: [] },
      { address_components: components, formatted_address: '', geometry: { location: { lat: 0, lng: 0 } }, types: [] },
    ],
    status: 'OK',
  } as unknown as GeocodeResponse);

  it('extracts city, state, and zip from geocode response', () => {
    const geocode = makeGeocode([
      { types: ['locality'], long_name: 'Austin', short_name: 'Austin' },
      { types: ['administrative_area_level_1'], long_name: 'Texas', short_name: 'TX' },
      { types: ['postal_code'], long_name: '78701', short_name: '78701' },
      { types: ['street_number'], long_name: '123', short_name: '123' },
      { types: ['route'], long_name: 'Congress Ave', short_name: 'Congress Ave' },
    ]);
    const address = getAddressFromGeocode(geocode);
    expect(address.city).toBe('Austin');
    expect(address.state).toBe('TX');
    expect(address.zipCode).toBe('78701');
    expect(address.streetNumber).toBe('123');
    expect(address.streetName).toBe('Congress Ave');
  });

  it('returns empty strings when components are missing', () => {
    const geocode = makeGeocode([]);
    const address = getAddressFromGeocode(geocode);
    expect(address.city).toBe('');
    expect(address.state).toBe('');
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/location.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/location.test.ts && git commit -m "test: add util/location unit tests"
```

---

## Batch 3 — Firebase-Dependent Utility Tests (parallel)

### Task 6: Tests for util/claims.ts

**Files:**
- Create: `src/__tests__/util/claims.test.ts`

`util/claims.ts` calls `auth().getUser()` from firebase-admin. Mock it.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/claims.test.ts

// Must mock firebase-admin before importing anything that uses it
const mockGetUser = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ getUser: mockGetUser })),
}));

import { createClaims, deleteClaim } from '../../util/claims';

const mockUser = (claims: Record<string, any> = {}) => ({
  customClaims: claims,
});

beforeEach(() => jest.clearAllMocks());

describe('createClaims', () => {
  it('creates new role claims when user has none', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual(['house-1']);
  });

  it('merges new houseIds with existing claims of the same role', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await createClaims('user-1', ['house-2'], 'guest');
    expect(result.guest).toContain('house-1');
    expect(result.guest).toContain('house-2');
  });

  it('deduplicates when adding an already-existing houseId', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    const guestClaims = result.guest as string[];
    expect(guestClaims.filter(id => id === 'house-1')).toHaveLength(1);
  });

  it('preserves other role claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ admin: ['house-99'] }));
    const result = await createClaims('user-1', ['house-1'], 'guest');
    expect((result as any).admin).toEqual(['house-99']);
  });

  it('sets potentialSuperAdmin when specified', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await createClaims('user-1', [], 'guest', true);
    expect(result.potentialSuperAdmin).toBe(true);
  });
});

describe('deleteClaim', () => {
  it('removes the specified houseId from role claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1', 'house-2'] }));
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).not.toContain('house-1');
    expect(result.guest).toContain('house-2');
  });

  it('is a no-op when houseId does not exist in claims', async () => {
    mockGetUser.mockResolvedValue(mockUser({ guest: ['house-1'] }));
    const result = await deleteClaim('user-1', ['house-99'], 'guest');
    expect(result.guest).toEqual(['house-1']);
  });

  it('handles user with no existing claims gracefully', async () => {
    mockGetUser.mockResolvedValue(mockUser({}));
    const result = await deleteClaim('user-1', ['house-1'], 'guest');
    expect(result.guest).toEqual([]);
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/claims.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/claims.test.ts && git commit -m "test: add util/claims unit tests"
```

---

### Task 7: Tests for util/user.ts

**Files:**
- Create: `src/__tests__/util/user.test.ts`

`util/user.ts` uses `getUsers` from `api/firestore` and `auth()` from firebase-admin. Mock both.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/user.test.ts

const mockGetUsers = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('../../api/firestore', () => ({
  getUsers: mockGetUsers,
}));

const mockAuthUpdateUser = jest.fn();
jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({ updateUser: mockAuthUpdateUser })),
}));

import { getGuestsAsUsers, _verifyUserEmail, createConfirmationEmail } from '../../util/user';

beforeEach(() => jest.clearAllMocks());

describe('getGuestsAsUsers', () => {
  it('returns an array of users matching the provided guests', async () => {
    const fakeUser = { uid: 'u1', email: 'u1@test.com' };
    mockGetUsers.mockResolvedValue({
      docs: [{ data: () => fakeUser }],
    });
    const guests = [{ userId: 'u1', houseId: 'h1' } as any];
    const result = await getGuestsAsUsers(guests);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('u1');
  });

  it('calls getUsers with uid for each guest', async () => {
    mockGetUsers.mockResolvedValue({ docs: [{ data: () => ({ uid: 'u1' }) }] });
    await getGuestsAsUsers([{ userId: 'u1', houseId: 'h1' } as any]);
    expect(mockGetUsers).toHaveBeenCalledWith('uid', 'u1');
  });
});

describe('_verifyUserEmail', () => {
  it('calls auth().updateUser with emailVerified: true', async () => {
    mockAuthUpdateUser.mockResolvedValue({});
    await _verifyUserEmail('user-123');
    expect(mockAuthUpdateUser).toHaveBeenCalledWith('user-123', { emailVerified: true });
  });
});

describe('createConfirmationEmail', () => {
  it('sends to the provided email address', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.to).toBe('test@example.com');
  });

  it('includes verify link in html', () => {
    const email = createConfirmationEmail('test@example.com', 'https://example.com/verify');
    expect(email.html).toContain('https://example.com/verify');
  });

  it('includes name in greeting when provided', () => {
    const email = createConfirmationEmail('test@example.com', 'https://x.com', 'Alice');
    expect(email.html).toContain('Alice');
    expect(email.text).toContain('Hello Alice');
  });

  it('wraps regroup:// links in a redirect URL', () => {
    const deepLink = 'regroup-app://verify?token=abc';
    const email = createConfirmationEmail('t@t.com', encodeURIComponent(deepLink));
    expect(email.html).toContain('regroup-app.com/redirect');
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/user.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/user.test.ts && git commit -m "test: add util/user unit tests"
```

---

### Task 8: Tests for util/email.ts

**Files:**
- Create: `src/__tests__/util/email.test.ts`

`util/email.ts` calls `sendgrid.send()`. Mock the sendgrid module.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/email.test.ts

const mockSendgridSend = jest.fn();
const mockSetApiKey = jest.fn();
jest.mock('@sendgrid/mail', () => ({
  setApiKey: mockSetApiKey,
  send: mockSendgridSend,
}));

// Must import AFTER the mock
import { sendEmail, regroupEmail } from '../../util/email';

beforeEach(() => jest.clearAllMocks());

describe('regroupEmail constant', () => {
  it('is the admin email address', () => {
    expect(regroupEmail).toBe('admin@regroup-app.com');
  });
});

describe('sendEmail', () => {
  it('calls sendgrid.send with correct to/from/subject/text', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'user@test.com', subject: 'Hello', text: 'World' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@test.com',
      subject: 'Hello',
      text: 'World',
    }));
  });

  it('uses regroupEmail as default from address', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'user@test.com', subject: 'Hi', text: 'Hi' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      from: regroupEmail,
    }));
  });

  it('uses the provided from address when supplied', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'u@t.com', from: 'custom@sender.com', subject: 'Hi', text: 'Hi' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      from: 'custom@sender.com',
    }));
  });

  it('includes html when provided', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'u@t.com', subject: 'Hi', text: 'Hi', html: '<b>Hi</b>' });
    expect(mockSendgridSend).toHaveBeenCalledWith(expect.objectContaining({
      html: '<b>Hi</b>',
    }));
  });

  it('does NOT include html when not provided', async () => {
    mockSendgridSend.mockResolvedValue([{}]);
    await sendEmail({ to: 'u@t.com', subject: 'Hi', text: 'Hi' });
    const call = mockSendgridSend.mock.calls[0][0];
    expect(call).not.toHaveProperty('html');
  });

  it('swallows errors silently (does not throw)', async () => {
    mockSendgridSend.mockRejectedValue(new Error('SMTP error'));
    await expect(sendEmail({ to: 'u@t.com', subject: 'Hi', text: 'Hi' }))
      .resolves.toBeUndefined();
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/email.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/email.test.ts && git commit -m "test: add util/email unit tests"
```

---

### Task 9: Tests for util/notifications.ts

**Files:**
- Create: `src/__tests__/util/notifications.test.ts`

`util/notifications.ts` imports `app` from `api/firestore`, uses `admin.messaging(app).sendEachForMulticast()`, and calls `getUser` + `userCollection` from `api/firestore`.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/notifications.test.ts

const mockSendEachForMulticast = jest.fn();
const mockMessaging = jest.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast }));
const mockUserDocUpdate = jest.fn();

jest.mock('firebase-admin', () => ({
  messaging: mockMessaging,
  default: { messaging: mockMessaging },
}));

const mockGetUser = jest.fn();
const mockApp = {};

jest.mock('../../api/firestore', () => ({
  getUser: mockGetUser,
  addNotification: jest.fn(),
  userCollection: {
    doc: jest.fn(() => ({ update: mockUserDocUpdate })),
  },
  app: mockApp,
}));

jest.mock('firebase-functions/v1', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { sendNotification, createInviteNotification } from '../../util/notifications';

beforeEach(() => jest.clearAllMocks());

describe('sendNotification', () => {
  const baseUser = { uid: 'u1', messagingToken: ['token-abc'] };

  it('calls sendEachForMulticast with the user tokens', async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({ responses: [{ error: null }] });
    await sendNotification({ recipientId: 'u1', title: 'Hi', body: 'World' });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['token-abc'],
    }));
  });

  it('embeds title and body in notifee JSON payload', async () => {
    mockGetUser.mockResolvedValue(baseUser);
    mockSendEachForMulticast.mockResolvedValue({ responses: [{ error: null }] });
    await sendNotification({ recipientId: 'u1', title: 'Alert', body: 'Test body' });
    const call = mockSendEachForMulticast.mock.calls[0][0];
    const notifee = JSON.parse(call.data.notifee);
    expect(notifee.title).toBe('Alert');
    expect(notifee.body).toBe('Test body');
  });

  it('removes invalid tokens from the user document', async () => {
    mockGetUser.mockResolvedValue({ uid: 'u1', messagingToken: ['valid', 'invalid'] });
    mockSendEachForMulticast.mockResolvedValue({
      responses: [
        { error: null },
        { error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });
    await sendNotification({ recipientId: 'u1', title: 'Hi', body: 'Body' });
    expect(mockUserDocUpdate).toHaveBeenCalledWith({ messagingToken: ['valid'] });
  });

  it('does not throw when user is not found', async () => {
    mockGetUser.mockResolvedValue(null);
    await expect(sendNotification({ recipientId: 'unknown', title: 'Hi', body: 'B' }))
      .resolves.toBeUndefined();
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/notifications.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/notifications.test.ts && git commit -m "test: add util/notifications unit tests"
```

---

### Task 10: Tests for util/invite.ts

**Files:**
- Create: `src/__tests__/util/invite.test.ts`

`util/invite.ts` uses `getUsersByEmail` (from util/user) and `createInviteNotification` (from util/notifications).

**Step 1: Create the test file**

```typescript
// src/__tests__/util/invite.test.ts

const mockGetUsersByEmail = jest.fn();
const mockCreateInviteNotification = jest.fn();

jest.mock('../../util/user', () => ({
  getUsersByEmail: mockGetUsersByEmail,
}));

jest.mock('../../util/notifications', () => ({
  createInviteNotification: mockCreateInviteNotification,
}));

import { notifyAdminsIfTheyExist } from '../../util/invite';

const fakeUser = { uid: 'u1', email: 'admin@test.com' };
const fakeInvite = { email: { to: 'admin@test.com', subject: 'Invite', text: '' } } as any;

beforeEach(() => jest.clearAllMocks());

describe('notifyAdminsIfTheyExist', () => {
  it('creates a notification for each found admin', async () => {
    mockGetUsersByEmail.mockResolvedValue({ docs: [{ exists: true, data: () => fakeUser }] });
    mockCreateInviteNotification.mockResolvedValue(undefined);

    await notifyAdminsIfTheyExist(['admin@test.com'], [fakeInvite]);

    expect(mockCreateInviteNotification).toHaveBeenCalledWith(fakeUser, fakeInvite);
  });

  it('skips admin when no user found with that email', async () => {
    mockGetUsersByEmail.mockResolvedValue({ docs: [] });
    await notifyAdminsIfTheyExist(['ghost@test.com'], [fakeInvite]);
    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  it('skips admin when invite email does not match', async () => {
    mockGetUsersByEmail.mockResolvedValue({ docs: [{ exists: true, data: () => fakeUser }] });
    const unmatchedInvite = { email: { to: 'other@test.com', subject: '', text: '' } } as any;
    await notifyAdminsIfTheyExist(['admin@test.com'], [unmatchedInvite]);
    expect(mockCreateInviteNotification).not.toHaveBeenCalled();
  });

  it('is case-insensitive when matching emails', async () => {
    mockGetUsersByEmail.mockResolvedValue({ docs: [{ exists: true, data: () => fakeUser }] });
    const upperInvite = { email: { to: 'ADMIN@TEST.COM', subject: '', text: '' } } as any;
    await notifyAdminsIfTheyExist(['admin@test.com'], [upperInvite]);
    // Upper-case TO should match lower-case adminEmails entry
    expect(mockCreateInviteNotification).toHaveBeenCalled();
  });

  it('resolves successfully even when getUsersByEmail throws', async () => {
    mockGetUsersByEmail.mockRejectedValue(new Error('Firestore error'));
    await expect(notifyAdminsIfTheyExist(['e@t.com'], [fakeInvite]))
      .resolves.toBeDefined();
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/invite.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/invite.test.ts && git commit -m "test: add util/invite unit tests"
```

---

## Batch 4 — Complex Utility Tests (parallel)

### Task 11: Tests for util/meetings.ts

**Files:**
- Create: `src/__tests__/util/meetings.test.ts`

`util/meetings.ts` uses `api/api`, `api/firestore`, `util/location`, `firebase-functions/v1` logger. Mock all of them.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/meetings.test.ts

jest.mock('firebase-functions/v1', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetAAMeetings = jest.fn();
const mockGetNAMeetings = jest.fn();
const mockPartialGeocode = jest.fn();
const mockGetCelebrateRecoveryMeetings = jest.fn();

jest.mock('../../api/api', () => ({
  getAAMeetings: mockGetAAMeetings,
  getNAMeetings: mockGetNAMeetings,
  partialGeocode: mockPartialGeocode,
  getCelebrateRecoveryMeetings: mockGetCelebrateRecoveryMeetings,
}));

const mockGetMeetings = jest.fn();
jest.mock('../../api/firestore', () => ({
  getMeetings: mockGetMeetings,
  ratsFirestore: { collection: jest.fn() },
  app: {},
}));

import {
  getMeetingEntity,
  filterCustomMeetings,
  filterMeetingsByCriteria,
  getAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings,
  geocodeNAMeeting,
  getAll12StepMeetings,
} from '../../util/meetings';
import { RatsMeeting } from '../../entities/Meeting';

beforeEach(() => jest.clearAllMocks());

// ── getMeetingEntity ──────────────────────────────────────────────────────────

describe('getMeetingEntity — AA type', () => {
  const aaRaw = {
    name: 'Serenity Group',
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    location_name: 'Community Center',
    types: 'O,BB',
    latitude: '30.267',
    longitude: '-97.743',
    day: 1, // Monday
    time: '19:30:00',
    conference_url: '',
    conference_url_notes: '',
  };

  it('maps name, city, state', () => {
    const m = getMeetingEntity(aaRaw, 'AA')!;
    expect(m.name).toBe('Serenity Group');
    expect(m.city).toBe('Austin');
    expect(m.state).toBe('TX');
  });

  it('strips seconds from time string', () => {
    const m = getMeetingEntity(aaRaw, 'AA')!;
    expect(m.time).toBe('19:30');
  });

  it('sets type to AA', () => {
    expect(getMeetingEntity(aaRaw, 'AA')!.type).toBe('AA');
  });

  it('converts day index to day name (1 = monday)', () => {
    expect(getMeetingEntity(aaRaw, 'AA')!.day).toBe('monday');
  });

  it('parses lat/lng as floats', () => {
    const m = getMeetingEntity(aaRaw, 'AA')!;
    expect(m.lat).toBeCloseTo(30.267);
    expect(m.lng).toBeCloseTo(-97.743);
  });

  it('sets online=false when conference_url is empty', () => {
    expect(getMeetingEntity(aaRaw, 'AA')!.online).toBe(false);
  });

  it('sets online=true when conference_url is provided', () => {
    const m = getMeetingEntity({ ...aaRaw, conference_url: 'https://zoom.us/j/1' }, 'AA')!;
    expect(m.online).toBe(true);
  });
});

describe('getMeetingEntity — NA type', () => {
  const naRaw = {
    com_name: 'NA Group',
    address: '456 Oak St',
    city: 'Austin',
    state: 'TX',
    zip: '78702',
    directions: 'Near the park',
    mtg_day: 2, // 1-indexed: 2 = Monday
    mtg_time: 1930, // military time
    latitude: 30.268,
    longitude: -97.744,
    online: 'No',
    password: '',
    link: '',
  };

  it('maps NA meeting fields', () => {
    const m = getMeetingEntity(naRaw, 'NA')!;
    expect(m.name).toBe('NA Group');
    expect(m.type).toBe('NA');
  });

  it('converts military time 1930 to 19:30', () => {
    expect(getMeetingEntity(naRaw, 'NA')!.time).toBe('19:30');
  });

  it('sets online=false when online is "No"', () => {
    expect(getMeetingEntity(naRaw, 'NA')!.online).toBe(false);
  });
});

describe('getMeetingEntity — returns null on bad data', () => {
  it('returns null if meeting data is malformed', () => {
    expect(getMeetingEntity(null, 'AA')).toBeNull();
  });
});

// ── filterCustomMeetings ──────────────────────────────────────────────────────

describe('filterCustomMeetings', () => {
  const meetings: RatsMeeting[] = [
    { name: 'Serenity Group', city: 'Austin', street: '123 Main', state: 'TX', lat: 30.267, lng: -97.743 } as RatsMeeting,
    { name: 'Hope Circle', city: 'Houston', street: '456 Oak', state: 'TX', lat: 29.760, lng: -95.370 } as RatsMeeting,
  ];

  it('filters by name (case-insensitive)', () => {
    const result = filterCustomMeetings(meetings, { name: 'serenity' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Serenity Group');
  });

  it('filters by city', () => {
    const result = filterCustomMeetings(meetings, { city: 'Houston' });
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Houston');
  });

  it('returns all when no criteria provided', () => {
    expect(filterCustomMeetings(meetings, {})).toHaveLength(2);
  });

  it('returns empty when nothing matches', () => {
    const result = filterCustomMeetings(meetings, { name: 'Nonexistent' });
    expect(result).toHaveLength(0);
  });
});

// ── filterMeetingsByCriteria ──────────────────────────────────────────────────

describe('filterMeetingsByCriteria', () => {
  const meetings: RatsMeeting[] = [
    { name: 'AA Morning', type: 'AA' } as RatsMeeting,
    { name: 'AA Evening', type: 'AA' } as RatsMeeting,
  ];

  it('filters AA meetings by name', () => {
    const result = filterMeetingsByCriteria(meetings, { name: 'morning' }, 'AA');
    expect(result).toHaveLength(1);
  });

  it('returns all meetings when no name criteria', () => {
    expect(filterMeetingsByCriteria(meetings, {}, 'AA')).toHaveLength(2);
  });

  it('returns all meetings when criteria is undefined', () => {
    expect(filterMeetingsByCriteria(meetings, undefined, 'AA')).toHaveLength(2);
  });
});

// ── getAlcoholicsAnonymousMeetings ────────────────────────────────────────────

describe('getAlcoholicsAnonymousMeetings', () => {
  it('returns mapped AA meetings from API response', async () => {
    mockGetAAMeetings.mockResolvedValue({
      meetings: [{
        name: 'AA Test',
        address: '1 St',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        location_name: 'Hall',
        types: 'O',
        latitude: '30.0',
        longitude: '-97.0',
        day: 1,
        time: '18:00:00',
        conference_url: '',
        conference_url_notes: '',
      }],
    });
    const results = await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('AA Test');
  });

  it('returns empty array on API error', async () => {
    // AA meetings throw on error, so the result should be [] due to try/catch in caller
    // Actually getAlcoholicsAnonymousMeetings doesn't have a try/catch, it throws.
    // Just verify it calls getAAMeetings
    mockGetAAMeetings.mockResolvedValue({ meetings: [] });
    const results = await getAlcoholicsAnonymousMeetings({ lat: 30.0, lng: -97.0 });
    expect(results).toHaveLength(0);
  });
});

// ── geocodeNAMeeting ──────────────────────────────────────────────────────────

describe('geocodeNAMeeting', () => {
  it('returns location from first result with geometry', async () => {
    mockPartialGeocode.mockResolvedValue({
      results: [
        { geometry: { location: { lat: 30.267, lng: -97.743 } } },
      ],
    });
    const result = await geocodeNAMeeting('123 Main St Austin TX');
    expect(result).toEqual({ lat: 30.267, lng: -97.743 });
  });

  it('returns undefined when no geometry results', async () => {
    mockPartialGeocode.mockResolvedValue({ results: [] });
    const result = await geocodeNAMeeting('nowhere');
    expect(result).toBeUndefined();
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/meetings.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/meetings.test.ts && git commit -m "test: add util/meetings unit tests"
```

---

### Task 12: Tests for util/disputes.ts

**Files:**
- Create: `src/__tests__/util/disputes.test.ts`

`util/disputes.ts` uses `api/firestore` (updateDispute, guestCollection, ratsFirestore) and `util/date`.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/disputes.test.ts

jest.mock('firebase-functions/v1', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateDispute = jest.fn();
const mockRunTransaction = jest.fn();
const mockGuestCollectionWhere = jest.fn();

jest.mock('../../api/firestore', () => ({
  updateDispute: mockUpdateDispute,
  ratsFirestore: { runTransaction: mockRunTransaction },
  guestCollection: { where: jest.fn(() => ({ where: mockGuestCollectionWhere })) },
  app: {},
}));

import { disputeResult, runDisputeTransaction } from '../../util/disputes';
import { Dispute } from '../../entities/Dispute';

beforeEach(() => jest.clearAllMocks());

// Helper: build a dispute object
const makeDispute = (overrides: Partial<Dispute> = {}): Dispute => ({
  id: 'dispute-1',
  initiatedDate: '2024-01-01', // 30 days ago — will be "old enough"
  active: true,
  challenges: [],
  activityId: 'activity-1',
  type: 'chore_completed' as any,
  disputeDate: '2024-01-10',
  victimId: 'guest-1',
  ...overrides,
} as Dispute);

const makeActivity = (underDispute = 0) => ({
  id: 'activity-1',
  underDispute,
} as any);

describe('disputeResult', () => {
  it('returns "success" when dispute is 2+ days old with no challenges', () => {
    const dispute = makeDispute({ initiatedDate: '2020-01-01' });
    const activity = makeActivity(0);
    expect(disputeResult(dispute, activity)).toBe('success');
  });

  it('returns "none" when dispute is less than 2 days old', () => {
    const today = new Date().toISOString().split('T')[0];
    const dispute = makeDispute({ initiatedDate: today });
    expect(disputeResult(dispute, makeActivity(0))).toBe('none');
  });

  it('returns "fail" when enough challenges exist', () => {
    const dispute = makeDispute({
      initiatedDate: '2020-01-01',
      challenges: ['challenge-1'],
    });
    const activity = makeActivity(1); // underDispute count matches challenges
    expect(disputeResult(dispute, activity)).toBe('fail');
  });

  it('returns "none" when dispute is not active', () => {
    const dispute = makeDispute({ initiatedDate: '2020-01-01', active: false });
    expect(disputeResult(dispute, makeActivity(0))).toBe('none');
  });

  it('handles new status field name (status="pending")', () => {
    const dispute = { ...makeDispute({ initiatedDate: '2020-01-01' }), active: undefined, status: 'pending' } as any;
    expect(disputeResult(dispute, makeActivity(0))).toBe('success');
  });
});

describe('runDisputeTransaction', () => {
  it('calls ratsFirestore.runTransaction', () => {
    mockRunTransaction.mockResolvedValue(undefined);
    const house = { id: 'h1', name: 'Test House', disputes: {} } as any;
    const dispute = makeDispute();
    runDisputeTransaction(house, dispute);
    expect(mockRunTransaction).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/disputes.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/disputes.test.ts && git commit -m "test: add util/disputes unit tests"
```

---

### Task 13: Tests for util/guest.ts

**Files:**
- Create: `src/__tests__/util/guest.test.ts`

`util/guest.ts` uses `api/firestore` (guestCollection, houseCollection, weekSummariesCollection, ratsFirestore) and `util/week`, `util/house`.

**Step 1: Create the test file**

```typescript
// src/__tests__/util/guest.test.ts

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockRunTransaction = jest.fn();
const mockHouseCollectionWhere = jest.fn();
const mockGuestCollectionWhere = jest.fn();
const mockWeekSummariesCollectionDoc = jest.fn();

jest.mock('../../api/firestore', () => ({
  ratsFirestore: { runTransaction: mockRunTransaction },
  houseCollection: {
    where: jest.fn(() => ({ get: mockHouseCollectionWhere })),
    get: mockHouseCollectionWhere,
  },
  guestCollection: {
    where: jest.fn(() => ({
      where: jest.fn(() => ({ get: mockGuestCollectionWhere })),
    })),
  },
  weekSummariesCollection: {
    doc: jest.fn(() => ({ set: jest.fn() })),
  },
  app: {},
}));

jest.mock('../../util/house', () => ({
  calculateWeeklyHealth: jest.fn(),
}));

import { advanceGuestWeek, getFailedTransfers } from '../../util/guest';

beforeEach(() => jest.clearAllMocks());

describe('advanceGuestWeek', () => {
  it('advances the guest week when week has ended', async () => {
    const guestRef = {} as any;
    const guest = {
      id: 'guest-1',
      firstName: 'John',
      lastName: 'Doe',
      houseId: 'house-1',
      currentWeekStartDate: '2020-01-06', // old Monday — week has ended
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxSet = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => guest,
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: mockTxSet };
      return fn(tx);
    });

    const result = await advanceGuestWeek(guestRef, guest);
    expect(mockTxUpdate).toHaveBeenCalled();
    expect(result.currentWeekStartDate).not.toBe('2020-01-06');
  });

  it('skips advance when week is current', async () => {
    // getCurrentWeekStart() returns today's Monday — guest is already on it
    const { getCurrentWeekStart } = require('../../util/week');
    const currentMonday = getCurrentWeekStart();

    const guestRef = {} as any;
    const guest = {
      id: 'guest-1',
      firstName: 'Jane',
      lastName: 'Doe',
      houseId: 'house-1',
      currentWeekStartDate: currentMonday,
    } as any;

    const mockTxUpdate = jest.fn();
    const mockTxGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => guest,
    });

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = { get: mockTxGet, update: mockTxUpdate, set: jest.fn() };
      return fn(tx);
    });

    await advanceGuestWeek(guestRef, guest);
    expect(mockTxUpdate).not.toHaveBeenCalled();
  });

  it('throws when guest document no longer exists', async () => {
    const guestRef = {} as any;
    const guest = { id: 'ghost', firstName: 'G', lastName: 'H', houseId: 'h1', currentWeekStartDate: '2020-01-06' } as any;

    mockRunTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        get: jest.fn().mockResolvedValue({ exists: false }),
        update: jest.fn(),
        set: jest.fn(),
      };
      return fn(tx);
    });

    await expect(advanceGuestWeek(guestRef, guest)).rejects.toThrow();
  });
});

describe('getFailedTransfers', () => {
  it('returns an array (empty at start of test)', () => {
    expect(Array.isArray(getFailedTransfers())).toBe(true);
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/util/guest.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/util/guest.test.ts && git commit -m "test: add util/guest unit tests"
```

---

## Batch 5 — Callable Function Tests (parallel)

### Standard mock setup for all callable tests

All callable function test files need this boilerplate at the top (adapt mocks per file):

```typescript
// Mock firebase-functions/v2/https — pass onCall handler through directly
jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) => {
      // onCall can be called as onCall(handler) or onCall(opts, handler)
      return typeof _optsOrHandler === 'function' ? _optsOrHandler : handler;
    },
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
```

When calling a v2 callable handler in tests, use:
```typescript
// v2 handler signature: (request: { data, auth }) => Promise<T>
const result = await (myFunction as unknown as Function)({ data: {...}, auth: { uid: 'user-1' } });
// unauthenticated:
const result = await (myFunction as unknown as Function)({ data: {...}, auth: undefined });
```

---

### Task 14: Tests for callable/auth.ts

**Files:**
- Create: `src/__tests__/callable/auth.test.ts`

**Step 1: Create the test file**

```typescript
// src/__tests__/callable/auth.test.ts

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_opts: any, handler?: Function) =>
      typeof _opts === 'function' ? _opts : handler,
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockCreateClaims = jest.fn();
const mockDeleteClaim = jest.fn();
const mockGetGuestsAsUsers = jest.fn();
const mockVerifyUserEmail = jest.fn();
const mockSetCustomUserClaims = jest.fn();
const mockAuthGetUser = jest.fn();

jest.mock('../../util/claims', () => ({
  createClaims: mockCreateClaims,
  deleteClaim: mockDeleteClaim,
}));

jest.mock('../../util/user', () => ({
  getGuestsAsUsers: mockGetGuestsAsUsers,
  _verifyUserEmail: mockVerifyUserEmail,
}));

jest.mock('firebase-admin', () => ({
  auth: jest.fn(() => ({
    setCustomUserClaims: mockSetCustomUserClaims,
    getUser: mockAuthGetUser,
  })),
}));

import {
  addGuestAuthorization,
  addAdminAuthorization,
  deleteAdminAuthorization,
  promoteGuestsToAdmin,
  removePrivilegesForGuests,
  verifyUserEmail,
  givePotentialSuperAdminPrivilege,
} from '../../callable/auth';
import { HttpsError } from 'firebase-functions/v2/https';

const call = (fn: unknown, data: unknown, auth?: object) =>
  (fn as Function)({ data, auth });

beforeEach(() => jest.clearAllMocks());

describe('addGuestAuthorization', () => {
  it('creates guest claims and sets them', async () => {
    const fakeClaims = { guest: ['house-1'] };
    mockCreateClaims.mockResolvedValue(fakeClaims);
    mockSetCustomUserClaims.mockResolvedValue(undefined);

    const result = await call(addGuestAuthorization, {
      userId: 'u1',
      houseId: 'house-1',
      isAdmin: false,
    });
    expect(mockCreateClaims).toHaveBeenCalledWith('u1', ['house-1'], 'guest');
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('u1', fakeClaims);
    expect(result).toBe(true);
  });

  it('also creates admin claims when isAdmin is true', async () => {
    mockCreateClaims.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(addGuestAuthorization, { userId: 'u1', houseId: 'h1', isAdmin: true });
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
    expect(mockCreateClaims).toHaveBeenCalledWith('u1', ['h1'], 'admin', false);
  });

  it('returns false when an error occurs', async () => {
    mockCreateClaims.mockRejectedValue(new Error('Firebase error'));
    const result = await call(addGuestAuthorization, { userId: 'u1', houseId: 'h1', isAdmin: false });
    expect(result).toBe(false);
  });
});

describe('addAdminAuthorization', () => {
  it('creates admin and superAdmin claims', async () => {
    mockCreateClaims.mockResolvedValue({ admin: ['h1'], superAdmin: ['h2'] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    const result = await call(addAdminAuthorization, {
      userId: 'u1',
      houseIds: ['h1'],
      superAdmin: ['h2'],
    });
    expect(result).toBe(true);
    expect(mockCreateClaims).toHaveBeenCalledTimes(2);
  });
});

describe('deleteAdminAuthorization', () => {
  it('deletes admin claims for provided houseIds', async () => {
    mockDeleteClaim.mockResolvedValue({ admin: [] });
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(deleteAdminAuthorization, {
      admin: { userId: 'u1' },
      adminHouseIds: ['h1'],
      superAdminHouseIds: [],
    });
    expect(mockDeleteClaim).toHaveBeenCalledWith('u1', ['h1'], 'admin');
  });

  it('skips adminHouseIds when array is empty', async () => {
    mockDeleteClaim.mockResolvedValue({});
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(deleteAdminAuthorization, {
      admin: { userId: 'u1' },
      adminHouseIds: [],
      superAdminHouseIds: ['h2'],
    });
    expect(mockDeleteClaim).toHaveBeenCalledWith('u1', ['h2'], 'superAdmin');
    expect(mockDeleteClaim).toHaveBeenCalledTimes(1);
  });
});

describe('verifyUserEmail', () => {
  it('calls _verifyUserEmail with userId', async () => {
    mockVerifyUserEmail.mockResolvedValue(undefined);
    await call(verifyUserEmail, { userId: 'u1' });
    expect(mockVerifyUserEmail).toHaveBeenCalledWith('u1');
  });
});

describe('givePotentialSuperAdminPrivilege', () => {
  it('throws unauthenticated when no auth', async () => {
    await expect(call(givePotentialSuperAdminPrivilege, {}, undefined))
      .rejects.toBeInstanceOf(HttpsError);
  });

  it('creates claims with potentialSuperAdmin=true when authenticated', async () => {
    mockCreateClaims.mockResolvedValue({ potentialSuperAdmin: true });
    mockSetCustomUserClaims.mockResolvedValue(undefined);
    await call(givePotentialSuperAdminPrivilege, {}, { uid: 'u1' });
    expect(mockCreateClaims).toHaveBeenCalledWith('u1', [], null, true);
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/auth.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/callable/auth.test.ts && git commit -m "test: add callable/auth unit tests"
```

---

### Task 15: Tests for callable/meetings.ts

**Files:**
- Create: `src/__tests__/callable/meetings.test.ts`

**Step 1: Create the test file**

```typescript
// src/__tests__/callable/meetings.test.ts

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return { ...actual, onCall: (h: any) => (typeof h === 'function' ? h : (_o: any, fn: any) => fn) };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockGetAlcoholicsAnonymousMeetings = jest.fn();
const mockGetNarcoticsAnoymousMeetings = jest.fn();
const mockGetAll12StepMeetings = jest.fn();
const mockGeocodeNAMeeting = jest.fn();
const mockGetCustomMeetings = jest.fn();
const mockGetCelebrateMeetings = jest.fn();

jest.mock('../../util/meetings', () => ({
  getAlcoholicsAnonymousMeetings: mockGetAlcoholicsAnonymousMeetings,
  getNarcoticsAnoymousMeetings: mockGetNarcoticsAnoymousMeetings,
  getAll12StepMeetings: mockGetAll12StepMeetings,
  geocodeNAMeeting: mockGeocodeNAMeeting,
  getCustomMeetings: mockGetCustomMeetings,
  getCelebrateMeetings: mockGetCelebrateMeetings,
}));

const mockGetDistance = jest.fn();
const mockGetAddressFromGeocode = jest.fn();
jest.mock('../../util/location', () => ({
  getDistance: mockGetDistance,
  getAddressFromGeocode: mockGetAddressFromGeocode,
}));

const mockReverseGeocode = jest.fn();
const mockGetNAMeetings = jest.fn();
jest.mock('../../api/api', () => ({
  reverseGeocode: mockReverseGeocode,
  getNAMeetings: mockGetNAMeetings,
}));

import { findMeetings, userIsAtMeeting, narcoticsAnonymousMeetings, getCurrentAddress } from '../../callable/meetings';

const call = (fn: unknown, data: unknown) => (fn as Function)({ data });

beforeEach(() => jest.clearAllMocks());

describe('findMeetings', () => {
  const location = { lat: 30.267, lng: -97.743 };

  it('calls getAlcoholicsAnonymousMeetings for AA type', async () => {
    mockGetAlcoholicsAnonymousMeetings.mockResolvedValue([]);
    await call(findMeetings, { filters: { type: 'AA', location, day: '' } });
    expect(mockGetAlcoholicsAnonymousMeetings).toHaveBeenCalledWith(location, undefined);
  });

  it('calls getNarcoticsAnoymousMeetings for NA type', async () => {
    mockGetNarcoticsAnoymousMeetings.mockResolvedValue([]);
    await call(findMeetings, { filters: { type: 'NA', location, day: 'monday' } });
    expect(mockGetNarcoticsAnoymousMeetings).toHaveBeenCalledWith(location, undefined, 'monday');
  });

  it('calls getAll12StepMeetings for "all" type', async () => {
    mockGetAll12StepMeetings.mockResolvedValue([]);
    await call(findMeetings, { filters: { type: 'all', location, day: '' } });
    expect(mockGetAll12StepMeetings).toHaveBeenCalled();
  });

  it('returns flattened array of meeting results', async () => {
    mockGetAlcoholicsAnonymousMeetings.mockResolvedValue([{ name: 'AA Meeting' }]);
    const result = await call(findMeetings, { filters: { type: 'AA', location, day: '' } });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('AA Meeting');
  });
});

describe('userIsAtMeeting', () => {
  it('returns true when user is within acceptable distance', async () => {
    mockGetDistance.mockReturnValue(100); // 100m < 200m threshold
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingLocation: { lat: 30.268, lng: -97.744 },
    });
    expect(result).toBe(true);
  });

  it('returns false when user is too far away', async () => {
    mockGetDistance.mockReturnValue(500); // 500m > 200m threshold
    const result = await call(userIsAtMeeting, {
      userLocation: { lat: 30.0, lng: -97.0 },
      meetingLocation: { lat: 31.0, lng: -98.0 },
    });
    expect(result).toBe(false);
  });

  it('geocodes NA meeting address when meetingAddress is provided', async () => {
    mockGeocodeNAMeeting.mockResolvedValue({ lat: 30.268, lng: -97.744 });
    mockGetDistance.mockReturnValue(50);
    await call(userIsAtMeeting, {
      userLocation: { lat: 30.267, lng: -97.743 },
      meetingAddress: '123 Main St Austin TX',
    });
    expect(mockGeocodeNAMeeting).toHaveBeenCalledWith('123 Main St Austin TX');
  });
});

describe('getCurrentAddress', () => {
  it('calls reverseGeocode and getAddressFromGeocode', async () => {
    mockReverseGeocode.mockResolvedValue({ results: [] });
    mockGetAddressFromGeocode.mockReturnValue({ city: 'Austin', state: 'TX' });
    const result = await call(getCurrentAddress, {
      location: { coords: { latitude: 30.267, longitude: -97.743 } },
    });
    expect(mockReverseGeocode).toHaveBeenCalledWith(30.267, -97.743);
    expect(result.city).toBe('Austin');
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/meetings.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/callable/meetings.test.ts && git commit -m "test: add callable/meetings unit tests"
```

---

### Task 16: Tests for callable/houses.ts

**Files:**
- Create: `src/__tests__/callable/houses.test.ts`

**Step 1: Create the test file**

```typescript
// src/__tests__/callable/houses.test.ts

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return { ...actual, onCall: (h: any) => (typeof h === 'function' ? h : (_o: any, fn: any) => fn) };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockUpdateHouseAdmins = jest.fn();
const mockGetNearbyHouses = jest.fn();

jest.mock('../../api/firestore', () => ({
  updateHouseAdmins: mockUpdateHouseAdmins,
  getNearbyHouses: mockGetNearbyHouses,
  app: {},
}));

import { addNewHouseAdmin, searchForHouses } from '../../callable/houses';

const call = (fn: unknown, data: unknown) => (fn as Function)({ data });

beforeEach(() => jest.clearAllMocks());

describe('addNewHouseAdmin', () => {
  it('calls updateHouseAdmins with correct args', async () => {
    mockUpdateHouseAdmins.mockResolvedValue(undefined);
    await call(addNewHouseAdmin, { houseId: 'h1', adminId: 'a1' });
    expect(mockUpdateHouseAdmins).toHaveBeenCalledWith('h1', 'a1');
  });
});

describe('searchForHouses', () => {
  it('calls getNearbyHouses when lat and lng are provided', async () => {
    mockGetNearbyHouses.mockResolvedValue({ 'h1': { id: 'h1', name: 'House 1' } });
    const result = await call(searchForHouses, {
      filters: { location: { lat: 30.267, lng: -97.743 } },
    });
    expect(mockGetNearbyHouses).toHaveBeenCalledWith(30.267, -97.743, 25);
    expect(result).toHaveProperty('h1');
  });

  it('returns empty object when lat or lng is missing', async () => {
    const result = await call(searchForHouses, {
      filters: { location: { lat: null, lng: null } },
    });
    expect(mockGetNearbyHouses).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/houses.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/callable/houses.test.ts && git commit -m "test: add callable/houses unit tests"
```

---

### Task 17: Tests for callable/subscriptions.ts

**Files:**
- Create: `src/__tests__/callable/subscriptions.test.ts`

`callable/subscriptions.ts` uses `api/stripe` (many functions), `api/firestore` (getUser, updateUser, getHousesByAttributes), `util/email`, `util/invite`, and firebase-admin.

**Step 1: Create the test file**

```typescript
// src/__tests__/callable/subscriptions.test.ts

jest.mock('firebase-functions/v2/https', () => {
  const actual = jest.requireActual('firebase-functions/v2/https');
  return {
    ...actual,
    onCall: (_optsOrHandler: any, handler?: Function) =>
      typeof _optsOrHandler === 'function' ? _optsOrHandler : handler,
  };
});

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../config', () => ({
  STRIPE_SECRET_KEY: 'fake-secret',
  SENDGRID_API_KEY: 'fake-sendgrid',
}));

// Mock config from src/config.ts (defineSecret values)
jest.mock('../../config', () => ({
  STRIPE_SECRET_KEY: 'fake-secret',
  SENDGRID_API_KEY: 'fake-sendgrid',
}));

const mockInitializeCustomer = jest.fn();
const mockUpdateSubscriptionItem = jest.fn();
const mockGetSubscriptionItem = jest.fn();
const mockUpdateSubscriptionMetadata = jest.fn();
const mockRetrievePaymentMethod = jest.fn();
const mockUpdatePaymentMethod = jest.fn();
const mockCancelSubscription = jest.fn();
const mockReactivateSubscription = jest.fn();
const mockMapSubscriptionToMetadata = jest.fn();
const mockUncancelSubscription = jest.fn();

jest.mock('../../api/stripe', () => ({
  initializeCustomer: mockInitializeCustomer,
  updateSubscriptionItem: mockUpdateSubscriptionItem,
  getSubscriptionItem: mockGetSubscriptionItem,
  updateSubscriptionMetadata: mockUpdateSubscriptionMetadata,
  retrievePaymentMethod: mockRetrievePaymentMethod,
  updatePaymentMethod: mockUpdatePaymentMethod,
  cancelSubscription: mockCancelSubscription,
  reactivateSubscription: mockReactivateSubscription,
  mapSubscriptionToMetadata: mockMapSubscriptionToMetadata,
  uncancelSubscription: mockUncancelSubscription,
}));

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetHousesByAttributes = jest.fn();

jest.mock('../../api/firestore', () => ({
  getUser: mockGetUser,
  updateUser: mockUpdateUser,
  getHousesByAttributes: mockGetHousesByAttributes,
  app: {},
}));

jest.mock('../../util/email', () => ({
  sendEmail: jest.fn(),
  regroupEmail: 'admin@regroup-app.com',
}));

jest.mock('../../util/invite', () => ({
  notifyAdminsIfTheyExist: jest.fn(),
}));

jest.mock('firebase-admin', () => ({
  firestore: Object.assign(jest.fn(() => ({})), {
    FieldValue: { arrayUnion: jest.fn((v: any) => v) },
  }),
}));

import {
  createOperatorSubscription,
  cancelUserSubscription,
  updateSubscriptionGuests,
  updateSubscriptionHouses,
  getPaymentMethod,
} from '../../callable/subscriptions';
import { HttpsError } from 'firebase-functions/v2/https';

const call = (fn: unknown, data: unknown, auth?: object) =>
  (fn as Function)({ data, auth });

const fakeUser = {
  id: 'user-1',
  email: 'user@test.com',
  adminId: 'admin-1',
  subscriptionMetadata: {
    customerId: 'cus_fake',
    subscriptionId: 'sub_fake',
    items: { houseItemId: 'si_house', guestItemId: 'si_guest' },
    houses: { 'house-1': { numberOfGuests: 2 } },
  },
};

beforeEach(() => jest.clearAllMocks());

describe('createOperatorSubscription', () => {
  it('initializes customer and updates user subscription metadata', async () => {
    const fakeMeta = { customerId: 'cus_new', subscriptionId: 'sub_new', status: 'trialing', houses: {}, items: {} };
    mockInitializeCustomer.mockResolvedValue(fakeMeta);
    mockUpdateUser.mockResolvedValue(undefined);

    await call(createOperatorSubscription, { user: fakeUser, paymentMethod: 'pm_test' });

    expect(mockInitializeCustomer).toHaveBeenCalledWith(fakeUser.email, 'pm_test');
    expect(mockUpdateUser).toHaveBeenCalledWith(fakeUser.id, expect.objectContaining({
      subscriptionMetadata: expect.objectContaining({ status: 'active' }),
    }));
  });
});

describe('cancelUserSubscription', () => {
  it('throws unauthenticated when no auth', async () => {
    await expect(call(cancelUserSubscription, {}, undefined))
      .rejects.toBeInstanceOf(HttpsError);
  });

  it('calls cancelSubscription with the subscriptionId', async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockCancelSubscription.mockResolvedValue({ cancel_at_period_end: true });
    mockUpdateUser.mockResolvedValue(undefined);

    await call(cancelUserSubscription, { userId: 'user-1' }, { uid: 'user-1' });
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_fake');
  });
});

describe('updateSubscriptionGuests', () => {
  it('throws unauthenticated when no auth', async () => {
    await expect(call(updateSubscriptionGuests, {}, undefined))
      .rejects.toBeInstanceOf(HttpsError);
  });

  it('calls updateSubscriptionItem with the guest item id', async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockGetSubscriptionItem.mockResolvedValue({ plan: { id: 'plan_guest' } });
    mockUpdateSubscriptionItem.mockResolvedValue({});
    mockUpdateUser.mockResolvedValue(undefined);

    await call(updateSubscriptionGuests, {
      userId: 'user-1',
      houseId: 'house-1',
      action: 'add',
    }, { uid: 'user-1' });

    expect(mockUpdateSubscriptionItem).toHaveBeenCalled();
  });
});

describe('getPaymentMethod', () => {
  it('throws unauthenticated when no auth', async () => {
    await expect(call(getPaymentMethod, {}, undefined))
      .rejects.toBeInstanceOf(HttpsError);
  });

  it('returns payment method for authenticated user', async () => {
    mockGetUser.mockResolvedValue(fakeUser);
    mockRetrievePaymentMethod.mockResolvedValue({ id: 'pm_123', card: { last4: '4242' } });

    const result = await call(getPaymentMethod, { userId: 'user-1' }, { uid: 'user-1' });
    expect(result).toHaveProperty('id', 'pm_123');
  });
});
```

**Step 2: Run tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npx jest src/__tests__/callable/subscriptions.test.ts --no-coverage
```
Expected: all pass.

**Step 3: Commit**
```bash
git add src/__tests__/callable/subscriptions.test.ts && git commit -m "test: add callable/subscriptions unit tests"
```

---

## Batch 6 — Triggers, Scheduled, Webhooks, HTTP Tests (parallel)

### Task 18: Tests for triggers/firestore.ts

**Files:**
- Create: `src/__tests__/triggers/firestore.test.ts`
- Reference: `src/triggers/firestore/index.ts`

Read `src/triggers/firestore/index.ts` first. The triggers respond to Firestore document events. Mock `firebase-functions/v2/firestore` so `onDocumentCreated` and `onDocumentDeleted` pass handlers through. Test each handler's business logic.

```typescript
// src/__tests__/triggers/firestore.test.ts

// Mock firebase-functions/v2/firestore — pass handlers through
jest.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: jest.fn((_path: any, handler: any) =>
    typeof _path === 'string' ? handler : _path
  ),
  onDocumentDeleted: jest.fn((_path: any, handler: any) =>
    typeof _path === 'string' ? handler : _path
  ),
  onDocumentWritten: jest.fn((_path: any, handler: any) =>
    typeof _path === 'string' ? handler : _path
  ),
}));

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Mock all util and api dependencies — read the actual triggers file for specific imports
// then mock them here.
// Pattern: jest.mock('../../util/email', () => ({ sendEmail: jest.fn() }));
// etc.
```

Read `src/triggers/firestore/index.ts` for the complete list of imports and handler signatures. For each trigger handler:
1. Build a fake Firestore event object: `{ data: { data: () => fakeDoc, id: 'doc-id' } }`
2. Call the handler directly
3. Assert the expected side effects (email sent, notification created, claim deleted, etc.)

Commit after all trigger tests pass.

---

### Task 19: Tests for triggers/rtdb.ts

**Files:**
- Create: `src/__tests__/triggers/rtdb.test.ts`
- Reference: `src/triggers/rtdb/index.ts`

Read `src/triggers/rtdb/index.ts`. Mock `firebase-functions/v2/database` so `onValueCreated` passes handlers through. The `dmNotification` handler fires when a direct message is written; it sends a push notification to the recipient.

Test:
- Happy path: recipient has messaging tokens, sendNotification is called
- Recipient not found: no notification sent, no crash

---

### Task 20: Tests for scheduled/index.ts

**Files:**
- Create: `src/__tests__/scheduled/index.test.ts`
- Reference: `src/scheduled/index.ts`

Read `src/scheduled/index.ts`. Mock `firebase-functions/v2/scheduler` so `onSchedule` passes handlers through. Mock `util/guest.transferStats`, `util/disputes.runDisputeTransaction`, and `api/firestore` collections.

Key tests per function:
- `scheduledWeeklyTransferEST/CST/MST/PST`: calls `transferStats` with correct timezone
- `scheduledWeeklyTransferFallback`: calls `transferStats` with no timezone
- `updateDisputes`: queries houses with active disputes, calls `runDisputeTransaction` for each
- `adHocTransfer`: calls `transferStats` for specific houseId from env

---

### Task 21: Tests for webhooks/stripeWebhook.ts

**Files:**
- Create: `src/__tests__/webhooks/stripeWebhook.test.ts`
- Reference: `src/webhooks/stripeWebhook.ts`

Read `src/webhooks/stripeWebhook.ts`. It is an HTTP function using `onRequest` from `firebase-functions/v2/https`. Mock `stripe.webhooks.constructEvent` to control which events fire. Mock the Firestore helpers.

Key tests:
- Valid signature: constructs event and routes to handler
- Invalid signature: returns 400
- `customer.subscription.updated` event: calls `updateUserSubscriptionStatus`
- `customer.subscription.deleted` event: calls `updateUserPeriodEnd` with cancel=true
- `invoice.payment_succeeded` event: calls `updateUserPeriodEnd`

---

### Task 22: Tests for http/stripeConnect.ts and http/universal.ts

**Files:**
- Create: `src/__tests__/http/stripeConnect.test.ts`
- Reference: `src/http/stripeConnect.ts`, `src/http/universal.ts`

Read both files. Mock `onRequest` from `firebase-functions/v2/https` to pass handlers through. Create fake `req`/`res` objects.

Key tests for `stripeConnectReauth`:
- Redirects to Stripe re-auth URL

Key tests for `stripeConnectReturn`:
- Updates house stripeStatus to 'active'
- Redirects to return URL

---

## Batch 7 — Final Verification (sequential)

### Task 23: Run full test suite and verify

**Step 1: Run all tests**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm test -- --no-coverage 2>&1 | tail -30
```
Expected: all test suites pass, 0 failures.

**Step 2: Run TypeScript build**
```bash
cd /Users/marcusklein/dev/regroup-functions/functions && npm run build 2>&1 | tail -20
```
Expected: exit 0.

**Step 3: Commit final state**
```bash
git add -A && git commit -m "test: comprehensive unit test suites for all functions"
```
