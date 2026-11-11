# Regroup Rent Charges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A house sets a weekly or monthly price once; the server adds each resident's rent to `rentOwed` on time, prorated in the first period, exactly once.

**Architecture:** Pure date and charge math in `regroup/functions/src/rent/`, one transactional `chargeResident` that every path calls (guest-write trigger on joining, an hourly job, catch-up), a house trigger that stamps when charging turned on, and rules that keep the new records server-only. The server ships first and stays inert, because no app screen can set `rentFrequency` to `weekly` or `monthly` today. The phone screens come after #160 merges.

**Tech Stack:** Firebase Functions v2 (TypeScript, Node 22), Firestore, Jest with `src/__tests__/helpers/memFirestore.ts`, `@firebase/rules-unit-testing`, the `regroup/e2e` payment suite, React Native 0.88 and Maestro (phase C).

**Spec:** `docs/superpowers/specs/2026-11-08-regroup-rent-charges-design.md` (section numbers below refer to it).

## Global Constraints

- `house.monthlyRent` / `house.weeklyRent` are DOLLARS; `guest.rentOwed`, `guest.choreFees` and every new amount are integer CENTS. Convert only with `dollarsToCents`; type every amount `Cents` or `Dollars` from `util/money.ts`.
- Charging is on only when `rentFrequency` is `'weekly'` or `'monthly'` and that schedule's price is a finite number above 0 and at most `MAX_HOUSE_PRICE_DOLLARS` (10000). `'both'`, missing, a string, or anything else means off.
- Dates are `YYYY-MM-DD` calendar dates in the house's zone (`resolveTimeZone(house.timezone)`, default `America/New_York`). Never add milliseconds to a date; use `addDays` / `localDateString` from `activities/weekSummaryMath.ts`.
- Weeks run Monday to Sunday; months are calendar months. The move-in day is a paid day.
- Amount = `Math.round(rateCents * daysCovered / daysInPeriod)`. A full period is exactly the rate.
- Active means `isActiveGuestDoc` from `util/guestMembership.ts`.
- `rentAccounts` and `rentCharges` are written only by the Admin SDK. Charge ids are `${guestId}_${from}`.
- No names, contact details or amounts in logs: ids and counts only.
- New source files ≤ 300 lines (pre-commit gate). Commit scopes name the product: `feat(regroup-functions):`, `feat(regroup):` for rules, `feat(regroup-mobile):`.
- Every new exported endpoint goes into `ALL_FUNCTIONS` in `regroup/scripts/deploy-batched.sh` (`deployList.test.ts` enforces it).
- No composite indexes: every query here is equality-only or a single `in`.
- Nothing deploys to `phoenix-cleanhouse` without the owner's yes. Staging is `regroup-e2e`.
- Never commit `regroup/mobile/package.json` changes you did not make. Never use `--no-verify`. Stage by name. End commit messages with the `Claude-Session:` line.

## Review Focus

1. **`moveInDate` in other formats.** Intake writes a full ISO timestamp (`new Date().toISOString()`), and import writes whatever was in the CSV. `2026-11-21T03:00:00.000Z` must read as Nov 20 for a New York house, not Nov 21. Pinned in Task 1 (`toLocalDate`) and Task 5.
2. **Schedule switch mid-cycle.** The spec's two switch examples must not skip or double any day, so `chargeFrom` is frozen once anchored and never recomputed with the new frequency. Pinned in Task 5.
3. **A price in the wrong unit or type.** `"175"`, `17500` meant as cents, or `NaN` must mean charging is off, never a 100x charge. Pinned in Task 2 and in the Task 4 rules.
4. **Concurrent paths on one resident.** The join trigger, the hourly job and a redelivered event can hit the same resident at once. The result must be one charge. Pinned in Task 5 (`mem.beforeCommit`) and Task 11 (emulator).
5. **A house with an empty or unknown timezone.** It is charged on New York dates, not skipped. Pinned in Task 8.

---

## Sequencing and branches

- **Phase A, server (Tasks 1–10):**
  - Worktree `/Users/marcusklein/dev/rp-rent-charges` on branch `feat/regroup-rent-charges` off `origin/main`, with the design commit `886b2180` and this plan cherry-picked first.
  - One PR, kept in draft until the domain-model review in spec §8 is done. Merging needs an independent reviewer reasoning from the domain model.
- **Phase B, real-system proof (Task 11):** needs the `regroup/e2e/src/payments/` harness on `main`. Today it is uncommitted in `rp-pay-suites`, and committing it is an open owner task. Task 11 goes on the Phase A branch if the harness has landed by then; otherwise it's a follow-up PR.
- **Phase C, phone (Tasks 12–16):** starts only after #160 merges. Separate worktree and branch `feat/regroup-rent-settings-ui` off `origin/main`.
- **Deploy:** after Phase A merges, deploy rules and functions to `regroup-e2e` only. Production waits for the owner and the deploy freeze.
- **Before the production deploy:** query production, read-only, for houses already set to `weekly` or `monthly` with a price, and for `guests.rentOwed` values that aren't numbers. A house already on a schedule gets its charging-start stamp on the next edit of a rent field, with no preview. `FieldValue.increment` replaces a string balance instead of adding to it.

## File structure

All of `regroup/functions/src/rent/` is new:

| File                  | Responsibility                                                    |
| --------------------- | ----------------------------------------------------------------- |
| `types.ts`            | Shared types and constants                                        |
| `period.ts`           | Pure calendar math: periods, local dates                          |
| `rate.ts`             | House settings and a resident's rate, from raw docs               |
| `chargeRule.ts`       | Pure: `chargeFromFor`, `nextChargeDay`, `planCharges`             |
| `chargeResident.ts`   | The one transaction that charges a resident                       |
| `guestWriteRent.ts`   | What a guest write means for rent (join, move, reactivation)      |
| `linkIntakeRecord.ts` | Folds an intake record into the invite record for the same person |

Other new files:

- `regroup/functions/src/triggers/firestore/houseRentSettings.ts`: stamps or clears the charging start.
- `regroup/functions/src/scheduled/rentChargeJob.ts`: the hourly job.
- `regroup/functions/src/scripts/reverseRentCharges.ts`: reversal, dry run by default.
- `regroup/mobile/firebase/__tests__/rentCharges.rules.test.ts`.

Modified:

- `api/firestore.ts`: three collection refs.
- `entities/House.ts`, `entities/Guest.ts`: new fields.
- `triggers/firestore/guestWrite.ts`: one step.
- `triggers/firestore/index.ts`, `scheduled/index.ts`: exports.
- `regroup/scripts/deploy-batched.sh`.
- `regroup/functions/package.json`: two scripts.
- `regroup/mobile/firebase/firestore.rules`.
- Docs (Task 10).

Tests for each `rent/X.ts` live in `regroup/functions/src/__tests__/rent/X.test.ts`.

---

### Task 1: Calendar math

**Files:**

- Create: `regroup/functions/src/rent/types.ts`
- Create: `regroup/functions/src/rent/period.ts`
- Test: `regroup/functions/src/__tests__/rent/period.test.ts`

**Interfaces:**

- Produces (`types.ts`):
  - `type RentFrequency = 'weekly' | 'monthly'`
  - `const MAX_HOUSE_PRICE_DOLLARS = 10000`
  - `const MAX_PERIODS_PER_RUN = 12`
