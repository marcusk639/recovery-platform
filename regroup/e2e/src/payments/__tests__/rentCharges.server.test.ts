// Rent charged from the house price, against the emulators: the join trigger, the hourly
// job (called over HTTP, as Cloud Scheduler calls it), and a test-card payment against
// the charge. Run with: npm run test:payments -- rentCharges
//
// Expected amounts are this file's own arithmetic, not imports from regroup/functions:
// amount = round(rate × days covered / days in the period), weeks Monday to Sunday,
// calendar months, dates in the house's zone (none set reads as New York).
import type Stripe from 'stripe';
import { commitAs, encodeFields, updateFields } from '../harness/firestoreRest';
import { seedOperator, seedResident, SeededOperator, SeededResident } from '../harness/fixtures';
import { docData } from '../harness/flows';
import { assertSafeTarget } from '../harness/guards';
import { runRentJob } from '../harness/rentJob';
import {
  chargedAccount,
  chargesOf,
  houseChargingNow,
  houseNotCharging,
  MONTHLY,
  payRent,
  residentBeforeCharging,
  startedOn,
  turnOn,
  WEEKLY,
} from '../harness/rentSetup';
import { waitFor } from '../harness/waitFor';

const WEEK_CENTS = 17500;
const MONTH_CENTS = 80000;

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (t: Date) => t.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(utc(d).getTime() + n * 86400000));
const mondayOf = (d: string) => addDays(d, -((utc(d).getUTCDay() + 6) % 7));
const monthEnd = (d: string) =>
  iso(new Date(Date.UTC(utc(d).getUTCFullYear(), utc(d).getUTCMonth() + 1, 0)));
const daysThrough = (from: string, to: string) =>
  (utc(to).getTime() - utc(from).getTime()) / 86400000 + 1;
const weekFrom = (d: string) =>
  Math.round((WEEK_CENTS * daysThrough(d, addDays(mondayOf(d), 6))) / 7);
const monthFrom = (d: string) =>
  Math.round((MONTH_CENTS * daysThrough(d, monthEnd(d))) / Number(monthEnd(d).slice(8)));

let stripe: Stripe;
let op: SeededOperator;

beforeAll(async () => {
  stripe = await assertSafeTarget();
  op = await seedOperator();
});

const guest = (r: SeededResident) => docData(`guests/${r.guestId}`);
const account = (r: SeededResident) => docData(`rentAccounts/${r.guestId}`);

test('CHARGE-001: a resident added today owes the prorated week, and paying it by card clears it', async () => {
  const house = await houseChargingNow(op, WEEKLY);
  const day = today();
  const r = await seedResident(house);
  const owed = weekFrom(day);

  await waitFor(
    () => guest(r),
    (g) => g.rentOwed === owed,
  );
  expect(await chargesOf(r)).toEqual([
    expect.objectContaining({
      id: `${r.guestId}_${day}`,
      from: day,
      through: addDays(mondayOf(day), 6),
      amountCents: owed,
    }),
  ]);

  await payRent(stripe, r, owed);
  expect((await guest(r)).rentOwed).toBe(0);
});

test('CHARGE-002: a resident added today to a monthly house owes round(80000 × days left / days in month)', async () => {
  const house = await houseChargingNow(op, MONTHLY);
  const day = today();
  const r = await seedResident(house);

  await waitFor(
    () => guest(r),
    (g) => g.rentOwed === monthFrom(day),
  );
  expect(await chargesOf(r)).toEqual([
    expect.objectContaining({
      from: day,
      through: monthEnd(day),
      amountCents: monthFrom(day),
      frequency: 'monthly',
    }),
  ]);
});

// The emulator may run the two calls one after the other, so this shows a second run
// finds nothing more to charge, not that the two overlapped. The joiner is charged by
// their join; the job leaves a record from the last hour alone.
test('CHARGE-003: two job runs started together charge a due resident once, and a resident joining meanwhile once', async () => {
  const monday = mondayOf(today());
  const house = await houseNotCharging(op);
  await startedOn(house, addDays(monday, -7));
  const due = await residentBeforeCharging(house, {
    account: chargedAccount(addDays(monday, -7), addDays(monday, -1)),
  });
  await turnOn(house, WEEKLY);

  const [, , joiner] = await Promise.all([runRentJob(), runRentJob(), seedResident(house)]);
  await waitFor(
    () => guest(joiner),
    (g) => g.rentOwed === weekFrom(today()),
  );

  expect(await chargesOf(due)).toEqual([
    expect.objectContaining({ from: monday, amountCents: WEEK_CENTS }),
  ]);
  expect((await guest(due)).rentOwed).toBe(WEEK_CENTS);
  expect(await chargesOf(joiner)).toHaveLength(1);
});

