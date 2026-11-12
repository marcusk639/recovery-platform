import {
  applicationsWaiting,
  canScore,
  cellFrom,
  formatCents,
  formatDay,
  houseHealth,
  overdueFromDischarged,
  rentOverdue,
  rowStateOf,
  subscriptionStateOf,
  totalsFor,
} from '../src/app/houses/summary';
import { summary } from './fixtures/house-summary';

const switchOn = { enabled: true, isLoading: false };
const toDate = (v: unknown) => (v ? new Date(v as string) : null);
const now = new Date('2026-06-01T00:00:00Z');
const stateOf = (house: object, killSwitch = switchOn) => subscriptionStateOf(house, killSwitch, now, toDate).state;

test('subscription follows the phone gate ladder', () => {
  expect(stateOf({})).toBe('pending');
  expect(stateOf({ subscriptionStatus: 'active' })).toBe('active');
  expect(stateOf({ subscriptionStatus: 'trialing' })).toBe('active');
  expect(stateOf({ subscriptionStatus: 'canceled', guestGraceEndsAt: '2026-07-01' })).toBe('grace');
  expect(stateOf({ subscriptionStatus: 'canceled', guestGraceEndsAt: '2026-01-01' })).toBe('lapsed');
  expect(stateOf({ subscriptionStatus: 'past_due' })).toBe('lapsed');
  expect(stateOf({ subscriptionStatus: 'unpaid' })).toBe('lapsed');
});
test('the grace end date comes back with the state', () => {
  const result = subscriptionStateOf({ subscriptionStatus: 'canceled', guestGraceEndsAt: '2026-07-01' }, switchOn, now, toDate);
  expect(result.graceEndsAt).toEqual(new Date('2026-07-01'));
});
test('the kill switch opens every house, and fails closed while loading', () => {
  expect(stateOf({ subscriptionStatus: 'canceled' }, { enabled: false, isLoading: false })).toBe('active');
  expect(stateOf({ subscriptionStatus: 'active' }, { enabled: true, isLoading: true })).toBe('loading');
});

test('a query becomes a cell by its status', () => {
  const double = (n: number) => n * 2;
  expect(cellFrom({ status: 'pending' }, double)).toEqual({ state: 'loading' });
  expect(cellFrom({ status: 'error' }, double)).toEqual({ state: 'error' });
  expect(cellFrom({ status: 'success', data: 2 }, double)).toEqual({ state: 'ready', value: 4 });
});
test('a refresh that fails shows the failure, not the old number', () => {
  expect(cellFrom({ status: 'error', data: 2 }, (n: number) => n)).toEqual({ state: 'error' });
});

test('rent overdue adds positive balances in cents, as the phone does', () => {
  expect(rentOverdue([{ rentOwed: 15000 }, { rentOwed: 0 }, {}, { rentOwed: 2550 }])).toBe(17550);
});
test('a credit does not reduce what others owe', () => {
  expect(rentOverdue([{ rentOwed: -500 }, { rentOwed: 1000 }])).toBe(1000);
});
test('an unreadable balance makes the total unknown, not smaller', () => {
  expect(rentOverdue([{ rentOwed: 1000 }, { rentOwed: '1000' }])).toBeNull();
  expect(rentOverdue([{ rentOwed: NaN }])).toBeNull();
});
// The phone reads a null balance as nothing owed (paymentQueries, owedNowCents).
test('a null balance counts as nothing owed, as on the phone', () => {
  expect(rentOverdue([{ rentOwed: null }, { rentOwed: 1000 }])).toBe(1000);
});
test('what discharged residents owe is known separately', () => {
  const guests = [{ rentOwed: 1000, status: 'active' }, { rentOwed: 500, status: 'discharged' }, { status: 'discharged' }];
  expect(overdueFromDischarged(guests)).toBe(500);
});