- Produces (`period.ts`):
  - `periodFor(date: string, frequency: RentFrequency): { start: string; end: string; days: number }`
  - `nextPeriodStart(date: string, frequency: RentFrequency): string`: the start of the period after the one containing `date`.
  - `daysInclusive(from: string, through: string): number`
  - `maxDate(...dates: Array<string | null | undefined>): string`: the latest of the non-empty arguments; throws if there are none.
  - `toLocalDate(value: unknown, timeZone: string): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
describe('periodFor', () => {
  it('weekly is Monday to Sunday', () =>
    expect(periodFor('2026-11-18', 'weekly')).toEqual({
      start: '2026-11-16',
      end: '2026-11-22',
      days: 7,
    }));
  it('a Sunday belongs to the week that started the Monday before', () =>
    expect(periodFor('2026-11-22', 'weekly').start).toBe('2026-11-16'));
  it('monthly is the calendar month', () =>
    expect(periodFor('2026-11-20', 'monthly')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
      days: 30,
    }));
  it('February in a common year has 28 days', () =>
    expect(periodFor('2027-02-20', 'monthly').days).toBe(28));
  it('February in a leap year has 29 days', () =>
    expect(periodFor('2028-02-20', 'monthly').days).toBe(29));
  it('a week across a DST change is still 7 days', () =>
    expect(periodFor('2026-11-01', 'weekly')).toEqual({
      start: '2026-10-26',
      end: '2026-11-01',
      days: 7,
    }));
});
describe('nextPeriodStart', () => {
  it('on a Monday is the following Monday', () =>
    expect(nextPeriodStart('2026-11-16', 'weekly')).toBe('2026-11-23'));
  it('on the 1st is the next month', () =>
    expect(nextPeriodStart('2026-11-01', 'monthly')).toBe('2026-12-01'));
  it('in December is January', () =>
    expect(nextPeriodStart('2026-12-31', 'monthly')).toBe('2027-01-01'));
});
describe('toLocalDate', () => {
  const NY = 'America/New_York';
  it('keeps a calendar date as is', () => expect(toLocalDate('2026-11-20', NY)).toBe('2026-11-20'));
  it('reads an ISO timestamp in the house zone', () =>
    expect(toLocalDate('2026-11-21T03:00:00.000Z', NY)).toBe('2026-11-20'));
  it('reads a Firestore Timestamp', () =>
    expect(toLocalDate({ toMillis: () => Date.parse('2026-11-21T03:00:00Z') }, NY)).toBe(
      '2026-11-20',
    ));
  it('reads epoch milliseconds', () =>
    expect(toLocalDate(Date.parse('2026-11-20T17:00:00Z'), NY)).toBe('2026-11-20'));
  it.each(['', 'soon', '2026-13-01', '11/20/2026', null, undefined, {}])(
    'returns null for %p',
    (v) => expect(toLocalDate(v, NY)).toBeNull(),
  );
});
it('daysInclusive counts both ends', () =>
  expect(daysInclusive('2026-11-20', '2026-11-30')).toBe(11));
it('maxDate ignores empty values', () =>
  expect(maxDate(null, '2026-11-02', undefined, '2026-11-01')).toBe('2026-11-02'));
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/period.test.ts`
Expected: FAIL, `Cannot find module '../../rent/period'`.

- [ ] **Step 3: Implement `period.ts`**

Build on `addDays`, `localDateString` and `weekStartFor` from `activities/weekSummaryMath.ts`. A string matching `^\d{4}-\d{2}-\d{2}$` is a calendar date and must also round-trip through `Date.UTC`, which rejects month 13. Any other string must `Date.parse` to a finite number and is then read in `timeZone`. Month length comes from `Date.UTC(y, m, 0)`.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd regroup/functions && npx jest src/__tests__/rent/period.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/rent/types.ts regroup/functions/src/rent/period.ts regroup/functions/src/__tests__/rent/period.test.ts
git commit -m "feat(regroup-functions): calendar math for rent periods"
```

---

### Task 2: House settings and a resident's rate

**Files:**

- Modify: `regroup/functions/src/rent/types.ts`
- Create: `regroup/functions/src/rent/rate.ts`
- Modify: `regroup/functions/src/entities/House.ts`, `regroup/functions/src/entities/Guest.ts`
- Test: `regroup/functions/src/__tests__/rent/rate.test.ts`

**Interfaces:**

- Consumes: `RentFrequency` and `MAX_HOUSE_PRICE_DOLLARS` (Task 1); `dollarsToCents`, `asDollars`, `Cents` (`util/money.ts`); `resolveTimeZone`.
- Produces (`types.ts`):
  - `interface RentSettings { frequency: RentFrequency; priceCents: Cents; timeZone: string; startDate: string | null; startedAtMs: number | null }`
  - `interface CustomRent { amountCents: Cents; frequency: RentFrequency }`
- Produces (`rate.ts`):
  - `rentSettingsOf(house: Record<string, unknown>): RentSettings | null`: null when charging is off. `startDate` and `startedAtMs` come from `house.rentChargesStartDate` and `house.rentChargesStartedAtMs`, and are null when absent or malformed.
  - `residentRate(guest: Record<string, unknown>, settings: RentSettings): { rateCents: Cents; source: 'house' | 'custom' }`
- Produces (entities):
  - `House` gains `rentChargesStartDate?: string | null` and `rentChargesStartedAtMs?: number | null`. Both are server-owned.
  - `Guest` gains `customRent?: CustomRent | null`, `importedAt?: string`, `rentDueDate?: string` and `rentLinkedTo?: string`.

- [ ] **Step 1: Write the failing tests**

```ts
const house = (o: Record<string, unknown> = {}) => ({
  rentFrequency: 'weekly',
  weeklyRent: 175,
  monthlyRent: 800,
  timezone: 'America/Chicago',
  ...o,
});
it('weekly uses weeklyRent, in cents', () =>
  expect(rentSettingsOf(house())).toMatchObject({
    frequency: 'weekly',
    priceCents: 17500,
    timeZone: 'America/Chicago',
  }));
it('monthly uses monthlyRent', () =>
  expect(rentSettingsOf(house({ rentFrequency: 'monthly' }))?.priceCents).toBe(80000));
it('19.99 dollars is 1999 cents, not 1998', () =>
  expect(rentSettingsOf(house({ weeklyRent: 19.99 }))?.priceCents).toBe(1999));
it.each([
  ['both', { rentFrequency: 'both' }],
  ['missing schedule', { rentFrequency: undefined }],
  ['zero price', { weeklyRent: 0 }],
  ['string price', { weeklyRent: '175' }],
  ['NaN', { weeklyRent: NaN }],
  ['negative', { weeklyRent: -5 }],
  ['cents-sized', { weeklyRent: 17500 }],
])('is off for %s', (_l, o) => expect(rentSettingsOf(house(o))).toBeNull());
it('an empty timezone falls back to New York', () =>
  expect(rentSettingsOf(house({ timezone: '' }))?.timeZone).toBe('America/New_York'));
it('carries the start stamp', () =>
  expect(
    rentSettingsOf(house({ rentChargesStartDate: '2026-11-09', rentChargesStartedAtMs: 5 })),
  ).toMatchObject({ startDate: '2026-11-09', startedAtMs: 5 }));

const s = rentSettingsOf(house())!;
it('no custom rate means the house price', () =>
  expect(residentRate({}, s)).toEqual({ rateCents: 17500, source: 'house' }));
it('a custom rate for this schedule wins', () =>
  expect(residentRate({ customRent: { amountCents: 12000, frequency: 'weekly' } }, s)).toEqual({
    rateCents: 12000,
    source: 'custom',
  }));
it('zero is a valid custom rate', () =>
  expect(residentRate({ customRent: { amountCents: 0, frequency: 'weekly' } }, s).rateCents).toBe(
    0,
  ));
it('a custom rate for the other schedule is ignored', () =>
  expect(residentRate({ customRent: { amountCents: 60000, frequency: 'monthly' } }, s).source).toBe(
    'house',
  ));
it.each([
  { amountCents: 12.5, frequency: 'weekly' },
  { amountCents: -1, frequency: 'weekly' },
  { amountCents: '120', frequency: 'weekly' },
  null,
])('a malformed custom rate %p falls back to the house price', (c) =>
  expect(residentRate({ customRent: c }, s).source).toBe('house'),
);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/rate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `rate.ts` and add the entity fields**

`rentSettingsOf` brands the raw price with `asDollars` only after checking that it is a finite number in (0, 10000]. A custom rate must be an integer ≥ 0.

- [ ] **Step 4: Run the tests and the type check**

Run: `cd regroup/functions && npx jest src/__tests__/rent/rate.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc reports no errors.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/rent/types.ts regroup/functions/src/rent/rate.ts regroup/functions/src/entities/House.ts regroup/functions/src/entities/Guest.ts regroup/functions/src/__tests__/rent/rate.test.ts
git commit -m "feat(regroup-functions): read a house's rent settings and a resident's rate"
```