test('CHARGE-004: catch-up charges every missed week', async () => {
  const monday = mondayOf(today());
  const house = await houseNotCharging(op);
  await startedOn(house, addDays(monday, -21));
  const r = await residentBeforeCharging(house, {
    account: chargedAccount(addDays(monday, -21), addDays(monday, -15)),
    rentOwed: 5000,
  });
  await turnOn(house, WEEKLY);

  await runRentJob();
  const weeks = [addDays(monday, -14), addDays(monday, -7), monday];
  expect(await chargesOf(r)).toEqual(
    weeks.map((from) => expect.objectContaining({ from, amountCents: WEEK_CENTS })),
  );
  expect((await guest(r)).rentOwed).toBe(5000 + 3 * WEEK_CENTS);
  expect((await account(r)).chargedThrough).toBe(addDays(monday, 6));
});

test('CHARGE-005: switching a weekly house to monthly charges the rest of the month from Monday', async () => {
  const day = today();
  const monday = mondayOf(day);
  const house = await houseNotCharging(op);
  await startedOn(house, addDays(monday, -7));
  const r = await residentBeforeCharging(house, {
    account: chargedAccount(addDays(monday, -7), addDays(monday, -1)),
  });
  await turnOn(house, WEEKLY);
  await turnOn(house, MONTHLY);

  await runRentJob();
  // Monday to its month end; when Monday fell in last month, this month from the 1st too.
  const expected: { from: string; amountCents: number }[] = [];
  for (let from = monday; from <= day; from = addDays(monthEnd(from), 1)) {
    expected.push({ from, amountCents: monthFrom(from) });
  }
  expect(await chargesOf(r)).toEqual(
    expected.map((c) => expect.objectContaining({ ...c, frequency: 'monthly' })),
  );
  expect((await guest(r)).rentOwed).toBe(expected.reduce((sum, c) => sum + c.amountCents, 0));
});

test('CHARGE-006: the job does not charge a discharged resident', async () => {
  const monday = mondayOf(today());
  const house = await houseNotCharging(op);
  await startedOn(house, addDays(monday, -7));
  const charged = chargedAccount(addDays(monday, -7), addDays(monday, -1));
  const active = await residentBeforeCharging(house, { account: charged });
  const discharged = await residentBeforeCharging(house, {
    account: charged,
    guest: {
      status: 'discharged',
      moveInDate: addDays(monday, -7),
      moveOutDate: addDays(monday, -2),
    },
  });
  await turnOn(house, WEEKLY);

  await runRentJob();
  expect(await chargesOf(active)).toEqual([
    expect.objectContaining({ from: monday, amountCents: WEEK_CENTS }),
  ]);
  expect(await chargesOf(discharged)).toEqual([]);
  expect((await guest(discharged)).rentOwed).toBe(0);
});

test('CHARGE-007: a $175 weekly price charges 17500 cents a week, and the app cannot save it as 17500', async () => {
  const owner = await seedOperator();
  const monday = mondayOf(today());
  const house = await houseNotCharging(owner);
  await startedOn(house, addDays(monday, -7));
  const r = await residentBeforeCharging(house, {
    account: chargedAccount(addDays(monday, -7), addDays(monday, -1)),
  });
  const write = (fields: object) =>
    commitAs(owner.uid, [updateFields(`houses/${house.id}`, encodeFields(fields))]);

  expect((await write(WEEKLY)).status).toBe(200);
  expect((await write({ weeklyRent: 17500 })).status).toBe(403);
  expect((await docData(`houses/${house.id}`)).weeklyRent).toBe(175);

  await runRentJob();
  expect(await chargesOf(r)).toEqual([
    expect.objectContaining({
      from: monday,
      daysCovered: 7,
      rateCents: WEEK_CENTS,
      amountCents: WEEK_CENTS,
    }),
  ]);
});

test('CHARGE-008: a resident already in the house when charging turns on owes nothing until the next week', async () => {
  const house = await houseNotCharging(op);
  // The emulator can't make a record older than the job's one-hour grace, so this
  // account stands in for one: it holds only when the resident joined, before charging
  // began. A real resident has no account and an old createTime, which anchors the same
  // way (unit test: chargeResident.test.ts, 'an existing resident starts the next Monday').
  const r = await residentBeforeCharging(house, {
    account: { houseJoinedAtMs: Date.now() - 7 * 86400000 },
  });
  await turnOn(house, WEEKLY);
  const state = await waitFor(
    () => docData(`rentHouseStates/${house.id}`),
    (s) => typeof s.startDate === 'string',
  );

  await runRentJob();
  expect(await account(r)).toMatchObject({
    anchoredTo: state.startDate,
    chargeFrom: addDays(mondayOf(state.startDate as string), 7),
    chargedThrough: null,
  });
  expect(await chargesOf(r)).toEqual([]);
  expect((await guest(r)).rentOwed).toBe(0);
});
