import type { Cell, HouseSummary } from '../../src/app/houses/summary';

const ready = <T,>(value: T): Cell<T> => ({ state: 'ready', value });

export const summary = (overrides: Partial<HouseSummary> = {}): HouseSummary => ({
  houseId: 'h1',
  name: 'One',
  house: ready(true as const),
  subscription: 'active',
  graceEndsAt: null,
  beds: ready({ used: 2, max: 4 }),
  healthPercent: ready(80),
  rentOverdueCents: ready(1000),
  overdueFromDischargedCents: 0,
  applicationsWaiting: ready(1),
  openDisputes: ready(2),
  ...overrides,
});