---

### Task 3: The charge rule

**Files:**

- Modify: `regroup/functions/src/rent/types.ts`
- Create: `regroup/functions/src/rent/chargeRule.ts`
- Test: `regroup/functions/src/__tests__/rent/chargeRule.test.ts`

**Interfaces:**

- Consumes: Task 1.
- Produces (`types.ts`):
  - `interface PlannedCharge { from: string; through: string; daysCovered: number; daysInPeriod: number; amountCents: Cents }`
  - `interface ChargeFromFacts { startDate: string; startedAtMs: number; houseJoinedAtMs: number; joinDate: string; importedOn: string | null; frequency: RentFrequency }`
- Produces (`chargeRule.ts`):
  - `chargeFromFor(f: ChargeFromFacts): string`. Three cases:
    - imported: `nextPeriodStart(maxDate(importedOn, startDate))`;
    - joined the house before charging started (`houseJoinedAtMs < startedAtMs`): `nextPeriodStart(startDate)`;
    - otherwise: `maxDate(joinDate, startDate)`.
  - `nextChargeDay(a: { chargeFrom: string; chargedThrough: string | null }): string`
  - `planCharges(p: { chargeFrom: string; chargedThrough: string | null; today: string; frequency: RentFrequency; rateCents: Cents; maxPeriods?: number }): PlannedCharge[]`: oldest first. It stops once the next day is after `today`, or at `maxPeriods` (default `MAX_PERIODS_PER_RUN`).

- [ ] **Step 1: Write the failing tests: the spec §4.3 examples, a table**

```ts
const first = (
  chargeFrom: string,
  frequency: RentFrequency,
  rate: number,
  today = chargeFrom,
  chargedThrough: string | null = null,
) => planCharges({ chargeFrom, chargedThrough, today, frequency, rateCents: rate as Cents });
it.each([
  [
    '$175/week, moves in Wednesday',
    first('2026-11-18', 'weekly', 17500),
    '2026-11-18',
    '2026-11-22',
    5,
    7,
    12500,
  ],
  [
    '$175/week, moves in Monday',
    first('2026-11-16', 'weekly', 17500),
    '2026-11-16',
    '2026-11-22',
    7,
    7,
    17500,
  ],
  [
    '$800/month, moves in Nov 20',
    first('2026-11-20', 'monthly', 80000),
    '2026-11-20',
    '2026-11-30',
    11,
    30,
    29333,
  ],
  [
    '$800/month, Feb 20 of a 28-day year',
    first('2027-02-20', 'monthly', 80000),
    '2027-02-20',
    '2027-02-28',
    9,
    28,
    25714,
  ],
  [
    'later Monday, full week',
    first('2026-11-16', 'weekly', 17500, '2026-11-23', '2026-11-22'),
    '2026-11-23',
    '2026-11-29',
    7,
    7,
    17500,
  ],
  [
    'weekly to $800/month on Nov 16',
    first('2026-11-02', 'monthly', 80000, '2026-11-16', '2026-11-15'),
    '2026-11-16',
    '2026-11-30',
    15,
    30,
    40000,
  ],
  [
    'monthly to $175/week, Dec 1 a Tuesday',
    first('2026-11-01', 'weekly', 17500, '2026-12-01', '2026-11-30'),
    '2026-12-01',
    '2026-12-06',
    6,
    7,
    15000,
  ],
])('%s', (_l, charges, from, through, days, inPeriod, cents) =>
  expect(charges[0]).toEqual({
    from,
    through,
    daysCovered: days,
    daysInPeriod: inPeriod,
    amountCents: cents,
  }),
);
```

Note: the switch rows use a Dec 2026 calendar where Dec 1 is a Tuesday. Check before relying on it: `new Date('2026-12-01T00:00:00Z').getUTCDay() === 2`. If the calendar disagrees, use the first year where Dec 1 is a Tuesday and keep the expected cents.

More cases:

```ts
it('nothing is due before chargeFrom', () =>
  expect(first('2026-11-25', 'weekly', 17500, '2026-11-20')).toEqual([]));
it('nothing is due when already charged through this period', () =>
  expect(first('2026-11-16', 'weekly', 17500, '2026-11-20', '2026-11-22')).toEqual([]));
it('catch-up after three missed Mondays is three charges, oldest first', () =>
  expect(
    first('2026-11-02', 'weekly', 17500, '2026-11-25', '2026-11-08').map((c) => c.from),
  ).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']));
it('catch-up stops at maxPeriods', () =>
  expect(
    planCharges({
      chargeFrom: '2026-01-05',
      chargedThrough: null,
      today: '2026-12-31',
      frequency: 'weekly',
      rateCents: 100 as Cents,
      maxPeriods: 12,
    }),
  ).toHaveLength(12));
it('a zero rate still advances, with zero amounts', () =>
  expect(first('2026-11-18', 'weekly', 0)[0]).toMatchObject({
    through: '2026-11-22',
    amountCents: 0,
  }));
it('nextChargeDay is the later of chargedThrough+1 and chargeFrom', () => {
  expect(nextChargeDay({ chargeFrom: '2026-11-01', chargedThrough: '2026-11-15' })).toBe(
    '2026-11-16',
  );
  expect(nextChargeDay({ chargeFrom: '2026-12-01', chargedThrough: '2026-11-15' })).toBe(
    '2026-12-01',
  );
  expect(nextChargeDay({ chargeFrom: '2026-11-18', chargedThrough: null })).toBe('2026-11-18');
});

const facts = (o: Partial<ChargeFromFacts>): ChargeFromFacts => ({
  startDate: '2026-11-11',
  startedAtMs: 100,
  houseJoinedAtMs: 200,
  joinDate: '2026-11-18',
  importedOn: null,
  frequency: 'weekly',
  ...o,
});
it('a new resident starts on their join date', () =>
  expect(chargeFromFor(facts({}))).toBe('2026-11-18'));
it('a backdated move-in is charged back, but not before charging began', () =>
  expect(chargeFromFor(facts({ joinDate: '2026-11-01' }))).toBe('2026-11-11'));
it('a future move-in starts that day', () =>
  expect(chargeFromFor(facts({ joinDate: '2026-12-02' }))).toBe('2026-12-02'));
it('a resident already in the house starts at the next period', () =>
  expect(chargeFromFor(facts({ houseJoinedAtMs: 50 }))).toBe('2026-11-16'));
it('an imported resident starts at the period after the import', () =>
  expect(chargeFromFor(facts({ importedOn: '2026-11-18' }))).toBe('2026-11-23'));
it('existing residents of a monthly house start on the 1st of next month', () =>
  expect(chargeFromFor(facts({ houseJoinedAtMs: 50, frequency: 'monthly' }))).toBe('2026-12-01'));
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/chargeRule.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `chargeRule.ts`**

A loop over periods, starting at `nextChargeDay` and moving to `periodFor(day).end + 1` each time. Amounts follow the Global Constraints formula.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd regroup/functions && npx jest src/__tests__/rent/chargeRule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/rent/types.ts regroup/functions/src/rent/chargeRule.ts regroup/functions/src/__tests__/rent/chargeRule.test.ts
git commit -m "feat(regroup-functions): the rent charge rule, with proration and catch-up"
```

---

### Task 4: Security rules

**Files:**

- Modify: `regroup/mobile/firebase/firestore.rules`: the `guests` update rule (around line 336), the `houses` update rule (around line 442), and new `rentCharges`, `rentAccounts` and `config` blocks next to `payments` (line 524).
- Test: `regroup/mobile/firebase/__tests__/rentCharges.rules.test.ts`. Copy the harness setup from `guestCreate.rules.test.ts`.

**Interfaces:**

- Produces: the client contract that Phase C relies on:
  - admins write `monthlyRent`, `weeklyRent` and `rentFrequency`, and other residents' `customRent`, `rentOwed` and `choreFees`;
  - residents read their own `rentCharges`.

Rule changes:

