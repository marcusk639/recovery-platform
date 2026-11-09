// What a house's numbers mean. Pure, with no mobile imports, so it can be unit tested.
// A number is right or it says so: nothing that failed or is still loading becomes 0.
export type Cell<T> =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'hidden' } // this role doesn't see it
  | { state: 'ready'; value: T };

export type SubscriptionState = 'loading' | 'active' | 'pending' | 'grace' | 'lapsed';
export type RowState = 'failed' | 'loading' | 'lapsed' | 'setting-up' | 'numbers';

export interface HouseSummary {
  houseId: string;
  name: string | null;
  house: Cell<true>;
  subscription: SubscriptionState;
  graceEndsAt: Date | null;
  beds: Cell<{ used: number; max: number }>;
  healthPercent: Cell<number | null>; // null: no resident can be scored
  rentOverdueCents: Cell<number>;
  overdueFromDischargedCents: number;
  applicationsWaiting: Cell<number>;
  openDisputes: Cell<number>;
}

export interface Total<T> {
  value: T;
  missing: number;
}

export interface HouseTotals {
  beds: Total<{ used: number; max: number }>;
  rentOverdueCents: Total<number>;
  applicationsWaiting: Total<number>;
  openDisputes: Total<number>;
  housesNotCounted: number;
}

// Reads the status rather than isLoading: in this TanStack Query, isLoading is false
// for a disabled or paused query, and defaulting from there would show $0.00. A
// refresh that fails keeps its old data, and showing that would be a stale number.
export function cellFrom<D, T>(query: { status: string; data?: D }, map: (data: D) => T): Cell<T> {
  if (query.status === 'error') return { state: 'error' };
  if (query.status !== 'success') return { state: 'loading' };
  return { state: 'ready', value: map(query.data as D) };
}

// Mirrors evaluateHouseAccess in the phone's useSubscriptionGate, which isn't exported.
// It decides only what a table row shows. SubscriptionCheck still guards the house.
export function subscriptionStateOf(
  house: { subscriptionStatus?: string; guestGraceEndsAt?: unknown },
  killSwitch: { enabled: boolean; isLoading: boolean },
  now: Date,
  toDate: (value: unknown) => Date | null,
): { state: SubscriptionState; graceEndsAt: Date | null } {
  if (killSwitch.isLoading) return { state: 'loading', graceEndsAt: null };
  if (!killSwitch.enabled) return { state: 'active', graceEndsAt: null };
  const status = house.subscriptionStatus;
  if (!status) return { state: 'pending', graceEndsAt: null };
  if (status === 'active' || status === 'trialing') return { state: 'active', graceEndsAt: null };
  const endsAt = toDate(house.guestGraceEndsAt);
  if (endsAt && endsAt > now) return { state: 'grace', graceEndsAt: endsAt };
  return { state: 'lapsed', graceEndsAt: null };
}

const isReadableBalance = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function rentOverdue(guests: { rentOwed?: unknown }[]): number | null {
  let total = 0;
  for (const { rentOwed } of guests) {
    if (rentOwed === undefined) continue;
    if (!isReadableBalance(rentOwed)) return null;
    if (rentOwed > 0) total += rentOwed;
  }
  return total;
}

export function overdueFromDischarged(guests: { rentOwed?: unknown; status?: string }[]): number {
  let total = 0;
  for (const { rentOwed, status } of guests) {
    if (status === 'discharged' && isReadableBalance(rentOwed) && rentOwed > 0) total += rentOwed;
  }
  return total;
}

export const applicationsWaiting = (applications: { status: string }[]): number =>
  applications.filter((application) => application.status === 'pending').length;

export function houseHealth(percents: (number | null)[]): number | null {
  const scored = percents.filter((percent): percent is number => percent !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, percent) => sum + percent, 0) / scored.length);
}

// The phone's helper scores a resident with no phase rules as 100%.
export const canScore = (
  guest: { phase: unknown },
  house: { phases?: Record<string, { rules?: unknown }> },
): boolean => !!house.phases?.[String(guest.phase)]?.rules;

export function rowStateOf(summary: HouseSummary): RowState {
  if (summary.house.state === 'error') return 'failed';
  if (summary.house.state === 'loading' || summary.subscription === 'loading') return 'loading';
  if (summary.subscription === 'lapsed') return 'lapsed';
  if (summary.subscription === 'pending') return 'setting-up';
  return 'numbers';
}

function addCell<T>(
  total: Total<T>,
  cell: Cell<T>,
  counted: boolean,
  add: (a: T, b: T) => T,
): boolean {
  if (cell.state === 'hidden') return false;
  if (counted && cell.state === 'ready') {
    total.value = add(total.value, cell.value);
    return false;
  }
  total.missing += 1;
  return true;
}

export function totalsFor(summaries: HouseSummary[]): HouseTotals {
  const sum = (a: number, b: number) => a + b;
  const totals: HouseTotals = {
    beds: { value: { used: 0, max: 0 }, missing: 0 },
    rentOverdueCents: { value: 0, missing: 0 },
    applicationsWaiting: { value: 0, missing: 0 },
    openDisputes: { value: 0, missing: 0 },
    housesNotCounted: 0,
  };
  for (const summary of summaries) {
    const counted = rowStateOf(summary) === 'numbers';
    const missed = [
      addCell(totals.beds, summary.beds, counted, (a, b) => ({
        used: a.used + b.used,
        max: a.max + b.max,
      })),
      addCell(totals.rentOverdueCents, summary.rentOverdueCents, counted, sum),
      addCell(totals.applicationsWaiting, summary.applicationsWaiting, counted, sum),
      addCell(totals.openDisputes, summary.openDisputes, counted, sum),
    ];
    if (!counted || missed.includes(true)) totals.housesNotCounted += 1;
  }
  return totals;
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatCents = (cents: number): string => currency.format(cents / 100);

const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
export function formatDay(value: unknown): string | null {
  if (!value) return null;
  let date: Date;
  if (typeof value === 'string') {
    // A bare date parses as UTC midnight, which is the day before in the US.
    date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  } else if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  } else {
    date = new Date(value as number | Date);
  }
  return Number.isNaN(date.getTime()) ? null : day.format(date);
}