test('only pending applications are waiting, matching the phone badge', () => {
  expect(applicationsWaiting([{ status: 'pending' }, { status: 'reviewing' }, { status: 'approved' }])).toBe(1);
});

test('house health is the mean of residents who can be scored', () => {
  expect(houseHealth([100, 50])).toBe(75);
  expect(houseHealth([100, null])).toBe(100);
});
test('a house nobody can be scored in has no health, not zero', () => {
  expect(houseHealth([])).toBeNull();
  expect(houseHealth([null])).toBeNull();
});
test('a resident whose phase is gone cannot be scored', () => {
  expect(canScore({ phase: 'Gone' }, { phases: { Default: { rules: {} } } })).toBe(false);
  expect(canScore({ phase: 'Default' }, { phases: { Default: { rules: {} } } })).toBe(true);
  expect(canScore({ phase: 'Default' }, { phases: { Default: {} } })).toBe(false);
  expect(canScore({ phase: 'Default' }, {})).toBe(false);
});

test('totals add ready houses', () => {
  const totals = totalsFor([summary(), summary({ houseId: 'h2' })]);
  expect(totals.rentOverdueCents).toEqual({ value: 2000, missing: 0 });
  expect(totals.beds.value).toEqual({ used: 4, max: 8 });
  expect(totals.housesNotCounted).toBe(0);
});
test('a failed field is counted as missing, not as zero', () => {
  const totals = totalsFor([summary(), summary({ houseId: 'h2', rentOverdueCents: { state: 'error' } })]);
  expect(totals.rentOverdueCents).toEqual({ value: 1000, missing: 1 });
  expect(totals.housesNotCounted).toBe(1);
});
test('a loading house is not counted yet', () => {
  const totals = totalsFor([summary({ openDisputes: { state: 'loading' } })]);
  expect(totals.openDisputes).toEqual({ value: 0, missing: 1 });
  expect(totals.housesNotCounted).toBe(1);
});
test('a lapsed house is not counted', () => {
  const lapsed = summary({ subscription: 'lapsed', rentOverdueCents: { state: 'loading' } });
  expect(totalsFor([summary(), lapsed]).housesNotCounted).toBe(1);
});
test('a hidden field is neither added nor missing', () => {
  const totals = totalsFor([summary({ rentOverdueCents: { state: 'hidden' } })]);
  expect(totals.rentOverdueCents).toEqual({ value: 0, missing: 0 });
  expect(totals.housesNotCounted).toBe(0);
});
test('what a row shows, most important first', () => {
  expect(rowStateOf(summary({ house: { state: 'error' }, subscription: 'loading' }))).toBe('failed');
  expect(rowStateOf(summary({ house: { state: 'loading' }, subscription: 'loading' }))).toBe('loading');
  expect(rowStateOf(summary({ subscription: 'loading' }))).toBe('loading');
  expect(rowStateOf(summary({ subscription: 'lapsed' }))).toBe('lapsed');
  expect(rowStateOf(summary({ subscription: 'pending' }))).toBe('setting-up');
  expect(rowStateOf(summary({ subscription: 'grace' }))).toBe('numbers');
  expect(rowStateOf(summary())).toBe('numbers');
});
test('only rows showing numbers are counted', () => {
  expect(totalsFor([summary({ subscription: 'pending' })]).housesNotCounted).toBe(1);
  expect(totalsFor([summary({ house: { state: 'error' } })]).housesNotCounted).toBe(1);
});

test('money formats like the phone', () => {
  expect(formatCents(15000)).toBe('$150.00');
  expect(formatCents(123456)).toBe('$1,234.56');
  expect(formatCents(0)).toBe('$0.00');
});
test('a date-only value keeps its day in any time zone', () => {
  expect(formatDay('2025-01-01')).toBe('Jan 1, 2025');
});
test('a missing or unreadable date is null', () => {
  expect(formatDay(undefined)).toBeNull();
  expect(formatDay('')).toBeNull();
  expect(formatDay('not a date')).toBeNull();
});