1. **Houses: server-owned fields.** Add `rentChargesStartDate` and `rentChargesStartedAtMs` to the server-owned `hasAny` list at the top of the rule. That guard sits above the role branches, so it binds super admins too.
2. **Houses: admin writes.** Remove `monthlyRent` and `weeklyRent` from the admin branch's blocked list. Everything else in that list stays.
3. **Houses: validation, for every role.** Add it above the role branches. When `rentFrequency` changes, it must be in `['weekly','monthly','both']`. When `monthlyRent` or `weeklyRent` changes, it must be a number with `>= 0 && <= 10000`.
4. **Guests: no one changes their own money fields.** In the admin branch, add: `!(resource.data.get('userId','') == request.auth.uid && affected.hasAny(['rentOwed','choreFees','customRent']))`. The resident branch's `hasOnly` list already excludes all three. Leave it as is and prove it with a test.
5. **Guests: custom rate shape.** When `customRent` changes, it must be `null`, or a map with exactly `amountCents` (an int `>= 0`) and `frequency` (`'weekly'` or `'monthly'`).
6. **Guests: server-only link.** `rentLinkedTo` is server-owned. No client may change it, in any branch.
7. **New blocks:**
   - `match /rentCharges/{id}`: read is allowed when `isAdmin([resource.data.houseId]) || (isGuest([resource.data.houseId]) && isSameUser(resource.data.guestUserId))`. `allow write: if false`.
   - `match /rentAccounts/{id}`: `allow read, write: if false`.
   - `match /config/{id}`: `allow read, write: if false`.

- [ ] **Step 1: Write the failing rules tests**

Each test names one rule:

- `an admin sets the weekly price and schedule`: succeeds.
- `a super admin cannot write rentChargesStartDate`: denied.
- `a plain admin cannot write rentChargesStartedAtMs`: denied.
- `a resident cannot change rentFrequency`: denied.
- `rentFrequency 'daily' is refused`: denied.
- `weeklyRent "175" (a string) is refused`: denied.
- `weeklyRent 17500 is refused`: denied, above the cap.
- `stripeAccountId is still refused for a plain admin`: denied.
- `an admin sets another resident's customRent {amountCents: 12000, frequency: 'weekly'}`: succeeds.
- `customRent {amountCents: 12.5, ...} is refused`: denied.
- `a peer leader cannot lower their own rentOwed`: denied.
- `a peer leader cannot set their own customRent`: denied.
- `a peer leader can still edit their own phoneNumber`: succeeds.
- `a resident cannot write their own customRent`: denied.
- `a self-created resident record may not carry customRent`: denied.
- `no client may change rentLinkedTo`: denied, even for an admin.
- `a resident reads their own rentCharges doc`: succeeds.
- `a resident cannot read another resident's rentCharges doc in the same house`: denied.
- `an admin reads any rentCharges doc in the house`: succeeds.
- `no client may write rentCharges`: denied, even for an admin.
- `no client may read or write rentAccounts or config`: denied.

- [ ] **Step 2: Run them and watch the new rules fail**

Run: `cd regroup/mobile/firebase && firebase emulators:exec --only firestore --project demo-test "npm --prefix .. run test:rules -- rentCharges"`
Expected: FAIL on every row that depends on a rule not yet written. The "still refused" rows pass already.

- [ ] **Step 3: Edit `firestore.rules` as listed above**

Each change gets a short comment saying why, in the style of the file.

- [ ] **Step 4: Run the whole rules suite**

Run: `cd regroup/mobile/firebase && firebase emulators:exec --only firestore,storage --project demo-test "npm --prefix .. run test:rules"`
Expected: every suite passes, the old ones included.

- [ ] **Step 5: Commit**

```bash
git add regroup/mobile/firebase/firestore.rules regroup/mobile/firebase/__tests__/rentCharges.rules.test.ts
git commit -m "feat(regroup): rules for house rent settings, rent charges and own-balance edits"
```

---

### Task 5: Charging a resident, exactly once

**Files:**

- Modify: `regroup/functions/src/api/firestore.ts`:
  - `rentAccountCollection = ratsFirestore.collection('rentAccounts')`;
  - `rentChargeCollection = ratsFirestore.collection('rentCharges')`;
  - `rentConfigRef = ratsFirestore.collection('config').doc('rentCharges')`.
  - Add the same three to `helpers/memFirestore.ts`'s `apiFirestore`.
- Modify: `regroup/functions/src/rent/types.ts`
- Create: `regroup/functions/src/rent/chargeResident.ts`
- Test: `regroup/functions/src/__tests__/rent/chargeResident.test.ts`, run against `memFirestore`, with `util/notifications` mocked.

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces (`types.ts`):
  - `interface RentAccount { guestId: string; houseId: string; houseJoinedAtMs: number; joinedOn: string | null; reactivatedOn: string | null; anchoredTo: string; chargeFrom: string; chargedThrough: string | null; updatedAtMs: number }`
  - `type ChargeOutcome = { status: 'charged'; totalCents: Cents; periods: number } | { status: 'skipped'; reason: 'paused' | 'missing' | 'inactive' | 'linked' | 'charging-off' | 'not-started' | 'not-due' }`
- Produces (`chargeResident.ts`):
  - `chargeResident(guestId: string, now: Date): Promise<ChargeOutcome>`
  - `chargeDocId(guestId: string, from: string): string`, which returns `${guestId}_${from}`.

**What the transaction does:**

1. **Before the transaction:**
   - Read `rentConfigRef`. If `paused === true`, return `paused`.
2. **Inside the transaction, in this order:**
   1. Read the guest, then the house, then `rentAccounts/{guestId}`. Reads come before writes.
   2. Skip when:
      - the guest is missing (`missing`);
      - the guest is not `isActiveGuestDoc` (`inactive`);
      - the guest has `rentLinkedTo` (`linked`);
      - `rentSettingsOf` returns null (`charging-off`);
      - `startDate` or `startedAtMs` is null (`not-started`).
   3. Work out `chargeFrom`:
      - **If the account is missing, or `account.anchoredTo !== settings.startDate`:** `chargeFrom = chargeFromFor(...)`, with
        - `houseJoinedAtMs` = `account?.houseJoinedAtMs` when the account's `houseId` is this house, else the guest snapshot's `createTime.toMillis()`;
        - `joinDate` = `account?.joinedOn`, else `toLocalDate(guest.moveInDate)`, else the local date of `createTime`;
        - `importedOn` = `toLocalDate(guest.importedAt)`;
        - then set `anchoredTo = startDate`.
      - **Otherwise:** keep `account.chargeFrom`. It is frozen once anchored (Review Focus 2).
      - **In both cases:** `chargeFrom = maxDate(chargeFrom, account?.reactivatedOn, account?.joinedOn)`.
   4. `today = localDateString(now, settings.timeZone)`. `plan = planCharges(...)` with `residentRate`. If the plan is empty, return `not-due`. Still write the account when it was created or re-anchored, so `chargeFrom` is recorded.
   5. Write the charge records: `txn.create(rentCharges/${chargeDocId})` for each planned charge, with
      - `{ guestId, houseId, guestUserId: plausible userId or null, from, through, daysCovered, daysInPeriod, amountCents, rateCents, rateSource, frequency, createdAtMs: now }`.
   6. Write the account: `txn.set(account, {...all RentAccount fields, chargedThrough: last.through, updatedAtMs}, { merge: true })`.
   7. Update the guest: `txn.update(guest, { rentOwed: increment(total) })`. When `guest.rentOwed <= 0` before the charge and `total > 0`, also set `rentDueDate: plan[0].from`.
3. **After commit:**
   - If `total > 0` and the guest has a plausible `userId`, call `sendNotification` with title `Rent added` and body `${formatCents(total)} was added to your balance.` once per call. Catch and log a failure (ids only); never throw it.

- [ ] **Step 1: Write the failing tests**

Fixtures: house `H` is weekly, $175, `America/New_York`, `rentChargesStartDate: '2026-11-11'`, `rentChargesStartedAtMs: 0`. mem's `createTime` is a small counter, so `0` makes every seeded resident a new joiner; set it to `Number.MAX_SAFE_INTEGER` to make them existing. `now` is a fixed `Date`.

Basics:

- `a resident who moved in Wednesday Nov 18 owes $125.00 that day`:
  - `rentOwed` 0 → 12500;
  - one doc at `rentCharges/g1_2026-11-18` with `amountCents 12500, daysCovered 5, daysInPeriod 7, rateSource 'house'`;
  - `rentAccounts/g1.chargedThrough === '2026-11-22'`;
  - `rentDueDate === '2026-11-18'`.
- `intake's ISO moveInDate is read in the house zone`: `moveInDate: '2026-11-19T03:00:00.000Z'` charges from `2026-11-18`. (Review Focus 1)
- `running again the same day charges nothing`: the second call returns `not-due`, `rentOwed` stays 12500, and there is still one charge doc.

Skips, each a separate test asserting the reason and that nothing was written: `paused`, `inactive` (status `discharged`; and, separately, a `moveOutDate`), `linked`, `charging-off` (`rentFrequency: 'both'`), and `not-started` (no stamp).

Who starts when:

- `an existing resident starts the next Monday`: with `rentChargesStartedAtMs = MAX`, a call on Wed Nov 11 → `not-due` and `chargeFrom === '2026-11-16'`; a call on Mon Nov 16 → 17500.

Rates and the due date:

- `a custom weekly rate is used`: `customRent {12000, weekly}` gives 8571 for 5 of 7 days, and `rateSource 'custom'`.
- `rentDueDate stays on the oldest unpaid period`: with `rentOwed` 5000 and an earlier `rentDueDate: '2026-11-02'`, a charge leaves `'2026-11-02'`.

Schedule switches (Review Focus 2). Each follows the spec's example, with `chargedThrough` set and the house switched before the call:

- `weekly through Sun Nov 15, switch to $800/month, Nov 16 charges $400.00 for Nov 16–30`.
- `monthly through Nov 30, switch to $175/week, Dec 1 charges $150.00 for Dec 1–6`.

Catch-up:

- `catch-up after a missed week makes two records and one notification`.

Off and on, moves:

- `turned off then on again, the gap is not charged`: anchored to `2026-11-11` and charged through Nov 22, the house is re-stamped `2026-12-09` with `startedAtMs = MAX`. On Dec 9 the result is `not-due`; on Dec 14 it charges a full week from Dec 14.
- `a move keeps chargedThrough`: an account in house A charged through Nov 22 with `joinedOn: '2026-11-20'`. The guest is now in house B (stamped, weekly). On Nov 20 → `not-due`; on Nov 23 → a full week.

Concurrency (Review Focus 4):

- `two concurrent calls charge once`:
  - Set `mem.beforeCommit` to run a second `chargeResident('g1', now)` to completion on its first invocation only.
  - Await the outer call and assert that `rentOwed === 12500` and there is one charge doc.
  - Assert that the outer call either returned `not-due` after retrying, or that the inner one did.

The rest:

- `a house with no Stripe account is still charged` (spec §5).
- `a house with subscriptionStatus 'canceled' is still charged` (spec §5).
- `a notification failure does not fail the charge`.
- `the notification body is the amount only`: the mock receives `{ recipientId: 'u1', title: 'Rent added', body: '$125.00 was added to your balance.' }`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/chargeResident.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Add the collections and implement `chargeResident.ts`**

Implement it as described above, under 300 lines.

- [ ] **Step 4: Run the file, then the whole functions suite**

Run: `cd regroup/functions && npx jest src/__tests__/rent/ && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/api/firestore.ts regroup/functions/src/__tests__/helpers/memFirestore.ts regroup/functions/src/rent/types.ts regroup/functions/src/rent/chargeResident.ts regroup/functions/src/__tests__/rent/chargeResident.test.ts
git commit -m "feat(regroup-functions): charge a resident's rent in one transaction"
```

---

### Task 6: Record when a house turns charging on

**Files:**

- Create: `regroup/functions/src/triggers/firestore/houseRentSettings.ts`
- Modify: `regroup/functions/src/triggers/firestore/index.ts`: export `onHouseRentSettingsWrite`.
- Modify: `regroup/scripts/deploy-batched.sh`: add `onHouseRentSettingsWrite` to `ALL_FUNCTIONS`.
- Test: `regroup/functions/src/__tests__/triggers/houseRentSettings.test.ts`, with the mocks from `guestWrite.test.ts`.

**Interfaces:**

- Consumes: `rentSettingsOf` (Task 2).
- Produces:
  - `syncRentChargeStart(houseId: string, now: Date): Promise<'stamped' | 'cleared' | 'unchanged'>`. It is a transaction on the current house doc:
    - charging on and `rentChargesStartDate` empty: set `{ rentChargesStartDate: localDateString(now, tz), rentChargesStartedAtMs: now.getTime() }`;
    - charging off and a stamp present: set both to `null`;
    - otherwise: `unchanged`.
  - `onHouseRentSettingsWrite = onDocumentWritten({ document: 'houses/{houseId}', retry: true }, ...)`. It returns without reads when the house was deleted, or when none of `rentFrequency`, `monthlyRent`, `weeklyRent`, `timezone`, `rentChargesStartDate` or `rentChargesStartedAtMs` changed between before and after. Otherwise it calls `syncRentChargeStart(houseId, new Date())`.

It decides from the current doc, not the event, so out-of-order events still converge.

- [ ] **Step 1: Write the failing tests**

- `turning weekly on stamps today in the house zone`: a Chicago house at `2026-11-10T04:30:00Z` is stamped `'2026-11-09'`.
- `a house created with charging on is stamped`.
- `turning off clears the stamp`.
- `a price change while on keeps the stamp`.
- `a schedule switch while on keeps the stamp`.
- `a write that changes no rent field does no reads`: use a `health` change and assert that mem recorded no reads or writes.
- `events out of order converge`: run the off event's handler after the house is back on; the stamp stays.
- `'both' never stamps`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/triggers/houseRentSettings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement it, export it, and add it to `ALL_FUNCTIONS`**

- [ ] **Step 4: Run the trigger tests and the deploy list check**

Run: `cd regroup/functions && npx jest src/__tests__/triggers/houseRentSettings.test.ts src/__tests__/deployList.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/triggers/firestore/houseRentSettings.ts regroup/functions/src/triggers/firestore/index.ts regroup/scripts/deploy-batched.sh regroup/functions/src/__tests__/triggers/houseRentSettings.test.ts
git commit -m "feat(regroup-functions): record the day a house turns rent charging on"
```

---

### Task 7: Charge on joining

**Files:**

- Create: `regroup/functions/src/rent/guestWriteRent.ts`
- Modify: `regroup/functions/src/triggers/firestore/guestWrite.ts`. Add one step after the claims cleanup, before the EES re-split, gated on `!stale && !isDelete`: `await rentOnGuestWrite({...}).catch((e) => remember('rent charge', e));`. A failure is then retried through the trigger's `retry: true`.
- Test: `regroup/functions/src/__tests__/rent/guestWriteRent.test.ts`, plus one wiring test in `regroup/functions/src/__tests__/triggers/guestWriteRentWiring.test.ts` that mocks `../../rent/guestWriteRent`.

**Interfaces:**

- Consumes: `chargeResident`, `rentAccountCollection`, `localDateString`, `resolveTimeZone`, `isActiveGuestDoc`.
- Produces:
  - `rentOnGuestWrite(e: { guestId: string; before?: Record<string, unknown>; after?: Record<string, unknown>; afterCreateTimeMs?: number; eventTime: string; now?: Date }): Promise<'none' | ChargeOutcome>`

**What it does, by cause.** Nothing happens unless `after` exists and is active. The cause is:

- **create:** no `before`.
  - If `after.moveInDate` is absent, set it in a transaction, and only while it's still absent, to `new Date(afterCreateTimeMs).toISOString()`. That's the format intake uses.
  - Then (Task 9) run `linkIntakeRecord` before charging.
- **moved:** `before.houseId` is non-empty and differs from `after.houseId`.
  - Merge into `rentAccounts/{guestId}`: `{ guestId, houseId: after.houseId, houseJoinedAtMs: Date.parse(eventTime), joinedOn: <local date of eventTime in the new house's zone>, reactivatedOn: null }`.
- **reactivated:** `before` is not active and `after` is.
  - Merge `{ reactivatedOn: <local date of eventTime> }`.
- **anything else:** return `'none'` without reads. This matters: the charge's own `rentOwed` write re-fires the trigger.

After any cause other than `'none'`, return `chargeResident(guestId, now ?? new Date())`.

- [ ] **Step 1: Write the failing tests**

Against mem, with a stamped weekly house:

- `a new resident created Wed Nov 18 is charged $125.00 by the trigger step`.
- `a create with no moveInDate gets one from its createTime`.
- `a redelivered create event charges once`: call it twice and assert one charge doc.
- `a stats update returns 'none' and does no reads`.
- `the rentOwed write from a charge returns 'none'`.
- `re-activation on Wed Dec 2 after a discharge charges from Dec 2, not from the last chargedThrough`.
- `a move to another house records joinedOn and keeps chargedThrough`.
- `a discharged write charges nothing`.

Wiring test:

- `onGuestWrite calls rentOnGuestWrite with before, after, createTime and the event time`.
- `onGuestWrite rethrows a rent failure after the EES step`: the error reaches the caller, so the event is redelivered.
- `a stale event does not call it`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/guestWriteRent.test.ts src/__tests__/triggers/guestWriteRentWiring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement it and wire it in**

`guestWrite.ts` is 299 lines. If the new step pushes it over 300, the pre-commit gate only warns, because it is a legacy file. Keep the added lines to the call itself.

- [ ] **Step 4: Run the new tests and every trigger suite**

Run: `cd regroup/functions && npx jest src/__tests__/rent/ src/__tests__/triggers/`
Expected: PASS, the existing `guestWrite*.test.ts` included.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/rent/guestWriteRent.ts regroup/functions/src/triggers/firestore/guestWrite.ts regroup/functions/src/__tests__/rent/guestWriteRent.test.ts regroup/functions/src/__tests__/triggers/guestWriteRentWiring.test.ts
git commit -m "feat(regroup-functions): charge rent when a resident joins, moves or returns"
```

---

### Task 8: The hourly job

**Files:**

- Create: `regroup/functions/src/scheduled/rentChargeJob.ts`
- Modify: `regroup/functions/src/scheduled/index.ts`: `export * from "./rentChargeJob";`.
- Modify: `regroup/scripts/deploy-batched.sh`: add `rentCharges`.
- Test: `regroup/functions/src/__tests__/scheduled/rentChargeJob.test.ts`

**Interfaces:**

- Consumes: `chargeResident`, `nextChargeDay`, `rentSettingsOf`, `localDateString`.
- Produces:
  - `runRentCharges(now?: Date): Promise<{ houses: number; charged: number; skipped: number; failed: number }>`
  - `rentCharges = onSchedule({ schedule: '5 * * * *', timeZone: 'UTC' }, ...)`

Ruling: the job runs hourly, so every zone, any zone, is charged within an hour of its local midnight. No timezone list is involved. It does the following:

1. Read `rentConfigRef`. If paused, log and return zeros.
2. Query `houseCollection.where('rentFrequency', 'in', ['weekly', 'monthly'])`. Keep houses whose `rentSettingsOf` is non-null and stamped.
3. For each such house:
   - list `guestCollection.where('houseId', '==', id)` and keep the active ones;
   - `getAll` their `rentAccounts` docs.
4. Call `chargeResident(guestId, now)` only when one of these holds:
   - the account exists, its `anchoredTo` differs from the house's `startDate`, or
   - the account exists and `nextChargeDay(account) <= today`, or
   - there is no account and the guest's `createTime` is more than 60 minutes before `now`. A newer record belongs to its create trigger, which must link an intake record first (Task 9).
5. Run houses one at a time. Count the outcomes. A thrown error counts as `failed` and is logged with ids only; the job continues.

- [ ] **Step 1: Write the failing tests**

- `charges a due resident in each stamped house`.
- `skips a house whose rentFrequency is 'both'`.
- `a house with timezone '' is charged on New York dates` (Review Focus 5): at `2026-11-16T04:30:00Z` it's still Sunday in New York, so nothing; at `2026-11-16T05:30:00Z` the Monday charge happens.
- `a house in 'Pacific/Honolulu' is charged after its own midnight`.
- `a resident created 10 minutes ago without an account is left to the trigger`.
- `a resident with no account created 2 hours ago is charged`.
- `not-due accounts make no transaction`: spy on `chargeResident`.
- `the stop switch stops the run`.
- `one resident's failure does not stop the others`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/scheduled/rentChargeJob.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement it, export it, and add it to `ALL_FUNCTIONS`**

- [ ] **Step 4: Run the job tests, the deploy list check and the whole suite**

Run: `cd regroup/functions && npx jest src/__tests__/scheduled/rentChargeJob.test.ts src/__tests__/deployList.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/scheduled/rentChargeJob.ts regroup/functions/src/scheduled/index.ts regroup/scripts/deploy-batched.sh regroup/functions/src/__tests__/scheduled/rentChargeJob.test.ts
git commit -m "feat(regroup-functions): hourly rent charges with catch-up and a stop switch"
```

---

### Task 9: One person, two records

The check that spec §5 asked for: it can happen. Intake creates a record with the person's email and no `userId` (`IntakeFormScreen.tsx:127`). Invite sign-up then creates a second record (`services/guest.tsx` `createGuest`, `batch.set(guestCollection.doc(newGuest.id), ...)`). Nothing matches them on email. Both are active, so both would be charged.

**Files:**

- Create: `regroup/functions/src/rent/linkIntakeRecord.ts`
- Modify: `regroup/functions/src/rent/guestWriteRent.ts`: on `create`, call it before `chargeResident`.
- Test: `regroup/functions/src/__tests__/rent/linkIntakeRecord.test.ts`

**Interfaces:**

- Produces:
  - `linkIntakeRecord(newGuestId: string): Promise<'linked' | 'none' | 'ambiguous'>`

Ruling: the rent side links the two, and nothing else does. The invite record survives, because it's the one the resident's app uses. It runs only when the new record has a plausible `userId` and a non-empty `email`. The candidates are guests in the same house that are:

- active;
- without a `userId`;
- without `rentLinkedTo`;
- with the same email, after `trim().toLowerCase()`.

That's an equality query on `houseId` plus a client-side filter, because import stores emails as typed.

- **Exactly one match:** one transaction that
  - moves `rentOwed` and `choreFees` onto the new record by increment, and sets them to 0 on the intake record;
  - copies `moveInDate` if the new record has none;
  - copies the intake record's `rentAccounts` doc to the new id, if the new id has none, then deletes the old one;
  - sets `rentLinkedTo: newGuestId` on the intake record.

  After commit, set `guestUserId` on the intake record's `rentCharges` docs, so the resident sees them in their history.

- **More than one match:** `'ambiguous'`. Log ids and the count only. Link nothing.

The intake record stays in the resident list. Merging it fully is out of scope; see the Handoff.

- [ ] **Step 1: Write the failing tests**

- `an intake record with $125 owed and the same email (different case) is linked`:
  - the new record owes 12500, the intake record 0;
  - the intake record has `rentLinkedTo`;
  - `rentAccounts` moved to the new id.
- `after linking, the next chargeResident on the intake record is 'linked'`, and the new record is not charged twice for the same week.
- `two matching intake records are 'ambiguous' and nothing changes`.
- `a match in another house is ignored`.
- `a discharged intake record is ignored`.
- `a new record without email does nothing and makes no reads`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/rent/linkIntakeRecord.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement it and call it from `rentOnGuestWrite`**

- [ ] **Step 4: Run the rent tests**

Run: `cd regroup/functions && npx jest src/__tests__/rent/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add regroup/functions/src/rent/linkIntakeRecord.ts regroup/functions/src/rent/guestWriteRent.ts regroup/functions/src/__tests__/rent/linkIntakeRecord.test.ts
git commit -m "feat(regroup-functions): charge one record when intake and invite create two"
```

---

### Task 10: Reversal script and docs

**Files:**

- Create: `regroup/functions/src/scripts/reverseRentCharges.ts`. Follow the `backfillPaymentGuestUserId.ts` pattern: `scriptBootstrap`, dry run unless `--apply`.
- Modify: `regroup/functions/package.json`. Add:
  - `"rent:reverse:dry-run": "npm run build && node lib/scripts/reverseRentCharges.js"`;
  - `"rent:reverse:apply": "npm run build && node lib/scripts/reverseRentCharges.js --apply"`.
- Modify docs:
  - `regroup/docs/product/requirements.md`: a rent-charges requirement that links the spec;
  - the "no rent-accrual job" paragraphs in `regroup/functions/src/util/money.ts` and `regroup/mobile/src/util/money.ts`: they now point at `rent/chargeResident.ts`;
  - `regroup/functions/CLAUDE.md`: one line on `config/rentCharges.paused`.
- Test: `regroup/functions/src/__tests__/scripts/reverseRentCharges.test.ts`

**Interfaces:**

- Produces:
  - `reverseRentCharges(opts: { houseId: string; since?: string; guestId?: string; apply: boolean }): Promise<{ charges: number; totalCents: Cents; refused?: 'not-paused' }>`

**What it does:**

1. Select `rentCharges` where `houseId == houseId`, filtered client-side on `from >= since` and on `guestId`.
2. Work per guest, newest first. Each reversal is one transaction that:
   - increments `rentOwed` by `-amountCents`;
   - sets `rentAccounts.chargedThrough` to `addDays(from, -1)`, but only when it currently equals the charge's `through`;
   - copies the charge to `rentChargeReversals/{id}_{nowMs}`;
   - deletes the original, so its id can be charged again later.
3. `--apply` is refused (`refused: 'not-paused'`) unless `config/rentCharges.paused` is true or the house's charging is off. Otherwise the next hourly run would charge the same days again.
4. Print counts and totals only.

- [ ] **Step 1: Write the failing tests**

- `dry run reports and changes nothing`.
- `apply reverses newest first and restores chargedThrough`: two weekly charges reversed leave `chargedThrough` at the day before the older one.
- `apply is refused while charging runs`.
- `a reversed week can be charged again after un-pausing`.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd regroup/functions && npx jest src/__tests__/scripts/reverseRentCharges.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the script and edit the docs**

Add `rentChargeReversals` with `allow read, write: if false` in `firestore.rules`, and a deny row in `rentCharges.rules.test.ts`.

- [ ] **Step 4: Run everything for Phase A**

Run:

```bash
cd regroup/functions && npx tsc --noEmit && npm test
cd ../mobile/firebase && firebase emulators:exec --only firestore,storage --project demo-test "npm --prefix .. run test:rules"
```

Expected: tsc reports no errors, and both suites pass.

- [ ] **Step 5: Commit, then open the draft PR**

```bash
git add regroup/functions/src/scripts/reverseRentCharges.ts regroup/functions/package.json regroup/functions/src/__tests__/scripts/reverseRentCharges.test.ts regroup/docs/product/requirements.md regroup/functions/src/util/money.ts regroup/mobile/src/util/money.ts regroup/functions/CLAUDE.md regroup/mobile/firebase/firestore.rules regroup/mobile/firebase/__tests__/rentCharges.rules.test.ts
git commit -m "feat(regroup-functions): reverse rent charges by their records; document rent charges"
```

The draft PR description lists the rulings in this plan. Ask for the domain-model review before marking it ready.

---

### Task 11: Real-system proof in the payment suite

**Prerequisite:** `regroup/e2e/src/payments/` (harness, `seedConnectedHouse`, `seedResident`, `callAs`, `deliverType`, `confirmWithCard`) is on `main`. If it's not, stop and say so.

**Files:**

- Create: `regroup/e2e/src/payments/__tests__/rentCharges.server.test.ts`
- Modify: `regroup/e2e/src/payments/harness/fixtures.ts`: `seedResident` gains `moveInDate`, `customRent`, `importedAt`.
- Create: `regroup/e2e/src/payments/harness/rentJob.ts`
  - `runRentJob(): Promise<void>`: publishes to the Pub/Sub emulator topic `firebase-schedule-rentCharges` and waits until `rentAccounts` stops changing for 2 s, bounded at 30 s.
  - If `regroup/firebase.json` has no `pubsub` emulator, add one on port 8085. That's the one config change allowed here.

Expected values are computed in the test from today's date in the house zone. Use the test's own arithmetic (the Global Constraints formula), not imports from `regroup/functions`. Rows:

- `RENT-040: a resident added today owes the prorated week, and paying it with a test card clears it`:
  - the expected value is `round(17500 × daysLeftThisWeek / 7)`;
  - then `pay(r, that)` and `deliverType(SUCCEEDED)`;
  - then `rentOwed === 0`.
- `RENT-041: a monthly house charges round(80000 × daysLeftThisMonth / daysInMonth)`.
- `RENT-042: the guest create event delivered while the job runs charges once`: write the guest and call `runRentJob()` concurrently; there is one `rentCharges` doc.
- `RENT-043: catch-up`:
  - seed an account anchored, with `chargedThrough` three weeks back and the house weekly, then run the job;
  - there are three charge docs and `rentOwed` rises by 3 × 17500.
- `RENT-044: schedule change`: with an account charged through last Sunday, switching the house to monthly and running the job charges the rest of this month from Monday.
- `RENT-045: a discharged resident is not charged by the job`.
- `RENT-046: unit boundary`:
  - `weeklyRent 175` charges 17500 cents for a full week;
  - writing `weeklyRent 17500` through the client SDK is refused by the rules.
- `RENT-047: a resident already in the house when charging turns on owes nothing until the next period`.

- [ ] **Step 1: Write the rows and run them against the emulators before the server code**

Run them on a checkout of `main` without Phase A.
Run: `cd regroup/e2e && npm run test:payments -- rentCharges`
Expected: FAIL. No charge docs appear.

- [ ] **Step 2: Run them on the Phase A branch**

Use the emulators and Stripe sandbox setup that `rentLedger.server.test.ts` uses.
Run: `cd regroup/e2e && npm run test:payments -- rentCharges`
Expected: 8/8 pass.

- [ ] **Step 3: Commit**

```bash
git add regroup/e2e/src/payments/__tests__/rentCharges.server.test.ts regroup/e2e/src/payments/harness/fixtures.ts regroup/e2e/src/payments/harness/rentJob.ts
git commit -m "test(regroup): rent charges against the emulators and the Stripe sandbox"
```

Add `regroup/firebase.json` to the commit only if the Pub/Sub emulator was added.

---

## Phase C: phone (after #160 merges)

Before Task 12, read the merged `PaymentHistory.tsx`, `paymentStatus.ts` and `services/payments.ts`. Phase C extends what #160 built.

### Task 12: Mobile rent helpers, data and import marker

**Files:**

- Create: `regroup/mobile/src/util/rentRate.ts`
  - It mirrors functions `rent/rate.ts` and `rent/period.ts`, for display and the preview only, with a header saying the server is the authority.
  - Exports `rentSettingsOf`, `residentRate`, `periodFor`, `nextPeriodStart`, `previewFirstCharges(house, guests, today)`.
- Create: `regroup/mobile/src/services/rentCharges.ts`
  - `getGuestRentCharges({ houseId, guestId })` is for admins and uses equality `where`s.
  - `getMyRentCharges({ houseId, uid })` uses `houseId` and `guestUserId`.
  - Both sort client-side by `from`, descending, like `getGuestPayments`.
- Modify: `regroup/mobile/src/services/guestImport.ts`: each imported row gets `importedAt: new Date().toISOString()`.
- Modify: `regroup/mobile/src/entities/House.tsx`, `Guest.tsx`: the Task 2 fields.
- Test: `src/util/__tests__/rentRate.test.ts`, `src/services/__tests__/rentCharges.test.ts`, and an `importedAt` assertion in the existing guest import test.

`rentRate.test.ts` repeats Task 2's and Task 3's tables with the same values, so the two copies can't drift unnoticed.

Run: `cd regroup/mobile && npx jest src/util/__tests__/rentRate.test.ts src/services/__tests__/rentCharges.test.ts --forceExit`. Expected: PASS. Commit `feat(regroup-mobile): rent helpers, charge reads and an import marker`.

### Task 13: Rent section in House Settings and the setup wizard

**Hard requirement (domain review, 2026-11-09):** Task 13 ships in the same release as Task 12's `importedAt` marker, or after it, never before. Without the marker, the server falls back to treating anyone entered after charging began with an earlier move-in date as already resident, but an import with no move-in column still looks like a new move-in.

**Write only the fields that change (domain review, I3).** The app writes whole house objects back from memory (`deleteGuest`, `customizePhase`, `updateDispute`). Once admins can set prices, a stale copy undoes a price or schedule change. This task changes those paths to field-level `update`s. It saves the schedule and the price in one write, so charging never turns off between them. The resident edit form (`guestFormValues.ts`, `mergeGuestStats`) also stops writing `rentOwed`, `choreFees`, `customRent` and `rentDueDate` back. Task 14 owns the balance edit, with the confirmation step from spec §4.6.

**Intake sends `createdBy`.** The server carries an intake record's custom rate and move-in date onto the resident's own record only when `createdBy` names the manager who made it (the rules bind it to the caller). `IntakeFormScreen` sets only `intakeCompletedBy` today, so it should also set `createdBy`.

**The intake form takes the real move-in date** (owner decision 2026-11-09). A date field defaults to today, and the manager can set the day the resident actually moved in. It is saved as a calendar date in the house's zone. Today the form always writes the current time, so a long-time resident entered late gets a prorated first charge.

**A timezone is required** before charging can be turned on. A house with none is charged on New York dates, so a Los Angeles house's Sunday-night intake would read as Monday.

**Oxford houses** never show the Rent section. Their dues are the equal expense share in the Oxford tools, and the rules refuse a weekly or monthly schedule there.

**Files:**

- Modify: the House Settings screen under `regroup/mobile/src/screens/HouseSettings/`.
- Modify: `screens/SetupWizards/HouseSetup.tsx`: restore the frequency picker as a two-choice control, Weekly / Monthly, never `'both'`.
- Test: the matching `__tests__`.

**Behavior:**

- The section has a schedule picker (Weekly / Monthly) and one price field in dollars, parsed with `parseDollarsField`. A malformed or blank value shows an error and is never saved as 0.
- Managers and above (rank 2 or more) can edit it; peer leaders and residents see it read-only. The rules enforce the same.
- **When charging is off:** a prompt says rent isn't being charged yet, with a button into the section.
- **Turning charging on:** a confirmation lists each active resident with `previewFirstCharges`: "first charge $175.00 on Mon Nov 16". It saves only on confirm.
- **Switching schedule:** it lists the residents whose custom rate no longer applies, with a link to each profile.

**Tests:**

- `saving weekly $175 writes rentFrequency 'weekly' and weeklyRent 175 (dollars)`;
- `a malformed price is not saved`;
- `turning on shows the preview and saves only on confirm`;
- `switching to monthly lists residents with weekly custom rates`;
- `the wizard offers Weekly and Monthly only`.

Commit `feat(regroup-mobile): set a house's rent schedule and price`.

### Task 14: Custom rate and balance edits on a resident's profile

**Files:**

- Modify: `screens/GuestUpdate/GuestUpdateForm.tsx`, `GuestUpdateFormView.tsx`, `guestFormValues.ts`.
- Test: the existing `__tests__`.

**Behavior:**

- **Custom rate:** a field in dollars for the house's current schedule. It's stored as `customRent: { amountCents, frequency }`, and clearing it writes `null`. The field is hidden when the profile is the signed-in user's own, and for anyone below manager (rank 2), because the rules deny both.
- **Balance:** before saving a changed `rentOwed`, re-read the guest. If `rentOwed` differs from the value when the form opened, show both figures and ask to confirm the new one (spec §4.6).

**Tests:**

- `a custom rate of $120 saves 12000 cents with the house's frequency`;
- `clearing it saves null`;
- `the field is absent on your own profile`;
- `the field is absent for a peer leader`;
- `a balance changed since opening asks for confirmation and saves only after it`.

Commit `feat(regroup-mobile): custom rent rate and safer balance edits`.

### Task 15: Charges in history

**Files:**

- Modify: `screens/Payments/PaymentHistory.tsx`. It merges `getMyRentCharges` / `getGuestRentCharges` (same signed-in rule as payments) with payments, newest first.
- Create: a `RentChargeRow`.
- Test: the existing `PaymentHistory.test.tsx`.

Each row reads "Rent, Nov 18 – Nov 22 (5 of 7 days)" with `formatCents(amountCents)`, and adds "custom rate" when `rateSource === 'custom'`. A charge is never offered a receipt.

**Tests:**

- `a resident sees their charge rows interleaved with payments by date`;
- `a manager sees the resident's charges`;
- `the prorated row shows 5 of 7 days and $125.00`.

Commit `feat(regroup-mobile): show rent charges in payment history`.

### Task 16: Maestro flow (required)

**Files:**

- Create: `regroup/mobile/maestro/flows/rent-setup-prorated.yaml`. Tags: `operator`, `payments`.

**Steps:**

1. The operator persona opens House Settings, sets Weekly $175 and confirms the preview.
2. The operator adds a resident through intake with today's move-in, using the e2e test email convention.
3. The flow logs in as that resident (an invite-seeded persona that links to the intake record, per Task 9).
4. It asserts the balance card shows the prorated amount (`balance-card` testID, text computed by a JS step from today's date), and that the history shows the charge row.
5. It pays the full balance with `payment-sheet-card.yaml` and `4242424242424242`, and asserts `payment-success-banner`.

No step is `optional`.

Run on the sweep simulator `AC9BBDC3-EEF9-4C60-9C14-B847E2403920` against the emulators, as in `rent-pay-full.yaml`. Expected: the flow passes. Commit `test(regroup-mobile): Maestro flow for rent setup and a prorated first payment`.

---

## Handoff: decided here, and left out

**Rulings in this plan (owner can overrule):**

- **Who may change money** (owner decisions 2026-11-10): only managers and above set the house price and schedule, custom rates and balances, and record payments. Peer leaders can't, on anyone's record. Task 14's custom-rate and balance fields are hidden below manager.

- **Turning charging back on** charges residents who were already being charged (with a `chargedThrough`) prorated from the day it comes back on, so a short break across a period start doesn't skip the period. A first turn-on still starts residents already in the house at the next full period (spec §2). This is the owner's decision of 2026-11-09, which overruled the earlier "next full period" rule.

- **"Next period" means the period after the one containing the turn-on day.** That holds even when turning on on a Monday or the 1st; spec §2 is read literally.
- **"Existing at turn-on" is decided by when the record joined the house** (its `createTime`, or the move time), compared with the stamp's `startedAtMs`. It is not decided by `moveInDate`. So a backdated move-in on a new record is still charged back to the start (spec §4.4).
- **Imported residents are marked with `importedAt`,** written by the app's import from Task 12. Until that ships, an import is treated like intake. That's harmless, because no screen can turn charging on before Phase C.
- **The job runs hourly,** not daily. That covers every timezone without a list.
- **A $0 custom rate still writes a $0 charge record,** for the history, but sends no notification.
- **The preview is computed in the app** from a mirrored helper, not by a callable. The server stays the authority on every charge.
- **Prices above $2,500 a week or $10,000 a month count as charging off,** for a house price or a custom rate, and the rules refuse them. This guards against cents typed as dollars. The owner accepted these limits on 2026-11-09.
- **Linking two records moves only the rent:** the balance, the account dates and the history. The intake record stays listed. A full merge is a separate change.
- **A brand-new record with no account is left to its create trigger for an hour** before the job will charge it. That way an intake record is linked first.

**Not in this plan:**

- auto-pay;
- the ACH attempts bug;
- `choreFees` not lowering on payment;
- web portal rent setup;
- a backdated discharge reversing charges (it stays a manual correction);
- the production deploy.
